/** PDF 内容、分页和原始附件的独立读取回归，使用虚构数据及合成图片。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { generatePdf, exportPdf } from '../src/lib/pdf.js';
import { attachmentName } from '../src/lib/pdfCore.js';
import { wrapText } from '../src/lib/pdfLayout.js';
import fields from '../src/data/fields.json' with { type: 'json' };
import questions from '../src/data/questions.json' with { type: 'json' };

const fontBytes = new Uint8Array(await readFile(new URL('../public/fonts/NotoSansSC-Regular.otf', import.meta.url)));

/**
 * 计算 PNG 数据块校验码。
 * @param {Buffer} bytes 数据块类型及内容
 * @returns {number} 无符号 CRC32
 */
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * 编码 PNG 数据块。
 * @param {string} type 四字符块类型
 * @param {Buffer} data 块内容
 * @returns {Buffer} 含长度和校验码的完整块
 */
function chunk(type, data) {
  const payload = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(payload));
  return Buffer.concat([length, payload, checksum]);
}

/**
 * 生成不同颜色的有效 1 像素图片，避免测试使用个人照片。
 * @param {number} index 用于区分颜色的序号
 * @returns {Buffer} PNG 原始字节
 */
function png(index) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.from([0, index * 13, 220, 80]))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * 构造完整草稿，每个字段和答案带有可核对的标记。
 * @returns {object} 不包含真实个人信息的导出草稿
 */
function makeDraft() {
  const photos = [];
  for (const category of ['selfie', 'nude', 'dick', 'other']) for (let slot = 1; slot <= 4; slot += 1) {
    const bytes = png(photos.length + 1);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const blob = new Blob([bytes], { type: 'image/png' });
    photos.push({ category, slot, blob, previewBlob: blob, name: `合成图片-${photos.length + 1}.png`, mime: 'image/png', sha256, sourceSha256: sha256, compressed: false });
  }
  const numeric = new Set(['height', 'weight', 'shoeSize', 'firstMasturbationAge', 'firstSexAge', 'meetingCount', 'masterCount', 'semenVolume', 'dailyMaxEjaculation']);
  const basicInfo = Object.fromEntries(fields.map((field, index) => [field.key, numeric.has(field.key) ? String(index + 1) : `测试值${index + 1}`]));
  basicInfo.phone = '13800000000';
  basicInfo.qq = '1234567';
  return {
    id: 'test-only', ageConfirmedAt: Date.now(),
    basicInfo,
    answers: questions.map((question) => ({ questionId: question.id, grade: ['A', 'B', 'C', 'D', 'E'][question.id % 5], remark: `备注标记${question.id}` })),
    photos,
  };
}

test('PDF 完整显示 32 字段、125 答案与长备注，16 附件逐字节相同', async () => {
  const draft = makeDraft();
  draft.basicInfo.remark = `${'长备注需要跨页保留全部内容。'.repeat(100)}末尾核对标记`;
  draft.basicInfo.trainingIntention = '第一段\n第二段\n\n第四段';
  draft.photos[0].name = '../危险<script>.png';
  const progress = [];
  const bytes = await generatePdf(draft, { fontBytes, onProgress: (event) => progress.push(event.percent) });
  assert(bytes.byteLength < 64 * 1024 * 1024);
  assert.equal(progress.at(-1), 100);
  assert(progress.every((value, index) => !index || value >= progress[index - 1]));
  const loading = getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: false });
  const document = await loading.promise;
  try {
    assert(document.numPages > 20, '正文及照片应分页展示');
    let fullText = '';
    // 页眉页脚在每页正文之后绘制，抽取顺序上会插入跨页的整句；按纵坐标只累计版心内的文字。
    let bodyText = '';
    let imagePages = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const text = await page.getTextContent();
      fullText += text.items.map((item) => item.str).join('');
      bodyText += text.items
        .filter((item) => item.transform[5] > 58 && item.transform[5] < 785)
        .map((item) => item.str)
        .join('');
      const operators = await page.getOperatorList();
      if (operators.fnArray.includes(OPS.paintImageXObject) || operators.fnArray.includes(OPS.paintInlineImageXObject) || operators.fnArray.includes(OPS.paintSolidColorImageMask)) imagePages += 1;
      assert.equal((await page.getAnnotations()).length, 0, '用户输入不得生成链接或动作');
    }
    for (const field of fields) assert(fullText.includes(field.label), `字段应出现：${field.key}`);
    for (const question of questions) {
      assert(fullText.includes(`备注标记${question.id}`), `备注应出现：${question.id}`);
      assert(fullText.includes(question.itemName), `题目应出现：${question.id}`);
    }
    assert(fullText.includes('末尾核对标记'));
    assert.equal(bodyText.split('长备注需要跨页保留全部内容。').length - 1, 100);
    assert(fullText.includes('第四段'));
    assert.equal(imagePages, 16, '每张照片独立展示');
    const attachments = [...(await document.getAttachments()).entries()];
    assert.equal(attachments.length, 16);
    for (const photo of draft.photos) {
      const attachment = attachments.find(([, item]) => item.filename === attachmentName(photo));
      assert(attachment, `附件应存在：${attachmentName(photo)}`);
      const content = await document.getAttachmentContent(attachment[0]);
      assert.deepEqual(new Uint8Array(content), new Uint8Array(await photo.blob.arrayBuffer()));
    }
    assert.equal(await document.getJSActions(), null);
    // 真正渲染一页以检查嵌入字体可解码，文本提取成功不能替代渲染验证。
    const firstPage = await document.getPage(1);
    const viewport = firstPage.getViewport({ scale: 1 });
    const canvas = document.canvasFactory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await firstPage.render({ canvasContext: canvas.context, viewport }).promise;
    const pixels = canvas.context.getImageData(0, 0, canvas.canvas.width, canvas.canvas.height).data;
    assert(pixels.some((channel, index) => index % 4 !== 3 && channel < 100), '正文必须渲染出非空内容');
    if (process.env.PDF_TEST_PREVIEW === '1') {
      await mkdir('test-results', { recursive: true });
      await writeFile('test-results/pdf-first-page.png', canvas.canvas.toBuffer('image/png'));
    }
    document.canvasFactory.destroy(canvas);
  } finally { await loading.destroy(); }
});

test('字体无法表示的字符替换为占位符并上报，导出不再中断', async () => {
  const draft = makeDraft();
  draft.basicInfo.name = '测试😀😀';
  draft.answers[0].remark = '一家👨‍👩‍👧四口';
  let substitutions = null;
  const bytes = await generatePdf(draft, {
    fontBytes,
    onSubstitution: (info) => { substitutions = info; },
  });
  assert(bytes.byteLength > 0, '替换缺字后仍应生成完整 PDF');
  assert(substitutions, '必须上报被替换的字符');
  assert.equal(substitutions.total, 7, '两个 emoji 与一个家庭序列（含两个ZWJ）共7个码位');
  assert.equal(substitutions.placeholder, '□');
  assert(substitutions.codes.includes('U+1F600'));
  assert(substitutions.codes.includes('U+200D'));
  assert.match(substitutions.message, /^PDF 中文字体无法显示 7 个字符/);
  assert.match(substitutions.pdfText, /U\+1F600（2 处）/);

  // 重新读取生成的 PDF：正文必须写明被替换的码位，且不能出现缺字空白。
  const loading = getDocument({ data: bytes, useSystemFonts: false });
  const document = await loading.promise;
  try {
    const page = await document.getPage(1);
    const text = (await page.getTextContent()).items
      .map((item) => item.str)
      .join("");
    assert(text.includes("测试□"), `姓名行应使用占位符：${text.slice(0, 200)}`);
    assert(text.includes("注意：字体没有以下字符的字形，已用 □ 代替"));
    assert(text.includes("U+1F600（2 处）"));
    assert(text.includes("U+200D（2 处）"));
  } finally {
    await loading.destroy();
  }

  // 反向确认：不含缺字的草稿不产生替换记录。
  const clean = makeDraft();
  let untouched = null;
  await generatePdf(clean, { fontBytes, onSubstitution: (info) => { untouched = info; } });
  assert.equal(untouched, null);
});

test('缺项、重复图片、损坏的附件摘要和过大文件阻止导出', async () => {
  const missing = makeDraft();
  missing.answers[0].remark = '  ';
  await assert.rejects(generatePdf(missing, { fontBytes }), /备注/);
  const duplicate = makeDraft();
  duplicate.photos[1].sha256 = duplicate.photos[0].sha256;
  await assert.rejects(generatePdf(duplicate, { fontBytes }), /重复/);
  const corrupted = makeDraft();
  corrupted.photos[0].sha256 = 'a'.repeat(64);
  await assert.rejects(generatePdf(corrupted, { fontBytes }), /摘要不一致/);
  const oversized = makeDraft();
  oversized.photos[0].blob = new Blob([new Uint8Array(2 * 1024 * 1024 + 1)], { type: 'image/png' });
  await assert.rejects(generatePdf(oversized, { fontBytes }), /容量限制/);
});

test('预先取消和生成中取消都保留 AbortError', async () => {
  const already = new AbortController();
  already.abort();
  await assert.rejects(generatePdf(makeDraft(), { fontBytes, signal: already.signal }), { name: 'AbortError' });
  await assert.rejects(exportPdf(makeDraft(), { signal: already.signal }), { name: 'AbortError' });
  const during = new AbortController();
  await assert.rejects(generatePdf(makeDraft(), {
    fontBytes, signal: during.signal,
    onProgress: ({ stage }) => { if (stage === '排版自评内容') during.abort(); },
  }), { name: 'AbortError' });
});

test('Worker 无法启动时本地回退，运行中取消不会再次生成', async () => {
  const previousWorker = globalThis.Worker;
  const previousFetch = globalThis.fetch;
  let fontRequests = 0;
  let terminated = 0;
  try {
    globalThis.fetch = async () => { fontRequests += 1; return new Response(fontBytes); };
    globalThis.Worker = class {
      constructor() { throw new Error('Worker unavailable'); }
    };
    const result = await exportPdf(makeDraft());
    assert.equal(result.blob.type, 'application/pdf');
    assert(result.blob.size > 0);
    assert.equal(fontRequests, 1);
    globalThis.Worker = class {
      postMessage() { queueMicrotask(() => this.onmessage({ data: { type: 'progress', progress: { percent: 2 } } })); }
      terminate() { terminated += 1; }
    };
    const controller = new AbortController();
    await assert.rejects(exportPdf(makeDraft(), { signal: controller.signal, onProgress: () => controller.abort() }), { name: 'AbortError' });
    assert.equal(fontRequests, 1, '取消后不得启动主线程回退');
    assert.equal(terminated, 1, '取消后必须释放 Worker');
  } finally {
    globalThis.fetch = previousFetch;
    if (previousWorker === undefined) delete globalThis.Worker;
    else globalThis.Worker = previousWorker;
  }
});

test('附件名移除路径、双向控制字符及可执行扩展名', () => {
  assert.equal(attachmentName({ category: 'selfie', slot: 1, name: '../../evil\u202E.exe', mime: 'image/png' }), 'selfie-1-evil_.png');
  assert.equal(attachmentName({ category: 'other', slot: 4, name: 'C:\\x\\a.jpg', mime: 'image/jpeg' }), 'other-4-a.jpg');
});

test('换行保留空段落和 Unicode 码点', () => {
  const font = { widthOfTextAtSize: () => 1 };
  assert.deepEqual(wrapText('甲乙丙\n\n丁𠮷', font, 10, 2), ['甲乙', '丙', '', '丁𠮷']);
});

test('16 张各 2 MiB 的附件在容量边界内生成，附件可完整取回', async () => {
  const draft = makeDraft();
  for (const [index, photo] of draft.photos.entries()) {
    const small = png(index + 1);
    const padding = Buffer.alloc(2 * 1024 * 1024 - small.length - 12);
    let state = index + 12345;
    for (let offset = 0; offset < padding.length; offset += 1) {
      state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
      padding[offset] = state & 255;
    }
    // 合法的私有 ancillary 块承载合成数据，最终原文件恰为 2 MiB。
    const bytes = Buffer.concat([small.subarray(0, -12), chunk('raNd', padding), small.subarray(-12)]);
    photo.blob = new Blob([bytes], { type: 'image/png' });
    photo.sha256 = createHash('sha256').update(bytes).digest('hex');
    photo.sourceSha256 = photo.sha256;
  }
  const bytes = await generatePdf(draft, { fontBytes });
  assert(bytes.byteLength < 64 * 1024 * 1024);
  assert(bytes.byteLength > 32 * 1024 * 1024);
  const loading = getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: false });
  const document = await loading.promise;
  try {
    const attachments = await document.getAttachments();
    assert.equal(attachments.size, 16);
    for (const [id, attachment] of attachments) {
      const photo = draft.photos.find((item) => attachmentName(item) === attachment.filename);
      const content = await document.getAttachmentContent(id);
      assert.equal(content.length, 2 * 1024 * 1024);
      assert.equal(createHash('sha256').update(content).digest('hex'), photo.sha256);
    }
  } finally { await loading.destroy(); }
});
