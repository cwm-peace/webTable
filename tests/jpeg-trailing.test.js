/** 验证 JPEG EOI 后的额外数据不会导致解析失败 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { inspectImage } from '../src/lib/imageHeader.js'

// 复用测试工具的 JPEG 生成函数
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

test('JPEG EOI 后的额外数据（厂商元数据）不应导致解析失败', () => {
  // 创建一个标准 JPEG，然后在 EOI 后添加额外数据
  const baseJpeg = jpeg(1)
  const jpegWithTrailing = Buffer.concat([
    baseJpeg,
    // 以下是 EOI 之后的额外数据（模拟手机相机添加的元数据）
    Buffer.from('EXTRA_METADATA_FROM_CAMERA'),
    Buffer.alloc(1024, 0xaa), // 额外的厂商私有数据
  ])
  
  const metadata = inspectImage(jpegWithTrailing)
  assert.equal(metadata.width, 3)
  assert.equal(metadata.height, 2)
  assert.equal(metadata.mime, 'image/jpeg')
  assert.equal(metadata.orientation, 1)
  
  // 确认没有额外数据的标准 JPEG 也能正常工作
  const standardMetadata = inspectImage(baseJpeg)
  assert.equal(standardMetadata.width, 3)
  assert.equal(standardMetadata.height, 2)
})
