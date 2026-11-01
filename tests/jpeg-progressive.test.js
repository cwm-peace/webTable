/** JPEG 多扫描回归：使用 Pillow 生成的合成渐变图，无个人照片。 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inspectImage } from "../src/lib/imageHeader.js";
import { processImage } from "../src/lib/images.js";

const progressive = readFileSync(
  new URL("./fixtures/progressive.jpg", import.meta.url),
);

test("渐进 JPEG 的多次扫描、标记填充与 EOI 后元数据均可解析", () => {
  // 相同真实编码用于容器和浏览器用例，避免只验证手写的伪 JPEG。
  assert(progressive.includes(Buffer.from([0xff, 0xc2])));
  const padded = Buffer.concat([
    progressive.subarray(0, 2),
    Buffer.from([0xff, 0xff]),
    progressive.subarray(2),
    Buffer.from("SYNTHETIC_TRAILING_METADATA"),
  ]);
  for (const bytes of [progressive, padded]) {
    const result = inspectImage(bytes);
    assert.equal(result.mime, "image/jpeg");
    assert.equal(result.width, 80);
    assert.equal(result.height, 60);
    assert.equal(result.orientation, 1);
  }
});

test("渐进 JPEG 截断、缺少扫描或段长度越界仍拒绝", () => {
  assert.throws(() => inspectImage(progressive.subarray(0, -2)), {
    code: "IMAGE_CORRUPT",
  });
  const scan = progressive.indexOf(Buffer.from([0xff, 0xda]));
  assert.throws(
    () =>
      inspectImage(
        Buffer.concat([
          progressive.subarray(0, scan),
          Buffer.from([0xff, 0xd9]),
        ]),
      ),
    { code: "IMAGE_CORRUPT" },
  );
  const invalidLength = Buffer.from(progressive);
  invalidLength.writeUInt16BE(65535, scan + 2);
  assert.throws(() => inspectImage(invalidLength), { code: "IMAGE_CORRUPT" });
  const laterScan = progressive.indexOf(Buffer.from([0xff, 0xda]), scan + 2);
  assert(laterScan > scan);
  assert.throws(() => inspectImage(progressive.subarray(0, laterScan + 3)), {
    code: "IMAGE_CORRUPT",
  });
});

test("损坏 JPEG 不因 MIME 为空或通用类型而进入容错解码", async () => {
  for (const type of ["", "application/octet-stream", "image/jpeg"]) {
    const image = new File([progressive.subarray(0, -2)], "synthetic.jpg", {
      type,
    });
    await assert.rejects(processImage(image), { code: "IMAGE_CORRUPT" });
  }
});
