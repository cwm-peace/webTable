/** 本机填写状态：串行自动保存、标签页编辑租约、图片处理和确认保存后的清理。 */
import { defineStore } from "pinia";
import { computed, nextTick, ref, toRaw, watch } from "vue";
import { createAutosave } from "../lib/autosave";
import {
  basicPayload,
  grades,
  newDraft,
  questions as fixedQuestions,
  validateRevision,
} from "../lib/formValidation";
import { openRepository } from "../lib/storage";
import { processImage } from "../lib/images";

export const useFormStore = defineStore("form", () => {
  const revision = ref(null),
    questions = ref(fixedQuestions),
    loading = ref(true);
  const error = ref(""),
    saveStatus = ref("saved"),
    saveError = ref(null);
  const step = ref(1),
    busy = ref(false),
    progress = ref(0),
    progressText = ref("");
  const issues = ref([]),
    readOnly = ref(false),
    storageFailed = ref(false);
  const storageMode = ref("persistent"),
    complete = ref(false);
  const pdfUrl = ref(""),
    pdfFilename = ref(""),
    // 字体缺字替换提示：生成成功后说明哪些字符被占位符代替。
    fontNotice = ref("");
  const clearWarning = ref("");
  const ageAccepted = computed(() => Boolean(revision.value?.ageConfirmedAt));
  const pdfReady = computed(() => Boolean(pdfUrl.value));
  const answered = computed(
    () =>
      (revision.value?.answers || []).filter((a) =>
        Object.hasOwn(grades, a.grade),
      ).length,
  );
  const dirty = computed(() =>
    ["pending", "saving", "error", "conflict"].includes(saveStatus.value),
  );
  let repository, control, queue, heartbeat, channel, abortController;
  let generation = 0,
    suppress = false,
    disposed = false;
  let operations = Promise.resolve();
  let canResumeReadOnly = false;
  const owner = newDraft().id;

  /** 检查持久草稿结构，阻止损坏的本机数据进入v-model绑定。
   * @param {object|null} value 从本机存储读取的草稿
   * @returns {object|null} 可安全渲染的草稿；损坏时抛出可见错误
   */
  function readableDraft(value) {
    if (!value) return null;
    const invalid =
      value.formatVersion !== 1 ||
      !value.ageConfirmedAt ||
      typeof value.id !== "string" ||
      !value.basicInfo ||
      typeof value.basicInfo !== "object" ||
      !Array.isArray(value.answers) ||
      value.answers.length !== 125 ||
      new Set(value.answers.map((a) => a?.questionId)).size !== 125 ||
      value.answers.some(
        (a) =>
          !a ||
          !fixedQuestions.some((q) => q.id === a.questionId) ||
          typeof a.remark !== "string" ||
          typeof a.grade !== "string",
      ) ||
      !Array.isArray(value.photos) ||
      value.photos.length > 16 ||
      value.photos.some(
        (p) =>
          !p || !(p.blob instanceof Blob) || !(p.previewBlob instanceof Blob),
      );
    if (invalid)
      throw new Error(
        "本机草稿结构无法读取，请先在浏览器设置中清理该网站数据后再使用",
      );
    return {
      ...value,
      basicInfo: basicPayload(value.basicInfo),
      // 旧草稿没有阶段字段，异常值也回到第一页，不升级数据库或草稿版本。
      currentStep: [1, 2, 3].includes(value.currentStep)
        ? value.currentStep
        : 1,
    };
  }

  /** 串行执行所有数据库操作，续租不会与保存争用同一个版本。
   * @param {Function} operation 要在先前操作结束后执行的函数
   * @returns {Promise<unknown>} 本次操作的结果
   */
  function serial(operation) {
    const result = operations.then(operation);
    operations = result.catch(() => {});
    return result;
  }
  /** 复制允许写入的字段，避免Vue代理进入IndexedDB或Worker。
   * @returns {object} 当前草稿的独立快照，Blob不可变且只共享引用
   */
  function snapshot() {
    const value = revision.value;
    if (!value) throw new Error("当前没有可保存的草稿");
    return {
      formatVersion: 1,
      id: value.id,
      ageConfirmedAt: value.ageConfirmedAt,
      updatedAt: new Date().toISOString(),
      currentStep: value.currentStep,
      basicInfo: basicPayload(value.basicInfo),
      answers: value.answers.map((a) => ({
        questionId: a.questionId,
        grade: a.grade,
        remark: a.remark,
      })),
      photos: value.photos.map((photo) => ({ ...toRaw(photo) })),
    };
  }
  /** 通知其他标签页重新检查控制记录，不发送填写内容。
   * @param {string} type changed或cleared
   * @returns {void} 无返回值
   */
  function notify(type) {
    channel?.postMessage({ type, generation: control?.generation });
  }
  /** 将失败状态交给页面，冲突后禁止继续写入。
   * @param {Error} failure 操作错误
   * @returns {void} 无返回值
   */
  function failed(failure) {
    error.value = failure.message || "操作未完成，请重试";
    if (failure.status === 409) {
      canResumeReadOnly = false;
      readOnly.value = true;
      saveStatus.value = "conflict";
      saveError.value = failure;
      abortController?.abort();
    }
  }
  /** 保存快照，只有事务提交后才更新页面的版本和保存提示。
   * @param {object} value 已脱离响应式代理的草稿
   * @param {boolean} photos 是否同时写入图片
   * @param {number} epoch 发起操作时的页面代次
   * @returns {Promise<void>} 保存结束
   */
  async function persist(value, photos = false, epoch = generation) {
    await serial(async () => {
      if (disposed || epoch !== generation) throw new Error("旧操作已取消");
      if (readOnly.value)
        throw Object.assign(new Error("本页没有编辑权，请重新读取"), {
          status: 409,
        });
      if (storageMode.value === "persistent") {
        if (!repository || !control) throw new Error("本机存储未准备好");
        control = await repository.save(value, control, photos);
        notify("changed");
      }
      if (epoch === generation && revision.value)
        revision.value.updatedAt = value.updatedAt;
    });
  }
  /** 为当前草稿创建防抖保存队列；新代次忽略旧队列回调。
   * @returns {void} 无返回值
   */
  function configureQueue() {
    queue?.dispose();
    const epoch = generation;
    queue = createAutosave({
      snapshot,
      save: (value) => persist(value, false, epoch),
      onState: (state) => {
        if (epoch !== generation || disposed) return;
        saveStatus.value =
          storageMode.value === "memory" && state.status === "saved"
            ? "memory"
            : state.status;
        saveError.value = state.error;
        if (state.error?.status === 409) failed(state.error);
      },
    });
  }
  watch(
    () =>
      revision.value && [
        revision.value.basicInfo,
        revision.value.answers,
        revision.value.currentStep,
      ],
    () => {
      if (!suppress && ageAccepted.value && !readOnly.value && !pdfReady.value)
        queue?.changed();
    },
    { deep: true, flush: "sync" },
  );

  watch(
    step,
    (value) => {
      if (
        !suppress &&
        ageAccepted.value &&
        !readOnly.value &&
        !pdfReady.value &&
        [1, 2, 3].includes(value) &&
        revision.value.currentStep !== value
      )
        revision.value.currentStep = value;
    },
    { flush: "sync" },
  );
  watch(
    () =>
      revision.value && [
        revision.value.basicInfo,
        revision.value.answers,
        revision.value.photos,
      ],
    () => {
      if (suppress || !issues.value.length) return;
      const remaining = new Map(
        validateRevision(revision.value).map((issue) => [issue.id, issue]),
      );
      // 只修正已显示的错误，并保持数组引用；输入不应触发摘要的导航聚焦。
      for (let index = issues.value.length - 1; index >= 0; index--) {
        const current = issues.value[index];
        const updated = remaining.get(current.id);
        if (!updated) issues.value.splice(index, 1);
        else Object.assign(current, updated);
      }
    },
    { deep: true },
  );

  /** 撤销本页生成文件的URL，不影响用户已下载的文件。
   * @returns {void} 无返回值
   */
  function revokePdf() {
    if (pdfUrl.value) URL.revokeObjectURL(pdfUrl.value);
    pdfUrl.value = "";
    pdfFilename.value = "";
    fontNotice.value = "";
  }
  /** 清除本页内存及旧任务，供数据库已清理后的跨标签页同步使用。
   * @returns {void} 无返回值
   */
  function forget() {
    generation++;
    queue?.dispose();
    queue = null;
    abortController?.abort();
    revokePdf();
    suppress = true;
    revision.value = null;
    suppress = false;
    issues.value = [];
    error.value = "";
    saveError.value = null;
    saveStatus.value = "saved";
    complete.value = true;
    readOnly.value = false;
    busy.value = false;
  }
  /** 检查清除代次并续租；后台标签页过期后必须重新读取，不能覆盖新编辑。
   * @returns {Promise<void>} 检查处理结束
   */
  async function checkLease() {
    if (!repository || !control || disposed || complete.value) return;
    const epoch = generation;
    try {
      await serial(async () => {
        if (epoch !== generation || !repository || complete.value) return;
        const latest = await repository.getControl();
        if (latest.generation !== control.generation) {
          control = latest;
          forget();
          return;
        }
        if (!readOnly.value) control = await repository.renew(control);
        else if (
          (!revision.value || canResumeReadOnly) &&
          (!latest.owner || latest.leaseUntil <= Date.now())
        ) {
          const claim = await repository.claim(latest.generation);
          if (claim.acquired) {
            const loaded = await repository.load();
            control = loaded.control;
            suppress = true;
            revision.value = readableDraft(loaded.draft);
            step.value = revision.value?.currentStep || 1;
            suppress = false;
            readOnly.value = false;
            canResumeReadOnly = false;
            saveStatus.value = "saved";
            saveError.value = null;
            error.value = "";
            if (revision.value) configureQueue();
          }
        }
      });
    } catch (failure) {
      if (epoch === generation) failed(failure);
    }
  }
  /** 注册不含个人数据的跨页通知与周期租约检查。
   * @returns {void} 无返回值
   */
  function watchTabs() {
    clearInterval(heartbeat);
    channel?.close();
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel("webtable-draft-control");
      channel.onmessage = () => {
        void checkLease();
      };
    }
    heartbeat = setInterval(checkLease, 2500);
    window.removeEventListener("pagehide", leavePage);
    window.addEventListener("pagehide", leavePage);
    window.removeEventListener("pageshow", returnPage);
    window.addEventListener("pageshow", returnPage);
    document.removeEventListener("visibilitychange", resumeVisiblePage);
    document.addEventListener("visibilitychange", resumeVisiblePage);
    window.removeEventListener("focus", resumeFocusedPage);
    window.addEventListener("focus", resumeFocusedPage);
  }
  /** 页面进入后台时暂停心跳；保留租约让同一页恢复时安全续租。
   * 释放租约会让返回页面误判为失权，因此交给租约自然到期。
   * @returns {void} 无返回值
   */
  function leavePage() {
    clearInterval(heartbeat);
  }
  /** 从浏览器往返缓存返回时复核编辑权，不覆盖本页尚未保存的数据。
   * @param {PageTransitionEvent} event 浏览器页面恢复事件
   * @returns {void} 无返回值
   */
  function returnPage(event) {
    if (event.persisted || document.visibilityState === "visible") {
      watchTabs();
      void checkLease();
    }
  }
  /** 页面从后台恢复可见时立即复核租约，不等待下一次2.5秒心跳。
   * @returns {void} 无返回值
   */
  function resumeVisiblePage() {
    if (document.visibilityState === "visible") {
      watchTabs();
      void checkLease();
    }
  }
  /** 窗口重新获得焦点时立即复核租约，覆盖部分移动浏览器不发送pageshow的情况。
   * @returns {void} 无返回值
   */
  function resumeFocusedPage() {
    watchTabs();
    void checkLease();
  }
  /** 读取草稿并取得单页编辑权；没有草稿时保持年龄确认页面。
   * @returns {Promise<void>} 初始化完成
   */
  async function initialize() {
    if (busy.value) return;
    disposed = false;
    loading.value = true;
    error.value = "";
    storageFailed.value = false;
    generation++;
    queue?.dispose();
    queue = null;
    revokePdf();
    clearInterval(heartbeat);
    channel?.close();
    channel = null;
    await operations;
    if (repository) {
      await repository.release().catch(() => {});
      repository.close();
    }
    repository = null;
    control = null;
    suppress = true;
    revision.value = null;
    suppress = false;
    complete.value = false;
    clearWarning.value = "";
    readOnly.value = false;
    step.value = 1;
    issues.value = [];
    saveStatus.value = "saved";
    saveError.value = null;
    storageMode.value = "persistent";
    try {
      if (!globalThis.crypto?.subtle)
        throw new Error(
          "当前环境缺少安全加密能力，请使用HTTPS或本机地址及新版浏览器",
        );
      repository = await openRepository({ owner });
      const initial = await repository.getControl();
      const claim = await repository.claim(initial.generation);
      // 取得租约后再读取内容，不能给旧快照配上其他页面写入后的新版本号。
      const loaded = await repository.load();
      control = loaded.control;
      readOnly.value = !claim.acquired;
      if (loaded.draft) {
        const value = readableDraft(loaded.draft);
        suppress = true;
        revision.value = value;
        step.value = value.currentStep;
        suppress = false;
        configureQueue();
      }
      if (readOnly.value)
        failed(
          Object.assign(
            new Error(
              "另一个标签页正在填写。本页只读，关闭那一页后可重新读取。",
            ),
            { status: 409 },
          ),
        );
      // 初次加载的只读快照没有本页编辑，可在旧页租约释放后安全重读。
      canResumeReadOnly = readOnly.value;
      watchTabs();
    } catch (failure) {
      storageFailed.value = true;
      error.value = failure.message || "浏览器本机存储不可用";
    } finally {
      loading.value = false;
    }
  }
  /** 用户明确选择临时填写；已有磁盘草稿仍在最终清理范围内。
   * @returns {Promise<void>} 临时模式切换结束
   */
  async function useMemory() {
    if (busy.value || readOnly.value || saveStatus.value === "conflict") return;
    await operations;
    storageMode.value = "memory";
    storageFailed.value = false;
    error.value = "";
    saveStatus.value = "memory";
    saveError.value = null;
    loading.value = false;
    if (revision.value) configureQueue();
  }
  /** 记录本份草稿的成年确认；没有确认不会存入填写数据。
   * @returns {Promise<void>} 草稿创建并保存完成
   */
  async function acceptAge() {
    if (busy.value || readOnly.value || ageAccepted.value) return;
    busy.value = true;
    error.value = "";
    try {
      const value = newDraft();
      value.ageConfirmedAt = new Date().toISOString();
      suppress = true;
      revision.value = value;
      suppress = false;
      await persist(snapshot(), true);
      configureQueue();
      saveStatus.value = storageMode.value === "memory" ? "memory" : "saved";
    } catch (failure) {
      suppress = true;
      revision.value = null;
      suppress = false;
      storageFailed.value = true;
      failed(failure);
    } finally {
      busy.value = false;
    }
  }
  /** 等待防抖保存完成，失败时保留未保存内容。
   * @returns {Promise<boolean>} 当前编辑是否已保存或保留在明确选择的临时模式中
   */
  async function flush() {
    return queue ? queue.flush() : false;
  }
  /** 重试失败的本机保存，不自动解除版本冲突。
   * @returns {Promise<boolean>} 重试是否成功
   */
  async function retrySave() {
    if (readOnly.value || busy.value) return false;
    error.value = "";
    const success = await queue?.resume();
    if (success) storageFailed.value = false;
    return Boolean(success);
  }
  /** 前进前检查当前及先前步骤，后退仍可查看或修正内容。
   * @param {number} nextStep 目标步骤1至3
   * @returns {Promise<void>} 步骤处理完成
   */
  async function navigate(nextStep) {
    if (busy.value || pdfReady.value || nextStep < 1 || nextStep > 3) return;
    if (!readOnly.value && !(await flush())) return;
    issues.value =
      nextStep > step.value
        ? validateRevision(revision.value).filter((i) => i.step < nextStep)
        : [];
    if (issues.value.length) {
      step.value = issues.value[0].step;
      return;
    }
    step.value = nextStep;
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  /** 定位校验错误对应的输入控件。
   * @param {object} issue 含step和id的校验错误
   * @returns {Promise<void>} 页面切换并尝试聚焦后完成
   */
  async function focusIssue(issue) {
    step.value = issue.step;
    await nextTick();
    const element = document.getElementById(issue.id);
    element?.scrollIntoView({ block: "center", behavior: "smooth" });
    element?.focus();
  }
  /** 在本机处理图片并原子替换槽位，失败则保留原来图片。
   * @param {string} category 图片类别
   * @param {number} slot 类别内槽位1至4
   * @param {File|null} file 选择的文件，null表示移除
   * @returns {Promise<void>} 图片操作结束
   */
  async function changePhoto(category, slot, file) {
    if (busy.value || readOnly.value || pdfReady.value || !ageAccepted.value)
      return;
    busy.value = true;
    error.value = "";
    progress.value = 0;
    progressText.value = "正在检查图片";
    const epoch = generation;
    abortController = new AbortController();
    try {
      if (!(await flush())) return;
      let photo;
      if (file) {
        photo = await processImage(file, {
          signal: abortController.signal,
          onProgress: (p) => {
            progress.value = p.progress * 100;
          },
        });
        const others = revision.value.photos.filter(
          (p) => p.category !== category || p.slot !== slot,
        );
        if (
          others.some(
            (p) =>
              p.sourceSha256 === photo.sourceSha256 ||
              p.sha256 === photo.sha256,
          )
        )
          throw new Error("这张图片已在其他槽位使用，请选择不同的图片");
      }
      if (epoch !== generation || abortController.signal.aborted) return;
      const value = snapshot();
      value.photos = value.photos.filter(
        (p) => p.category !== category || p.slot !== slot,
      );
      if (photo) value.photos.push({ ...photo, category, slot });
      await persist(value, true, epoch);
      if (epoch === generation) revision.value.photos = value.photos;
    } catch (failure) {
      if (epoch === generation) failed(failure);
    } finally {
      if (epoch === generation) {
        busy.value = false;
        abortController = null;
      }
    }
  }
  /** 校验并生成完整PDF快照；下载和清理均由页面上的明确操作触发。
   * @returns {Promise<void>} 生成结束，失败保留草稿
   */
  async function generateExport() {
    if (busy.value || readOnly.value || !ageAccepted.value || pdfReady.value)
      return;
    busy.value = true;
    error.value = "";
    progress.value = 0;
    progressText.value = "正在检查全部内容";
    const epoch = generation;
    abortController = new AbortController();
    try {
      if (!(await flush())) return;
      issues.value = validateRevision(revision.value);
      if (issues.value.length) {
        step.value = issues.value[0].step;
        return;
      }
      const value = snapshot();
      const { exportPdf } = await import("../lib/pdf");
      const output = await exportPdf(value, {
        signal: abortController.signal,
        onProgress: (p) => {
          progress.value = p.percent;
          progressText.value = p.stage;
        },
      });
      if (epoch !== generation || abortController.signal.aborted) return;
      revokePdf();
      pdfUrl.value = URL.createObjectURL(output.blob);
      pdfFilename.value = output.filename;
      fontNotice.value = output.substitutions?.message || "";
      progress.value = 100;
    } catch (failure) {
      if (epoch === generation) failed(failure);
    } finally {
      if (epoch === generation) {
        busy.value = false;
        abortController = null;
      }
    }
  }
  /** 取消本次生成，填写内容和图片继续保留。
   * @returns {void} 无返回值
   */
  function cancelExport() {
    abortController?.abort();
  }
  /** 回到编辑时废弃旧PDF，防止下载过时的填写内容。
   * @returns {void} 无返回值
   */
  function returnToEdit() {
    if (!busy.value) revokePdf();
  }
  /** 用户确认后删除本应用内容；事务失败时保留页面供重试。
   * @returns {Promise<boolean>} 是否验证清理完成
   */
  async function clearAll() {
    if (busy.value || readOnly.value) return false;
    busy.value = true;
    error.value = "";
    queue?.dispose();
    try {
      await serial(async () => {
        // 临时模式也检查此前写入的磁盘草稿，避免仅清掉内存却误报全部清理。
        if (!repository) {
          repository = await openRepository({ owner });
          const loaded = await repository.load();
          const claim = await repository.claim(loaded.control.generation);
          if (!claim.acquired)
            throw Object.assign(
              new Error("另一个标签页正在填写，请关闭它后重试清理"),
              { status: 409 },
            );
          control = claim.control;
        }
        control = await repository.clear(control);
        const loaded = await repository.load();
        if (loaded.draft) throw new Error("清理验证未通过，请重试");
        notify("cleared");
      });
      forget();
      return true;
    } catch (failure) {
      if (
        storageMode.value === "memory" &&
        !repository &&
        failure.status !== 409
      ) {
        forget();
        clearWarning.value =
          "当前页面中的填写内容和生成文件已释放。浏览器存储不可访问，无法确认此前的磁盘草稿已清除；请在浏览器设置中清除本网站数据。";
        return true;
      }
      failed(failure);
      configureQueue();
      return false;
    } finally {
      busy.value = false;
    }
  }
  /** 重新读取磁盘草稿，界面操作已提醒会放弃本页未保存修改。
   * @returns {Promise<void>} 重读结束
   */
  async function refresh() {
    await initialize();
  }
  /** 清理完成后准备新表单，新表单重新确认年龄。
   * @returns {Promise<void>} 初始化结束
   */
  async function startNew() {
    if (complete.value) await initialize();
  }
  /** 离开应用时撤销本页资源；不删除尚未确认清除的草稿。
   * @returns {void} 无返回值
   */
  function dispose() {
    disposed = true;
    generation++;
    queue?.dispose();
    abortController?.abort();
    clearInterval(heartbeat);
    channel?.close();
    window.removeEventListener("pagehide", leavePage);
    window.removeEventListener("pageshow", returnPage);
    document.removeEventListener("visibilitychange", resumeVisiblePage);
    window.removeEventListener("focus", resumeFocusedPage);
    revokePdf();
    window.removeEventListener("pagehide", leavePage);
    window.removeEventListener("pageshow", returnPage);
    const previous = repository;
    repository = null;
    void operations.then(async () => {
      await previous?.release().catch(() => {});
      previous?.close();
    });
  }
  return {
    revision,
    questions,
    loading,
    error,
    saveStatus,
    saveError,
    step,
    busy,
    progress,
    progressText,
    issues,
    readOnly,
    storageFailed,
    storageMode,
    complete,
    clearWarning,
    pdfUrl,
    pdfFilename,
    fontNotice,
    ageAccepted,
    pdfReady,
    answered,
    dirty,
    initialize,
    acceptAge,
    useMemory,
    flush,
    retrySave,
    navigate,
    focusIssue,
    changePhoto,
    generateExport,
    cancelExport,
    returnToEdit,
    clearAll,
    refresh,
    startNew,
    dispose,
  };
});
