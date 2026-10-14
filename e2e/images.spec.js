/** 真实图片选择降级与容量边界回归；全部附件由代码生成，不包含个人照片。 */
import { test, expect } from "@playwright/test";
import { createCanvas } from "@napi-rs/canvas";
import { createHash } from "node:crypto";
import { closeSync, ftruncateSync, mkdirSync, openSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { seedDraft } from "./helpers.js";

/**
 * 生成稀疏的超大文件，避免把64 MiB内容放进测试进程内存。
 * @param {number} bytes 文件字节数
 * @returns {string} 测试目录中的文件绝对路径
 */
function sparseFile(bytes) {
  const directory = fileURLToPath(
    new URL("../test-results/generated/", import.meta.url),
  );
  mkdirSync(directory, { recursive: true });
  const file = `${directory}oversize-${bytes}.png`;
  const handle = openSync(file, "w");
  ftruncateSync(handle, bytes);
  closeSync(handle);
  return file;
}

/**
 * 创建可由浏览器实际解码的静态图片，包含不同像素以区分摘要。
 * @param {string} mimeType JPEG、PNG或WebP类型
 * @param {number} width 合成图片宽度
 * @param {number} height 合成图片高度
 * @returns {object} Playwright文件对象和预期原始摘要
 */
function fixture(mimeType, width = 48, height = 36) {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.fillStyle = "#2f7055";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#efd191";
  context.fillRect(
    3,
    4,
    Math.max(6, Math.floor(width / 3)),
    Math.max(4, Math.floor(height / 2)),
  );
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1];
  const buffer = canvas.toBuffer(mimeType);
  return {
    name: `generated-${width}-${height}.${extension}`,
    mimeType,
    buffer,
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };
}

/**
 * 生成结构合法的最小 GIF，用帧数区分静态图与动图。
 * @param {number} frames 图像帧数
 * @returns {Buffer} 可在浏览器中解码的GIF89a字节
 */
function gifBytes(frames = 1) {
  const screen = Buffer.alloc(7);
  screen.writeUInt16LE(2, 0);
  screen.writeUInt16LE(2, 2);
  screen[4] = 0xf0;
  const palette = Buffer.from([0, 0, 0, 255, 255, 255]);
  const frame = Buffer.concat([
    Buffer.from([0x2c, 0, 0, 0, 0, 2, 0, 2, 0, 0]),
    Buffer.from([0x02, 0x02, 0x84, 0x51, 0x00]),
  ]);
  return Buffer.concat([
    Buffer.from("GIF89a"),
    screen,
    palette,
    ...Array.from({ length: frames }, () => frame),
    Buffer.from([0x3b]),
  ]);
}

/**
 * 在 SOI 之后插入 EXIF 方向段，模拟手机竖拍但像素为横向存储的照片。
 * @param {Buffer} buffer 完整JPEG字节
 * @param {number} orientation EXIF方向值1至8
 * @returns {Buffer} 带方向标记的JPEG字节
 */
function withExifOrientation(buffer, orientation) {
  const payload = Buffer.alloc(32);
  payload.write("Exif", 0, "latin1");
  payload.write("II", 6, "latin1");
  payload.writeUInt16LE(42, 8);
  payload.writeUInt32LE(8, 10);
  payload.writeUInt16LE(1, 14);
  payload.writeUInt16LE(0x112, 16);
  payload.writeUInt16LE(3, 18);
  payload.writeUInt32LE(1, 20);
  payload.writeUInt16LE(orientation, 24);
  const segment = Buffer.alloc(4);
  segment[0] = 0xff;
  segment[1] = 0xe1;
  segment.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([
    buffer.subarray(0, 2),
    segment,
    payload,
    buffer.subarray(2),
  ]);
}

/**
 * 仅在测试页面关闭高级图像API，强制应用走Image元素与普通canvas回退。
 * @param {import('@playwright/test').Page} page 当前浏览器页面
 * @returns {Promise<void>} 初始化脚本注册完成
 */
async function disableAdvancedImageApis(page) {
  await page.addInitScript(() => {
    for (const name of ["Worker", "createImageBitmap", "OffscreenCanvas"])
      Object.defineProperty(window, name, {
        configurable: true,
        value: undefined,
      });
  });
}

/**
 * 准备完整基础资料和空图片槽，再通过真实步骤按钮进入图片页。
 * @param {import('@playwright/test').Page} page 当前浏览器页面
 * @returns {Promise<void>} 图片选择控件可操作后完成
 */
async function openPhotos(page) {
  // 空数组避免测试准备依赖已禁用的createImageBitmap，图片处理仅经生产UI执行。
  await seedDraft(page, { images: [], name: "合成图片边界测试" });
  await page.getByRole("button", { name: "检查并继续", exact: true }).click();
  await expect(page.locator("#photo-selfie-1")).toBeEnabled();
}

/**
 * 只读取已提交图片的非敏感元数据，用于证明错误没有覆盖或追加存储。
 * @param {import('@playwright/test').Page} page 当前同源页面
 * @returns {Promise<Array>} 槽位、摘要、类型、尺寸和压缩标记
 */
async function savedPhotos(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("webtable-local-v1", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction("photos", "readonly");
        const request = transaction.objectStore("photos").getAll();
        transaction.oncomplete = () =>
          resolve(
            request.result
              .map((photo) => ({
                category: photo.category,
                slot: photo.slot,
                sha256: photo.sha256,
                sourceSha256: photo.sourceSha256,
                mime: photo.mime,
                width: photo.width,
                height: photo.height,
                sourceWidth: photo.sourceWidth,
                sourceHeight: photo.sourceHeight,
                compressed: photo.compressed,
                animated: photo.animated,
                rasterized: photo.rasterized,
                autoShrunk: photo.autoShrunk,
                size: photo.blobBytes?.byteLength ?? photo.blob?.size,
              }))
              .sort((a, b) => a.slot - b.slot),
          );
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      db.close();
    }
  });
}

/**
 * 选择图片并等待处理、存储与预览全部完成，防止下一次选择撞上busy状态。
 * @param {import('@playwright/test').Page} page 当前图片页面
 * @param {number} slot 自拍槽位编号
 * @param {object} file 合成文件对象
 * @returns {Promise<void>} 图片预览已解码且控件重新启用后完成
 */
async function chooseAndWait(page, slot, file) {
  const input = page.locator(`#photo-selfie-${slot}`);
  await expect(input).toBeEnabled();
  await input.setInputFiles({
    name: file.name,
    mimeType: file.mimeType,
    buffer: file.buffer,
  });
  const preview = page.getByRole("img", {
    name: `自拍第${slot}张预览`,
    exact: true,
  });
  await expect(preview).toBeVisible();
  await expect
    .poll(() =>
      preview.evaluate((image) => image.complete && image.naturalWidth > 0),
    )
    .toBe(true);
  await expect(input).toBeEnabled();
  await expect
    .poll(async () =>
      (await savedPhotos(page)).some((photo) => photo.slot === slot),
    )
    .toBe(true);
}

test("无Worker或位图API时JPEG、PNG、WebP均能处理并保存原字节摘要", async ({
  page,
}) => {
  await disableAdvancedImageApis(page);
  await openPhotos(page);
  expect(
    await page.evaluate(() => [
      typeof Worker,
      typeof createImageBitmap,
      typeof OffscreenCanvas,
    ]),
  ).toEqual(["undefined", "undefined", "undefined"]);
  const files = ["image/jpeg", "image/png", "image/webp"].map((mime, index) =>
    fixture(mime, 48 + index, 36 + index),
  );
  for (const [index, file] of files.entries())
    await chooseAndWait(page, index + 1, file);
  const stored = await savedPhotos(page);
  expect(stored).toHaveLength(3);
  for (const [index, file] of files.entries()) {
    expect(stored[index]).toMatchObject({
      slot: index + 1,
      mime: file.mimeType,
      sourceSha256: file.sha256,
      sha256: file.sha256,
      compressed: false,
      size: file.buffer.length,
    });
  }
});

test("4097像素长边图片经普通canvas压缩并显示附件替代说明", async ({ page }) => {
  await disableAdvancedImageApis(page);
  await openPhotos(page);
  const image = fixture("image/png", 4097, 48);
  await chooseAndWait(page, 1, image);
  await expect(
    page.getByText("此图片已生成压缩附件，PDF 将使用压缩版本。", {
      exact: true,
    }),
  ).toBeVisible();
  const [stored] = await savedPhotos(page);
  expect(stored).toMatchObject({
    compressed: true,
    mime: "image/jpeg",
    sourceSha256: image.sha256,
  });
  expect(stored.sha256).not.toBe(image.sha256);
  expect(Math.max(stored.width, stored.height)).toBeLessThanOrEqual(2560);
  expect(stored.size).toBeLessThanOrEqual(2 * 1024 * 1024);
});

test("4928×6560超大照片自动缩小而不是报错", async ({ page }) => {
  await openPhotos(page);
  // 复现用户实际报错尺寸：3230万像素，超过2500万像素门槛。
  const image = fixture("image/png", 4928, 6560);
  await chooseAndWait(page, 1, image);
  const [stored] = await savedPhotos(page);
  expect(stored).toMatchObject({
    compressed: true,
    autoShrunk: true,
    rasterized: false,
    mime: "image/jpeg",
    sourceSha256: image.sha256,
    sourceWidth: 4928,
    sourceHeight: 6560,
  });
  expect(stored.height).toBe(2560);
  expect(Math.abs(stored.width / stored.height - 4928 / 6560)).toBeLessThan(0.01);
  expect(stored.size).toBeLessThanOrEqual(2 * 1024 * 1024);
  await expect(
    page.getByText(/原图 4928×6560 超过限制，已自动缩小为 \d+×2560/),
  ).toBeVisible();
});

test("竖拍大图按 EXIF 方向缩小到正确的长短边", async ({ page }) => {
  await openPhotos(page);
  // 像素横向存储、方向标记为6，显示尺寸应为3000×6000。
  const base = fixture("image/jpeg", 6000, 3000);
  const buffer = withExifOrientation(base.buffer, 6);
  const image = {
    name: "rotated-large.jpg",
    mimeType: "image/jpeg",
    buffer,
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };
  await chooseAndWait(page, 1, image);
  const [stored] = await savedPhotos(page);
  expect(stored).toMatchObject({
    compressed: true,
    autoShrunk: false,
    animated: false,
    rasterized: false,
    sourceWidth: 3000,
    sourceHeight: 6000,
    sourceSha256: image.sha256,
  });
  expect(stored.width).toBe(1280);
  expect(stored.height).toBe(2560);
});

test("保留原字节的图片不会因解码降采样而改写记录尺寸", async ({ page }) => {
  await openPhotos(page);
  const image = fixture("image/png", 3000, 2000);
  await chooseAndWait(page, 1, image);
  const [stored] = await savedPhotos(page);
  expect(stored).toMatchObject({
    compressed: false,
    autoShrunk: false,
    mime: "image/png",
    width: 3000,
    height: 2000,
    sourceWidth: 3000,
    sourceHeight: 2000,
    sourceSha256: image.sha256,
    sha256: image.sha256,
    size: image.buffer.length,
  });
});

test("GIF动图取第一帧并转换为静态附件", async ({ page }) => {
  await openPhotos(page);
  const image = {
    name: "generated-animated.gif",
    mimeType: "image/gif",
    buffer: gifBytes(2),
    sha256: createHash("sha256").update(gifBytes(2)).digest("hex"),
  };
  await chooseAndWait(page, 1, image);
  const [stored] = await savedPhotos(page);
  expect(stored).toMatchObject({
    mime: "image/jpeg",
    compressed: true,
    animated: true,
    rasterized: true,
    sourceWidth: 2,
    sourceHeight: 2,
  });
  expect(stored.sourceSha256).toBe(image.sha256);
  await expect(
    page.getByText("动图已取用第一帧。此图片已生成压缩附件，PDF 将使用压缩版本。", {
      exact: true,
    }),
  ).toBeVisible();
});

test("假MIME、损坏图和64MiB超限均明确报错且保留原槽位", async ({ page }) => {
  await openPhotos(page);
  const valid = fixture("image/png");
  await chooseAndWait(page, 1, valid);
  const baseline = await savedPhotos(page);
  const failures = [
    {
      name: "false-mime.jpg",
      mimeType: "image/jpeg",
      buffer: valid.buffer,
      message: /格式与图片内容不一致/,
    },
    {
      name: "truncated.png",
      mimeType: "image/png",
      buffer: valid.buffer.subarray(0, 24),
      message: /不完整|损坏/,
    },
    {
      name: "oversize.png",
      path: sparseFile(64 * 1024 * 1024 + 1),
      message: /不能超过 64 MiB/,
    },
  ];
  for (const file of failures) {
    const input = page.locator("#photo-selfie-1");
    await expect(input).toBeEnabled();
    if (file.path) await input.setInputFiles(file.path);
    else
      await input.setInputFiles({
        name: file.name,
        mimeType: file.mimeType,
        buffer: file.buffer,
      });
    await expect(
      page.getByRole("alert").filter({ hasText: file.message }),
    ).toBeVisible();
    await expect(input).toBeEnabled();
    expect(await savedPhotos(page)).toEqual(baseline);
    await expect(
      page.getByRole("img", { name: "自拍第1张预览", exact: true }),
    ).toBeVisible();
  }
});
