/** 为本机图片异步操作提供有界等待；取消后到达的解码资源仍会释放。 */
import { imageError } from "./imageHeader.js";

/** 单个读取、摘要、解码或编码阶段最多等待 20 秒。 */
export const IMAGE_OPERATION_TIMEOUT_MS = 20_000;

/** Worker 连续 30 秒没有进度时终止，并由入口改用页面处理。 */
export const IMAGE_WORKER_TIMEOUT_MS = 30_000;

/**
 * 执行一个可取消且有时间上限的异步图片阶段。
 * @param {(signal:AbortSignal)=>Promise<*>|*} operation 操作；不能原生取消的 API 可忽略信号。
 * @param {{signal?:AbortSignal,timeoutMs?:number,onLateResult?:Function,timeoutCode?:string,timeoutMessage?:string}} options 调用方信号、等待上限与晚到资源清理。
 * @returns {Promise<*>} 阶段结果；超时或取消立即拒绝，不等待底层 API 返回。
 */
export function imageOperation(
  operation,
  {
    signal,
    timeoutMs = IMAGE_OPERATION_TIMEOUT_MS,
    onLateResult,
    timeoutCode = "IMAGE_TIMEOUT",
    timeoutMessage = "图片处理等待过久，请重试；如照片仅保存在云端，请先下载到设备后再选择。",
  } = {},
) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    let settled = false;
    let timer;
    const finish = (callback, value) => {
      if (settled) return false;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      callback(value);
      return true;
    };
    const abort = () => {
      finish(reject, new DOMException("图片处理已取消。", "AbortError"));
      controller.abort();
    };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) {
      abort();
      return;
    }
    timer = setTimeout(() => {
      finish(reject, imageError(timeoutCode, timeoutMessage));
      controller.abort();
    }, timeoutMs);
    Promise.resolve()
      .then(() => {
        if (controller.signal.aborted)
          throw new DOMException("图片处理已取消。", "AbortError");
        return operation(controller.signal);
      })
      .then(
        (result) => {
          // createImageBitmap 等原生 API 不接受 AbortSignal，晚到的位图必须主动关闭。
          if (!finish(resolve, result)) {
            try {
              onLateResult?.(result);
            } catch {
              // 资源可能已被浏览器销毁，清理异常不能成为未处理的 Promise 拒绝。
            }
          }
        },
        (error) => finish(reject, error),
      );
  });
}
