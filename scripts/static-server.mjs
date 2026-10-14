/** 生产静态文件服务：仅GET/HEAD、同源安全头、压缩协商和缓存，不记录请求内容。 */
import { createServer } from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import { resolve, relative, extname, sep } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { brotliCompress, gzip, constants } from "node:zlib";
const compressBr = promisify(brotliCompress),
  compressGzip = promisify(gzip);
export const CONTENT_SECURITY_POLICY =
  "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
};

/**
 * 根据客户端质量权重选择压缩，显式q=0禁止该编码。
 * @param {string} header Accept-Encoding请求头
 * @returns {string|null} br、gzip、identity或无可接受表示时null
 */
export function selectEncoding(header = "") {
  if (!header) return "identity";
  const values = new Map(
    header
      .toLowerCase()
      .split(",")
      .map((item) => {
        const [name, ...parameters] = item.trim().split(";");
        const quality = parameters.find((part) => part.trim().startsWith("q="));
        const q = quality ? Number(quality.trim().slice(2)) : 1;
        return [name, Number.isFinite(q) && q >= 0 && q <= 1 ? q : 0];
      }),
  );
  const options = ["br", "gzip", "identity"].map((name) => ({
    name,
    q:
      values.get(name) ??
      (name === "identity"
        ? values.get("*") === 0
          ? 0
          : 1
        : (values.get("*") ?? 0)),
  }));
  options.sort((a, b) => b.q - a.q);
  return options[0].q > 0 ? options[0].name : null;
}

/**
 * 为成功和失败响应统一设置安全头；HTTPS由外部反向代理提供。
 * @param {import('node:http').ServerResponse} response 当前响应
 * @returns {void} 无返回值
 */
function securityHeaders(response) {
  response.setHeader("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  response.setHeader("Cache-Control", "no-store");
}

/**
 * 创建只读静态服务器；导入时不会启动监听，方便隔离测试。
 * @param {object} options 静态根目录选项
 * @param {string} options.root 构建输出目录，默认项目dist
 * @returns {import('node:http').Server} 尚未监听的HTTP服务器
 */
export function createStaticServer({
  root = fileURLToPath(new URL("../dist", import.meta.url)),
} = {}) {
  const rootPath = resolve(root);
  const cached = new Map();
  const pending = new Map();
  let cachedBytes = 0;
  return createServer(async (request, response) => {
    securityHeaders(response);
    /**
     * 结束无敏感详情的失败响应，HEAD不返回正文。
     * @param {number} status HTTP状态码
     * @param {string} message 固定错误说明
     * @returns {void} 无返回值
     */
    function fail(status, message) {
      response.writeHead(status, {
        "Content-Type": "text/plain; charset=utf-8",
      });
      response.end(request.method === "HEAD" ? undefined : message);
    }
    if (!["GET", "HEAD"].includes(request.method)) {
      response.setHeader("Allow", "GET, HEAD");
      fail(405, "Method not allowed");
      return;
    }
    try {
      const rawPath = (request.url || "/").split("?")[0];
      let pathname;
      try {
        pathname = decodeURIComponent(rawPath);
      } catch {
        fail(400, "Invalid path");
        return;
      }
      if (
        !pathname.startsWith("/") ||
        pathname.includes("\\") ||
        /[\x00-\x1f]/.test(pathname) ||
        /%2f|%5c/i.test(rawPath) ||
        pathname.split("/").some((part) => part.startsWith("."))
      ) {
        fail(400, "Invalid path");
        return;
      }
      if (/^\/(api|admin)(\/|$)/i.test(pathname)) {
        fail(404, "Not found");
        return;
      }
      if (pathname === "/") pathname = "/index.html";
      const canonicalRoot = await realpath(rootPath);
      const candidate = await realpath(resolve(rootPath, `.${pathname}`));
      const rel = relative(canonicalRoot, candidate);
      if (rel.startsWith(`..${sep}`) || rel === ".." || rel.startsWith(sep)) {
        fail(404, "Not found");
        return;
      }
      const info = await stat(candidate);
      if (!info.isFile()) {
        fail(404, "Not found");
        return;
      }
      const encoding = selectEncoding(request.headers["accept-encoding"]);
      if (!encoding) {
        fail(406, "No acceptable encoding");
        return;
      }
      const cacheKey = `${candidate}:${info.mtimeMs}:${info.size}:${encoding}`;
      let representation = cached.get(cacheKey);
      if (!representation) {
        let building = pending.get(cacheKey);
        if (!building) {
          building = (async () => {
            const bytes = await readFile(candidate);
            const body =
              encoding === "br"
                ? await compressBr(bytes, {
                    params: { [constants.BROTLI_PARAM_QUALITY]: 4 },
                  })
                : encoding === "gzip"
                  ? await compressGzip(bytes)
                  : bytes;
            const built = {
              body,
              etag: `"${createHash("sha256").update(body).digest("base64url")}"`,
            };
            // 缓存有上限，字体和重复访问不触发无限内存增长。
            if (body.length <= 32 * 1024 * 1024) {
              if (cachedBytes + body.length > 64 * 1024 * 1024) {
                cached.clear();
                cachedBytes = 0;
              }
              cached.set(cacheKey, built);
              cachedBytes += body.length;
            }
            return built;
          })();
          pending.set(cacheKey, building);
          // 合并同一文件的冷缓存请求，避免同时压缩大字体导致内存和延迟陡增。
          building.finally(() => pending.delete(cacheKey)).catch(() => {});
        }
        representation = await building;
      }
      const type =
        mimeTypes[extname(candidate).toLowerCase()] ||
        "application/octet-stream";
      response.setHeader("Content-Type", type);
      response.setHeader("Vary", "Accept-Encoding");
      response.setHeader("ETag", representation.etag);
      response.setHeader("Last-Modified", info.mtime.toUTCString());
      response.setHeader(
        "Cache-Control",
        /^\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.[^/]+$/.test(pathname)
          ? "public, max-age=31536000, immutable"
          : "no-cache",
      );
      if (encoding !== "identity")
        response.setHeader("Content-Encoding", encoding);
      if (
        String(request.headers["if-none-match"] || "")
          .split(",")
          .some(
            (tag) =>
              tag.trim().replace(/^W\//, "") === representation.etag ||
              tag.trim() === "*",
          )
      ) {
        response.writeHead(304);
        response.end();
        return;
      }
      response.setHeader("Content-Length", representation.body.length);
      response.writeHead(200);
      response.end(request.method === "HEAD" ? undefined : representation.body);
    } catch (failure) {
      fail(
        ["ENOENT", "ENOTDIR", "EACCES"].includes(failure.code) ? 404 : 500,
        "Static file unavailable",
      );
    }
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const host = process.env.HOST || "127.0.0.1";
  const port = Number(process.env.PORT || 5174);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT must be between 1 and 65535");
  const server = createStaticServer({
    root: process.env.STATIC_ROOT || undefined,
  });
  server.listen(port, host, () =>
    process.stdout.write(`Static site listening on http://${host}:${port}\n`),
  );
}
