/** PNG 相册兼容回归：用合成像素覆盖 Adam7 交错、EXIF 字节序及损坏容器。 */
import test from "node:test";
import assert from "node:assert/strict";
import { loadImage } from "@napi-rs/canvas";
import { inspectImage } from "../src/lib/imageHeader.js";

import { png, exifOrientation } from "./fixtures/png.mjs";

test("valid Adam7 PNGs pass container checks and independently decode", async () => {
  for (const [width, height] of [
    [1, 1],
    [3, 2],
    [9, 7],
  ]) {
    const bytes = png({ interlace: 1, width, height });
    const decoded = await loadImage(bytes);
    assert.equal(decoded.width, width);
    assert.equal(decoded.height, height);
    const metadata = inspectImage(bytes);
    assert.equal(metadata.width, width);
    assert.equal(metadata.height, height);
  }
});

test("PNG EXIF orientation follows TIFF byte order and IFD offsets", () => {
  for (const littleEndian of [true, false]) {
    for (const orientation of [1, 6, 8]) {
      for (const offset of [8, 20]) {
        const metadata = inspectImage(
          png({
            exif: exifOrientation(orientation, littleEndian, offset),
          }),
        );
        assert.equal(metadata.orientation, orientation);
        assert.equal(metadata.displayWidth, orientation === 1 ? 9 : 7);
        assert.equal(metadata.displayHeight, orientation === 1 ? 7 : 9);
      }
    }
  }
});

test("PNG compatibility does not accept unsupported interlace or broken CRC", () => {
  assert.throws(() => inspectImage(png({ interlace: 2 })), {
    code: "IMAGE_CORRUPT",
  });
  const badChecksum = png({ interlace: 1 });
  badChecksum[29] ^= 1;
  assert.throws(() => inspectImage(badChecksum), { code: "IMAGE_CORRUPT" });
  assert.throws(() => inspectImage(png({ interlace: 1 }).subarray(0, -1)), {
    code: "IMAGE_CORRUPT",
  });
});

test("PNG EXIF rejects truncated IFD, invalid byte order and invalid orientation", () => {
  const truncated = exifOrientation(6, true).subarray(0, 14);
  const invalidByteOrder = exifOrientation(6, true);
  invalidByteOrder.write("ZZ");
  const escapedOffset = exifOrientation(6, false);
  escapedOffset.writeUInt32BE(0xffffffff, 4);
  for (const exif of [
    truncated,
    invalidByteOrder,
    escapedOffset,
    exifOrientation(0, true),
    exifOrientation(9, false),
  ]) {
    assert.throws(() => inspectImage(png({ exif })), { code: "IMAGE_CORRUPT" });
  }
});
