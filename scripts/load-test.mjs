/** 本机静态服务压力测试；不执行表单填写、图片解码或 PDF 生成。 */
import { fork } from "node:child_process";
import { Agent } from "node:http";
import { cpus, totalmem, platform, release } from "node:os";
import { resolve, relative, extname } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { setTimeout as wait } from "node:timers/promises";
import {
  filesUnder,
  fingerprint,
  measuredRequest,
  percentile,
  writeJson,
} from "./verification-support.mjs";

/**
 * 启动独立随机端口服务，监听子进程错误和内存采样。
 * @param {string} root 静态构建目录。
 * @returns {Promise<{child:import('node:child_process').ChildProcess,url:string,memory:object[]}>} 服务和采样数组。
 */
async function startServer(root) {
  const child = fork(
    fileURLToPath(new URL("./load-server.mjs", import.meta.url)),
    [],
    {
      env: { ...process.env, LOAD_TEST_ROOT: root },
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    },
  );
  const memory = [];
  child.stderr.on("data", (value) => process.stderr.write(value));
  return new Promise((accept, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Static test server did not start within 15 seconds"));
    }, 15_000);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`Static test server exited: ${code}`));
    });
    child.on("message", (message) => {
      if (message.type === "memory") memory.push(message);
      if (message.type === "error") {
        clearTimeout(timer);
        reject(new Error(message.message));
      }
      if (message.type === "ready") {
        clearTimeout(timer);
        accept({ child, url: `http://127.0.0.1:${message.port}`, memory });
      }
    });
  });
}

/**
 * 正常关闭测试服务，五秒后仍不退出才发送终止信号。
 * @param {import('node:child_process').ChildProcess} child 测试服务进程。
 * @returns {Promise<void>} 进程退出完成。
 */
async function stopServer(child) {
  if (child.exitCode !== null) return;
  await new Promise((accept) => {
    const timer = setTimeout(() => child.kill("SIGTERM"), 5000);
    child.once("exit", () => {
      clearTimeout(timer);
      accept();
    });
    if (child.connected) child.send({ type: "stop" });
    else child.kill("SIGTERM");
  });
}

/**
 * 执行100个并发客户端的静态请求模型，并写入客观指标。
 * @param {object} [options] root构建目录、durationSeconds持续秒数、clients并发数、output报告路径、seed请求序列种子。
 * @returns {Promise<object>} 包含请求耗时、错误、流量和独立服务RSS的报告。
 */
export async function runLoadTest({
  root = resolve("dist"),
  durationSeconds = 30,
  clients = 100,
  output = "artifacts/load-test.json",
  seed = 1,
} = {}) {
  if (!Number.isFinite(durationSeconds) || durationSeconds < 30)
    throw new Error("Static load duration must be at least 30 seconds");
  if (!Number.isInteger(clients) || clients < 100)
    throw new Error("Static load requires at least 100 clients");
  const files = await filesUnder(root);
  const build = await fingerprint(files, root);
  const paths = files.map(
    (file) => `/${relative(root, file).split("\\").join("/")}`,
  );
  const assets = paths.filter((path) =>
    [".js", ".css", ".svg"].includes(extname(path)),
  );
  const fonts = paths.filter((path) =>
    [".otf", ".ttf", ".woff2"].includes(extname(path)),
  );
  if (!paths.includes("/index.html") || !assets.length || !fonts.length)
    throw new Error(
      "Complete production build, scripts/styles and fonts are required",
    );
  const { child, url, memory } = await startServer(root);
  const agent = new Agent({
    keepAlive: true,
    maxSockets: clients,
    maxFreeSockets: clients,
  });
  const latencies = [],
    coldLatencies = [],
    revalidationLatencies = [],
    errors = [];
  const statuses = {},
    groups = { home: 0, assets: 0, fonts: 0 };
  let bytes = 0,
    requests = 0,
    cacheHits = 0,
    firstRequests = 0;
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const deadline = started + durationSeconds * 1000;
  try {
    await Promise.all(
      Array.from({ length: clients }, async (_, index) => {
        const cache = new Map();
        const encoding = index % 10 === 0 ? "gzip" : "br";
        let random = (seed * 2654435761 + index + 1) >>> 0;
        let sequence = 0;
        while (performance.now() < deadline) {
          random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
          const choice = random / 0x100000000;
          const group =
            sequence === 0 || choice < 0.2
              ? "home"
              : choice < 0.9
                ? "assets"
                : "fonts";
          const path =
            group === "home"
              ? "/"
              : group === "assets"
                ? assets[random % assets.length]
                : fonts[random % fonts.length];
          sequence += 1;
          const headers = { "Accept-Encoding": encoding };
          if (cache.has(path)) headers["If-None-Match"] = cache.get(path);
          groups[group] += 1;
          try {
            const result = await measuredRequest(`${url}${path}`, {
              headers,
              agent,
            });
            requests += 1;
            bytes += result.bytes;
            latencies.push(result.durationMs);
            statuses[result.status] = (statuses[result.status] || 0) + 1;
            if (result.status === 200) {
              firstRequests += 1;
              coldLatencies.push(result.durationMs);
              if (result.headers.etag) cache.set(path, result.headers.etag);
            } else if (
              result.status === 304 &&
              cache.has(path) &&
              result.bytes === 0
            ) {
              cacheHits += 1;
              revalidationLatencies.push(result.durationMs);
            } else
              errors.push({
                client: index,
                path,
                status: result.status,
                bytes: result.bytes,
              });
          } catch (error) {
            requests += 1;
            errors.push({ client: index, path, message: error.message });
          }
          // 固定思考时间避免将100个客户端误解为不受约束的全速请求线程。
          await wait(100);
        }
      }),
    );
  } finally {
    agent.destroy();
    await stopServer(child);
  }
  const elapsedSeconds = (performance.now() - started) / 1000;
  const after = await fingerprint(await filesUnder(root), root);
  const buildUnchanged = after.sha256 === build.sha256;
  const summary = {
    schemaVersion: 1,
    startedAt,
    completedAt: new Date().toISOString(),
    model: {
      description:
        "Local static HTTP server only; no browser form filling, image decoding, IndexedDB writes or PDF generation.",
      clients,
      minimumDurationSeconds: durationSeconds,
      actualElapsedSeconds: elapsedSeconds,
      thinkTimeMs: 100,
      mix: "20% homepage, 70% JS/CSS/SVG, 10% font; first request per client is homepage; per-client ETag revalidation thereafter",
      compression: "90% br clients, 10% gzip clients",
      cache:
        "Server starts cold. Conditional requests are sent even for immutable assets; real fresh browser caches can avoid these requests entirely.",
      seed,
    },
    environment: {
      node: process.version,
      platform: platform(),
      release: release(),
      architecture: process.arch,
      cpu: cpus()[0]?.model,
      logicalCpus: cpus().length,
      memoryBytes: totalmem(),
    },
    build,
    buildUnchanged,
    requests,
    statuses,
    groups,
    errors,
    unexpectedErrors: errors.length,
    unexpectedErrorRate: requests ? errors.length / requests : 1,
    transferredBodyBytes: bytes,
    requestsPerSecond: requests / elapsedSeconds,
    firstResponses: firstRequests,
    cacheRevalidations: cacheHits,
    latencyMs: {
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      p99: percentile(latencies, 0.99),
      max: latencies.length ? Math.max(...latencies) : null,
      coldP95: percentile(coldLatencies, 0.95),
      revalidationP95: percentile(revalidationLatencies, 0.95),
    },
    serverMemory: {
      measuredProcess: "isolated Node static-server child process",
      firstRssBytes: memory[0]?.rss ?? null,
      peakRssBytes: memory.length
        ? Math.max(...memory.map((sample) => sample.rss))
        : null,
      lastRssBytes: memory.at(-1)?.rss ?? null,
      samples: memory,
    },
    thresholds: {
      unexpectedErrors: 0,
      p95Ms: 500,
      serverRssBytes: 512 * 1024 * 1024,
    },
    passed:
      errors.length === 0 &&
      buildUnchanged &&
      requests > 0 &&
      percentile(latencies, 0.95) < 500 &&
      memory.length > 0 &&
      Math.max(...memory.map((sample) => sample.rss)) < 512 * 1024 * 1024,
  };
  await writeJson(output, summary);
  return summary;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const argument = (name, fallback) => {
    const index = process.argv.indexOf(name);
    return index < 0 ? fallback : process.argv[index + 1];
  };
  const summary = await runLoadTest({
    root: resolve(argument("--root", "dist")),
    durationSeconds: Number(argument("--duration", "30")),
    clients: Number(argument("--clients", "100")),
    output: argument("--output", "artifacts/load-test.json"),
    seed: Number(argument("--seed", "1")),
  });
  process.stdout.write(
    `${JSON.stringify({ passed: summary.passed, requests: summary.requests, unexpectedErrors: summary.unexpectedErrors, p95Ms: summary.latencyMs.p95, bytes: summary.transferredBodyBytes, peakRssBytes: summary.serverMemory.peakRssBytes })}\n`,
  );
  if (!summary.passed) process.exitCode = 1;
}
