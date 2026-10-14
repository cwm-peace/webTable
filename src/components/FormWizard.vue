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
} from "../lib/formValidation";
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
const openedGroups = ref(new Set());
const steps = [
  { number: 1, label: "基础信息" },
  { number: 2, label: "图片附件" },
  { number: 3, label: "自评与导出" },
];
const basicsDone = computed(
  () =>
    allBasicFields.filter((field) =>
      String(store.revision?.basicInfo?.[field.key] || "").trim(),
    ).length,
);
const remarksDone = computed(
  () =>
    (store.revision?.answers || []).filter((answer) =>
      String(answer.remark || "").trim(),
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
  return result;
});
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
    store.busy ||
    store.readOnly ||
    store.saveStatus === "conflict" ||
    store.pdfReady,
);
/**
 * 找到指定输入当前对应的错误，供可访问提示引用。
 * @param {string} id 输入控件编号
 * @returns {string} 错误说明，没有错误时为空
 */
function fieldError(id) {
  return store.issues.find((issue) => issue.id === id)?.message || "";
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
  for (const group of groups.value)
    if (
      group.items.some((item) =>
        [`grade-${item.id}`, `remark-${item.id}`].includes(issue.id),
      )
    )
      openedGroups.value = new Set([...openedGroups.value, group.key]);
  await nextTick();
  await store.focusIssue(issue);
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
  openedGroups.value = new Set();
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
  <div class="page form-shell">
    <header class="form-header">
      <div>
        <p class="eyebrow">WebTable · 本机填写</p>
        <h1 class="page-title mt-2">个人信息表</h1>
        <p class="mt-2 text-sm text-muted-foreground">
          填写、整理附件，生成一份由自己保管的 PDF。
        </p>
      </div>
      <ThemeControl />
    </header>
    <main id="main-content" tabindex="-1">
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
        <div class="form-workspace">
          <aside class="form-sidebar space-y-5">
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
                <span class="step-number">{{ item.number }}</span
                ><span>{{ item.label }}</span>
              </button>
            </nav>
            <div class="panel compact-panel text-sm space-y-3">
              <h2 class="font-semibold">完成进度</h2>
              <dl class="space-y-2">
                <div class="flex justify-between gap-3">
                  <dt>基础信息</dt>
                  <dd>{{ basicsDone }} / 32</dd>
                </div>
                <div class="flex justify-between gap-3">
                  <dt>图片附件</dt>
                  <dd>{{ store.revision.photos.length }} / 16</dd>
                </div>
                <div class="flex justify-between gap-3">
                  <dt>自评级别</dt>
                  <dd>{{ store.answered }} / 125</dd>
                </div>
                <div class="flex justify-between gap-3">
                  <dt>自评备注</dt>
                  <dd>{{ remarksDone }} / 125</dd>
                </div>
              </dl>
            </div>
            <details class="text-sm text-muted-foreground">
              <summary class="min-h-11 py-2 font-medium">
                草稿与隐私说明
              </summary>
              <div class="space-y-3 mt-2">
                <p>
                  请在您信任的设备和浏览器中填写。保存在浏览器中的草稿可被同一设备使用者访问。
                </p>
                <p>
                  “清除本应用数据”只清除此应用的草稿和缓存文件，不清除其他网站数据，也不会删除已下载的
                  PDF。
                </p>
                <p>
                  全部文字字段均需填写；没有对应情况时可填写“无”或“不适用”。
                </p>
              </div>
            </details>
            <Button
              variant="outline"
              class="w-full"
              :disabled="store.busy"
              @click="discardOpen = true"
              ><Trash2
                class="size-4"
                aria-hidden="true"
              />清除本应用数据</Button
            >
          </aside>
          <div class="min-w-0 space-y-5">
            <div class="notice space-y-3">
              <p role="status" aria-live="polite">{{ saveLabel }}</p>
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
              <p class="mt-1">选择下列提示可跳到对应位置。</p>
              <ul class="error-list">
                <li
                  v-for="(issue, index) in store.issues"
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
                  <h2
                    id="pdf-title"
                    tabindex="-1"
                    class="text-xl font-semibold"
                  >
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
                        ? "四类图片各 4 张，共 16 张；相同文件内容不能重复使用。"
                        : "每项选择 A–E 级别并填写备注；备注没有补充内容时可填“无”。"
                  }}
                </p>
                <p v-if="store.step === 2" class="notice mt-3">
                  支持 JPEG、PNG、WebP、GIF、BMP、AVIF、TIFF、SVG
                  等常见图片，按文件内容识别格式，HEIC／HEIF
                  取决于浏览器是否内置解码器。单张最多 64 MiB；超过 2500
                  万像素或边长 8192 会自动缩小，动图取第一帧。
                  不超过 2 MiB、1300 万像素且边长不超过 4096
                  的图片保留原始字节；其余生成压缩 JPEG 附件并标记。
                  原文件可能保留拍摄位置等元数据。
                </p>
              </div>
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
                          :aria-invalid="
                            Boolean(fieldError(`basic-${field.key}`))
                          "
                          :aria-describedby="
                            fieldError(`basic-${field.key}`)
                              ? `basic-${field.key}-error`
                              : undefined
                          "
                        /><Input
                          v-else
                          :id="`basic-${field.key}`"
                          v-model="store.revision.basicInfo[field.key]"
                          :maxlength="field.maxLength"
                          :placeholder="field.placeholder || ''"
                          autocomplete="off"
                          required
                          :aria-invalid="
                            Boolean(fieldError(`basic-${field.key}`))
                          "
                          :aria-describedby="
                            fieldError(`basic-${field.key}`)
                              ? `basic-${field.key}-error`
                              : undefined
                          "
                        />
                        <p
                          v-if="fieldError(`basic-${field.key}`)"
                          :id="`basic-${field.key}-error`"
                          class="text-sm text-destructive"
                        >
                          {{ fieldError(`basic-${field.key}`) }}
                        </p>
                      </div>
                    </div>
                  </section></template
                >
                <template v-if="store.step === 2"
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
                <template v-if="store.step === 3"
                  ><div class="notice">
                    A 超级喜欢 · B 喜欢 · C 不喜欢但接受 · D 强迫才接受 · E
                    绝对不接受
                  </div>
                  <details
                    v-for="group in groups"
                    :key="group.key"
                    class="panel assessment-group"
                    :open="openedGroups.has(group.key)"
                    @toggle="toggleGroup(group.key, $event)"
                  >
                    <summary
                      class="flex items-center justify-between gap-4 font-semibold"
                    >
                      <span>{{ group.label }}</span
                      ><span class="text-sm text-muted-foreground font-normal"
                        >{{
                          group.items.filter(
                            (item) =>
                              item.answer?.grade &&
                              String(item.answer?.remark || "").trim(),
                          ).length
                        }}
                        / {{ group.items.length }} 完成</span
                      >
                    </summary>
                    <div class="divide-y mt-4">
                      <div
                        v-for="question in group.items"
                        :key="question.id"
                        class="assessment-item"
                      >
                        <div class="field">
                          <label :for="`grade-${question.id}`"
                            >{{ question.itemName }} · 级别
                            <span class="text-muted-foreground font-normal"
                              >必填</span
                            ></label
                          ><select
                            :id="`grade-${question.id}`"
                            v-model="question.answer.grade"
                            required
                            class="control"
                            :aria-invalid="
                              Boolean(fieldError(`grade-${question.id}`))
                            "
                            :aria-describedby="
                              fieldError(`grade-${question.id}`)
                                ? `grade-${question.id}-error`
                                : undefined
                            "
                          >
                            <option value="">选择级别</option>
                            <option
                              v-for="(label, grade) in {
                                A: '超级喜欢',
                                B: '喜欢',
                                C: '不喜欢但接受',
                                D: '强迫才接受',
                                E: '绝对不接受',
                              }"
                              :key="grade"
                              :value="grade"
                            >
                              {{ grade }} · {{ label }}
                            </option>
                          </select>
                          <p
                            v-if="fieldError(`grade-${question.id}`)"
                            :id="`grade-${question.id}-error`"
                            class="text-sm text-destructive"
                          >
                            {{ fieldError(`grade-${question.id}`) }}
                          </p>
                        </div>
                        <div class="field">
                          <label :for="`remark-${question.id}`"
                            >{{ question.itemName }} · 备注
                            <span class="text-muted-foreground font-normal"
                              >必填</span
                            ></label
                          ><Textarea
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
                  >检查并继续<ArrowRight
                    class="size-4"
                    aria-hidden="true" /></Button
                ><Button v-else :disabled="inputDisabled" @click="generate"
                  ><Check class="size-4" aria-hidden="true" />检查并生成
                  PDF</Button
                >
              </footer>
            </template>
          </div>
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
