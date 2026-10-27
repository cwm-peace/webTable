<!-- 本机填写流程：成年确认、完整性校验、图片预览、PDF下载与明确确认后的清理。 -->
<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { useFormStore } from "../stores/form";
import {
  fieldGroups,
  photoCategories,
  allBasicFields,
  grades,
  meaningful,
  summarizeIssues,
  validateBasicField,
} from "../lib/formValidation";
import { loadOpenGroups, saveOpenGroups } from "../lib/uiState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  ExternalLink,
  FileCheck2,
  ShieldCheck,
  Trash2,
} from "lucide-vue-next";
import ThemeControl from "./ThemeControl.vue";
import PhotoSlot from "./form/PhotoSlot.vue";
const store = useFormStore();
const ageChecked = ref(false),
  declined = ref(false),
  discardOpen = ref(false),
  clearOpen = ref(false),
  savedConfirmed = ref(false);
const summary = ref(null);
const exporting = ref(false);
const resetAnswersOpen = ref(false);
const firstGroupKey = `${store.questions[0].section}-${store.questions[0].itemType}`;
// 分组展开状态持久化到本机，刷新后恢复到上次填写位置；只存键名，不含填写内容。
const localStorageRef =
  typeof localStorage === "undefined" ? null : localStorage;
const openedGroups = ref(loadOpenGroups(localStorageRef, firstGroupKey));
const openedRemarks = ref(new Set());
/** 已失焦过的基础字段键名，失焦后才显示即时校验，避免输入中途打扰。 */
const touchedBasics = ref(new Set());
const quickPhrases = ["无", "不适用", "有经验", "有条件", "需要说明"];
const steps = [
  { number: 1, label: "基础信息", description: "填写个人基本资料" },
  { number: 2, label: "喜好自评", description: "A–E 分级与备注" },
  { number: 3, label: "照片及导出", description: "添加照片与生成 PDF" },
];
const basicsDone = computed(
  () =>
    allBasicFields.filter((field) =>
      meaningful(store.revision?.basicInfo?.[field.key]),
    ).length,
);
const groups = computed(() => {
  const result = [];
  for (const question of store.questions) {
    const key = `${question.section}-${question.itemType}`;
    let group = result.find((item) => item.key === key);
    if (!group) {
      group = { key, label: question.itemType, items: [] };
      result.push(group);
    }
    group.items.push({
      ...question,
      answer: store.revision?.answers.find(
        (answer) => Number(answer.questionId) === Number(question.id),
      ),
    });
  }
  return result.map((group) => ({
    ...group,
    completed: group.items.filter((item) => answerComplete(item.answer)).length,
  }));
});
const assessmentsDone = computed(() =>
  groups.value.reduce((total, group) => total + group.completed, 0),
);
const nextIncomplete = computed(() =>
  groups.value
    .flatMap((group) => group.items)
    .find((question) => !answerComplete(question.answer)),
);
const hasAssessments = computed(() =>
  store.revision?.answers.some((answer) => answer.grade || answer.remark),
);
/** 校验错误按步骤聚合，摘要从平铺长列表改为分组视图。 */
const issueGroups = computed(() => summarizeIssues(store.issues));
const saveLabel = computed(
  () =>
    ({
      saved: "已保存在此浏览器",
      pending: "等待本机保存",
      saving: "正在保存到此浏览器…",
      error: "本机保存失败",
      conflict: "另一个标签页已修改此表单",
      memory: "临时填写：关闭或刷新页面会丢失内容",
    })[store.saveStatus] || "正在准备本机草稿",
);
const inputDisabled = computed(
  () =>
    !store.revision ||
    store.complete ||
    store.busy ||
    store.readOnly ||
    store.saveStatus === "conflict" ||
    store.pdfReady,
);
/**
 * 按统一等级与备注规则计算完成度，不增加额外必答层。
 * @param {object|undefined} answer 当前题目的草稿答案
 * @returns {boolean} 等级有效且备注含可见内容并未超长时为真
 */
function answerComplete(answer) {
  return Boolean(
    Object.hasOwn(grades, answer?.grade || "") &&
      meaningful(answer?.remark) &&
      answer.remark.length <= 500,
  );
}
/**
 * 在用户点选时更新等级，仅为空备注填入“无”，不改写已有说明。
 * @param {object} question 当前题目及其草稿答案
 * @param {string} grade 用户点选的 A–E 等级
 * @returns {void} 无返回值
 */
function selectGrade(question, grade) {
  if (inputDisabled.value) return;
  question.answer.grade = grade;
  if (!meaningful(question.answer.remark)) question.answer.remark = "无";
}
/**
 * 在当前题中用 A–E 或 1–5 点选等级，保留输入框和系统组合键的默认行为。
 * @param {KeyboardEvent} event 当前题目内的键盘事件
 * @param {object} question 当前题目及草稿答案
 * @returns {void} 无返回值
 */
function gradeShortcut(event, question) {
  if (
    inputDisabled.value ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.isComposing ||
    event.target.closest(
      "textarea, select, button, [contenteditable='true']",
    ) ||
    (event.target instanceof HTMLInputElement && event.target.type !== "radio")
  )
    return;
  const key = event.key.toUpperCase();
  const grade = Object.hasOwn(grades, key)
    ? key
    : Object.keys(grades)[Number(key) - 1];
  if (!grade) return;
  event.preventDefault();
  selectGrade(question, grade);
  document.getElementById(`grade-${question.id}-${grade}`)?.focus();
}
/**
 * 在对话框明确确认后清空自评，沿用现有自动保存并保留基础资料与图片。
 * @returns {Promise<void>} 清空后下一未完成入口获得焦点时兑现
 */
async function resetAnswers() {
  if (inputDisabled.value) return;
  for (const answer of store.revision.answers) {
    answer.grade = "";
    answer.remark = "";
  }
  openedGroups.value = new Set([firstGroupKey]);
  openedRemarks.value = new Set();
  resetAnswersOpen.value = false;
  await nextTick();
  document.getElementById("assessment-heading")?.focus();
}
/**
 * 切换单题备注编辑器，展开后将焦点移到对应文本框。
 * @param {number} id 题目编号
 * @returns {Promise<void>} 展开与焦点处理完成时兑现
 */
async function toggleRemark(id) {
  const next = new Set(openedRemarks.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  openedRemarks.value = next;
  if (next.has(id)) {
    await nextTick();
    document.getElementById(`remark-${id}`)?.focus();
  }
}
/**
 * 根据用户明确点选的快捷短语修改备注，不触发额外确认或必答问题。
 * @param {object} question 当前题目及其草稿答案
 * @param {string} phrase 要写入的快捷短语
 * @returns {void} 无返回值
 */
function setRemarkPhrase(question, phrase) {
  if (!inputDisabled.value) question.answer.remark = phrase;
}
/**
 * 定位首个尚未完成的等级或备注，沿用错误定位的分组展开逻辑。
 * @returns {Promise<void>} 未完成控件获得焦点后兑现
 */
async function nextUnfinished() {
  const question = nextIncomplete.value;
  if (!question || inputDisabled.value) return;
  const prefix = Object.hasOwn(grades, question.answer?.grade || "")
    ? "remark"
    : "grade";
  await focusIssue({ step: 2, id: `${prefix}-${question.id}` });
}
/**
 * 找到指定输入当前对应的错误，供可访问提示引用。
 * @param {string} id 输入控件编号
 * @returns {string} 错误说明，没有错误时为空
 */
function fieldError(id) {
  return store.issues.find((issue) => issue.id === id)?.message || "";
}
/**
 * 基础字段的展示错误：汇总摘要优先，失焦后补充即时校验。
 * @param {object} field 字段元数据
 * @returns {string} 当前应展示的错误说明，没有时为空
 */
function basicError(field) {
  const summaryMessage = fieldError(`basic-${field.key}`);
  if (summaryMessage) return summaryMessage;
  if (!touchedBasics.value.has(field.key)) return "";
  return validateBasicField(
    field.key,
    store.revision?.basicInfo?.[field.key] ?? "",
  );
}
/**
 * 记录字段失焦，之后该字段的输入变化会即时更新校验提示。
 * @param {string} key 字段键名
 * @returns {void} 无返回值
 */
function touchBasic(key) {
  if (touchedBasics.value.has(key)) return;
  touchedBasics.value = new Set([...touchedBasics.value, key]);
}
/**
 * 查找图片槽位元数据和本地Blob。
 * @param {string} category 图片类别
 * @param {number} slot 槽位编号
 * @returns {object|undefined} 当前图片
 */
function photo(category, slot) {
  return store.revision?.photos.find(
    (item) => item.category === category && Number(item.slot) === slot,
  );
}
/**
 * 切换自评分组并保留用户展开状态。
 * @param {string} key 分组键名
 * @param {Event} event 原生details切换事件
 * @returns {void} 无返回值
 */
function toggleGroup(key, event) {
  const next = new Set(openedGroups.value);
  if (event.target.open) next.add(key);
  else next.delete(key);
  openedGroups.value = next;
}
/**
 * 展开错误所在分组后定位输入，避免焦点落入折叠内容。
 * @param {object} issue 包含步骤、输入编号和说明的校验项
 * @returns {Promise<void>} 错误控件获得焦点后兑现
 */
async function focusIssue(issue) {
  if (store.busy || store.pdfReady) return;
  const remarkId = /^remark-(\d+)$/.exec(issue.id);
  if (remarkId)
    openedRemarks.value = new Set([
      ...openedRemarks.value,
      Number(remarkId[1]),
    ]);
  for (const group of groups.value)
    if (
      group.items.some((item) =>
        [`grade-${item.id}`, `remark-${item.id}`].includes(issue.id),
      )
    )
      openedGroups.value = new Set([...openedGroups.value, group.key]);
  await nextTick();
  await store.focusIssue(issue);
  if (issue.id.startsWith("grade-")) {
    const anchor = document.getElementById(issue.id);
    (
      anchor?.querySelector("input:checked") || anchor?.querySelector("input")
    )?.focus();
  }
}
/**
 * 检查步骤跳转结果，校验失败时聚焦错误摘要。
 * @param {number} step 要进入的步骤
 * @returns {Promise<void>} 导航与焦点处理完成时兑现
 */
async function navigate(step) {
  await store.navigate(step);
  await nextTick();
  if (store.issues.length) summary.value?.focus();
  else document.getElementById("step-heading")?.focus();
}
/**
 * 在当前表单上明确记录成年确认，不收集身份证件或出生日期。
 * @returns {Promise<void>} 年龄确认处理完成时兑现
 */
async function acceptAge() {
  if (ageChecked.value) {
    await store.acceptAge();
    await nextTick();
    document.getElementById("step-heading")?.focus();
  }
}
/**
 * 生成锁定快照的PDF，校验失败时让键盘用户到达错误摘要。
 * @returns {Promise<void>} 导出尝试完成时兑现
 */
async function generate() {
  savedConfirmed.value = false;
  exporting.value = true;
  try {
    await store.generateExport();
  } finally {
    exporting.value = false;
  }
  await nextTick();
  if (store.issues.length) summary.value?.focus();
  else if (store.pdfReady) document.getElementById("pdf-title")?.focus();
}
/**
 * 在二次确认后清除本应用草稿；不删除用户下载到设备的文件。
 * @returns {Promise<void>} 清理操作完成时兑现
 */
async function clearData() {
  await store.clearAll();
  discardOpen.value = false;
  clearOpen.value = false;
  savedConfirmed.value = false;
}
/**
 * 开始新的空白表单并重新要求成年确认。
 * @returns {Promise<void>} 新表单准备完成时兑现
 */
async function startNew() {
  ageChecked.value = false;
  declined.value = false;
  openedGroups.value = new Set([firstGroupKey]);
  openedRemarks.value = new Set();
  touchedBasics.value = new Set();
  await store.startNew();
}
/**
 * 在未落盘、临时填写或图片处理期间提示意外离开可能丢失内容。
 * @param {BeforeUnloadEvent} event 页面离开事件
 * @returns {void} 无返回值
 */
function beforeUnload(event) {
  if (
    store.dirty ||
    store.busy ||
    (store.ageAccepted && store.storageMode === "memory" && !store.complete)
  ) {
    event.preventDefault();
    event.returnValue = "";
  }
}
watch(
  () => store.revision?.id,
  () => {
    // 清理或重读另一份草稿时关闭旧确认，避免后续点击误作用于新草稿。
    resetAnswersOpen.value = false;
  },
);
watch(
  openedGroups,
  (keys) => {
    saveOpenGroups(localStorageRef, keys);
  },
  { flush: "post" },
);
watch(
  () => store.issues,
  async (issues) => {
    if (issues.length) {
      await nextTick();
      summary.value?.focus();
    }
  },
);
onMounted(() => {
  store.initialize();
  window.addEventListener("beforeunload", beforeUnload);
});
onBeforeUnmount(() => {
  window.removeEventListener("beforeunload", beforeUnload);
  store.dispose();
});
</script>

<template>
  <div class="form-shell">
    <aside class="form-sidebar" aria-label="表单导航与草稿进度">
      <div class="brand">
        <svg
          class="brand-mark"
          viewBox="0 0 64 64"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          role="img"
          aria-label="跪姿人物的抽象线稿"
        >
          <circle cx="24" cy="11" r="5"></circle>
          <path d="M29 17 C34 23 37 29 39 36"></path>
          <path d="M25 18 C22 25 24 33 31 39"></path>
          <path d="M31 39 C36 42 42 44 49 45"></path>
          <path d="M49 45 C48 50 43 53 35 53 H23"></path>
          <path d="M31 39 C27 45 22 49 13 49"></path>
          <path d="M27 24 C31 30 38 34 47 34 L53 30"></path>
          <path class="logo-floor" d="M8 57 H57"></path>
        </svg>
        <div>
          <p class="eyebrow brand-kicker">个人喜好筛选工具</p>
          <h1 class="page-title mt-2">奴测</h1>
        </div>
      </div>
      <svg
        class="rope-rule"
        viewBox="0 0 220 14"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d="M0 7 C18 0 32 14 50 7 S82 0 100 7 S132 14 150 7 S182 0 220 7"
        />
        <path
          d="M0 7 C18 14 32 0 50 7 S82 14 100 7 S132 0 150 7 S182 14 220 7"
        />
      </svg>
      <template v-if="store.ageAccepted && store.revision && !store.complete">
        <div class="draft-meta text-sm text-muted-foreground space-y-2">
          <p>本机草稿</p>
          <p class="break-all">{{ store.revision.id }}</p>
          <p>
            {{
              store.storageMode === "memory"
                ? "临时填写，刷新或关闭会丢失内容。"
                : "正常保存后，刷新可恢复填写内容。"
            }}
          </p>
        </div>
        <nav aria-label="填写步骤" class="step-navigation">
          <button
            v-for="item in steps"
            :key="item.number"
            type="button"
            class="step-button"
            :aria-current="store.step === item.number ? 'step' : undefined"
            :disabled="store.busy || store.pdfReady"
            @click="navigate(item.number)"
          >
            <span class="step-number">{{ item.number }}</span>
            <span class="step-copy min-w-0">
              <span class="block">{{ item.label }}</span>
              <small class="step-description">
                {{ item.description }}
              </small>
            </span>
          </button>
        </nav>
        <div class="panel compact-panel text-sm space-y-3">
          <h2 class="font-semibold">完成进度</h2>
          <dl class="space-y-2">
            <div class="flex justify-between gap-3">
              <dt>基础信息</dt>
              <dd>{{ basicsDone }} / {{ allBasicFields.length }}</dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt>喜好自评</dt>
              <dd>{{ assessmentsDone }} / {{ store.questions.length }}</dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt>照片</dt>
              <dd>{{ store.revision.photos.length }} / 16</dd>
            </div>
          </dl>
          <progress
            class="assessment-progress w-full h-2"
            :value="assessmentsDone"
            :max="store.questions.length"
            aria-label="喜好自评完成进度"
          />
        </div>
        <details class="text-sm text-muted-foreground">
          <summary class="min-h-11 py-2 font-medium">草稿与隐私说明</summary>
          <div class="space-y-3 mt-2">
            <p>
              请在您信任的设备和浏览器中填写。保存在浏览器中的草稿可被同一设备使用者访问。
            </p>
            <p>
              “清除本应用数据”只清除此应用的草稿和缓存文件，不清除其他网站数据，也不会删除已下载的
              PDF。
            </p>
            <p>全部文字字段均需填写；没有对应情况时可填写“无”或“不适用”。</p>
          </div>
        </details>
        <Button
          variant="outline"
          class="w-full"
          :disabled="store.busy"
          @click="discardOpen = true"
          ><Trash2 class="size-4" aria-hidden="true" />清除本应用数据</Button
        >
      </template>
      <p v-else class="side-note">
        填写、整理照片，生成一份由自己保管的 PDF。所有填写内容仅留在本机。
      </p>
    </aside>
    <main id="main-content" class="form-main" tabindex="-1">
      <header class="form-header">
        <template
          v-if="
            store.ageAccepted &&
            store.revision &&
            !store.complete &&
            !store.pdfReady
          "
        >
          <div>
            <p class="eyebrow">第 {{ store.step }} / 3 步</p>
            <h2
              id="step-heading"
              tabindex="-1"
              class="text-2xl font-semibold mt-2"
            >
              {{ steps[store.step - 1]?.label }}
            </h2>
            <p class="text-sm text-muted-foreground mt-2">
              {{
                store.step === 1
                  ? "每项都需填写。没有对应情况，可填写“无”或“不适用”。"
                  : store.step === 2
                    ? "直接点选 A–E；如有特殊情况，或对题目含义有疑问，请在备注中说明。"
                    : "四类照片各 4 张，共 16 张；相同文件内容不能重复使用。"
              }}
            </p>
          </div>
        </template>
        <div v-else class="form-intro">
          <p class="eyebrow">个人喜好筛选工具 · 本机填写</p>
          <p class="text-sm text-muted-foreground mt-2">
            由自己填写，由自己保管。
          </p>
        </div>
        <div class="top-actions">
          <p
            v-if="store.ageAccepted && !store.complete"
            class="save-state"
            :data-status="store.saveStatus"
            role="status"
            aria-live="polite"
          >
            {{ saveLabel }}
          </p>
          <ThemeControl />
        </div>
      </header>
      <div v-if="store.loading" class="panel empty" role="status">
        正在读取本机草稿…
      </div>
      <section
        v-else-if="store.complete"
        class="panel max-w-xl mx-auto text-center space-y-5"
      >
        <FileCheck2 class="size-12 mx-auto text-primary" aria-hidden="true" />
        <h2 class="text-2xl font-semibold">
          {{
            store.clearWarning ? "当前页面内容已清除" : "应用内填写数据已清除"
          }}
        </h2>
        <p v-if="store.clearWarning" class="notice error" role="alert">
          {{ store.clearWarning }}
        </p>
        <p class="text-muted-foreground">
          已下载到设备的 PDF 和原始图片仍由您自行保管，不会随此操作删除。
        </p>
        <Button @click="startNew">开始新表单</Button>
      </section>
      <section
        v-else-if="!store.ageAccepted"
        class="panel max-w-2xl mx-auto space-y-6"
      >
        <ShieldCheck class="size-9 text-primary" aria-hidden="true" />
        <p v-if="store.error" class="notice error" role="alert">
          {{ store.error }}
        </p>
        <Button v-if="store.readOnly" variant="outline" @click="store.refresh"
          >重新读取草稿</Button
        >
        <div v-if="store.storageFailed" class="notice space-y-3">
          <p>
            浏览器存储不可用。您可以选择临时填写，内容仅保留在当前页面，刷新或关闭会丢失。
          </p>
          <Button variant="outline" @click="store.useMemory"
            >我了解，改用临时填写</Button
          >
        </div>
        <template v-if="!declined"
          ><div>
            <p class="eyebrow mb-2">开始之前</p>
            <h2 class="text-2xl font-semibold">仅限已满 18 周岁者使用</h2>
          </div>
          <p>
            表单涉及个人与私密信息。是否填写、如何保管生成的文件，由您自己决定；不愿继续时可以直接离开。
          </p>
          <div class="notice space-y-2">
            <p>
              草稿保存在当前浏览器中。共用设备上，请在结束后清除本应用数据。
            </p>
            <p>
              浏览器清理数据、隐私模式或存储空间不足可能影响草稿保留，请及时保存
              PDF。
            </p>
          </div>
          <label class="flex items-start gap-3 py-2 cursor-pointer"
            ><input
              id="age-confirm"
              type="checkbox"
              v-model="ageChecked"
              class="mt-1 size-5 shrink-0"
            /><span>我确认自己已满 18 周岁，并自愿继续填写。</span></label
          >
          <div class="flex flex-wrap gap-3">
            <Button
              :disabled="!ageChecked || store.busy || store.readOnly"
              @click="acceptAge"
              >确认并开始</Button
            ><Button variant="outline" @click="declined = true"
              >暂不填写</Button
            >
          </div>
        </template>
        <template v-else
          ><h2 class="text-2xl font-semibold">您可以关闭此页面</h2>
          <p class="text-muted-foreground">
            尚未开始填写。需要使用时，再确认是否符合使用条件。
          </p>
          <Button variant="outline" @click="declined = false"
            >返回说明</Button
          ></template
        >
      </section>
      <template v-else-if="store.revision">
        <div class="min-w-0 space-y-5">
          <div
            v-if="
              store.saveError ||
              store.storageFailed ||
              store.readOnly ||
              store.saveStatus === 'conflict'
            "
            class="notice space-y-3"
          >
            <p v-if="store.saveError" class="text-sm">
              {{ store.saveError.message }}
            </p>
            <div
              v-if="store.saveStatus === 'error' || store.storageFailed"
              class="flex flex-wrap gap-3"
            >
              <Button
                variant="outline"
                :disabled="store.busy"
                @click="store.retrySave"
                >重试本机保存</Button
              ><Button
                variant="outline"
                :disabled="store.busy"
                @click="store.useMemory"
                >改用临时填写</Button
              >
            </div>
            <p v-if="store.storageFailed" class="text-sm">
              改用临时填写后，内容仅保留在当前页面，刷新或关闭会丢失。请完成后及时下载
              PDF。
            </p>
            <div
              v-if="store.readOnly || store.saveStatus === 'conflict'"
              class="space-y-3"
            >
              <p>
                此标签页暂不可编辑。请保留需要的内容，再重新读取另一标签页保存的草稿。
              </p>
              <Button
                variant="outline"
                :disabled="store.busy"
                @click="store.refresh"
                >重新读取本机草稿</Button
              >
            </div>
          </div>
          <p v-if="store.error" class="notice error" role="alert">
            {{ store.error }}
          </p>
          <section
            v-if="store.issues.length"
            ref="summary"
            tabindex="-1"
            class="notice error"
            role="alert"
            aria-labelledby="issues-title"
          >
            <h2 id="issues-title" class="font-semibold">
              还有 {{ store.issues.length }} 项需要完成
            </h2>
            <p class="mt-1">按步骤分组如下，选择提示可跳到对应位置。</p>
            <div class="issue-groups space-y-3 mt-3">
              <div
                v-for="group in issueGroups"
                :key="group.step"
                class="issue-group"
              >
                <div class="issue-group-header flex flex-wrap items-center justify-between gap-2">
                  <h3 class="font-semibold">
                    {{ group.label }} · 还差 {{ group.count }} 项
                  </h3>
                  <button
                    type="button"
                    class="underline underline-offset-4 min-h-11"
                    @click="focusIssue(group.first)"
                  >
                    定位到第一项
                  </button>
                </div>
                <details v-if="group.count > 1" class="issue-group-list">
                  <summary class="min-h-11 py-2">
                    查看全部 {{ group.count }} 项提示
                  </summary>
                  <ul class="error-list">
                    <li
                      v-for="(issue, index) in group.issues"
                      :key="`${issue.id}-${index}`"
                    >
                      <button
                        type="button"
                        class="text-left underline underline-offset-4 min-h-11"
                        @click="focusIssue(issue)"
                      >
                        {{ issue.message }}
                      </button>
                    </li>
                  </ul>
                </details>
                <ul v-else class="error-list">
                  <li>
                    <button
                      type="button"
                      class="text-left underline underline-offset-4 min-h-11"
                      @click="focusIssue(group.first)"
                    >
                      {{ group.first.message }}
                    </button>
                  </li>
                </ul>
              </div>
            </div>
          </section>
          <section
            v-if="store.busy"
            class="panel space-y-4"
            aria-labelledby="processing-title"
          >
            <h2 id="processing-title" class="text-lg font-semibold">
              {{ store.progressText || "正在处理，请稍候" }}
            </h2>
            <progress
              class="w-full h-3"
              :value="store.progress"
              max="100"
              :aria-label="store.progressText || '处理进度'"
            />
            <p class="text-sm text-muted-foreground" role="status">
              {{ Math.round(store.progress || 0) }}%
            </p>
            <Button
              v-if="exporting"
              variant="outline"
              @click="store.cancelExport"
              >取消生成</Button
            >
          </section>
          <section
            v-if="store.pdfReady"
            class="panel space-y-5"
            aria-labelledby="pdf-title"
          >
            <div class="flex items-start gap-3">
              <FileCheck2
                class="size-8 shrink-0 text-primary"
                aria-hidden="true"
              />
              <div>
                <h2 id="pdf-title" tabindex="-1" class="text-xl font-semibold">
                  PDF 已生成
                </h2>
                <p class="text-muted-foreground mt-2">
                  请点击下载并检查文件。浏览器无法替您确认文件已经保存在设备上。
                </p>
              </div>
            </div>
            <div class="flex flex-wrap gap-3">
              <a
                class="action-link primary"
                :href="store.pdfUrl"
                :download="store.pdfFilename"
                ><Download class="size-4" aria-hidden="true" />下载 PDF</a
              ><a
                class="action-link"
                :href="store.pdfUrl"
                target="_blank"
                rel="noopener"
                ><ExternalLink class="size-4" aria-hidden="true" />打开 PDF</a
              >
            </div>
            <p v-if="store.fontNotice" class="notice" role="status">
              {{ store.fontNotice }}
            </p>
            <p class="text-sm text-muted-foreground">
              如果下载没有开始，请打开
              PDF，再使用浏览器的保存或分享功能。确认文件可打开且图片完整后，再清除应用数据。
            </p>
            <p class="text-sm text-muted-foreground">
              PDF 正文包含全部图片，另附 16
              个图片文件。部分手机阅读器不显示附件列表，提取附件需使用支持 PDF
              附件的阅读器。
            </p>
            <label class="flex items-start gap-3 py-2 cursor-pointer"
              ><input
                v-model="savedConfirmed"
                type="checkbox"
                class="size-5 shrink-0 mt-1"
              /><span>我已把 PDF 保存到设备，并检查了文件内容。</span></label
            >
            <div class="flex flex-wrap gap-3">
              <Button :disabled="!savedConfirmed" @click="clearOpen = true"
                >确认已保存，清除本应用数据</Button
              ><Button variant="outline" @click="store.returnToEdit"
                >返回修改</Button
              >
            </div>
          </section>
          <template v-else>
            <details
              v-if="store.step === 3"
              id="photos-heading"
              tabindex="-1"
              class="notice photo-rules mt-3"
            >
              <summary class="min-h-11 py-2 font-medium">
                图片格式与压缩规则（JPEG／PNG／WebP 等常见格式，单张最多 64
                MiB，超大图自动缩小）
              </summary>
              <p class="mt-2">
                支持 JPEG、PNG、WebP、GIF、BMP、AVIF、TIFF、SVG
                等常见图片，按文件内容识别格式，HEIC／HEIF
                取决于浏览器是否内置解码器。单张最多 64 MiB；超过 2500
                万像素或边长 8192 会自动缩小，动图取第一帧。 不超过 2 MiB、1300
                万像素且边长不超过 4096 的图片保留原始字节；其余生成压缩 JPEG
                附件并标记。 原文件可能保留拍摄位置等元数据。
              </p>
            </details>

            <fieldset :disabled="inputDisabled" class="min-w-0 space-y-5">
              <template v-if="store.step === 1"
                ><section
                  v-for="group in fieldGroups"
                  :key="group.label"
                  class="panel"
                >
                  <h3 class="text-lg font-semibold mb-5">
                    {{ group.label }}
                  </h3>
                  <div class="grid sm:grid-cols-2 gap-5">
                    <div
                      v-for="field in group.fields"
                      :key="field.key"
                      class="field"
                    >
                      <label :for="`basic-${field.key}`"
                        >{{ field.label }}
                        <span class="text-muted-foreground font-normal"
                          >必填</span
                        ></label
                      ><Textarea
                        v-if="
                          [
                            'remark',
                            'trainingIntention',
                            'selfDescription',
                          ].includes(field.key)
                        "
                        :id="`basic-${field.key}`"
                        v-model="store.revision.basicInfo[field.key]"
                        :maxlength="field.maxLength"
                        rows="3"
                        required
                        :aria-invalid="Boolean(basicError(field))"
                        :aria-describedby="
                          basicError(field)
                            ? `basic-${field.key}-error`
                            : undefined
                        "
                        @blur="touchBasic(field.key)"
                      /><Input
                        v-else
                        :id="`basic-${field.key}`"
                        v-model="store.revision.basicInfo[field.key]"
                        :maxlength="field.maxLength"
                        :placeholder="field.placeholder || ''"
                        autocomplete="off"
                        required
                        :aria-invalid="Boolean(basicError(field))"
                        :aria-describedby="
                          basicError(field)
                            ? `basic-${field.key}-error`
                            : undefined
                        "
                        @blur="touchBasic(field.key)"
                      />
                      <p
                        v-if="basicError(field)"
                        :id="`basic-${field.key}-error`"
                        class="text-sm text-destructive"
                      >
                        {{ basicError(field) }}
                      </p>
                    </div>
                  </div>
                </section></template
              >
              <template v-if="store.step === 3"
                ><section
                  v-for="category in photoCategories"
                  :key="category.key"
                  class="panel"
                >
                  <div class="flex justify-between gap-3 mb-5">
                    <h3 class="text-lg font-semibold">
                      {{ category.label }}
                    </h3>
                    <span class="text-sm text-muted-foreground"
                      >{{
                        store.revision.photos.filter(
                          (item) => item.category === category.key,
                        ).length
                      }}
                      / 4</span
                    >
                  </div>
                  <div
                    class="grid grid-cols-1 min-[440px]:grid-cols-2 xl:grid-cols-4 gap-4"
                  >
                    <PhotoSlot
                      v-for="slot in 4"
                      :key="slot"
                      :photo="photo(category.key, slot)"
                      :category="category.key"
                      :label="category.label"
                      :slot="slot"
                      :disabled="inputDisabled"
                      :error="fieldError(`photo-${category.key}-${slot}`)"
                      @change="store.changePhoto(category.key, slot, $event)"
                    />
                  </div></section
              ></template>
              <template v-if="store.step === 2">
                <div
                  class="assessment-toolbar flex flex-wrap items-center justify-between gap-3"
                >
                  <div>
                    <h3
                      id="assessment-heading"
                      tabindex="-1"
                      class="text-lg font-semibold"
                    >
                      逐项选择
                    </h3>
                    <p class="text-sm text-muted-foreground">
                      已完成 {{ assessmentsDone }} /
                      {{ store.questions.length }}
                      项；选择后空备注自动填“无”，可展开修改。
                    </p>
                    <p class="text-xs text-muted-foreground mt-1">
                      聚焦题目后，可用 A–E 或数字 1–5 选择等级。
                    </p>
                  </div>
                  <div class="toolbar-actions">
                    <Button
                      type="button"
                      variant="outline"
                      :disabled="inputDisabled || !hasAssessments"
                      @click="resetAnswersOpen = true"
                      >清空自评</Button
                    >
                    <Button
                      type="button"
                      variant="outline"
                      :disabled="inputDisabled || !nextIncomplete"
                      @click="nextUnfinished"
                      >下一未完成项</Button
                    >
                  </div>
                </div>
                <div
                  class="grade-legend flex flex-wrap gap-3"
                  aria-label="A 到 E 等级含义"
                >
                  <div
                    v-for="(label, grade) in grades"
                    :key="grade"
                    class="legend-item flex items-center gap-2 text-sm"
                    :class="`grade-${grade.toLowerCase()}`"
                  >
                    <span class="legend-dot" aria-hidden="true"></span>
                    <strong>{{ grade }}</strong
                    ><span>{{ label }}</span>
                  </div>
                </div>
                <details
                  v-for="(group, groupIndex) in groups"
                  :key="group.key"
                  class="panel assessment-group"
                  :open="openedGroups.has(group.key)"
                  @toggle="toggleGroup(group.key, $event)"
                >
                  <summary
                    class="flex items-center justify-between gap-4 font-semibold"
                  >
                    <span class="group-title"
                      ><span class="group-index" aria-hidden="true">{{
                        String(groupIndex + 1).padStart(2, "0")
                      }}</span
                      >{{ group.label }}</span
                    ><span class="text-sm text-muted-foreground font-normal"
                      >{{ group.completed }} /
                      {{ group.items.length }} 完成</span
                    >
                  </summary>
                  <div v-if="openedGroups.has(group.key)" class="divide-y mt-4">
                    <div
                      v-for="question in group.items"
                      :key="question.id"
                      class="assessment-item question-card"
                      tabindex="0"
                      :aria-label="`第 ${question.id} 项 ${question.itemName}`"
                      :class="{ answered: answerComplete(question.answer) }"
                      @keydown="gradeShortcut($event, question)"
                    >
                      <fieldset
                        :id="`grade-${question.id}`"
                        tabindex="-1"
                        class="field col-span-full"
                        :aria-invalid="
                          Boolean(fieldError(`grade-${question.id}`))
                        "
                        :aria-describedby="
                          fieldError(`grade-${question.id}`)
                            ? `grade-${question.id}-error`
                            : undefined
                        "
                      >
                        <legend class="question-heading font-semibold mb-3">
                          <span class="question-number text-muted-foreground"
                            >{{ question.id }} ·
                          </span>
                          {{ question.itemName }}
                          <span
                            class="text-sm text-muted-foreground font-normal"
                            >必填</span
                          >
                        </legend>
                        <div class="grade-scale grid grid-cols-5 gap-2">
                          <label
                            v-for="(label, grade) in grades"
                            :key="grade"
                            :for="`grade-${question.id}-${grade}`"
                            class="grade-option flex min-h-11 min-w-0 flex-wrap items-center justify-center gap-1 rounded border p-2"
                            :class="[
                              `grade-${grade.toLowerCase()}`,
                              {
                                'is-selected': question.answer.grade === grade,
                              },
                            ]"
                            :data-selected="question.answer.grade === grade"
                          >
                            <input
                              :id="`grade-${question.id}-${grade}`"
                              :name="`grade-${question.id}`"
                              type="radio"
                              class="grade-radio sr-only"
                              :value="grade"
                              :checked="question.answer.grade === grade"
                              :disabled="inputDisabled"
                              required
                              :aria-label="`${grade} · ${label}`"
                              :aria-invalid="
                                Boolean(fieldError(`grade-${question.id}`))
                              "
                              :aria-describedby="
                                fieldError(`grade-${question.id}`)
                                  ? `grade-${question.id}-error`
                                  : undefined
                              "
                              @change="selectGrade(question, grade)"
                            />
                            <span class="grade-letter font-semibold">{{
                              grade
                            }}</span>
                            <span class="grade-word hidden sm:inline text-xs">{{
                              label
                            }}</span>
                            <span
                              v-if="question.answer.grade === grade"
                              class="grade-selected-indicator"
                              aria-hidden="true"
                            >
                              <Check class="size-4" />
                            </span>
                          </label>
                        </div>
                        <p
                          v-if="fieldError(`grade-${question.id}`)"
                          :id="`grade-${question.id}-error`"
                          class="text-sm text-destructive"
                        >
                          {{ fieldError(`grade-${question.id}`) }}
                        </p>
                      </fieldset>
                      <div
                        class="selected-line col-span-full flex flex-wrap items-center gap-3 text-sm"
                      >
                        <span
                          class="current-grade"
                          :class="
                            question.answer.grade
                              ? `grade-${question.answer.grade.toLowerCase()}`
                              : ''
                          "
                        >
                          当前：{{
                            question.answer.grade
                              ? `${question.answer.grade} · ${grades[question.answer.grade]}`
                              : "尚未选择"
                          }}
                        </span>
                        <button
                          type="button"
                          class="remark-toggle min-h-11 min-w-0 text-left underline underline-offset-4 break-all"
                          :aria-expanded="openedRemarks.has(question.id)"
                          :aria-controls="`remark-editor-${question.id}`"
                          :aria-label="`${question.itemName} · ${openedRemarks.has(question.id) ? '收起' : '展开'}备注：${question.answer.remark || '未填写'}`"
                          @click="toggleRemark(question.id)"
                        >
                          备注：{{ question.answer.remark || "未填写" }} ·
                          {{
                            openedRemarks.has(question.id) ? "收起" : "展开修改"
                          }}
                        </button>
                        <span class="question-status text-muted-foreground">
                          {{
                            answerComplete(question.answer)
                              ? "已完成"
                              : "待完成"
                          }}
                        </span>
                      </div>
                      <div
                        v-show="openedRemarks.has(question.id)"
                        :id="`remark-editor-${question.id}`"
                        class="remark-editor field col-span-full"
                      >
                        <label :for="`remark-${question.id}`"
                          >{{ question.itemName }} · 备注</label
                        >
                        <Textarea
                          :id="`remark-${question.id}`"
                          v-model="question.answer.remark"
                          rows="2"
                          maxlength="500"
                          required
                          placeholder="没有补充内容可填“无”或“不适用”"
                          :aria-invalid="
                            Boolean(fieldError(`remark-${question.id}`))
                          "
                          :aria-describedby="
                            fieldError(`remark-${question.id}`)
                              ? `remark-${question.id}-error`
                              : undefined
                          "
                        />
                        <p
                          v-if="!meaningful(question.answer.remark)"
                          class="text-sm remark-empty-hint"
                          role="status"
                        >
                          备注不能为空；没有补充内容时，可点下方“无”快速填写。
                        </p>
                        <div
                          class="quick-phrases flex flex-wrap gap-2"
                          :aria-label="`${question.itemName}备注快捷短语`"
                          role="group"
                        >
                          <Button
                            v-for="phrase in quickPhrases"
                            :key="phrase"
                            type="button"
                            variant="outline"
                            class="quick-phrase"
                            :aria-label="`将本题备注设为“${phrase}”`"
                            @click="setRemarkPhrase(question, phrase)"
                            >{{ phrase }}</Button
                          >
                        </div>
                        <p
                          v-if="fieldError(`remark-${question.id}`)"
                          :id="`remark-${question.id}-error`"
                          class="text-sm text-destructive"
                        >
                          {{ fieldError(`remark-${question.id}`) }}
                        </p>
                      </div>
                    </div>
                  </div>
                </details></template
              >
            </fieldset>
            <button
              v-if="store.step === 2"
              type="button"
              class="mobile-progress-fab"
              :disabled="inputDisabled || !nextIncomplete"
              @click="nextUnfinished"
            >
              自评 {{ assessmentsDone }} / {{ store.questions.length }}
              <span v-if="nextIncomplete">· 下一未完成项</span>
              <span v-else>· 全部完成</span>
            </button>
            <section
              v-if="store.step === 3"
              class="panel export-box space-y-2"
              aria-labelledby="export-heading"
            >
              <h3 id="export-heading" class="text-lg font-semibold">
                检查并生成 PDF
              </h3>
              <p class="text-sm text-muted-foreground">
                生成前将检查全部基础信息、自评与备注，以及 16 张照片。PDF
                仅在本机生成，不会上传资料。
              </p>
              <p class="text-sm text-muted-foreground">
                生成或下载不会自动清理草稿。请先保存并检查
                PDF，再明确确认是否清除本应用数据。
              </p>
            </section>
            <footer class="form-actions">
              <Button
                variant="outline"
                :disabled="store.step === 1 || store.busy"
                @click="navigate(store.step - 1)"
                ><ArrowLeft class="size-4" aria-hidden="true" />上一步</Button
              ><Button
                v-if="store.step < 3"
                :disabled="inputDisabled"
                @click="navigate(store.step + 1)"
                >{{ store.step === 1 ? "检查并进入自评" : "检查并添加照片"
                }}<ArrowRight class="size-4" aria-hidden="true" /></Button
              ><Button v-else :disabled="inputDisabled" @click="generate"
                ><Check class="size-4" aria-hidden="true" />检查并生成
                PDF</Button
              >
            </footer>
          </template>
        </div>
      </template>
      <section v-else class="panel max-w-xl mx-auto space-y-4">
        <h2 class="text-xl font-semibold">暂时无法准备本机草稿</h2>
        <p role="alert">
          {{ store.error || "请重试，或选择只在当前页面临时填写。" }}
        </p>
        <div class="flex flex-wrap gap-3">
          <Button @click="store.initialize">重新读取</Button
          ><Button variant="outline" @click="store.useMemory"
            >改用临时填写</Button
          >
        </div>
      </section>
    </main>
    <Dialog v-model:open="resetAnswersOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>清空全部自评？</DialogTitle>
          <DialogDescription
            >这会清空
            {{ store.questions.length }}
            项等级与备注，无法撤销。基础信息和照片会保留。</DialogDescription
          >
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="resetAnswersOpen = false"
            >保留自评</Button
          >
          <Button
            variant="destructive"
            :disabled="inputDisabled"
            @click="resetAnswers"
            >确认清空自评</Button
          >
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog v-model:open="discardOpen"
      ><DialogContent
        ><DialogHeader
          ><DialogTitle>清除本应用的填写数据？</DialogTitle
          ><DialogDescription
            >当前草稿和本应用中的图片、生成文件将被清除，无法恢复。已下载到设备的
            PDF 与原始图片不会删除。</DialogDescription
          ></DialogHeader
        ><DialogFooter
          ><Button variant="outline" @click="discardOpen = false"
            >保留草稿</Button
          ><Button
            variant="destructive"
            :disabled="store.busy"
            @click="clearData"
            >确认清除</Button
          ></DialogFooter
        ></DialogContent
      ></Dialog
    >
    <Dialog v-model:open="clearOpen"
      ><DialogContent
        ><DialogHeader
          ><DialogTitle>已保存文件，现在清除草稿？</DialogTitle
          ><DialogDescription
            >请确认 PDF
            已保存在设备且可以打开。清除后无法从本应用恢复，已下载文件仍保留。</DialogDescription
          ></DialogHeader
        ><DialogFooter
          ><Button variant="outline" @click="clearOpen = false">返回检查</Button
          ><Button :disabled="!savedConfirmed || store.busy" @click="clearData"
            >已保存，确认清除</Button
          ></DialogFooter
        ></DialogContent
      ></Dialog
    >
  </div>
</template>
