/** 静态服务隔离测试：真实HTTP请求验证只读边界、路径安全和压缩缓存语义。 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import {
  createStaticServer,
  selectEncoding,
} from "../scripts/static-server.mjs";

/**
 * 保留原始URL路径发送请求，避免fetch在发出前规整路径穿越测试样本。
 * @param {number} port 隔离服务器随机端口
 * @param {string} path 请求路径
 * @param {object} options 方法与请求头
 * @returns {Promise<object>} 状态、响应头和未解压正文
 */
function get(port, path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = request(
      { hostname: "127.0.0.1", port, path, ...options },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () =>
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks),
          }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

test("编码协商尊重权重、拒绝值和identity", () => {
  assert.equal(selectEncoding("gzip, br"), "br");
  assert.equal(selectEncoding("br;q=0, gzip"), "gzip");
  assert.equal(selectEncoding("br;q=0.5, gzip;q=0.8, identity;q=0"), "gzip");
  assert.equal(selectEncoding("*;q=0"), null);
  assert.equal(selectEncoding(""), "identity");
});

test("真实HTTP静态服务安全、压缩和缓存", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "webtable-static-"));
  const root = join(directory, "dist");
  await mkdir(join(root, "assets"), { recursive: true });
  const html = "<!doctype html><title>Local test</title>";
  const script = "const test = true;\n".repeat(100);
  await writeFile(join(root, "index.html"), html);
  await writeFile(join(root, "assets/app-Abcd1234.js"), script);
  await writeFile(join(root, ".secret"), "hidden");
  await writeFile(join(directory, "outside.txt"), "outside");
  await symlink(join(directory, "outside.txt"), join(root, "escape.txt"));
  const server = createStaticServer({ root });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  const port = server.address().port;
  const first = await get(port, "/");
  assert.equal(first.status, 200);
  assert.equal(first.body.toString(), html);
  assert.equal(first.headers["cache-control"], "no-cache");
  assert.match(first.headers["content-security-policy"], /connect-src 'self'/);
  assert.equal(first.headers["x-content-type-options"], "nosniff");
  assert.equal(first.headers["referrer-policy"], "no-referrer");
  for (const coding of ["br", "gzip"]) {
    const response = await get(port, "/assets/app-Abcd1234.js", {
      headers: { "Accept-Encoding": coding },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers["content-encoding"], coding);
    assert.equal(
      (coding === "br"
        ? brotliDecompressSync(response.body)
        : gunzipSync(response.body)
      ).toString(),
      script,
    );
    assert.match(response.headers["cache-control"], /immutable/);
    assert.equal(response.headers.vary, "Accept-Encoding");
    const cached = await get(port, "/assets/app-Abcd1234.js", {
      headers: {
        "Accept-Encoding": coding,
        "If-None-Match": response.headers.etag,
      },
    });
    assert.equal(cached.status, 304);
    assert.equal(cached.body.length, 0);
  }
  const head = await get(port, "/", { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(head.body.length, 0);
  assert.equal(Number(head.headers["content-length"]), Buffer.byteLength(html));
  assert.equal((await get(port, "/", { method: "POST" })).status, 405);
  assert.equal(
    (await get(port, "/", { headers: { "Accept-Encoding": "*;q=0" } })).status,
    406,
  );
  for (const path of ["/api/form", "/admin", "/missing", "/escape.txt"])
    assert.equal((await get(port, path)).status, 404);
  for (const path of [
    "/../outside.txt",
    "/%2e%2e/outside.txt",
    "/.secret",
    "/assets%2fapp-Abcd1234.js",
    "/%zz",
  ])
    assert.equal((await get(port, path)).status, 400);
});
