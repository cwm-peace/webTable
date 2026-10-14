/** 在独立线程生成本地 PDF，主线程通过 terminate 取消并释放任务数据。 */
import { generatePdf } from "../lib/pdfCore.js";

/**
 * 接收一份固定草稿，返回进度或可转移的 PDF 字节。
 * @param {MessageEvent<{draft: object}>} event 主线程发送的导出快照
 * @returns {Promise<void>} 消息发送完毕后兑现，不保存草稿
 */
self.onmessage = async (event) => {
  try {
    const bytes = await generatePdf(event.data.draft, {
      onProgress: (progress) =>
        self.postMessage({ type: "progress", progress }),
      onSubstitution: (substitutions) =>
        self.postMessage({ type: "substitution", substitutions }),
    });
    self.postMessage({ type: "result", bytes }, [bytes.buffer]);
  } catch (error) {
    self.postMessage({
      type: "error",
      name: error.name,
      message: error.message || "PDF 生成失败，草稿仍保留。",
    });
  }
};
