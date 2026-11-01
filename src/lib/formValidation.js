/** 本地表单唯一元数据与完整性校验，页面、存储和PDF共享同一规则。 */
import fields from "../data/fields.json" with { type: "json" };
import questionData from "../data/questions.json" with { type: "json" };
export const questions = Object.freeze(questionData);
export const grades = Object.freeze({
  A: "超级喜欢",
  B: "喜欢",
  C: "不喜欢但接受",
  D: "强迫才接受",
  E: "绝对不接受",
});
export const basicFields = [
  { key: "name", label: "名字" },
  { key: "height", label: "身高cm" },
  { key: "weight", label: "体重kg" },
  { key: "education", label: "学历" },
  { key: "occupation", label: "职业" },
  { key: "shoeSize", label: "鞋码EU" },
  { key: "province", label: "所在地(省)" },
  { key: "city", label: "所在地(市)" },
];

export const contactFields = [
  { key: "qq", label: "QQ号" },
  { key: "wechat", label: "微信号" },
  { key: "weibo", label: "微博名" },
  { key: "phone", label: "电话号码" },
];

export const experienceFields = [
  { key: "firstMasturbationAge", label: "第一次自慰年龄" },
  { key: "firstSexAge", label: "破处年龄" },
  { key: "isSingle", label: "是否单身" },
  { key: "cheatedOnPartner", label: "是否绿过伴侣" },
  { key: "beenCheated", label: "是否被伴侣绿过" },
  { key: "longestLockTime", label: "最长带锁时间" },
];

export const habitFields = [
  { key: "sexFrequency", label: "做爱频率" },
  { key: "masturbationFrequency", label: "自慰频率" },
  { key: "masturbationTool", label: "自慰工具" },
  {
    key: "analInsertableSize",
    label: "菊穴可完全插入尺寸",
    placeholder: "直径*长度cm",
  },
  {
    key: "urethraInsertableSize",
    label: "尿道可完全插入尺寸",
    placeholder: "直径*长度cm",
  },
];

export const otherFields = [
  { key: "dogAge", label: "犬龄(做犬的时间)" },
  { key: "meetingCount", label: "约调次数" },
  { key: "masterCount", label: "侍主人数" },
  { key: "semenVolume", label: "精液量ml" },
  { key: "dailyMaxEjaculation", label: "每日最高射精次数" },
  { key: "preferredName", label: "喜欢被叫的称呼" },
  { key: "selfDescription", label: "一句话形容自己" },
  { key: "remark", label: "备注" },
  { key: "trainingIntention", label: "培养意向" },
];

export const photoCategories = [
  { key: "selfie", label: "自拍" },
  { key: "nude", label: "裸照" },
  { key: "dick", label: "狗屌" },
  { key: "other", label: "其他" },
];

export const allBasicFields = [
  ...basicFields,
  ...contactFields,
  ...experienceFields,
  ...habitFields,
  ...otherFields,
];

// 字段标签、长度与题库一起作为本地静态资源发布。
for (const field of allBasicFields) {
  Object.assign(
    field,
    fields.find((item) => item.key === field.key),
  );
}

export const fieldGroups = [
  { label: "基本信息", fields: basicFields },
  { label: "联系方式", fields: contactFields },
  { label: "个人经历", fields: experienceFields },
  { label: "个人习惯", fields: habitFields },
  { label: "其他信息", fields: otherFields },
];

const noContentValues = new Set(["无", "不适用", "无/不适用", "无／不适用"]);
const numericFields = new Set([
  "height",
  "weight",
  "shoeSize",
  "firstMasturbationAge",
  "firstSexAge",
  "meetingCount",
  "masterCount",
  "semenVolume",
  "dailyMaxEjaculation",
]);
const digestPattern = /^[a-f0-9]{64}$/;

/** 步骤编号与名称的对应，错误分组和页面标题共用。 */
export const STEP_LABELS = Object.freeze({
  1: "基础信息",
  2: "喜好自评",
  3: "照片及导出",
});

/**
 * 提取实际可见内容，用于识别仅包含空白或不可见字符的输入。
 * @param {unknown} value 用户输入或本地存储恢复值。
 * @returns {string} 去除空白和不可见格式字符的文本，非字符串返回空串。
 */
export function meaningful(value) {
  return typeof value === "string"
    ? value
        .replace(/[\s\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/gu, "")
        .trim()
    : "";
}

/**
 * 只提取固定基础字段，避免异常本地数据给草稿追加额外属性。
 * @param {object} [source={}] 基础信息来源。
 * @returns {object} 具有全部32个字符串字段的对象。
 */
export function basicPayload(source = {}) {
  return Object.fromEntries(
    allBasicFields.map((field) => [
      field.key,
      typeof source?.[field.key] === "string" ? source[field.key] : "",
    ]),
  );
}

/**
 * 判断存储条目是否为普通的非空对象，防止损坏草稿使校验流程中断。
 * @param {unknown} value 待检查的数组条目。
 * @returns {boolean} 是否可按对象字段读取。
 */
function isEntry(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * 校验单个基础字段，供失焦即时提示与整表校验共用同一套规则。
 * @param {string} key 字段键名
 * @param {unknown} value 字段当前值
 * @returns {string} 错误说明；无错误或键名未知时为空串
 */
export function validateBasicField(key, value) {
  const field = allBasicFields.find((item) => item.key === key);
  if (!field) return "";
  const text = meaningful(value);
  if (!text) return `请填写「${field.label}」，没有内容可填写“无／不适用”`;
  if (typeof value === "string" && value.length > field.maxLength)
    return `「${field.label}」最多${field.maxLength}字`;
  if (noContentValues.has(text)) return "";
  const trimmed = String(value).trim();
  if (
    key === "phone" &&
    (!/^\+?[0-9 ()-]{5,20}$/.test(trimmed) ||
      (trimmed.match(/\d/g) || []).length < 5)
  )
    return "电话号码格式不正确";
  if (key === "qq" && !/^[1-9]\d{4,19}$/.test(trimmed))
    return "QQ号应为5至20位数字";
  if (numericFields.has(key) && !/^\d+(?:\.\d+)?$/.test(trimmed))
    return `「${field.label}」请填写非负数或“无／不适用”`;
  return "";
}

/**
 * 把校验错误按步骤聚合，避免一次性平铺上百条提示。
 * @param {Array<{step:number,id:string,message:string}>} issues 校验错误列表
 * @returns {Array<{step:number,label:string,count:number,first:object,issues:Array}>} 按步骤排序的分组
 */
export function summarizeIssues(issues) {
  const groups = new Map();
  for (const issue of Array.isArray(issues) ? issues : []) {
    // 已知步骤按页面顺序排列；未知或缺失步骤归入末尾的“其他”。
    const known = STEP_LABELS[issue?.step];
    const sortKey = known ? issue.step : Number.MAX_SAFE_INTEGER;
    if (!groups.has(sortKey))
      groups.set(sortKey, {
        step: known ? issue.step : 0,
        label: known || "其他",
        count: 0,
        first: issue,
        issues: [],
        sortKey,
      });
    const group = groups.get(sortKey);
    group.count += 1;
    group.issues.push(issue);
  }
  return [...groups.values()]
    .sort((left, right) => left.sortKey - right.sortKey)
    .map(({ sortKey, ...group }) => group);
}

/**
 * 检查全部基础字段、125题以及16个图片槽位。
 * @param {object} draft 本地草稿，可能来自异常或旧版站点存储。
 * @param {Array} [items=questions] 固定问卷元数据。
 * @returns {Array<{step:number,id:string,message:string}>} 可用于展开步骤并定位字段的错误列表。
 */
export function validateRevision(draft, items = questions) {
  const errors = [];
  const add = (step, id, message) => errors.push({ step, id, message });

  for (const field of allBasicFields) {
    const message = validateBasicField(
      field.key,
      draft?.basicInfo?.[field.key],
    );
    if (message) add(1, `basic-${field.key}`, message);
  }

  const storedPhotos = Array.isArray(draft?.photos) ? draft.photos : [];
  const photos = storedPhotos.filter(isEntry);
  const originals = new Set();
  const finals = new Set();
  if (storedPhotos.length > 16)
    add(3, "photos-heading", "照片数量不能超过16张");
  if (storedPhotos.length !== photos.length)
    add(3, "photos-heading", "照片记录损坏，请重新选择对应照片");
  for (const category of photoCategories) {
    for (let slot = 1; slot <= 4; slot += 1) {
      const matches = photos.filter(
        (photo) => photo.category === category.key && photo.slot === slot,
      );
      const id = `photo-${category.key}-${slot}`;
      if (matches.length !== 1) {
        add(3, id, `请为「${category.label}」第${slot}个槽位选择一张照片`);
        continue;
      }
      const photo = matches[0];
      if (
        !digestPattern.test(photo.sha256 || "") ||
        !digestPattern.test(photo.sourceSha256 || "")
      ) {
        add(3, id, "照片摘要无效，请重新选择");
      }
      if (originals.has(photo.sourceSha256) || finals.has(photo.sha256)) {
        add(3, id, "图片内容重复，请更换");
      }
      originals.add(photo.sourceSha256);
      finals.add(photo.sha256);
      if (
        !(photo.blob instanceof Blob) ||
        !photo.blob.size ||
        photo.blob.size > 2 * 1024 * 1024 ||
        !(photo.previewBlob instanceof Blob) ||
        !photo.previewBlob.size ||
        photo.previewBlob.size > 512 * 1024
      ) {
        add(3, id, "照片文件缺失或超过容量限制，请重新选择");
      }
    }
  }

  const storedAnswers = Array.isArray(draft?.answers) ? draft.answers : [];
  const answers = storedAnswers.filter(isEntry);
  const validItems = Array.isArray(items) ? items.filter(isEntry) : [];
  const expectedIds = new Set(validItems.map((question) => question.id));
  if (
    validItems.length !== 125 ||
    expectedIds.size !== 125 ||
    storedAnswers.length !== validItems.length ||
    answers.length !== storedAnswers.length ||
    new Set(answers.map((answer) => answer.questionId)).size !==
      validItems.length ||
    answers.some((answer) => !expectedIds.has(answer.questionId))
  ) {
    add(2, "assessment-heading", "自评数据不完整，请重新读取草稿");
  }
  for (const question of validItems) {
    const answer = answers.find((item) => item.questionId === question.id);
    if (!Object.hasOwn(grades, answer?.grade || "")) {
      add(2, `grade-${question.id}`, `请选择第${question.id}项的级别`);
    }
    if (!meaningful(answer?.remark)) {
      add(
        2,
        `remark-${question.id}`,
        `请填写第${question.id}项备注，没有内容可填“无”`,
      );
    } else if (answer.remark.length > 500) {
      add(2, `remark-${question.id}`, `第${question.id}项备注最多500字`);
    }
  }
  // 错误定位与前进检查遵循基础信息、自评、照片的页面顺序。
  return errors.sort((left, right) => left.step - right.step);
}

/**
 * 创建一份无个人信息的新草稿；年龄确认前不应写入本机存储。
 * @returns {object} 具有随机编号、空基础信息、125个空答案和空图片数组的草稿。
 */
export function newDraft() {
  const random = new Uint8Array(16);
  crypto.getRandomValues(random);
  return {
    formatVersion: 1,
    id: Array.from(random, (value) => value.toString(16).padStart(2, "0")).join(
      "",
    ),
    ageConfirmedAt: null,
    updatedAt: null,
    currentStep: 1,
    basicInfo: basicPayload(),
    answers: questions.map((question) => ({
      questionId: question.id,
      grade: "",
      remark: "",
    })),
    photos: [],
  };
}
