/** 图片解码和派生图生成；Worker 不可用时，同一实现可在页面中使用。 */
import {
  IMAGE_LIMITS,
  exceedsInputLimits,
  fitWithin,
  imageError,
  isPreservableFormat,
} from "../lib/imageHeader.js";
import { imageOperation } from "../lib/imageOperation.js";

/** 解码目标长边：附件和预览都不会超过该值，超限图片在解码阶段先降采样。 */
const DECODE_SIDE = Math.max(
  IMAGE_LIMITS.compressedSide,
  IMAGE_LIMITS.previewSide,
);

/**
 * 在阶段边界检查取消状态。
 * @param {AbortSignal|undefined} signal 调用方取消信号。
 * @returns {void} 已取消时抛出 AbortError。
 */
function checkAbort(signal) {
  if (signal?.aborted) throw new DOMException("图片处理已取消。", "AbortError");
}

/**
 * 比较解码结果与期望尺寸。
 * @param {{width:number,height:number}} actual 解码得到的尺寸。
 * @param {{width:number,height:number}} expected 期望尺寸。
 * @returns {boolean} 完全一致时为 true。
 */
function sameSize(actual, expected) {
  return actual.width === expected.width && actual.height === expected.height;
}

/**
 * 接受原尺寸或浏览器因内存限制进行的等比降采样，拒绝放大、横竖反转和拉伸。
 * @param {{width:number,height:number}} actual 浏览器交付的实际尺寸。
 * @param {{width:number,height:number}} source 按文件方向修正后的原始尺寸。
 * @returns {boolean} 尺寸一致或降采样取整误差不超过一个像素。
 */
function matchesDecodedSize(actual, source) {
  if (sameSize(actual, source)) return true;
  if (
    !Number.isInteger(actual.width) ||
    !Number.isInteger(actual.height) ||
    actual.width <= 0 ||
    actual.height <= 0 ||
    actual.width > source.width ||
    actual.height > source.height ||
    Math.max(actual.width, actual.height) >=
      Math.max(source.width, source.height) ||
    (actual.width - actual.height) * (source.width - source.height) < 0
  )
    return false;
  const expected = fitWithin(
    source.width,
    source.height,
    Math.max(actual.width, actual.height),
  );
  // 原生解码器的整数舍入可能与 Math.round 相差一个像素。
  return (
    Math.abs(actual.width - expected.width) <= 1 &&
    Math.abs(actual.height - expected.height) <= 1
  );
}

/**
 * 用 Image 元素解码，供不支持 createImageBitmap 的浏览器回退。
 * @param {Blob} blob 图片字节。
 * @param {AbortSignal|undefined} signal 取消信号。
 * @returns {Promise<{source:HTMLImageElement,width:number,height:number,close:Function}>} 可绘制图片及资源释放方法。
 */
function decodeWithElement(blob, signal) {
  if (typeof document === "undefined")
    throw imageError(
      "IMAGE_DECODE",
      "浏览器未能解码这张图片，请换一张图片重试。",
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
          resolve({
            source: element,
            width: element.naturalWidth,
            height: element.naturalHeight,
            close: () => {
              element.src = "";
            },
          });
        };
        element.onerror = () => {
          if (finished) return;
          finished = true;
          cleanup();
          reject(
            imageError(
              "IMAGE_DECODE",
              "浏览器未能解码这张图片，请换一张图片重试。",
            ),
          );
        };
        element.src = url;
        if (decodeSignal.aborted) abort();
      }),
    { signal, onLateResult: (result) => result.close() },
  );
}

/**
 * 读取浏览器已按 EXIF 方向处理的位图；超大图片与矢量图在解码时直接缩放到目标尺寸。
 * @param {Blob} blob 已通过容器检查的图片。
 * @param {{displayWidth:number,displayHeight:number,mime:string}} metadata 文件头或探测得到的尺寸。
 * @param {AbortSignal|undefined} signal 取消信号。
 * @returns {Promise<{source:ImageBitmap|HTMLImageElement,width:number,height:number,close:Function}>} 可绘制图片及资源释放方法。
 */
async function decode(blob, metadata, signal) {
  checkAbort(signal);
  const source = {
    width: metadata.displayWidth,
    height: metadata.displayHeight,
  };
  const requested = fitWithin(source.width, source.height, DECODE_SIDE);
  const shrinking = !sameSize(requested, source);
  // 没有固有尺寸的 SVG 必须显式给出目标尺寸，否则解码器无法确定画布。
  const vector = metadata.mime === "image/svg+xml";
  const options = { imageOrientation: "from-image" };
  if (shrinking || vector) {
    options.resizeWidth = requested.width;
    options.resizeHeight = requested.height;
    options.resizeQuality = "high";
  }
  if (typeof createImageBitmap === "function") {
    let bitmap = null;
    try {
      bitmap = await imageOperation(() => createImageBitmap(blob, options), {
        signal,
        onLateResult: (result) => result.close(),
      });
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      // 部分系统浏览器支持 createImageBitmap，但没有实现所有图片解码器。
      bitmap = null;
    }
    if (bitmap) {
      if (signal?.aborted) {
        bitmap.close();
        checkAbort(signal);
      }
      const actual = { width: bitmap.width, height: bitmap.height };
      // 部分系统的位图解码器方向/缩放行为不完整；尺寸不符时再试图片元素。
      if (!sameSize(actual, requested) && !matchesDecodedSize(actual, source)) {
        bitmap.close();
      } else {
        return {
          source: bitmap,
          width: actual.width,
          height: actual.height,
          close: () => bitmap.close(),
        };
      }
    }
  }
  const decoded = await decodeWithElement(blob, signal);
  if (!matchesDecodedSize(decoded, source)) {
    decoded.close();
    throw imageError(
      "IMAGE_DECODE",
      "浏览器解码的图片尺寸或方向与文件记录不一致，请在相册重新保存后再选择。",
    );
  }
  return decoded;
}

/**
 * 创建画布并填充白底，压缩透明图片时保留一致的视觉背景。
 * @param {number} width 输出宽度。
 * @param {number} height 输出高度。
 * @returns {{canvas:OffscreenCanvas|HTMLCanvasElement,context:CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D}} 画布及绘图上下文。
 */
function makeCanvas(width, height) {
  let canvas;
  if (typeof document !== "undefined") {
    canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
  } else if (typeof OffscreenCanvas === "function")
    canvas = new OffscreenCanvas(width, height);
  else
    throw imageError(
      "IMAGE_UNSUPPORTED",
      "浏览器不支持本地图片处理，请使用当前版本的系统浏览器。",
    );
  try {
    const context = canvas.getContext("2d", { alpha: false });
    if (!context)
      throw imageError(
        "IMAGE_UNSUPPORTED",
        "浏览器无法创建图片画布，请关闭其他页面后重试。",
      );
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    return { canvas, context };
  } catch (error) {
    // 获取上下文也可能在低内存设备上失败，此时尚未进入外层画布 finally。
    canvas.width = 1;
    canvas.height = 1;
    if (error.code === "IMAGE_UNSUPPORTED") throw error;
    throw imageError(
      "IMAGE_UNSUPPORTED",
      "浏览器无法创建图片画布，请关闭其他页面后重试。",
    );
  }
}

/**
 * 编码 JPEG，兼容 OffscreenCanvas 和普通 canvas。
 * @param {OffscreenCanvas|HTMLCanvasElement} canvas 已绘制的画布。
 * @param {number} quality JPEG 编码质量，范围为 0 至 1。
 * @param {AbortSignal|undefined} signal 取消信号。
 * @returns {Promise<Blob>} JPEG 字节。
 */
async function encode(canvas, quality, signal) {
  let blob;
  try {
    blob = await imageOperation(
      () => {
        if (typeof canvas.convertToBlob === "function")
          return canvas.convertToBlob({ type: "image/jpeg", quality });
        return new Promise((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", quality),
        );
      },
      { signal },
    );
  } catch (error) {
    if (error.name === "AbortError" || error.code === "IMAGE_TIMEOUT")
      throw error;
    throw imageError(
      "IMAGE_ENCODING",
      "浏览器无法生成图片，请关闭其他页面后重试，或先在设备上缩小照片。",
    );
  }
  if (!blob || blob.type !== "image/jpeg")
    throw imageError(
      "IMAGE_ENCODING",
      "浏览器无法生成 JPEG，请换用当前版本的系统浏览器。",
    );
  return blob;
}

/**
 * 按边长和质量阶梯生成容量受限的图片，不放大原图。
 * @param {{source:ImageBitmap|HTMLImageElement,width:number,height:number}} decoded 已解码图片。
 * @param {number[]} sides 逐次尝试的长边上限。
 * @param {number[]} qualities 逐次尝试的编码质量。
 * @param {number} maxBytes 输出容量上限。
 * @param {AbortSignal|undefined} signal 取消信号。
 * @returns {Promise<{blob:Blob,width:number,height:number}>} 首个满足容量要求的输出。
 */
async function boundedJpeg(decoded, sides, qualities, maxBytes, signal) {
  for (const side of sides) {
    checkAbort(signal);
    const scale = Math.min(1, side / Math.max(decoded.width, decoded.height));
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));
    const { canvas, context } = makeCanvas(width, height);
    try {
      context.drawImage(decoded.source, 0, 0, width, height);
      for (const quality of qualities) {
        checkAbort(signal);
        const blob = await encode(canvas, quality, signal);
        checkAbort(signal);
        if (blob.size <= maxBytes) return { blob, width, height };
      }
    } finally {
      // 及时释放像素缓冲区，避免 16 张图片连续处理后占满手机内存。
      canvas.width = 1;
      canvas.height = 1;
    }
  }
  throw imageError(
    "IMAGE_COMPRESS",
    "图片压缩后仍超过容量限制，请在相册中缩小或换一张图片。",
  );
}

/**
 * 生成最终附件和 PDF 预览；可保留原字节的静态图片直接复用，其余自动缩小并压缩。
 * @param {Blob} blob 输入图片原字节。
 * @param {object} metadata 文件头或探测得到的尺寸、格式、方向与动图标记。
 * @param {{signal?:AbortSignal,onProgress?:Function}} options 取消和进度回调。
 * @returns {Promise<{blob:Blob,previewBlob:Blob,width:number,height:number,sourceWidth:number,sourceHeight:number,compressed:boolean,animated:boolean,rasterized:boolean,autoShrunk:boolean}>} 最终图片、派生预览和处理标记。
 */
export async function renderImage(blob, metadata, { signal, onProgress } = {}) {
  checkAbort(signal);
  const decoded = await decode(blob, metadata, signal);
  try {
    checkAbort(signal);
    onProgress?.({ stage: "decode", progress: 0.4 });
    const animated = Boolean(metadata.animated);
    // 动图与浏览器专有格式不能作为原文件附件，必须转成静态位图后重新编码。
    const preservable = isPreservableFormat(metadata.mime, animated);
    const preserve =
      preservable &&
      blob.size <= IMAGE_LIMITS.attachmentBytes &&
      metadata.width * metadata.height <= IMAGE_LIMITS.originalPixels &&
      Math.max(metadata.width, metadata.height) <= IMAGE_LIMITS.originalSide;
    let attachment = {
      blob,
      width: metadata.displayWidth,
      height: metadata.displayHeight,
    };
    if (!preserve) {
      attachment = await boundedJpeg(
        decoded,
        [IMAGE_LIMITS.compressedSide, IMAGE_LIMITS.fallbackSide, 1600, 1280],
        [0.9, 0.86, 0.82],
        IMAGE_LIMITS.attachmentBytes,
        signal,
      );
    }
    onProgress?.({ stage: "attachment", progress: 0.65 });
    const preview = await boundedJpeg(
      decoded,
      [IMAGE_LIMITS.previewSide, 1280, 1024, 800],
      [0.86, 0.82, 0.78],
      IMAGE_LIMITS.previewBytes,
      signal,
    );
    checkAbort(signal);
    return {
      ...attachment,
      previewBlob: preview.blob,
      compressed: !preserve,
      animated,
      rasterized: !preservable,
      autoShrunk:
        !preserve &&
        exceedsInputLimits(metadata.displayWidth, metadata.displayHeight),
      sourceWidth: metadata.displayWidth,
      sourceHeight: metadata.displayHeight,
    };
  } finally {
    decoded.close();
  }
}

// 文件也被页面导入以提供回退实现；只有 Worker 环境接收处理消息。
if (
  typeof WorkerGlobalScope !== "undefined" &&
  globalThis instanceof WorkerGlobalScope
) {
  globalThis.onmessage = async ({ data }) => {
    try {
      const result = await renderImage(data.blob, data.metadata, {
        onProgress: (progress) => globalThis.postMessage({ progress }),
      });
      globalThis.postMessage({ result });
    } catch (error) {
      globalThis.postMessage({
        error: {
          name: error.name,
          code: error.code || "IMAGE_PROCESS",
          message: error.message || "图片处理失败，请重试。",
        },
      });
    }
  };
}
