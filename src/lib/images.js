/** 本地图片入口：校验、摘要和可取消处理。图片与处理结果均不会发往服务器。 */
import {
  IMAGE_LIMITS,
  imageError,
  inspectImage,
  mimeGroup,
  sameMimeGroup,
  sniffMime,
} from "./imageHeader.js";
import { renderImage } from "../workers/image.worker.js";

export { IMAGE_LIMITS };

/**
 * 检查调用方是否已取消图片选择。
 * @param {AbortSignal|undefined} signal 调用方取消信号。
 * @returns {void} 已取消时抛出 AbortError。
 */
function checkAbort(signal) {
  if (signal?.aborted) throw new DOMException("图片处理已取消。", "AbortError");
}

/**
 * 对文件原字节计算 SHA-256，文件名不会影响摘要。
 * @param {Blob} blob 需要计算摘要的图片文件。
 * @returns {Promise<string>} 64 位十六进制摘要。
 */
export async function sha256(blob) {
  return digestBytes(await blob.arrayBuffer());
}

/**
 * 复用已经读取的文件缓冲区计算摘要，减少大文件的临时副本。
 * @param {ArrayBuffer} bytes 图片原字节。
 * @returns {Promise<string>} 64 位十六进制 SHA-256。
 */
async function digestBytes(bytes) {
  if (!globalThis.crypto?.subtle)
    throw imageError(
      "IMAGE_CRYPTO",
      "浏览器不支持安全摘要，请通过 HTTPS 或 localhost 打开网站。",
    );
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/**
 * 在 Worker 中生成派生图，结束或取消时立即终止线程。
 * @param {Blob} blob 已通过容器检查的图片。
 * @param {object} metadata 图片尺寸、格式与方向。
 * @param {{signal?:AbortSignal,onProgress?:Function}} options 取消和进度回调。
 * @returns {Promise<object>} 最终附件和预览结果。
 */
function renderInWorker(blob, metadata, { signal, onProgress }) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(
        new URL("../workers/image.worker.js", import.meta.url),
        { type: "module" },
      );
    } catch {
      reject(imageError("WORKER_UNAVAILABLE", "图片处理线程不可用。"));
      return;
    }
    const cleanup = () => {
      signal?.removeEventListener("abort", abort);
      worker.terminate();
    };
    const abort = () => {
      cleanup();
      reject(new DOMException("图片处理已取消。", "AbortError"));
    };
    worker.onmessage = ({ data }) => {
      if (data.progress) {
        onProgress?.(data.progress);
        return;
      }
      cleanup();
      if (data.error)
        reject(
          Object.assign(new Error(data.error.message), {
            name: data.error.name,
            code: data.error.code,
          }),
        );
      else resolve(data.result);
    };
    worker.onerror = () => {
      cleanup();
      reject(imageError("WORKER_UNAVAILABLE", "图片处理线程不可用。"));
    };
    worker.onmessageerror = () => {
      cleanup();
      reject(imageError("WORKER_UNAVAILABLE", "图片无法传递给处理线程。"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) {
      abort();
      return;
    }
    try {
      worker.postMessage({ blob, metadata });
    } catch {
      cleanup();
      reject(imageError("WORKER_UNAVAILABLE", "图片处理线程不可用。"));
    }
  });
}

/**
 * 尝试通过浏览器解码来探测图片尺寸，用于本文件未做结构校验的格式。
 * SVG 以图片方式加载时按静态模式渲染，脚本不会执行，也不会请求外部资源。
 * @param {Blob} blob 图片文件。
 * @param {AbortSignal|undefined} signal 取消信号。
 * @returns {Promise<{width:number,height:number,mime:string}>} 解码后的尺寸和文件声明的格式。
 */
async function probeImageByDecoding(blob, signal) {
  checkAbort(signal);

  // 优先使用 createImageBitmap，它支持浏览器内置解码器的全部格式。
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob, {
        imageOrientation: "from-image",
      });
      if (signal?.aborted) {
        bitmap.close();
        checkAbort(signal);
      }
      const width = bitmap.width;
      const height = bitmap.height;
      bitmap.close();
      return { width, height, mime: String(blob.type || "") };
    } catch (error) {
      if (error.name === "AbortError") throw error;
      // 解码失败，继续尝试 Image 元素
    }
  }

  // 回退到 Image 元素
  if (typeof document === "undefined")
    throw imageError(
      "IMAGE_DECODE",
      "浏览器无法解码这张图片，请确认文件完整且格式正确。",
    );

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const element = new Image();
    let finished = false;
    const cleanup = () => {
      signal?.removeEventListener("abort", abort);
      element.onload = null;
      element.onerror = null;
      URL.revokeObjectURL(url);
    };
    const abort = () => {
      if (finished) return;
      finished = true;
      cleanup();
      element.src = "";
      reject(new DOMException("图片处理已取消。", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    element.onload = () => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve({
        width: element.naturalWidth,
        height: element.naturalHeight,
        mime: String(blob.type || ""),
      });
    };
    element.onerror = () => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(
        imageError(
          "IMAGE_DECODE",
          "浏览器无法解码这张图片，请确认文件完整且格式正确。",
        ),
      );
    };
    element.src = url;
    if (signal?.aborted) abort();
  });
}

/**
 * 把解码失败整理成用户能执行的提示，HEIC／HEIF 单独说明浏览器限制。
 * @param {Error} error 解码阶段抛出的错误。
 * @param {string} declaredType 文件声明的 MIME。
 * @param {string} sniffed 按文件头识别出的 MIME。
 * @returns {Error} 带 code 的错误。
 */
function describeDecodeFailure(error, declaredType, sniffed) {
  const group = mimeGroup(sniffed) || mimeGroup(declaredType);
  if (group === "heif")
    return imageError(
      "IMAGE_DECODE",
      "当前浏览器不能解码 HEIC／HEIF 图片，请在设备上转换为 JPEG 或 PNG 后再选择。",
    );
  if (error.code === "IMAGE_DECODE") return error;
  return imageError(
    "IMAGE_DECODE",
    "浏览器无法解码这张图片，请确认文件完整或换一张图片。",
  );
}

/**
 * 校验并处理一张本地图片；调用方应串行调用，并用两个摘要跨槽位判重。
 * @param {File|Blob} file 用户选择的文件，支持所有浏览器能解码的图片格式。
 * @param {{signal?:AbortSignal,onProgress?:(progress:{stage:string,progress:number})=>void}} options 取消信号与 0 至 1 的处理进度。
 * @returns {Promise<{blob:Blob,previewBlob:Blob,sourceSha256:string,sha256:string,mime:string,name:string,originalName:string,size:number,width:number,height:number,sourceWidth:number,sourceHeight:number,compressed:boolean,animated:boolean,rasterized:boolean,autoShrunk:boolean}>} 不含对象 URL 的可持久化结果。
 * @throws {Error|DOMException} 校验失败返回带 code 的错误；取消返回 AbortError。
 */
export async function processImage(file, { signal, onProgress } = {}) {
  checkAbort(signal);
  if (!file || typeof file.arrayBuffer !== "function")
    throw imageError("IMAGE_TYPE", "请选择一张本地图片。");

  if (file.size > IMAGE_LIMITS.inputBytes)
    throw imageError(
      "IMAGE_TOO_LARGE",
      `单张图片不能超过 ${IMAGE_LIMITS.inputBytes / (1024 * 1024)} MiB，请先在设备上压缩或缩小后再选择。`,
    );

  onProgress?.({ stage: "validate", progress: 0.05 });
  let bytes = await file.arrayBuffer();
  checkAbort(signal);

  const declaredType = String(file.type || "")
    .trim()
    .toLowerCase()
    .replace("image/jpg", "image/jpeg");
  const declaredGroup = mimeGroup(declaredType);
  const sniffed = sniffMime(bytes);

  // 先按容器规范解析；解析不了的格式再交给浏览器解码器，超大尺寸不在这里拒绝。
  let metadata = null;
  try {
    metadata = inspectImage(bytes);
  } catch (error) {
    if (error.name === "AbortError") throw error;
    // 声明为 JPEG／PNG／WebP 却解析失败，说明内容与声明不符，直接拒绝。
    if (
      ["jpeg", "png", "webp"].includes(declaredGroup) &&
      (error.code === "IMAGE_TYPE" || error.code === "IMAGE_CORRUPT")
    )
      throw error;
    // 体积与解码硬上限仍要立即拒绝，其余格式走浏览器解码。
    if (error.code !== "IMAGE_TYPE" && error.code !== "IMAGE_CORRUPT")
      throw error;
  }

  if (!metadata) {
    const typed =
      file.type && String(file.type).startsWith("image/")
        ? file
        : new Blob([bytes], { type: sniffed || "application/octet-stream" });
    let probed;
    try {
      probed = await probeImageByDecoding(typed, signal);
    } catch (error) {
      if (error.name === "AbortError") throw error;
      throw describeDecodeFailure(error, declaredType, sniffed);
    }
    checkAbort(signal);
    if (!(probed.width > 0) || !(probed.height > 0))
      throw imageError(
        "IMAGE_DECODE",
        "无法确定这张图片的尺寸，请换一张图片或先转换为 JPEG、PNG、WebP。",
      );
    metadata = {
      mime: sniffed || declaredType || "image/jpeg",
      width: probed.width,
      height: probed.height,
      displayWidth: probed.width,
      displayHeight: probed.height,
      orientation: 1,
      animated: false,
    };
  }

  // 文件声明的格式必须与内容格式同组，防止改扩展名绕过判重与格式说明。
  if (declaredGroup && !sameMimeGroup(declaredType, metadata.mime))
    throw imageError(
      "IMAGE_TYPE",
      "文件声明的格式与图片内容不一致，请从相册重新保存后再选择。",
    );

  // 重建 Blob，确保 MIME 类型与内容一致。
  const blob =
    file.type === metadata.mime
      ? file
      : new Blob([bytes], { type: metadata.mime });
  const sourceSha256 = await digestBytes(bytes);
  bytes = null;
  checkAbort(signal);
  onProgress?.({ stage: "hash", progress: 0.2 });

  // 压缩与缩小都在处理线程中完成，大图在解码阶段就降采样。
  let result;
  if (
    typeof Worker === "function" &&
    typeof OffscreenCanvas === "function" &&
    typeof createImageBitmap === "function"
  ) {
    try {
      result = await renderInWorker(blob, metadata, { signal, onProgress });
    } catch (error) {
      if (
        ![
          "WORKER_UNAVAILABLE",
          "IMAGE_DECODE",
          "IMAGE_UNSUPPORTED",
          "IMAGE_ENCODING",
          "IMAGE_PROCESS",
        ].includes(error.code)
      )
        throw error;
      checkAbort(signal);
      result = await renderImage(blob, metadata, { signal, onProgress });
    }
  } else result = await renderImage(blob, metadata, { signal, onProgress });
  checkAbort(signal);

  const finalSha256 = result.compressed
    ? await sha256(result.blob)
    : sourceSha256;
  checkAbort(signal);

  const originalName =
    String(file.name || "photo")
      .replace(/[\u0000-\u001f\u007f/\\]/g, "_")
      .slice(0, 180) || "photo";
  const stem = originalName.replace(/\.[^.]*$/, "") || "photo";
  // 附件名说明处理方式：动图取首帧、矢量或专有格式已转换、普通图片已压缩。
  const suffix = result.animated
    ? "-首帧"
    : result.rasterized
      ? "-已转换"
      : "-已压缩";
  onProgress?.({ stage: "complete", progress: 1 });

  return {
    ...result,
    sourceSha256,
    sha256: finalSha256,
    mime: result.blob.type,
    name: result.compressed ? `${stem}${suffix}.jpg` : originalName,
    originalName,
    size: result.blob.size,
  };
}
