/** 验收脚本共用的文件清单、内容指纹和原始 HTTP 测量工具。 */
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { relative, join, dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import { request } from "node:http";

/**
 * 按稳定顺序列出目录中的普通文件；不跟随符号链接。
 * @param {string} directory 待读取目录。
 * @returns {Promise<string[]>} 文件绝对路径列表。
 */
export async function filesUnder(directory) {
  const output = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) output.push(...(await filesUnder(path)));
    else if (item.isFile()) output.push(path);
  }
  return output.sort();
}

/**
 * 为文件清单计算包括相对路径在内的内容指纹。
 * @param {string[]} files 文件路径列表。
 * @param {string} root 路径基准。
 * @returns {Promise<{sha256:string,files:number}>} 总摘要与文件数量。
 */
export async function fingerprint(files, root) {
  const hash = createHash("sha256");
  for (const file of [...files].sort()) {
    hash.update(relative(root, file)).update("\0");
    hash
      .update(
        createHash("sha256")
          .update(await readFile(file))
          .digest(),
      )
      .update("\0");
  }
  return { sha256: hash.digest("hex"), files: files.length };
}

/**
 * 保存人可读的 JSON 测量报告。
 * @param {string} file 输出文件路径。
 * @param {object} data 报告数据。
 * @returns {Promise<void>} 文件写入完成。
 */
export async function writeJson(file, data) {
  await mkdir(dirname(resolve(file)), { recursive: true });
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
}

/**
 * 发起 HTTP 请求并读取原始编码字节，不执行 gzip/br 解压。
 * @param {string} url 本机测量 URL。
 * @param {object} [options] headers请求头、agent连接池及timeoutMs超时。
 * @returns {Promise<{status:number,headers:object,bytes:number,durationMs:number}>} HTTP状态、头、编码正文大小及完整传输耗时。
 */
export function measuredRequest(
  url,
  { headers = {}, agent, timeoutMs = 20_000 } = {},
) {
  const started = performance.now();
  return new Promise((accept, reject) => {
    const req = request(url, { headers, agent }, (response) => {
      let bytes = 0;
      response.on("data", (part) => {
        bytes += part.length;
      });
      response.on("aborted", () => reject(new Error("HTTP response aborted")));
      response.on("error", reject);
      response.on("end", () =>
        accept({
          status: response.statusCode,
          headers: response.headers,
          bytes,
          durationMs: performance.now() - started,
        }),
      );
    });
    req.setTimeout(timeoutMs, () =>
      req.destroy(new Error(`HTTP request exceeded ${timeoutMs} ms`)),
    );
    req.on("error", reject);
    req.end();
  });
}

/**
 * 计算有限样本的百分位数，空样本返回 null。
 * @param {number[]} values 数值样本。
 * @param {number} quantile 百分位比例，范围0至1。
 * @returns {number|null} 排序后的最近秩百分位。
 */
export function percentile(values, quantile) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)];
}
