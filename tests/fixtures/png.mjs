/** 合成 PNG 测试样本：提供 Adam7 与可控 TIFF 方向，不含个人照片。 */
import { deflateSync } from "node:zlib";

/**
 * 计算 PNG 块的校验和，保证测试修改格式字段时仍是完整容器。
 * @param {Buffer} bytes 块类型与内容。
 * @returns {number} CRC-32。
 */
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * 包装 PNG 块，包含准确长度与 CRC。
 * @param {string} type 四字符块类型。
 * @param {Buffer} [data] 块内容。
 * @returns {Buffer} 完整块。
 */
function chunk(type, data = Buffer.alloc(0)) {
  const bytes = Buffer.concat([Buffer.from(type), data]);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(bytes));
  return Buffer.concat([size, bytes, checksum]);
}

/**
 * 生成实际可解码的 RGBA PNG；小尺寸覆盖 Adam7 空轮次。
 * @param {object} [options] 交错方式、尺寸及可选 EXIF 块。
 * @returns {Buffer} 只有合成色块的图片。
 */
export function png({ interlace = 0, width = 9, height = 7, exif } = {}) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[12] = interlace;
  const passes =
    interlace === 1
      ? [
          [0, 0, 8, 8],
          [4, 0, 8, 8],
          [0, 4, 4, 8],
          [2, 0, 4, 4],
          [0, 2, 2, 4],
          [1, 0, 2, 2],
          [0, 1, 1, 2],
        ]
      : [[0, 0, 1, 1]];
  const pixels = [];
  for (const [startX, startY, stepX, stepY] of passes) {
    if (startX >= width) continue;
    for (let y = startY; y < height; y += stepY) {
      pixels.push(0);
      for (let x = startX; x < width; x += stepX)
        pixels.push((x * 23) % 256, (y * 31) % 256, 90, 255);
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    ...(exif ? [chunk("eXIf", exif)] : []),
    chunk("IDAT", deflateSync(Buffer.from(pixels))),
    chunk("IEND"),
  ]);
}

/**
 * 生成合法 TIFF 头和 0th IFD，允许偏移留白以检查实际偏移读取。
 * @param {number} orientation EXIF 方向值。
 * @param {boolean} littleEndian 是否使用 Intel 字节序。
 * @param {number} [offset] 第一个 IFD 相对 TIFF 头的偏移。
 * @returns {Buffer} 不带 JPEG Exif 标识的 PNG eXIf 内容。
 */
export function exifOrientation(orientation, littleEndian, offset = 8) {
  const bytes = Buffer.alloc(offset + 18);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  bytes.write(littleEndian ? "II" : "MM");
  view.setUint16(2, 42, littleEndian);
  view.setUint32(4, offset, littleEndian);
  view.setUint16(offset, 1, littleEndian);
  view.setUint16(offset + 2, 0x0112, littleEndian);
  view.setUint16(offset + 4, 3, littleEndian);
  view.setUint32(offset + 6, 1, littleEndian);
  view.setUint16(offset + 10, orientation, littleEndian);
  return bytes;
}
