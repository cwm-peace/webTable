/** 测量静态包实际压缩体积、延迟加载预算及本机HTTP缓存行为。 */
import { readFile } from "node:fs/promises";
import { resolve, relative, posix, extname } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { gzip, brotliCompress, constants } from "node:zlib";
import { createStaticServer } from "./static-server.mjs";
import {
  filesUnder,
  fingerprint,
  measuredRequest,
  writeJson,
} from "./verification-support.mjs";

const compressGzip = promisify(gzip);
const compressBr = promisify(brotliCompress);

/**
 * 解析构建内的资源相对地址，忽略外部链接、内联数据和片段。
 * @param {string} parent 引用资源的文件路径。
 * @param {string} reference 原始引用。
 * @param {Set<string>} known 已有构建文件。
 * @returns {string|null} 构建内路径或空值。
 */
function localReference(parent, reference, known) {
  if (/^(?:data:|blob:|https?:|#)/i.test(reference)) return null;
  const clean = reference.split(/[?#]/)[0];
  const candidate = clean.startsWith("/")
    ? clean.slice(1)
    : posix.normalize(posix.join(posix.dirname(parent), clean));
  if (known.has(candidate)) return candidate;
  // 子路径部署时，Vite生成的绝对地址包含部署前缀。
  return [...known].find((path) => candidate.endsWith(`/${path}`)) || null;
}

/**
 * 统计指定资源集合的三种正文大小。
 * @param {string[]} paths 资源路径。
 * @param {Map<string,object>} measured 逐文件测量。
 * @returns {{raw:number,gzip:number,br:number}} 正文字节合计。
 */
function totals(paths, measured) {
  return [...new Set(paths)].reduce(
    (sum, path) => {
      const item = measured.get(path);
      if (item)
        for (const format of ["raw", "gzip", "br"]) sum[format] += item[format];
      return sum;
    },
    { raw: 0, gzip: 0, br: 0 },
  );
}

/**
 * 用Chromium记录真实首页冷缓存和同一浏览器上下文刷新后的网络传输。
 * @param {string} url 本机静态服务地址。
 * @returns {Promise<object>} 实际浏览器网络测量，浏览器缺失时明确记录未验证。
 */
async function measureBrowser(url) {
  let browser;
  try {
    const { chromium } = await import("@playwright/test");
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    const session = await context.newCDPSession(page);
    await session.send("Network.enable");
    let capture = new Map();
    session.on("Network.requestWillBeSent", (event) =>
      capture.set(event.requestId, {
        url: event.request.url,
        method: event.request.method,
        encodedBytes: 0,
      }),
    );
    session.on("Network.responseReceived", (event) => {
      const item = capture.get(event.requestId);
      if (item)
        Object.assign(item, {
          status: event.response.status,
          diskCache: Boolean(event.response.fromDiskCache),
          serviceWorker: Boolean(event.response.fromServiceWorker),
          mime: event.response.mimeType,
        });
    });
    session.on("Network.requestServedFromCache", (event) => {
      const item = capture.get(event.requestId);
      if (item) item.memoryCache = true;
    });
    session.on("Network.loadingFinished", (event) => {
      const item = capture.get(event.requestId);
      if (item) item.encodedBytes = event.encodedDataLength;
    });
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    const cold = [...capture.values()];
    capture = new Map();
    await page.reload({ waitUntil: "networkidle", timeout: 30_000 });
    const warm = [...capture.values()];
    const failed = [...cold, ...warm].filter(
      (entry) => !entry.status || entry.status >= 400,
    );
    return {
      status: failed.length ? "failed" : "measured",
      browser: `Chromium ${browser.version()}`,
      note: "CDP encodedDataLength includes response transport/header accounting; body-only budgets are reported separately. Same-page reload still revalidates index.html.",
      cold: {
        encodedBytes: cold.reduce((sum, item) => sum + item.encodedBytes, 0),
        requests: cold,
      },
      warm: {
        encodedBytes: warm.reduce((sum, item) => sum + item.encodedBytes, 0),
        requests: warm,
      },
      failed,
    };
  } catch (error) {
    return {
      status: browser ? "failed" : "not-measured",
      reason: error.message.split("\n")[0],
    };
  } finally {
    await browser?.close();
  }
}

/**
 * 测量构建产物，并验证实际静态服务的编码、ETag和304正文。
 * @param {object} [options] root构建目录、output报告路径。
 * @returns {Promise<object>} 包体、预算和HTTP测量报告。
 */
export async function measureBandwidth({
  root = resolve("dist"),
  output = "docs/verification/bandwidth.json",
} = {}) {
  const sourceFiles = await filesUnder(root);
  const build = await fingerprint(sourceFiles, root);
  const measured = new Map();
  for (const file of sourceFiles) {
    const bytes = await readFile(file);
    const [gz, br] = await Promise.all([
      compressGzip(bytes),
      compressBr(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } }),
    ]);
    measured.set(relative(root, file).split("\\").join("/"), {
      raw: bytes.length,
      gzip: gz.length,
      br: br.length,
    });
  }
  const known = new Set(measured.keys());
  if (!known.has("index.html")) throw new Error("Build index.html is missing");
  const html = await readFile(resolve(root, "index.html"), "utf8");
  const entry = new Set(["index.html"]);
  const pending = [];
  for (const match of html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
    const path = localReference("index.html", match[1], known);
    if (path) pending.push(path);
  }
  while (pending.length) {
    const path = pending.pop();
    if (entry.has(path)) continue;
    entry.add(path);
    if (![".js", ".css"].includes(extname(path))) continue;
    const source = await readFile(resolve(root, path), "utf8");
    const patterns =
      extname(path) === ".js"
        ? [
            /\b(?:import|export)\s*(?:[\w*$,{}\s]+?\s*from\s*)?["']([^"']+)["']/g,
          ]
        : [
            /url\(\s*["']?([^"')\s]+)["']?\s*\)/g,
            /@import\s+["']([^"']+)["']/g,
          ];
    for (const pattern of patterns)
      for (const match of source.matchAll(pattern)) {
        const reference = localReference(path, match[1], known);
        if (reference && !entry.has(reference)) pending.push(reference);
      }
  }
  const fonts = [...known].filter((path) =>
    /\.(?:otf|ttf|woff2?)$/i.test(path),
  );
  const pdfWorkers = [...known].filter((path) =>
    /pdf[.-]?worker[^/]*\.js$/i.test(path),
  );
  const fallbackChunks = [...known].filter(
    (path) =>
      !entry.has(path) &&
      /\.js$/i.test(path) &&
      !pdfWorkers.includes(path) &&
      !/image[.-]?worker/i.test(path),
  );
  const pdfLoaders = [...known].filter(
    (path) => !entry.has(path) && /(?:^|\/)pdf-[^/]+\.js$/i.test(path),
  );
  const imageWorkers = [...known].filter((path) =>
    /image[.-]?worker[^/]*\.js$/i.test(path),
  );
  const exportNormal = [...new Set([...pdfLoaders, ...pdfWorkers, ...fonts])];
  const normalFullUse = [
    ...new Set([...entry, ...imageWorkers, ...exportNormal]),
  ];
  const exportFallback = [...new Set([...fallbackChunks, ...fonts])];
  const allExecutable = [...known].filter((path) =>
    /\.(?:html|js|css|svg|ico|otf|ttf|woff2?)$/i.test(path),
  );
  const server = createStaticServer({ root });
  await new Promise((accept, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", accept);
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  const httpChecks = [];
  let browserNetwork;
  try {
    const checked = [
      ...new Set(
        [
          "index.html",
          [...entry].find((path) => path.endsWith(".js")),
          fonts[0],
          pdfWorkers[0],
        ].filter(Boolean),
      ),
    ];
    for (const path of checked) {
      for (const encoding of ["br", "gzip", "identity"]) {
        const first = await measuredRequest(`${url}/${path}`, {
          headers: { "Accept-Encoding": encoding },
        });
        const repeat = await measuredRequest(`${url}/${path}`, {
          headers: {
            "Accept-Encoding": encoding,
            "If-None-Match": first.headers.etag,
          },
        });
        const expected =
          measured.get(path)[encoding === "identity" ? "raw" : encoding];
        const passed =
          first.status === 200 &&
          first.bytes === expected &&
          (first.headers["content-encoding"] || "identity") === encoding &&
          repeat.status === 304 &&
          repeat.bytes === 0;
        httpChecks.push({
          path,
          encoding,
          status: first.status,
          encodedBodyBytes: first.bytes,
          expectedBodyBytes: expected,
          cacheControl: first.headers["cache-control"],
          etag: first.headers.etag,
          repeatedStatus: repeat.status,
          repeatedBodyBytes: repeat.bytes,
          passed,
        });
      }
    }
    browserNetwork = await measureBrowser(url);
  } finally {
    server.closeIdleConnections?.();
    await new Promise((accept) => server.close(accept));
  }
  const after = await fingerprint(await filesUnder(root), root);
  const complete = totals(allExecutable, measured);
  const assumptions = {
    peakUsers: 100,
    desiredLoadSeconds: 10,
    overheadFactor: 1.3,
    monthlyColdFullUses: 10_000,
  };
  const summary = {
    schemaVersion: 1,
    measuredAt: new Date().toISOString(),
    node: process.version,
    build,
    buildUnchanged: after.sha256 === build.sha256,
    compression: {
      gzip: "Node zlib default level 6",
      br: "Node Brotli quality 4, matching static-server.mjs",
      measurement:
        "Compressed response-body bytes; excludes HTTP/TLS headers, retransmission and CDN billing rules.",
    },
    files: [...measured].map(([path, sizes]) => ({ path, ...sizes })),
    totals: totals([...known], measured),
    budgets: {
      entry: {
        paths: [...entry].sort(),
        bytes: totals([...entry], measured),
        method:
          "index.html plus statically imported JS, CSS URL assets and HTML references; excludes dynamic imports and workers",
      },
      normalFirstExportAdditional: {
        paths: exportNormal,
        bytes: totals(exportNormal, measured),
        method:
          "Lazy PDF module, PDF worker and font; worker includes its bundled libraries",
      },
      imageProcessingAdditional: {
        paths: imageWorkers,
        bytes: totals(imageWorkers, measured),
        method: "Worker loaded on the first local image processing task",
      },
      normalCompleteUse: {
        paths: normalFullUse,
        bytes: totals(normalFullUse, measured),
        method:
          "Union of entry resources, image worker, lazy PDF module, PDF worker and font; excludes the main-thread PDF fallback bundle",
      },
      fallbackFirstExportAdditional: {
        paths: exportFallback,
        bytes: totals(exportFallback, measured),
        method:
          "Conservative sum of non-entry non-worker JS chunks plus font; fallback path may load only a subset",
      },
      allRuntimeResources: {
        paths: allExecutable,
        bytes: complete,
        method:
          "Upper bound if every runtime branch is loaded once; ordinary use does not necessarily request every chunk",
      },
    },
    realHttpCacheChecks: httpChecks,
    browserHomepageNetwork: browserNetwork,
    planning: {
      assumptions,
      coldFullMonthlyGB: (complete.br * assumptions.monthlyColdFullUses) / 1e9,
      entryPeakMbps:
        ((totals([...entry], measured).br * 8 * assumptions.peakUsers) /
          assumptions.desiredLoadSeconds /
          1e6) *
        assumptions.overheadFactor,
      normalFullUseMonthlyGB:
        (totals(normalFullUse, measured).br * assumptions.monthlyColdFullUses) /
        1e9,
      normalFullUsePeakMbps:
        ((totals(normalFullUse, measured).br * 8 * assumptions.peakUsers) /
          assumptions.desiredLoadSeconds /
          1e6) *
        assumptions.overheadFactor,
      fullPeakMbps:
        ((complete.br * 8 * assumptions.peakUsers) /
          assumptions.desiredLoadSeconds /
          1e6) *
        assumptions.overheadFactor,
      note: "Photos, IndexedDB drafts and generated PDFs remain local and do not add server payload traffic. Cached immutable resources need no body transfer until changed; unhashed fonts currently revalidate using ETag.",
    },
    passed:
      after.sha256 === build.sha256 &&
      httpChecks.every((check) => check.passed) &&
      browserNetwork.status !== "failed",
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
  const summary = await measureBandwidth({
    root: resolve(argument("--root", "dist")),
    output: argument("--output", "docs/verification/bandwidth.json"),
  });
  process.stdout.write(
    `${JSON.stringify({ passed: summary.passed, raw: summary.totals.raw, gzip: summary.totals.gzip, br: summary.totals.br, entryBr: summary.budgets.entry.bytes.br, exportBr: summary.budgets.normalFirstExportAdditional.bytes.br, browser: summary.browserHomepageNetwork.status })}\n`,
  );
  if (!summary.passed) process.exitCode = 1;
}
