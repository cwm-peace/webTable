/** 生成一份合成数据的样例 PDF，用于人工核对版面风格。不纳入测试。 */
import { readFile, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { generatePdf } from '../src/lib/pdfCore.js';
import fields from '../src/data/fields.json' with { type: 'json' };
import questions from '../src/data/questions.json' with { type: 'json' };

const fontBytes = new Uint8Array(await readFile(new URL('../public/fonts/NotoSansSC-Regular.otf', import.meta.url)));

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const payload = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(payload));
  return Buffer.concat([length, payload, checksum]);
}
function png(index) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(64, 0);
  header.writeUInt32BE(64, 4);
  header[8] = 8;
  header[9] = 2;
  const row = Buffer.alloc(1 + 64 * 3);
  for (let i = 0; i < 64; i += 1) {
    row[1 + i * 3] = (index * 13) % 255;
    row[1 + i * 3 + 1] = 220;
    row[1 + i * 3 + 2] = 80;
  }
  const scan = Buffer.concat(Array.from({ length: 64 }, () => row));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(scan)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const photos = [];
for (const category of ['selfie', 'nude', 'dick', 'other']) for (let slot = 1; slot <= 4; slot += 1) {
  const bytes = png(photos.length + 1);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const blob = new Blob([bytes], { type: 'image/png' });
  photos.push({ category, slot, blob, previewBlob: blob, name: `合成图片-${photos.length + 1}.png`, mime: 'image/png', sha256, sourceSha256: sha256, compressed: false, width: 64, height: 64 });
}
const numeric = new Set(['height', 'weight', 'shoeSize', 'firstMasturbationAge', 'firstSexAge', 'meetingCount', 'masterCount', 'semenVolume', 'dailyMaxEjaculation']);
const basicInfo = Object.fromEntries(fields.map((field, index) => [field.key, numeric.has(field.key) ? String(index + 1) : `测试值${index + 1}`]));
basicInfo.phone = '13800000000';
basicInfo.qq = '1234567';
const draft = {
  id: 'sample-only', ageConfirmedAt: Date.now(),
  basicInfo,
  answers: questions.map((question) => ({ questionId: question.id, grade: ['A', 'B', 'C', 'D', 'E'][question.id % 5], remark: `备注标记${question.id}` })),
  photos,
};
const bytes = await generatePdf(draft, { fontBytes });
const output = new URL('../奴测档案-样例.pdf', import.meta.url);
await writeFile(output, bytes);
console.log(`已生成 ${output.pathname}（${(bytes.byteLength / 1024).toFixed(0)} KiB）`);
