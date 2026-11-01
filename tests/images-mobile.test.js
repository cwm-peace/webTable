/** 手机相册的能力与失败模拟：仅使用合成图片，验证本机读取、回退、取消与资源释放。 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { processImage, sha256 } from "../src/lib/images.js";
import { inspectImage } from "../src/lib/imageHeader.js";
import { renderImage } from "../src/workers/image.worker.js";
import {
  imageOperation,
  IMAGE_OPERATION_TIMEOUT_MS,
  IMAGE_WORKER_TIMEOUT_MS,
} from "../src/lib/imageOperation.js";

const jpeg = readFileSync(
  new URL("./fixtures/progressive.jpg", import.meta.url),
);
const metadata = inspectImage(jpeg);

/**
 * 模拟浏览器的位图、图片元素和普通画布；保留所有资源供断言释放行为。
 * @param {import('node:test').TestContext} context 测试上下文。
 * @param {{bitmap?:Function,elementWidth?:number,elementHeight?:number,elementFails?:boolean,elementHangs?:boolean,encodeHangs?:boolean,canvasFails?:boolean}} options 注入平台能力和故障。
 * @returns {object} 位图、画布、图片元素和 URL 记录。
 */
function browser(context, options = {}) {
  const state = {
    bitmaps: [],
    canvases: [],
    elements: [],
    urls: [],
    revoked: [],
    bitmapCalls: 0,
    drawnSizes: [],
  };
  const replacements = {
    Worker: undefined,
    OffscreenCanvas: undefined,
    createImageBitmap: async (...args) => {
      state.bitmapCalls += 1;
      if (options.bitmap) return options.bitmap(...args);
      const bitmap = {
        width: 80,
        height: 60,
        closed: 0,
        close() {
          this.closed += 1;
        },
      };
      state.bitmaps.push(bitmap);
      return bitmap;
    },
    document: {
      createElement(name) {
        assert.equal(name, "canvas");
        const canvas = {
          width: 0,
          height: 0,
          getContext: () =>
            options.canvasFails
              ? null
              : {
                  fillRect() {},
                  drawImage(source, x, y, width, height) {
                    state.drawnSizes.push({ width, height });
                  },
                },
          toBlob(callback) {
            if (!options.encodeHangs)
              queueMicrotask(() =>
                callback(new Blob(["synthetic-jpeg"], { type: "image/jpeg" })),
              );
          },
        };
        state.canvases.push(canvas);
        return canvas;
      },
    },
    Image: class {
      constructor() {
        this.naturalWidth = options.elementWidth ?? 80;
        this.naturalHeight = options.elementHeight ?? 60;
        state.elements.push(this);
      }
      set src(value) {
        this.source = value;
        if (value && !options.elementHangs)
          queueMicrotask(() =>
            options.elementFails ? this.onerror?.() : this.onload?.(),
          );
      }
    },
  };
  for (const [name, value] of Object.entries(replacements)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, {
      value,
      writable: true,
      configurable: true,
    });
    context.after(() =>
      original
        ? Object.defineProperty(globalThis, name, original)
        : delete globalThis[name],
    );
  }
  context.mock.method(URL, "createObjectURL", () => {
    const url = `blob:synthetic-${state.urls.length}`;
    state.urls.push(url);
    return url;
  });
  context.mock.method(URL, "revokeObjectURL", (url) => state.revoked.push(url));
  return state;
}

/**
 * 加快指定阶段计时器，避免故障模拟实际等待几十秒。
 * @param {import('node:test').TestContext} context 测试上下文。
 * @param {number} duration 需加快的产品超时值。
 * @returns {void} 仅本测试中使用 5 毫秒代替该等待。
 */
function accelerate(context, duration) {
  const original = globalThis.setTimeout;
  context.mock.method(globalThis, "setTimeout", (callback, delay, ...args) =>
    original(callback, delay === duration ? 5 : delay, ...args),
  );
}

/**
 * 等待一次事件循环，让异步解码/摘要进入待处理阶段。
 * @returns {Promise<void>} 下一轮事件循环。
 */
function turn() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("相册转码后 MIME 错标、缺失或通用类型仍按合法 JPEG 字节处理", async (context) => {
  const state = browser(context);
  for (const type of [
    "image/jpeg",
    "image/png",
    "image/heic",
    "application/octet-stream",
    "",
  ]) {
    const file = new File([jpeg], "synthetic-photo.heic", { type });
    let reads = 0;
    const read = file.arrayBuffer.bind(file);
    file.arrayBuffer = () => {
      reads += 1;
      if (reads > 1)
        throw new DOMException("File provider expired", "NotReadableError");
      return read();
    };
    const result = await processImage(file);
    assert.equal(result.mime, "image/jpeg");
    assert.notEqual(result.blob, file, "保存与后续解码必须使用内存快照");
    assert.deepEqual(Buffer.from(await result.blob.arrayBuffer()), jpeg);
    assert.equal(reads, 1);
  }
  assert(state.bitmaps.every((bitmap) => bitmap.closed === 1));
  assert(
    state.canvases.every((canvas) => canvas.width === 1 && canvas.height === 1),
  );
});

test("损坏容器不能通过错标 MIME 绕过校验", async (context) => {
  const state = browser(context);
  for (const type of [
    "image/png",
    "image/heic",
    "application/octet-stream",
    "",
  ]) {
    await assert.rejects(
      processImage(new File([jpeg.subarray(0, -2)], "synthetic.jpg", { type })),
      { code: "IMAGE_CORRUPT" },
    );
  }
  assert.equal(state.bitmapCalls, 0);
});

test("云端文件读失败或返回空内容时给出重新下载提示", async () => {
  await assert.rejects(
    processImage({
      size: 1,
      arrayBuffer: () =>
        Promise.reject(
          new DOMException("provider unavailable", "NotReadableError"),
        ),
    }),
    { code: "IMAGE_READ", message: /保存到设备/ },
  );
  await assert.rejects(
    processImage(new File([], "synthetic.png", { type: "image/png" })),
    { code: "IMAGE_READ", message: /没有可读取的内容/ },
  );
});

test("读取相册文件挂起时可立即取消，阶段超时也不会无限等待", async (context) => {
  accelerate(context, IMAGE_OPERATION_TIMEOUT_MS);
  const file = { size: 1, arrayBuffer: () => new Promise(() => {}) };
  const controller = new AbortController();
  const pending = processImage(file, { signal: controller.signal });
  const cancelled = assert.rejects(pending, { name: "AbortError" });
  controller.abort();
  await cancelled;
  await assert.rejects(processImage(file), { code: "IMAGE_TIMEOUT" });
});

test("摘要计算挂起时可以取消", async (context) => {
  context.mock.method(crypto.subtle, "digest", () => new Promise(() => {}));
  const controller = new AbortController();
  const pending = sha256(new Blob(["synthetic"]), controller.signal);
  const cancelled = assert.rejects(pending, { name: "AbortError" });
  await turn();
  controller.abort();
  await cancelled;
});

test("Worker 无响应时终止并回退页面画布，失败线程不再接收消息", async (context) => {
  const state = browser(context);
  accelerate(context, IMAGE_WORKER_TIMEOUT_MS);
  let instance;
  globalThis.OffscreenCanvas = class {};
  globalThis.Worker = class {
    constructor() {
      instance = this;
      this.terminated = 0;
    }
    postMessage() {}
    terminate() {
      this.terminated += 1;
    }
  };
  const result = await processImage(
    new File([jpeg], "synthetic.jpg", { type: "image/jpeg" }),
  );
  assert.equal(result.width, 80);
  assert.equal(instance.terminated, 1);
  assert.equal(instance.onmessage, null);
  assert.equal(instance.onerror, null);
  assert.equal(instance.onmessageerror, null);
  assert.equal(state.bitmapCalls, 1);
});

test("等待 Worker 时取消会终止线程，不会重新在页面处理", async (context) => {
  const state = browser(context);
  const controller = new AbortController();
  let terminated = 0;
  globalThis.OffscreenCanvas = class {};
  globalThis.Worker = class {
    postMessage() {
      queueMicrotask(() => controller.abort());
    }
    terminate() {
      terminated += 1;
    }
  };
  await assert.rejects(
    processImage(new File([jpeg], "synthetic.jpg"), {
      signal: controller.signal,
    }),
    { name: "AbortError" },
  );
  assert.equal(terminated, 1);
  assert.equal(state.bitmapCalls, 0);
});

test("位图解码忽略方向时回退图片元素，并关闭尺寸不符的位图", async (context) => {
  let closed = 0;
  const state = browser(context, {
    bitmap: async () => ({
      width: 60,
      height: 80,
      close() {
        closed += 1;
      },
    }),
  });
  const result = await renderImage(
    new Blob([jpeg], { type: "image/jpeg" }),
    metadata,
  );
  assert.equal(result.width, 80);
  assert.equal(closed, 1);
  assert.equal(state.elements.length, 1);
  assert.deepEqual(state.revoked, state.urls);
  assert.equal(state.elements[0].source, "");
});

test("取消不可中止的位图解码后，晚到位图仍只关闭一次", async (context) => {
  let finish;
  let closed = 0;
  browser(context, {
    bitmap: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  const controller = new AbortController();
  const pending = renderImage(
    new Blob([jpeg], { type: "image/jpeg" }),
    metadata,
    { signal: controller.signal },
  );
  const cancelled = assert.rejects(pending, { name: "AbortError" });
  await turn();
  controller.abort();
  await cancelled;
  finish({
    width: 80,
    height: 60,
    close() {
      closed += 1;
    },
  });
  await turn();
  assert.equal(closed, 1);
});

test("位图解码挂起可超时回退，后到位图不泄露", async (context) => {
  let finish;
  let closed = 0;
  const state = browser(context, {
    bitmap: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  accelerate(context, IMAGE_OPERATION_TIMEOUT_MS);
  await renderImage(new Blob([jpeg], { type: "image/jpeg" }), metadata);
  finish({
    width: 80,
    height: 60,
    close() {
      closed += 1;
    },
  });
  await turn();
  assert.equal(closed, 1);
  assert.deepEqual(state.revoked, state.urls);
});

test("图片元素解码超时会撤销 Blob URL 并清空 src", async (context) => {
  const state = browser(context, { elementHangs: true });
  globalThis.createImageBitmap = undefined;
  accelerate(context, IMAGE_OPERATION_TIMEOUT_MS);
  await assert.rejects(
    renderImage(new Blob([jpeg], { type: "image/jpeg" }), metadata),
    { code: "IMAGE_TIMEOUT" },
  );
  assert.deepEqual(state.revoked, state.urls);
  assert.equal(state.elements[0].source, "");
});

test("普通画布编码挂起后取消，释放画布像素和解码位图", async (context) => {
  const state = browser(context, { encodeHangs: true });
  const controller = new AbortController();
  const pending = renderImage(
    new Blob([jpeg], { type: "image/jpeg" }),
    metadata,
    { signal: controller.signal },
  );
  const cancelled = assert.rejects(pending, { name: "AbortError" });
  await turn();
  assert.equal(state.canvases.length, 1);
  controller.abort();
  await cancelled;
  assert.equal(state.bitmaps[0].closed, 1);
  assert.equal(state.canvases[0].width, 1);
  assert.equal(state.canvases[0].height, 1);
});

test("普通画布编码不回调时超时并释放内存", async (context) => {
  const state = browser(context, { encodeHangs: true });
  accelerate(context, IMAGE_OPERATION_TIMEOUT_MS);
  await assert.rejects(
    renderImage(new Blob([jpeg], { type: "image/jpeg" }), metadata),
    { code: "IMAGE_TIMEOUT" },
  );
  assert.equal(state.bitmaps[0].closed, 1);
  assert.equal(state.canvases[0].width, 1);
  assert.equal(state.canvases[0].height, 1);
});

test("低内存导致画布上下文创建失败时也释放像素与位图", async (context) => {
  const state = browser(context, { canvasFails: true });
  await assert.rejects(
    renderImage(new Blob([jpeg], { type: "image/jpeg" }), metadata),
    { code: "IMAGE_UNSUPPORTED" },
  );
  assert.equal(state.canvases[0].width, 1);
  assert.equal(state.canvases[0].height, 1);
  assert.equal(state.bitmaps[0].closed, 1);
});

test("Worker 消息传递失败后回退，旧线程晚到结果不覆盖当前结果", async (context) => {
  browser(context);
  let instance;
  let oldMessage;
  let oldError;
  let oldMessageError;
  globalThis.OffscreenCanvas = class {};
  globalThis.Worker = class {
    constructor() {
      instance = this;
      this.terminated = 0;
    }
    postMessage() {
      oldMessage = this.onmessage;
      oldError = this.onerror;
      oldMessageError = this.onmessageerror;
      queueMicrotask(() => this.onmessageerror());
    }
    terminate() {
      this.terminated += 1;
    }
  };
  const result = await processImage(new File([jpeg], "synthetic.jpg"));
  oldMessage({ data: { result: { width: 9999 } } });
  oldError();
  oldMessageError();
  assert.equal(instance.terminated, 1);
  assert.equal(result.width, 80);
});

test("图片元素解码后尺寸仍不一致时明确失败且释放 URL", async (context) => {
  const state = browser(context);
  globalThis.createImageBitmap = undefined;
  await assert.rejects(
    renderImage(new Blob([jpeg], { type: "image/jpeg" }), {
      ...metadata,
      displayWidth: 60,
      displayHeight: 80,
    }),
    { code: "IMAGE_DECODE" },
  );
  assert.deepEqual(state.revoked, state.urls);
  assert.equal(state.elements[0].source, "");
});

test("低内存浏览器的等比降采样可用于预览，原附件尺寸仍由文件元数据确定", async (context) => {
  let closed = 0;
  const state = browser(context, {
    bitmap: async () => ({
      width: 40,
      height: 30,
      close() {
        closed += 1;
      },
    }),
    elementWidth: 40,
    elementHeight: 31,
  });
  const input = new Blob([jpeg], { type: "image/jpeg" });
  const bitmapResult = await renderImage(input, metadata);
  assert.equal(bitmapResult.blob, input);
  assert.equal(bitmapResult.width, 80);
  assert.equal(bitmapResult.height, 60);
  assert.deepEqual(state.drawnSizes[0], { width: 40, height: 30 });
  assert.equal(closed, 1);
  globalThis.createImageBitmap = undefined;
  const elementResult = await renderImage(input, metadata);
  assert.equal(elementResult.width, 80);
  assert.equal(elementResult.height, 60);
  assert.deepEqual(state.drawnSizes[1], { width: 40, height: 31 });
  assert.equal(state.elements[0].source, "");
});

test("降采样宽容不接受放大、横竖互换或纵横比变化", async (context) => {
  const state = browser(context);
  globalThis.createImageBitmap = undefined;
  for (const [width, height] of [
    [160, 120],
    [30, 40],
    [40, 35],
  ]) {
    const BaseImage = globalThis.Image;
    globalThis.Image = class extends BaseImage {
      constructor() {
        super();
        this.naturalWidth = width;
        this.naturalHeight = height;
      }
    };
    await assert.rejects(
      renderImage(new Blob([jpeg], { type: "image/jpeg" }), metadata),
      { code: "IMAGE_DECODE" },
    );
    assert.equal(state.elements.at(-1).source, "");
  }
  assert.deepEqual(state.revoked, state.urls);
});

test("HEIC 解码不支持时提示设备转换；已转码但沿用旧 MIME 时按内容解码", async (context) => {
  const state = browser(context, {
    bitmap: async (blob) => {
      assert.equal(blob.type, "image/heic");
      throw new Error("decoder unavailable");
    },
    elementFails: true,
  });
  const bytes = Buffer.alloc(24);
  bytes.write("ftyp", 4);
  bytes.write("heic", 8);
  await assert.rejects(
    processImage(new File([bytes], "synthetic.png", { type: "image/png" })),
    { code: "IMAGE_DECODE", message: /HEIC／HEIF/ },
  );
  assert.deepEqual(state.revoked, state.urls);
});

test("解码探测格式也遵守总像素及边长硬上限", async (context) => {
  let closed = 0;
  browser(context, {
    bitmap: async () => ({
      width: 40000,
      height: 1,
      close() {
        closed += 1;
      },
    }),
  });
  const bytes = Buffer.alloc(24);
  bytes.write("ftyp", 4);
  bytes.write("avif", 8);
  await assert.rejects(
    processImage(new File([bytes], "synthetic.avif", { type: "image/avif" })),
    { code: "IMAGE_DIMENSIONS" },
  );
  assert.equal(closed, 1);
});

test("阶段等待成功后清除超时与取消监听，不错误释放已交付的结果", async () => {
  const controller = new AbortController();
  let disposed = 0;
  const result = await imageOperation(async () => "ready", {
    signal: controller.signal,
    timeoutMs: 5,
    onLateResult: () => {
      disposed += 1;
    },
  });
  controller.abort();
  assert.equal(result, "ready");
  assert.equal(disposed, 0);
});
