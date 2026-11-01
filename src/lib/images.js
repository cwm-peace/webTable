/** 本地图片入口：校验、摘要和可取消处理。图片与处理结果均不会发往服务器。 */
import {
  IMAGE_LIMITS,
  imageError,
  inspectImage,
  mimeGroup,
  sniffMime,
} from "./imageHeader.js";
import { renderImage } from "../workers/image.worker.js";
import { imageOperation, IMAGE_WORKER_TIMEOUT_MS } from "./imageOperation.js";

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
 * @param {AbortSignal|undefined} signal 取消信号。
 * @returns {Promise<string>} 64 位十六进制摘要。
 */
export async function sha256(blob, signal) {
  return digestBytes(
    await imageOperation(() => blob.arrayBuffer(), { signal }),
    signal,
  );
}

/**
 * 复用已经读取的文件缓冲区计算摘要，减少大文件的临时副本。
 * @param {ArrayBuffer} bytes 图片原字节。
 * @param {AbortSignal|undefined} signal 取消信号。
 * @returns {Promise<string>} 64 位十六进制 SHA-256。
 */
async function digestBytes(bytes, signal) {
  if (!globalThis.crypto?.subtle)
    throw imageError(
      "IMAGE_CRYPTO",
      "浏览器不支持安全摘要，请通过 HTTPS 或 localhost 打开网站。",
    );
  const digest = await imageOperation(
    () => globalThis.crypto.subtle.digest("SHA-256", bytes),
    { signal },
  );
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
    let timer;
    let finished = false;
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
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
    };
    const abort = () => {
      if (finished) return;
      cleanup();
      reject(new DOMException("图片处理已取消。", "AbortError"));
    };
    const restartTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (finished) return;
        cleanup();
        reject(
          imageError(
            "WORKER_UNAVAILABLE",
            "图片处理线程等待过久，正在改用页面处理。",
          ),
        );
      }, IMAGE_WORKER_TIMEOUT_MS);
    };
    worker.onmessage = ({ data }) => {
      if (finished) return;
      if (data.progress) {
        restartTimer();
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
      if (finished) return;
      cleanup();
      reject(imageError("WORKER_UNAVAILABLE", "图片处理线程不可用。"));
    };
    worker.onmessageerror = () => {
      if (finished) return;
      cleanup();
      reject(imageError("WORKER_UNAVAILABLE", "图片无法传递给处理线程。"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) {
      abort();
      return;
    }
    try {
      restartTimer();
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

  // 位图与图片元素可能支持不同格式，按能力尝试而不按设备名称判断。
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await imageOperation(
        () => createImageBitmap(blob, { imageOrientation: "from-image" }),
        { signal, onLateResult: (result) => result.close() },
      );
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

  return imageOperation(
    (decodeSignal) =>
      new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const element = new Image();
        let finished = false;
        const cleanup = () => {
          decodeSignal.removeEventListener("abort", abort);
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
        decodeSignal.addEventListener("abort", abort, { once: true });
        element.onload = () => {
          if (finished) return;
          finished = true;
          cleanup();
          const dimensions = {
            width: element.naturalWidth,
            height: element.naturalHeight,
            mime: String(blob.type || ""),
          };
          element.src = "";
          resolve(dimensions);
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
        if (decodeSignal.aborted) abort();
      }),
    { signal },
  );
}

/**
 * 把解码失败整理成用户能执行的提示，HEIC／HEIF 单独说明浏览器限制。
 * @param {Error} error 解码阶段抛出的错误。
 * @param {string} declaredType 文件声明的 MIME。
 * @param {string} sniffed 按文件头识别出的 MIME。
 * @returns {Error} 带 code 的错误。
 */
function describeDecodeFailure(error, declaredType, sniffed) {
  if (error.code === "IMAGE_TIMEOUT") return error;
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
  let bytes;
  try {
    bytes = await imageOperation(() => file.arrayBuffer(), { signal });
  } catch (error) {
    if (error.name === "AbortError" || error.code === "IMAGE_TIMEOUT")
      throw error;
    throw imageError(
      "IMAGE_READ",
      "无法读取所选照片，请先将照片下载或保存到设备，再重新选择。",
    );
  }
  checkAbort(signal);
  if (!bytes.byteLength)
    throw imageError(
      "IMAGE_READ",
      "所选照片没有可读取的内容，请先将照片下载或保存到设备，再重新选择。",
    );

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
    // 已识别的容器必须通过结构校验，不能因相册未提供 MIME 而绕过检查。
    if (
      (["jpeg", "png", "webp", "gif"].includes(mimeGroup(sniffed)) ||
        (!sniffed && ["jpeg", "png", "webp", "gif"].includes(declaredGroup))) &&
      (error.code === "IMAGE_TYPE" || error.code === "IMAGE_CORRUPT")
    )
      throw error;
    // 体积与解码硬上限仍要立即拒绝，其余格式走浏览器解码。
    if (error.code !== "IMAGE_TYPE" && error.code !== "IMAGE_CORRUPT")
      throw error;
  }

  if (!metadata) {
    const typed = new Blob([bytes], {
      type:
        sniffed ||
        (declaredType.startsWith("image/")
          ? declaredType
          : "application/octet-stream"),
    });
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

  if (
    Math.max(metadata.width, metadata.height) > IMAGE_LIMITS.decodeSide ||
    metadata.width * metadata.height > IMAGE_LIMITS.decodePixels
  )
    throw imageError(
      "IMAGE_DIMENSIONS",
      `图片尺寸 ${metadata.width}×${metadata.height} 过大，本机无法处理，请先在设备上裁剪或缩小。`,
    );

  // 相册可能转码但保留旧 MIME；以已校验内容为准，并脱离可能失效的系统文件句柄。
  const blob = new Blob([bytes], { type: metadata.mime });
  const sourceSha256 = await digestBytes(bytes, signal);
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
          "IMAGE_TIMEOUT",
        ].includes(error.code)
      )
        throw error;
      checkAbort(signal);
      result = await renderImage(blob, metadata, { signal, onProgress });
    }
  } else result = await renderImage(blob, metadata, { signal, onProgress });
  checkAbort(signal);

  const finalSha256 = result.compressed
    ? await sha256(result.blob, signal)
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
