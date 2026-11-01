/** 构建时预压缩静态资源，避免小带宽服务器在首个访问请求中压缩大字库。 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { gzip, brotliCompress, constants } from "node:zlib";
import { filesUnder } from "./verification-support.mjs";

const gzipAsync = promisify(gzip);
const brotliAsync = promisify(brotliCompress);
const root = resolve(process.argv[2] || "dist");
let count = 0;
for (const file of await filesUnder(root)) {
  if (!/\.(html|js|mjs|css|json|svg|otf|ttf)$/.test(file)) continue;
  const input = await readFile(file);
  if (input.length < 256) continue;
  // 每次只处理一份资源，限制字库压缩的峰值内存；压缩仅发生在构建机。
  const [gz, br] = await Promise.all([
    gzipAsync(input, { level: 9 }),
    brotliAsync(input, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }),
  ]);
  await Promise.all([writeFile(`${file}.gz`, gz), writeFile(`${file}.br`, br)]);
  count++;
}
console.log(`预压缩 ${count} 份静态资源（gzip / Brotli）。`);
