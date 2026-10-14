/** 图片边界回归：使用合成容器检查格式识别、尺寸策略、摘要和取消行为。 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { deflateSync } from 'node:zlib'
import {
  IMAGE_LIMITS,
  exceedsInputLimits,
  fitWithin,
  inspectImage,
  mimeGroup,
  sameMimeGroup,
  sniffMime,
} from '../src/lib/imageHeader.js'
import { processImage, sha256 } from '../src/lib/images.js'

/**
 * 为测试 PNG 计算 CRC。
 * @param {Uint8Array} data 块类型和内容。
 * @returns {number} CRC32。
 */
function crc(data) {
  let result = 0xffffffff
  for (const byte of data) {
    result ^= byte
    for (let index = 0; index < 8; index += 1) result = result & 1 ? 0xedb88320 ^ (result >>> 1) : result >>> 1
  }
  return (result ^ 0xffffffff) >>> 0
}

/**
 * 生成一个完整 PNG 块。
 * @param {string} type 块类型。
 * @param {Uint8Array} content 块内容。
 * @returns {Buffer} 带长度和 CRC 的块。
 */
function chunk(type, content = Buffer.alloc(0)) {
  const data = Buffer.concat([Buffer.from(type), content])
  const length = Buffer.alloc(4)
  const checksum = Buffer.alloc(4)
  length.writeUInt32BE(content.length)
  checksum.writeUInt32BE(crc(data))
  return Buffer.concat([length, data, checksum])
}

/**
 * 创建尺寸可控的合成 PNG；只有 1×1 情况包含对应像素。
 * @param {number} width 声明宽度。
 * @param {number} height 声明高度。
 * @param {Buffer[]} extra 插在图像前的额外块。
 * @returns {Buffer} 测试 PNG。
 */
function png(width = 1, height = 1, extra = []) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), ...extra, chunk('IDAT', deflateSync(Buffer.from([0, 255, 0, 0, 255]))), chunk('IEND')])
}

/**
 * 创建 JPEG 结构，像素解码由浏览器集成测试另行验证。
 * @param {number} orientation EXIF 方向。
 * @returns {Buffer} JPEG 标记序列。
 */
function jpeg(orientation = 1) {
  const exif = Buffer.alloc(32)
  exif.write('Exif', 0)
  exif.write('II', 6)
  exif.writeUInt16LE(42, 8)
  exif.writeUInt32LE(8, 10)
  exif.writeUInt16LE(1, 14)
  exif.writeUInt16LE(0x112, 16)
  exif.writeUInt16LE(3, 18)
  exif.writeUInt32LE(1, 20)
  exif.writeUInt16LE(orientation, 24)
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0, 34]), exif,
    Buffer.from([0xff, 0xc0, 0, 11, 8, 0, 2, 0, 3, 1, 1, 0x11, 0]),
    Buffer.from([0xff, 0xda, 0, 8, 1, 1, 0, 0, 63, 0, 0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x12, 0xff, 0xd9]),
  ])
}

/**
 * 包装单个 WebP 块。
 * @param {string} type 块类型。
 * @param {Buffer} payload 位流或扩展头。
 * @returns {Buffer} WebP 文件。
 */
function webp(type, payload) {
  return webpFile([[type, payload]])
}

/**
 * 按 RIFF 结构组装多个 WebP 块。
 * @param {Array<[string, Buffer]>} chunks 块类型与内容。
 * @returns {Buffer} WebP 文件。
 */
function webpFile(chunks) {
  const body = chunks
    .map(([type, payload]) => {
      const head = Buffer.alloc(8)
      head.write(type)
      head.writeUInt32LE(payload.length, 4)
      return Buffer.concat([head, payload, Buffer.alloc(payload.length & 1)])
    })
    .reduce((all, item) => Buffer.concat([all, item]), Buffer.alloc(0))
  const header = Buffer.alloc(12)
  header.write('RIFF')
  header.writeUInt32LE(body.length + 4, 4)
  header.write('WEBP', 8)
  return Buffer.concat([header, body])
}

/**
 * 生成 VP8X 扩展头。
 * @param {number} width 画布宽度。
 * @param {number} height 画布高度。
 * @param {boolean} animated 是否声明动画。
 * @returns {Buffer} 10 字节扩展头。
 */
function vp8x(width, height, animated = false) {
  const payload = Buffer.alloc(10)
  if (animated) payload[0] = 2
  const storedWidth = width - 1
  const storedHeight = height - 1
  payload[4] = storedWidth & 0xff
  payload[5] = (storedWidth >> 8) & 0xff
  payload[6] = (storedWidth >> 16) & 0xff
  payload[7] = storedHeight & 0xff
  payload[8] = (storedHeight >> 8) & 0xff
  payload[9] = (storedHeight >> 16) & 0xff
  return payload
}

/**
 * 生成结构合法的最小 GIF，用帧数区分静态与动图。
 * @param {number} frames 图像帧数。
 * @returns {Buffer} GIF89a 字节。
 */
function gif(frames = 1) {
  const screen = Buffer.alloc(7)
  screen.writeUInt16LE(2, 0)
  screen.writeUInt16LE(2, 2)
  screen[4] = 0xf0
  const palette = Buffer.from([0, 0, 0, 255, 255, 255])
  const frame = Buffer.concat([
    Buffer.from([0x2c, 0, 0, 0, 0, 2, 0, 2, 0, 0]),
    Buffer.from([0x02, 0x02, 0x04, 0x05, 0x00]),
  ])
  const images = Array.from({ length: frames }, () => frame)
  return Buffer.concat([Buffer.from('GIF89a'), screen, palette, ...images, Buffer.from([0x3b])])
}

test('PNG checks CRC, dimensions, end marker and rejects trailing bytes', () => {
  assert.deepEqual(inspectImage(png()), { mime: 'image/png', width: 1, height: 1, orientation: 1, animated: false, displayWidth: 1, displayHeight: 1 })
  const corrupted = png()
  corrupted[corrupted.length - 8] ^= 1
  assert.throws(() => inspectImage(corrupted), { code: 'IMAGE_CORRUPT' })
  assert.throws(() => inspectImage(png().subarray(0, -1)), { code: 'IMAGE_CORRUPT' })
  assert.throws(() => inspectImage(Buffer.concat([png(), Buffer.from('junk')])), { code: 'IMAGE_CORRUPT' })
})

test('超出自动缩小门槛的尺寸照常返回，只拒绝超过解码硬上限的图片', () => {
  assert.equal(inspectImage(png(8193, 1)).width, 8193)
  const large = inspectImage(png(5001, 5000))
  assert.equal(large.width, 5001)
  assert.equal(exceedsInputLimits(large.width, large.height), true)
  assert.equal(exceedsInputLimits(4928, 6560), true)
  assert.equal(exceedsInputLimits(1920, 1080), false)
  assert.throws(() => inspectImage(png(IMAGE_LIMITS.decodeSide + 1, 1)), { code: 'IMAGE_DIMENSIONS' })
  assert.throws(() => inspectImage(png(20000, 10001)), { code: 'IMAGE_DIMENSIONS' })
  assert.throws(() => inspectImage(png(0, 1)), { code: 'IMAGE_CORRUPT' })
  assert.equal(inspectImage(png(5000, 5000)).width, 5000)
  assert.throws(() => inspectImage(new Uint8Array(IMAGE_LIMITS.inputBytes + 1)), { code: 'IMAGE_TOO_LARGE' })
})

test('自动缩小只等比缩放，不放大原始图片', () => {
  assert.deepEqual(fitWithin(4928, 6560, 2560), { width: 1923, height: 2560 })
  assert.deepEqual(fitWithin(800, 600, 2560), { width: 800, height: 600 })
  assert.deepEqual(fitWithin(0, 0, 2560), { width: 1, height: 1 })
})

test('APNG、动画 WebP 与 GIF 标记为动图并交给解码器取首帧', () => {
  assert.equal(inspectImage(png(1, 1, [chunk('acTL', Buffer.alloc(8))])).animated, true)
  assert.equal(inspectImage(webpFile([['VP8X', vp8x(10, 20, true)], ['ANIM', Buffer.alloc(6)]])).animated, true)
  assert.equal(inspectImage(webp('VP8L', Buffer.from([0x2f, 0, 0, 0, 0]))).animated, false)
})

test('GIF 结构被逐块校验，静态与动图按帧数区分', () => {
  const still = inspectImage(gif())
  assert.deepEqual(still, { mime: 'image/gif', width: 2, height: 2, orientation: 1, animated: false, displayWidth: 2, displayHeight: 2 })
  assert.equal(inspectImage(gif(3)).animated, true)
  assert.throws(() => inspectImage(gif().subarray(0, -1)), { code: 'IMAGE_CORRUPT' })
  const unknownBlock = gif()
  unknownBlock[19] = 0x99
  assert.throws(() => inspectImage(unknownBlock), { code: 'IMAGE_CORRUPT' })
  const brokenSubBlock = gif()
  brokenSubBlock[30] = 0x40
  assert.throws(() => inspectImage(brokenSubBlock), { code: 'IMAGE_CORRUPT' })
  // 结束符之后允许厂商附加数据，与 JPEG 的处理保持一致。
  assert.equal(inspectImage(Buffer.concat([gif(), Buffer.from('TRAILER')])).width, 2)
})

test('JPEG handles escaped entropy markers and EXIF orientation without double rotation', () => {
  const result = inspectImage(jpeg(6))
  assert.equal(result.mime, 'image/jpeg')
  assert.equal(result.width, 3)
  assert.equal(result.height, 2)
  assert.equal(result.displayWidth, 2)
  assert.equal(result.displayHeight, 3)
  assert.equal(result.animated, false)
  assert.throws(() => inspectImage(jpeg(9)), { code: 'IMAGE_CORRUPT' })
  assert.throws(() => inspectImage(jpeg().subarray(0, -2)), { code: 'IMAGE_CORRUPT' })
})

test('WebP length and lossless dimensions are checked independently of file extension', () => {
  const result = inspectImage(webp('VP8L', Buffer.from([0x2f, 0, 0, 0, 0])))
  assert.equal(result.mime, 'image/webp')
  assert.equal(result.width, 1)
  assert.equal(result.height, 1)
  const corrupt = webp('VP8L', Buffer.from([0x2f, 0, 0, 0, 0]))
  corrupt.writeUInt32LE(0xffffffff, 16)
  assert.throws(() => inspectImage(corrupt), { code: 'IMAGE_CORRUPT' })
  assert.throws(() => inspectImage(corrupt.subarray(0, -1)), { code: 'IMAGE_CORRUPT' })
  assert.throws(() => inspectImage(Buffer.from('<svg>not an image</svg>')), { code: 'IMAGE_TYPE' })
})

test('文件头探测覆盖浏览器可解码的其他格式', () => {
  assert.equal(sniffMime(Buffer.from('BM12345678', 'latin1')), 'image/bmp')
  assert.equal(sniffMime(Buffer.from([0x49, 0x49, 0x2a, 0x00, 1, 2, 3, 4])), 'image/tiff')
  assert.equal(sniffMime(Buffer.from([0x00, 0x00, 0x01, 0x00, 1, 2, 3, 4])), 'image/x-icon')
  assert.equal(sniffMime(gif()), 'image/gif')
  const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(8)])
  assert.equal(sniffMime(heic), 'image/heic')
  const avif = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypavif'), Buffer.alloc(8)])
  assert.equal(sniffMime(avif), 'image/avif')
  assert.equal(sniffMime(Buffer.from('<?xml version="1.0"?><svg viewBox="0 0 4 4"></svg>')), 'image/svg+xml')
  assert.equal(sniffMime(Buffer.from('not an image at all')), '')
  assert.equal(sniffMime(png()), 'image/png')
  // processImage 传入 file.arrayBuffer() 的结果，必须同样识别。
  const view = png()
  assert.equal(sniffMime(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength)), 'image/png')
  assert.equal(sniffMime('text'), '')
})

test('声明格式与内容格式按组比较，别名不算冲突', () => {
  assert.equal(mimeGroup('image/jpg'), 'jpeg')
  assert.equal(mimeGroup('application/octet-stream'), '')
  assert.equal(sameMimeGroup('image/heic', 'image/heif'), true)
  assert.equal(sameMimeGroup('image/png', 'image/apng'), true)
  assert.equal(sameMimeGroup('image/png', 'image/jpeg'), false)
  assert.equal(sameMimeGroup('', 'image/jpeg'), true)
})

test('SHA-256 is byte-based and stable across renamed files', async () => {
  const first = new File(['abc'], 'first.png')
  const second = new File(['abc'], 'second.png')
  assert.equal(await sha256(first), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  assert.equal(await sha256(first), await sha256(second))
})

test('processImage rejects oversized files, forged MIME and cancellation before decode', async () => {
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(processImage(new File([png()], 'a.png'), { signal: controller.signal }), { name: 'AbortError' })
  await assert.rejects(processImage({ size: IMAGE_LIMITS.inputBytes + 1, arrayBuffer() { throw new Error('Must not allocate') } }), { code: 'IMAGE_TOO_LARGE' })
  await assert.rejects(processImage(new File([png()], 'a.jpg', { type: 'image/jpeg' })), { code: 'IMAGE_TYPE' })
  await assert.rejects(processImage(new File(['<html>invalid data</html>'], 'a.png', { type: 'image/png' })), { code: 'IMAGE_TYPE' })
  await assert.rejects(processImage(new File([png().subarray(0, 20)], 'a.png', { type: 'image/png' })), { code: 'IMAGE_CORRUPT' })
})

test('processImage 在无浏览器解码器时明确报告无法解码', async () => {
  await assert.rejects(processImage(new File([gif()], 'a.gif', { type: 'image/gif' })), { code: 'IMAGE_DECODE' })
  await assert.rejects(processImage(new File([Buffer.from('plain text file body')], 'a.bin')), { code: 'IMAGE_DECODE' })
})
