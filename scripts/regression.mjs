/** 固定候选版本的11轮回归：单元、安全、浏览器流程与100客户端静态负载，任一步失败立即停止。 */
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { resolve, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { cpus, platform, release, totalmem } from "node:os";
import { filesUnder, fingerprint, writeJson } from "./verification-support.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const roundsRequired = 11;
const selectedProjects = (
  process.env.REGRESSION_PROJECTS || "chromium,firefox,webkit"
)
  .split(",")
  .filter(Boolean);
if (
  !selectedProjects.length ||
  selectedProjects.some(
    (name) => !["chromium", "firefox", "webkit"].includes(name),
  )
)
  throw new Error("Unsupported REGRESSION_PROJECTS");
const startedAt = new Date().toISOString();
const runId = startedAt.replace(/[:.]/g, "-");
const artifactDirectory = join(root, "artifacts", `regression-${runId}`);
const reportFile = join(root, "docs/verification/local-rounds.json");
const summary = {
  schemaVersion: 1,
  runId,
  startedAt,
  requiredRounds: roundsRequired,
  completedRounds: 0,
  status: "running",
  environment: {
    node: process.version,
    platform: platform(),
    release: release(),
    architecture: process.arch,
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    memoryBytes: totalmem(),
  },
  scope:
    "Each round runs Node unit/security tests, every selected Playwright project and at least 30 seconds with 100 static HTTP clients. Static clients do not run image decoding or PDF generation. Browser engines in automation do not establish real-device certification.",
  browserProjects: selectedProjects,
  unverifiedProjects: ["chromium", "firefox", "webkit"].filter(
    (name) => !selectedProjects.includes(name),
  ),
  scopeLimitation: process.env.REGRESSION_LIMITATION || null,
  artifacts: relative(root, artifactDirectory),
  rounds: [],
};

/**
 * 收集实现、固定资源、测试及构建配置，排除测试输出和历史文档。
 * @returns {Promise<string[]>} 候选源码清单。
 */
async function implementationFiles() {
  const directories = ["src", "public", "tests", "e2e", "scripts"];
  const result = [];
  for (const directory of directories) {
    try {
      result.push(...(await filesUnder(join(root, directory))));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  for (const item of await readdir(root, { withFileTypes: true })) {
    if (
      item.isFile() &&
      /^(?:package(?:-lock)?\.json|(?:vite|playwright|postcss|tailwind|jsconfig|tsconfig).*|index\.html|\.npmrc|\.nvmrc)$/.test(
        item.name,
      )
    )
      result.push(join(root, item.name));
  }
  return result.sort();
}

/**
 * 将外部命令完整输出留存到文件，并等待进程真正退出。
 * @param {string[]} command 可执行文件及参数，使用数组避免shell转义。
 * @param {string} logPath stdout和stderr日志路径。
 * @param {object} [environment] 该阶段独立环境变量。
 * @returns {Promise<object>} 命令、退出码及耗时；非零退出抛出附有结果的错误。
 */
async function runCommand(command, logPath, environment = {}) {
  await mkdir(resolve(logPath, ".."), { recursive: true });
  const started = performance.now();
  const stream = createWriteStream(logPath, { flags: "wx" });
  const child = spawn(command[0], command.slice(1), {
    cwd: root,
    env: { ...process.env, CI: "true", ...environment },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (data) => stream.write(data));
  child.stderr.on("data", (data) => stream.write(data));
  const { code, signal, error } = await new Promise((accept) => {
    child.once("error", (error) => accept({ code: null, signal: null, error }));
    child.once("close", (code, signal) => accept({ code, signal }));
  });
  await new Promise((accept, reject) => {
    stream.once("error", reject);
    stream.end(accept);
  });
  const result = {
    command,
    exitCode: code,
    signal,
    elapsedSeconds: (performance.now() - started) / 1000,
    log: relative(root, logPath),
  };
  if (error || code !== 0)
    throw Object.assign(
      new Error(
        error?.message || `${command.join(" ")} exited ${code ?? signal}`,
      ),
      { phaseResult: result },
    );
  return result;
}

/**
 * 确认开始验收后源码与静态产物均未变化。
 * @returns {Promise<void>} 无变化时完成，否则停止本次验收。
 */
async function verifyFingerprints() {
  const source = await fingerprint(await implementationFiles(), root);
  const build = await fingerprint(
    await filesUnder(join(root, "dist")),
    join(root, "dist"),
  );
  if (
    source.sha256 !== summary.source.sha256 ||
    build.sha256 !== summary.build.sha256
  ) {
    throw new Error(
      "Candidate files changed during regression. Start a fresh 11-round run after all edits and rebuilds are finished.",
    );
  }
}

/**
 * 从Node测试日志提取计数，原始日志仍作为完整证据保留。
 * @param {string} logFile 测试日志。
 * @returns {Promise<object>} 测试、通过、失败及跳过计数，无法解析的项为null。
 */
async function nodeCounts(logFile) {
  const text = await readFile(logFile, "utf8");
  return Object.fromEntries(
    ["tests", "pass", "fail", "skipped"].map((name) => {
      const match = text.match(new RegExp(`(?:#|ℹ)\\s*${name}\\s+(\\d+)`));
      return [name, match ? Number(match[1]) : null];
    }),
  );
}

await mkdir(artifactDirectory, { recursive: true });
let currentPhase = "build";
let currentRound = null;
try {
  const beforeBuild = await fingerprint(await implementationFiles(), root);
  summary.buildCommand = await runCommand(
    ["npm", "run", "build"],
    join(artifactDirectory, "build.log"),
  );
  summary.source = await fingerprint(await implementationFiles(), root);
  if (summary.source.sha256 !== beforeBuild.sha256)
    throw new Error(
      "Implementation changed while the candidate was building; rerun after edits finish.",
    );
  summary.build = await fingerprint(
    await filesUnder(join(root, "dist")),
    join(root, "dist"),
  );
  await writeJson(reportFile, summary);
  for (let number = 1; number <= roundsRequired; number += 1) {
    currentRound = {
      number,
      seed: number,
      startedAt: new Date().toISOString(),
      status: "running",
    };
    summary.rounds.push(currentRound);
    const directory = join(
      artifactDirectory,
      `round-${String(number).padStart(2, "0")}`,
    );
    await mkdir(directory, { recursive: true });
    currentPhase = "candidate-fingerprint";
    await verifyFingerprints();
    process.stdout.write(
      `Round ${number}/${roundsRequired}: unit and security tests\n`,
    );
    currentPhase = "unit-tests";
    const unitLog = join(directory, "unit.log");
    currentRound.unit = await runCommand(["npm", "test"], unitLog, {
      TEST_ROUND: String(number),
      TEST_SEED: String(number),
    });
    currentRound.unit.counts = await nodeCounts(unitLog);
    if (
      !(currentRound.unit.counts.tests > 0) ||
      !(currentRound.unit.counts.pass > 0) ||
      currentRound.unit.counts.fail !== 0 ||
      currentRound.unit.counts.skipped !== 0
    )
      throw new Error(
        "Unit report is missing counts or contains failures/skips; full regression requires every test to run",
      );
    process.stdout.write(
      `Round ${number}/${roundsRequired}: browser functional/security/resource tests\n`,
    );
    currentPhase = "browser-tests";
    const browserJson = join(directory, "playwright.json");
    currentRound.browser = await runCommand(
      [
        "npm",
        "run",
        "test:e2e",
        "--",
        ...selectedProjects.map((name) => `--project=${name}`),
        "--reporter=line,json",
        "--output",
        join(directory, "browser-results"),
      ],
      join(directory, "browser.log"),
      {
        TEST_ROUND: String(number),
        TEST_SEED: String(number),
        PLAYWRIGHT_JSON_OUTPUT_FILE: browserJson,
      },
    );
    const browserReport = JSON.parse(await readFile(browserJson, "utf8"));
    currentRound.browser.stats = browserReport.stats;
    if (
      !browserReport.stats?.expected ||
      browserReport.stats.unexpected > 0 ||
      browserReport.stats.flaky > 0 ||
      browserReport.stats.skipped > 0
    ) {
      throw new Error(
        "Browser tests did not all pass on their first attempt; flaky/retried/skipped tests are not accepted",
      );
    }
    process.stdout.write(
      `Round ${number}/${roundsRequired}: 100 static clients for 30 seconds\n`,
    );
    currentPhase = "static-load";
    const loadReport = join(directory, "load.json");
    currentRound.load = await runCommand(
      [
        process.execPath,
        join(root, "scripts/load-test.mjs"),
        "--duration",
        "30",
        "--clients",
        "100",
        "--seed",
        String(number),
        "--output",
        loadReport,
      ],
      join(directory, "load.log"),
    );
    const load = JSON.parse(await readFile(loadReport, "utf8"));
    if (!load.passed) throw new Error("Static load report did not pass");
    currentRound.load.metrics = {
      requests: load.requests,
      errors: load.unexpectedErrors,
      p95Ms: load.latencyMs.p95,
      bodyBytes: load.transferredBodyBytes,
      peakRssBytes: load.serverMemory.peakRssBytes,
      report: relative(root, loadReport),
    };
    currentPhase = "candidate-fingerprint";
    await verifyFingerprints();
    currentRound.status = "passed";
    currentRound.completedAt = new Date().toISOString();
    summary.completedRounds += 1;
    await writeJson(reportFile, summary);
  }
  summary.status = summary.unverifiedProjects.length
    ? "passed-selected-scope"
    : "passed";
  summary.completedAt = new Date().toISOString();
  process.stdout.write(
    `All ${roundsRequired} rounds passed without candidate changes. Report: ${reportFile}\n`,
  );
} catch (error) {
  summary.status = "failed";
  summary.failure = {
    phase: currentPhase,
    round: currentRound?.number ?? null,
    message: error.message,
    command: error.phaseResult ?? null,
  };
  summary.completedAt = new Date().toISOString();
  if (currentRound) {
    currentRound.status = "failed";
    currentRound.failure = summary.failure;
  }
  process.stderr.write(`Regression stopped: ${error.message}\n`);
  process.exitCode = 1;
} finally {
  await writeJson(reportFile, summary);
  await writeJson(join(artifactDirectory, "summary.json"), summary);
}
