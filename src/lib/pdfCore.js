/**
 * 在当前设备生成包含完整表单、照片和文件附件的 PDF。
 * 只从同源静态路径加载字体，不上传草稿，不持久保存生成结果。
 */
import { PDFDocument } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {
  allBasicFields as fields,
  fieldGroups,
  questions,
  photoCategories as CATEGORIES,
  grades as GRADE_LABELS,
  validateRevision,
} from "./formValidation.js";
import { CONTENT_WIDTH, PALETTE, PdfLayout } from "./pdfLayout.js";
import { inspectImage, IMAGE_LIMITS } from "./imageHeader.js";

const MIB = 1024 * 1024;
const MAX_PDF_BYTES = 64 * MIB;
const MIME_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MIME_LABELS = {
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "image/webp": "WebP",
};
/** 超过该长度的字段独占整幅宽，两列网格只放短字段。 */
const LONG_FIELD_LENGTH = 200;
const ASSESSMENT_COLUMNS = [
  { label: "题号", width: 34 },
  { label: "项目", width: 150 },
  { label: "评级", width: 92 },
  { label: "备注", width: CONTENT_WIDTH - 34 - 150 - 92 },
];

/**
 * 在取消后停止导出，调用方可区分主动取消与生成失败。
 * @param {AbortSignal} [signal] 当前导出取消信号
 * @returns {void} 未取消时无返回值，取消时抛出 AbortError
 */
export function checkAbort(signal) {
  if (signal?.aborted)
    throw new DOMException("已取消 PDF 生成，草稿仍保留。", "AbortError");
}

/**
 * 给浏览器一次处理取消和进度更新的机会。
 * @param {AbortSignal} [signal] 当前导出取消信号
 * @returns {Promise<void>} 下一个事件循环完成后兑现
 */
async function yieldToBrowser(signal) {
  checkAbort(signal);
  await new Promise((resolve) => setTimeout(resolve, 0));
  checkAbort(signal);
}

/**
 * 生成报告页眉用的本地时间戳，不写入设备标识或网络信息。
 * @param {Date} date 生成时刻
 * @returns {string} YYYY-MM-DD HH:mm
 */
function formatTimestamp(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * 汇总照片页说明：处理方式、文件名、像素、格式与容量。
 * @param {object} photo 照片元数据
 * @param {string} name 附件文件名
 * @returns {string} 用间隔号连接的说明文字
 */
function photoFacts(photo, name) {
  const facts = [attachmentLabel(photo), name];
  if (Number.isFinite(photo.width) && Number.isFinite(photo.height))
    facts.push(`${photo.width}×${photo.height} 像素`);
  facts.push(MIME_LABELS[photo.mime || photo.blob?.type] || "未知格式");
  facts.push(`${(photo.blob.size / 1024).toFixed(1)} KiB`);
  return facts.join(" · ");
}

/**
 * 说明附件是被保留的原文件，还是本机缩小、转换或压缩后的版本。
 * @param {object} photo 照片元数据，包含压缩与处理标记
 * @returns {string} 附件版本标签
 */
function attachmentLabel(photo) {
  if (!photo.compressed) return "原文件";
  if (photo.autoShrunk) return "已自动缩小";
  if (photo.animated) return "动图首帧";
  if (photo.rasterized) return "已转换格式";
  return "已压缩";
}

/**
 * 为附件生成无路径、无控制符且扩展名正确的唯一文件名。
 * @param {object} photo 照片元数据，包含分类、槽位、文件名、格式
 * @returns {string} 可安全显示和保存的附件名
 */
export function attachmentName(photo) {
  const extension = MIME_EXTENSIONS[photo.mime || photo.blob?.type];
  if (!extension)
    throw new Error("照片格式不受支持，请重新选择 JPEG、PNG 或 WebP。");
  const stem =
    String(photo.name || "photo")
      .split(/[\\/]/)
      .pop()
      .replace(/\.[^.]*$/, "")
      .replace(
        /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f<>:"|?*]/g,
        "_",
      )
      .replace(/^[.\s]+|[.\s]+$/g, "") || "photo";
  return `${photo.category}-${photo.slot}-${Array.from(stem).slice(0, 80).join("")}.${extension}`;
}

/**
 * 检查导出快照完整性及容量，避免损坏的本地存储直接进入 PDF 处理。
 * @param {object} draft 表单快照
 * @returns {{answers: Map<number, object>, photos: object[]}} 按题号索引的答案和按槽位排序的图片
 */
function validateSnapshot(draft) {
  if (!draft.ageConfirmedAt) throw new Error("请先完成年龄确认。");
  const errors = validateRevision(draft);
  if (errors.length) throw new Error(errors[0].message);
  const answers = new Map(
    draft.answers.map((answer) => [answer.questionId, answer]),
  );
  const photos = [];
  for (const category of CATEGORIES)
    for (let slot = 1; slot <= 4; slot += 1) {
      const photo = draft.photos.find(
        (photo) => photo.category === category.key && photo.slot === slot,
      );
      attachmentName(photo);
      photos.push(photo);
    }
  return { answers, photos };
}

/**
 * 字体缺少字形时优先使用的占位符，按顺序取字体确实拥有的一个。
 */
const PLACEHOLDER_CODEPOINTS = [0x25a1, 0x3f];

/**
 * 判断一个码位能否由当前字体绘制；换行与制表符由排版处理，不算缺失。
 * @param {Set<number>} supported 字体支持的码位集合
 * @param {number} code 待检查的码位
 * @returns {boolean} 可以绘制时为 true
 */
function isDrawableCode(supported, code) {
  if (code === 10 || code === 13 || code === 9) return true;
  return code >= 32 && !(code >= 127 && code <= 159) && supported.has(code);
}

/**
 * 建立文本替换器：字体没有的字符用占位符代替并统计码位。
 * 连续缺失的码位（例如一个 ZWJ emoji 序列）只产生一个占位符，避免出现一排方框。
 * @param {Set<number>} supported 字体支持的码位集合
 * @param {number} placeholder 占位符码位
 * @returns {{sanitize:(value:unknown)=>string, entries:Map<number,number>, count:()=>number}} 替换函数与统计
 */
function createTextSanitizer(supported, placeholder) {
  const entries = new Map();
  let total = 0;
  /**
   * 把文本中字体无法表示的字符替换为占位符。
   * @param {unknown} value 原始文本
   * @returns {string} 可安全绘制的文本
   */
  const sanitize = (value) => {
    let output = "";
    let insideRun = false;
    for (const character of String(value ?? "")) {
      const code = character.codePointAt(0);
      if (isDrawableCode(supported, code)) {
        output += character;
        insideRun = false;
        continue;
      }
      entries.set(code, (entries.get(code) || 0) + 1);
      total += 1;
      if (!insideRun) {
        output += String.fromCodePoint(placeholder);
        insideRun = true;
      }
    }
    return output;
  };
  return { sanitize, entries, count: () => total };
}

/**
 * 判断码位在页面上是否可见，用于决定提示里是否同时展示原字符。
 * @param {number} code 码位
 * @returns {boolean} 有可见字形时为 true
 */
function isVisibleCode(code) {
  if (code < 32 || (code >= 127 && code <= 159)) return false;
  return ![
    [0x200b, 0x200f],
    [0x202a, 0x202e],
    [0x2060, 0x206f],
    [0xfe00, 0xfe0f],
    [0xfeff, 0xfeff],
  ].some(([start, end]) => code >= start && code <= end);
}

/**
 * 汇总替换结果，分别生成可写入 PDF 的说明和页面提示。
 * PDF 说明只使用 U+ 码位，避免提示本身再引入缺字；页面提示附上原字符便于核对。
 * @param {{entries:Map<number,number>,count:()=>number}} sanitizer 文本替换器
 * @param {number} placeholder 占位符码位
 * @returns {{total:number,placeholder:string,codes:string[],pdfText:string,message:string}|null} 没有替换时为 null
 */
function buildSubstitutionReport(sanitizer, placeholder) {
  const total = sanitizer.count();
  if (!total) return null;
  const character = String.fromCodePoint(placeholder);
  const items = [...sanitizer.entries]
    .slice(0, 8)
    .map(([code, times]) => ({
      code: `U+${code.toString(16).toUpperCase()}`,
      character: isVisibleCode(code) ? String.fromCodePoint(code) : "",
      count: times,
    }));
  return {
    total,
    placeholder: character,
    codes: items.map((item) => item.code),
    pdfText: `字体没有以下字符的字形，已用 ${character} 代替：${items.map((item) => `${item.code}（${item.count} 处）`).join("、")}。原始文字仍完整保存在本机草稿中。`,
    message: `PDF 中文字体无法显示 ${total} 个字符，已用 ${character} 代替：${items.map((item) => (item.character ? `${item.character}（${item.code}，${item.count} 处）` : `${item.code}（${item.count} 处）`)).join("、")}。草稿内容不会改变。`,
  };
}

/**
 * 最终校验：所有将要绘制的文本都必须能被字体表示，避免排版遗漏造成静默缺字。
 * @param {Set<number>} supported 字体支持的码位集合
 * @param {Array<string>} values 将要绘制的文本
 * @returns {void} 存在无法表示的字符时抛出内部错误
 */
function assertDrawable(supported, values) {
  for (const value of values)
    for (const character of String(value ?? "")) {
      const code = character.codePointAt(0);
      if (!isDrawableCode(supported, code))
        throw new Error(
          `PDF 排版仍包含字体无法表示的字符 U+${code.toString(16).toUpperCase()}，请重试或反馈此问题。草稿仍保留。`,
        );
    }
}

/**
 * 读取本站字体资源，支持部署在域名子路径下。
 * @param {AbortSignal} [signal] 下载取消信号
 * @returns {Promise<Uint8Array>} 字体原始字节
 */
async function loadFont(signal) {
  const base = import.meta.env?.BASE_URL || "/";
  const response = await fetch(`${base}fonts/NotoSansSC-Regular.otf`, {
    signal,
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  if (!response.ok)
    throw new Error("PDF 字体加载失败，请检查网络后重试。草稿仍保留。");
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * 在浏览器或 Node 验证环境生成 PDF 原始字节。
 * @param {object} draft 完整、固定的草稿快照
 * @param {object} [options] fontBytes 可注入字体；onProgress 接收进度对象；signal 用于取消
 * @returns {Promise<Uint8Array>} PDF 字节；生成失败或取消时抛错，调用方保留草稿
 */
export async function generatePdf(
  draft,
  { fontBytes, onProgress = () => {}, onSubstitution, signal } = {},
) {
  checkAbort(signal);
  const { answers, photos } = validateSnapshot(draft);
  onProgress({ stage: "加载中文字体", completed: 0, total: 16, percent: 2 });
  const bytes = fontBytes ?? (await loadFont(signal));
  checkAbort(signal);
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  // fontkit 的 CFF 子集在部分阅读器中产生无效子程序索引，保留完整字体以保证字形一致。
  const font = await document.embedFont(bytes, { subset: false });
  // 用户输入与文件名先按字体能力替换缺字；不支持的 emoji 用占位符代替并明确告知。
  const supported = new Set(font.getCharacterSet());
  const placeholder =
    PLACEHOLDER_CODEPOINTS.find((code) => supported.has(code)) ?? 0x3f;
  const sanitizer = createTextSanitizer(supported, placeholder);
  const basicInfo = new Map(
    fields.map((field) => [
      field.key,
      sanitizer.sanitize(draft.basicInfo[field.key]),
    ]),
  );
  const remarks = new Map(
    questions.map((question) => [
      question.id,
      sanitizer.sanitize(answers.get(question.id).remark),
    ]),
  );
  const safePhotos = photos.map((photo) => ({
    ...photo,
    name: sanitizer.sanitize(photo.name),
  }));
  assertDrawable(supported, [
    ...fields.map((field) => field.label),
    ...basicInfo.values(),
    ...questions.flatMap((question) => [
      question.itemType,
      question.itemName,
      remarks.get(question.id),
    ]),
    ...safePhotos.map(attachmentName),
  ]);
  const substitutions = buildSubstitutionReport(sanitizer, placeholder);
  if (substitutions) onSubstitution?.(substitutions);
  document.setTitle("个人填写记录");
  document.setCreator("WebTable 本地导出");
  document.setProducer("WebTable");
  // 不把姓名、站点地址或表单唯一标识放进 PDF 元数据。
  const layout = new PdfLayout(document, font, {
    runningTitle: "个人填写记录",
    footerNote: "本机生成 · 内容未上传",
  });
  layout.title("个人填写记录", {
    meta: `生成时间 ${formatTimestamp(new Date())} · ${fields.length} 项资料 · ${questions.length} 项自评 · ${safePhotos.length} 张照片`,
  });
  layout.text(
    "本文件由填写者在浏览器中生成，正文之外嵌入全部图片附件，请妥善保管。",
    { size: 9, lineHeight: 14, after: 12, color: PALETTE.muted },
  );
  if (substitutions) layout.note(`注意：${substitutions.pdfText}`);

  // 基础资料按网页同一套分组呈现，短字段两列、长文本独占整幅宽。
  for (const group of fieldGroups) {
    layout.section(group.label);
    let pending = [];
    const flushPending = () => {
      if (pending.length) layout.fieldGrid(pending);
      pending = [];
    };
    for (const field of group.fields) {
      const value = basicInfo.get(field.key);
      if ((field.maxLength || 0) >= LONG_FIELD_LENGTH) {
        flushPending();
        layout.fieldBlock(field.label, value);
      } else pending.push({ label: field.label, value });
    }
    flushPending();
  }

  onProgress({ stage: "排版自评内容", completed: 0, total: 16, percent: 8 });
  layout.section("接受程度自评");
  layout.text(
    `等级说明：${Object.entries(GRADE_LABELS)
      .map(([grade, label]) => `${grade} ${label}`)
      .join("；")}。`,
    { size: 9.5, lineHeight: 15, after: 8, color: PALETTE.muted },
  );
  let previousGroup;
  for (const question of questions) {
    const group = `${question.section}:${question.itemType}`;
    if (group !== previousGroup) {
      // 小节标题与表头、前几行必须留在同页，避免只留一行在页尾。
      layout.ensureSpace(190);
      layout.subheading(
        `${question.section === "left" ? "左侧分组" : "右侧分组"} · ${question.itemType}`,
        { note: `${questions.filter((item) => `${item.section}:${item.itemType}` === group).length} 项` },
      );
      layout.tableHead(ASSESSMENT_COLUMNS);
      previousGroup = group;
    }
    const answer = answers.get(question.id);
    layout.tableRow([
      { text: String(question.id), width: ASSESSMENT_COLUMNS[0].width },
      { text: question.itemName, width: ASSESSMENT_COLUMNS[1].width },
      {
        text: `${answer.grade} ${GRADE_LABELS[answer.grade]}`,
        width: ASSESSMENT_COLUMNS[2].width,
        badge: true,
      },
      { text: remarks.get(question.id), width: ASSESSMENT_COLUMNS[3].width },
    ]);
    if (question.id % 12 === 0) await yieldToBrowser(signal);
  }

  // 不再单独排“图片附件目录”页；每张照片页已带版本、文件名与容量，附件名本身即含分类与序号。
  for (const [index, photo] of safePhotos.entries()) {
    await yieldToBrowser(signal);
    const label = CATEGORIES.find(
      (category) => category.key === photo.category,
    ).label;
    const name = attachmentName(photo);
    const preview = new Uint8Array(await photo.previewBlob.arrayBuffer());
    const previewMetadata = inspectImage(preview);
    if (
      previewMetadata.mime !== photo.previewBlob.type ||
      Math.max(previewMetadata.width, previewMetadata.height) >
        IMAGE_LIMITS.previewSide
    ) {
      throw new Error("照片预览格式或尺寸无效，请重新选择该照片。");
    }
    let image;
    if (photo.previewBlob.type === "image/jpeg")
      image = await document.embedJpg(preview);
    else if (photo.previewBlob.type === "image/png")
      image = await document.embedPng(preview);
    else throw new Error("照片预览格式无效，请重新选择该照片。");
    layout.photo(image, `${label} ${photo.slot}`, photoFacts(photo, name), {
      section: label,
    });
    // 逐张完成嵌入，释放解码后的像素数组，避免 16 张大预览同时驻留内存。
    await image.embed();
    const original = new Uint8Array(await photo.blob.arrayBuffer());
    const originalMetadata = inspectImage(original);
    if (
      originalMetadata.mime !== (photo.mime || photo.blob.type) ||
      Math.max(originalMetadata.width, originalMetadata.height) >
        IMAGE_LIMITS.originalSide ||
      originalMetadata.width * originalMetadata.height >
        IMAGE_LIMITS.originalPixels
    ) {
      throw new Error("照片附件格式或尺寸无效，请重新选择该照片。");
    }
    const digest = await crypto.subtle.digest("SHA-256", original);
    const actual = [...new Uint8Array(digest)]
      .map((part) => part.toString(16).padStart(2, "0"))
      .join("");
    if (actual !== photo.sha256)
      throw new Error("本地照片内容与保存时的摘要不一致，请重新选择该照片。");
    await document.attach(original, name, {
      mimeType: photo.mime || photo.blob.type,
      description: `${label} ${photo.slot}，${attachmentLabel(photo)}`,
    });
    onProgress({
      stage: "嵌入照片与附件",
      completed: index + 1,
      total: 16,
      percent: 15 + Math.round(((index + 1) / 16) * 70),
    });
  }
  layout.finish();
  await yieldToBrowser(signal);
  onProgress({ stage: "生成 PDF 文件", completed: 16, total: 16, percent: 90 });
  const output = await document.save({
    useObjectStreams: true,
    objectsPerTick: 40,
  });
  checkAbort(signal);
  if (output.byteLength > MAX_PDF_BYTES)
    throw new Error("PDF 超过 64 MiB，请换用较小的图片后重试。草稿仍保留。");
  onProgress({ stage: "PDF 已生成", completed: 16, total: 16, percent: 100 });
  return output;
}
