/** 在 Worker 中生成本地 PDF，并为不支持 Worker 的浏览器提供本机回退。 */
import { allBasicFields as fields } from "./formValidation.js";

/**
 * 延迟加载纯 PDF 内核，主线程回退或 Node 验证时才需要这一份库。
 * @param {object} draft 固定草稿
 * @param {object} [options] 字体字节、进度回调与取消信号
 * @returns {Promise<Uint8Array>} 完整 PDF 字节
 */
export async function generatePdf(draft, options) {
  const core = await import("./pdfCore.js");
  return core.generatePdf(draft, options);
}

/**
 * 复制草稿白名单字段，移除 Vue Proxy 和不属于导出的状态。
 * @param {object} draft 当前草稿
 * @returns {object} 可以传递到 Worker 的独立表单快照，Blob 由浏览器共享底层数据
 */
function snapshot(draft) {
  return {
    id: String(draft.id ?? ""),
    ageConfirmedAt: draft.ageConfirmedAt,
    basicInfo: Object.fromEntries(
      fields.map((field) => [
        field.key,
        String(draft.basicInfo?.[field.key] ?? ""),
      ]),
    ),
    answers: (draft.answers ?? []).map(({ questionId, grade, remark }) => ({
      questionId,
      grade,
      remark,
    })),
    photos: (draft.photos ?? []).map((photo) =>
      Object.fromEntries(
        [
          "category",
          "slot",
          "blob",
          "previewBlob",
          "sha256",
          "sourceSha256",
          "name",
          "mime",
          "size",
          "width",
          "height",
          "compressed",
          "animated",
          "rasterized",
          "autoShrunk",
          "sourceWidth",
          "sourceHeight",
        ].map((key) => [key, photo[key]]),
      ),
    ),
  };
}

/**
 * 在专用 Worker 生成 PDF；仅在 Worker 无法启动时回退到本机主线程。
 * @param {object} draft 完整草稿，调用期间不得更改
 * @param {object} [options] signal 取消信号；onProgress 接收 stage、completed、total、percent
 * @returns {Promise<{blob: Blob, filename: string, substitutions: object|null}>} 可供用户下载的 PDF 与字体缺字替换记录；不自动清除任何草稿
 */
export async function exportPdf(draft, { signal, onProgress = () => {} } = {}) {
  if (signal?.aborted)
    throw new DOMException("已取消 PDF 生成，草稿仍保留。", "AbortError");
  const fixed = snapshot(draft);
  const filename = `填写记录-${new Date().toISOString().slice(0, 10)}.pdf`;
  // 字体缺字替换由内核回调上报，Worker 与本机回退都要带回页面。
  const fallback = async () => {
    let substitutions = null;
    const bytes = await generatePdf(fixed, {
      signal,
      onProgress,
      onSubstitution: (info) => {
        substitutions = info;
      },
    });
    return {
      blob: new Blob([bytes], { type: "application/pdf" }),
      filename,
      substitutions,
    };
  };
  if (typeof Worker === "undefined") return fallback();
  let worker;
  try {
    worker = new Worker(new URL("../workers/pdf.worker.js", import.meta.url), {
      type: "module",
    });
  } catch {
    return fallback();
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    let started = false;
    let substitutions = null;
    /** 移除监听并释放 Worker，防止保留照片和文档内存。 */
    const cleanup = () => {
      worker.terminate();
      signal?.removeEventListener("abort", abort);
    };
    /** 用户取消只结束任务，不能触发回退和再次生成。 */
    const abort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new DOMException("已取消 PDF 生成，草稿仍保留。", "AbortError"));
    };
    worker.onmessage = ({ data }) => {
      if (settled) return;
      if (data.type === "progress") {
        started = true;
        onProgress(data.progress);
        return;
      }
      if (data.type === "substitution") {
        started = true;
        substitutions = data.substitutions;
        return;
      }
      settled = true;
      cleanup();
      if (data.type === "result")
        resolve({
          blob: new Blob([data.bytes], { type: "application/pdf" }),
          filename,
          substitutions,
        });
      else {
        const error = new Error(data.message || "PDF 生成失败，草稿仍保留。");
        error.name = data.name || "Error";
        reject(error);
      }
    };
    const workerFailed = () => {
      if (settled) return;
      settled = true;
      cleanup();
      if (signal?.aborted)
        reject(new DOMException("已取消 PDF 生成。", "AbortError"));
      else if (started)
        reject(new Error("PDF 处理任务中断，请重试。草稿仍保留。"));
      else fallback().then(resolve, reject);
    };
    worker.onerror = workerFailed;
    worker.onmessageerror = workerFailed;
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) {
      abort();
      return;
    }
    try {
      worker.postMessage({ draft: fixed });
    } catch {
      settled = true;
      cleanup();
      fallback().then(resolve, reject);
    }
  });
}
