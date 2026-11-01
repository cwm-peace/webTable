/** 移动照片选择能力与生命周期回归；仅模拟浏览器条件，不替代 Android、鸿蒙或 iOS 真机验收。 */
import { test, expect } from "@playwright/test";
import {
  goToExport,
  seedDraft,
  storageSummary,
  syntheticImages,
} from "./helpers.js";
import { png, exifOrientation } from "../tests/fixtures/png.mjs";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

/**
 * 准备虚构文字和空图片槽，通过真实步骤按钮进入照片页。
 * @param {import('@playwright/test').Page} page 当前页面
 * @returns {Promise<void>} 照片控件可操作后完成
 */
async function openPhotos(page) {
  await seedDraft(page, { images: [], name: "移动相册合成测试" });
  await goToExport(page);
  await expect(page.locator("#photo-selfie-1")).toBeEnabled();
}

/**
 * 提取一个合成文件，支持伪造相册提供的文件名和 MIME 元数据。
 * @param {number} index 合成图片索引
 * @param {object} changes 文件名、MIME 或字节覆盖项
 * @returns {object} Playwright 文件对象
 */
function file(index = 0, changes = {}) {
  const { name, mimeType, buffer } = syntheticImages()[index];
  return { name, mimeType, buffer, ...changes };
}

/**
 * 选择图片并确认真实预览、控件解锁与磁盘写入均已完成。
 * @param {import('@playwright/test').Page} page 当前页面
 * @param {string} id 照片控件 ID
 * @param {object} image 合成图片文件
 * @returns {Promise<void>} 图片处理保存完成
 */
async function choose(page, id, image) {
  const input = page.locator(`#${id}`);
  await expect(input).toBeEnabled();
  await input.setInputFiles(image);
  await expect(input).toBeEnabled();
  const preview = input
    .locator("xpath=ancestor::div[contains(@class,'photo-slot')]")
    .locator("img");
  await expect(preview).toBeVisible();
  await expect
    .poll(() =>
      preview.evaluate(
        (element) => element.complete && element.naturalWidth > 0,
      ),
    )
    .toBe(true);
  await expect
    .poll(async () =>
      (await savedPhotos(page)).some(
        (photo) => `photo-${photo.key}` === id && photo.name === image.name,
      ),
    )
    .toBe(true);
}

/**
 * 读取已经提交的非敏感图片元数据，比较失败或取消前后是否发生覆盖。
 * @param {import('@playwright/test').Page} page 当前同源页面
 * @returns {Promise<Array>} 槽位、类型、摘要和文件名
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
            request.result.map(({ key, mime, sha256, name }) => ({
              key,
              mime,
              sha256,
              name,
            })),
          );
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      db.close();
    }
  });
}

/**
 * 在真实 File 读取边界模拟云相册失败或挂起，可释放迟到结果来检查取消竞态。
 * @param {import('@playwright/test').Page} page 当前页面
 * @returns {Promise<void>} 故障注入脚本已安装
 */
async function installReadFault(page) {
  await page.addInitScript(() => {
    const read = File.prototype.arrayBuffer;
    globalThis.__photoReadMode = "normal";
    globalThis.__photoReadAttempts = 0;
    globalThis.__photoPendingReads = [];
    File.prototype.arrayBuffer = function () {
      if (this.name !== "cloud-photo.jpg") return read.call(this);
      globalThis.__photoReadAttempts++;
      if (globalThis.__photoReadMode === "fail")
        return Promise.reject(
          new DOMException(
            "Synthetic cloud file unavailable",
            "NotReadableError",
          ),
        );
      if (globalThis.__photoReadMode === "pending")
        return new Promise((resolve, reject) => {
          globalThis.__photoPendingReads.push(() =>
            read.call(this).then(resolve, reject),
          );
        });
      return read.call(this);
    };
    globalThis.__releasePhotoReads = () =>
      Promise.all(
        globalThis.__photoPendingReads.splice(0).map((release) => release()),
      );
  });
}

/**
 * 模拟后台冻结：停止页面心跳，并只推进页面时钟而不等待真实的 11 秒。
 * @param {import('@playwright/test').Page} page 当前页面
 * @returns {Promise<void>} 后台事件和时钟偏移已设置
 */
async function suspendBeyondLease(page) {
  await page.evaluate(() => {
    window.dispatchEvent(
      new PageTransitionEvent("pagehide", { persisted: true }),
    );
    const now = Date.now.bind(Date);
    Date.now = () => now() + 11_000;
  });
}

/**
 * 在同一浏览器上下文打开真实第二页，以未来时钟模拟后台租约过期后的接管。
 * @param {import('@playwright/test').BrowserContext} context 当前上下文
 * @returns {Promise<import('@playwright/test').Page>} 已取得编辑权的第二页
 */
async function takeoverPage(context) {
  const other = await context.newPage();
  await other.addInitScript(() => {
    const now = Date.now.bind(Date);
    Date.now = () => now() + 11_000;
  });
  await other.goto("/");
  await expect(other.locator("#photo-selfie-1")).toBeEnabled();
  await other
    .getByRole("navigation", { name: "填写步骤" })
    .getByRole("button")
    .first()
    .click();
  await expect(other.locator("#basic-name")).toBeEnabled();
  return other;
}

for (const profile of [
  { name: "Android Chromium 常见能力", browser: "chromium", disabled: [] },
  {
    name: "iOS WebKit 无 OffscreenCanvas",
    browser: "webkit",
    disabled: ["OffscreenCanvas"],
  },
  {
    name: "鸿蒙浏览器能力降级",
    browser: "chromium",
    disabled: ["Worker", "OffscreenCanvas", "createImageBitmap"],
  },
]) {
  test(`${profile.name}模拟：无 MIME、通用 MIME 与相册别名 JPEG 均可选择`, async ({
    page,
    browserName,
  }, testInfo) => {
    test.skip(
      browserName !== profile.browser,
      "该能力组合仅在对应浏览器引擎模拟，不代表真机结论",
    );
    await page.addInitScript((disabled) => {
      for (const name of disabled)
        Object.defineProperty(window, name, {
          configurable: true,
          value: undefined,
        });
    }, profile.disabled);
    await openPhotos(page);
    await expect(page.locator("#photo-selfie-1")).toHaveAttribute(
      "accept",
      "image/*",
    );
    for (const [index, mimeType] of [
      "",
      "application/octet-stream",
      "image/jpg",
    ].entries())
      await choose(
        page,
        `photo-selfie-${index + 1}`,
        file(index * 3, { name: `camera-${index}.jpg`, mimeType }),
      );
    expect(await savedPhotos(page)).toHaveLength(3);
    await testInfo.attach("mobile-capability-simulation", {
      body: JSON.stringify({
        profile: profile.name,
        engine: browserName,
        disabled: profile.disabled,
        realDevice: false,
      }),
      contentType: "application/json",
    });
  });
}

test("最后一格的相册读取失败在原处提示，重选同一文件可以成功", async ({
  page,
}, testInfo) => {
  await installReadFault(page);
  await openPhotos(page);
  const input = page.locator("#photo-other-4");
  const image = file(0, { name: "cloud-photo.jpg" });
  await input.evaluate((element) =>
    element.scrollIntoView({ block: "center" }),
  );
  await page.evaluate(() => {
    globalThis.__photoReadMode = "fail";
  });
  await input.setInputFiles(image);
  const error = page.locator("#photo-other-4-error");
  await expect(error).toHaveAttribute("role", "alert");
  await expect(error).toContainText(/读取|相册|重新选择/);
  await expect(error).toBeInViewport();
  const screenshot = testInfo.outputPath("last-photo-visible-error.png");
  await page.screenshot({ path: screenshot });
  await testInfo.attach("last-photo-visible-error", {
    path: screenshot,
    contentType: "image/png",
  });
  await expect(input).toBeEnabled();
  expect(await input.inputValue()).toBe("");
  expect(await savedPhotos(page)).toEqual([]);
  await page.evaluate(() => {
    globalThis.__photoReadMode = "normal";
  });
  await choose(page, "photo-other-4", image);
  await expect(error).toHaveCount(0);
  expect(
    await page.evaluate(() => globalThis.__photoReadAttempts),
  ).toBeGreaterThanOrEqual(2);
});

test("取消系统文件选择和再次选择同一照片均保留已有槽位", async ({ page }) => {
  await openPhotos(page);
  const image = file();
  await choose(page, "photo-selfie-1", image);
  const baseline = await savedPhotos(page);
  const input = page.locator("#photo-selfie-1");
  await input.setInputFiles([]);
  await input.dispatchEvent("cancel");
  await expect(input).toBeEnabled();
  expect(await savedPhotos(page)).toEqual(baseline);
  await choose(page, "photo-selfie-1", image);
  expect(await savedPhotos(page)).toEqual(baseline);
});

test("零字节云端占位图和错标 MIME 的截断图均明确报错并保留旧照片", async ({
  page,
}) => {
  await openPhotos(page);
  await choose(page, "photo-selfie-1", file());
  const baseline = await savedPhotos(page);
  const input = page.locator("#photo-selfie-1");
  for (const image of [
    file(0, { buffer: Buffer.alloc(0) }),
    file(1, {
      name: "wrong.jpg",
      mimeType: "image/jpeg",
      buffer: file(1).buffer.subarray(0, 24),
    }),
  ]) {
    await input.setInputFiles(image);
    await expect(page.locator("#photo-selfie-1-error")).toContainText(
      /为空|内容|完整|损坏|读取|格式/,
    );
    await expect(input).toBeEnabled();
    expect(await savedPhotos(page)).toEqual(baseline);
  }
});

test("相册读取挂起可取消，迟到的读取结果不会替换旧照片", async ({ page }) => {
  await installReadFault(page);
  await openPhotos(page);
  await choose(page, "photo-selfie-1", file(3));
  const baseline = await savedPhotos(page);
  await page.evaluate(() => {
    globalThis.__photoReadMode = "pending";
  });
  await page
    .locator("#photo-selfie-1")
    .setInputFiles(file(0, { name: "cloud-photo.jpg" }));
  const slot = page
    .locator(".photo-slot")
    .filter({ has: page.locator("#photo-selfie-1") });
  await expect(slot.getByRole("status")).toContainText(/读取|检查/);
  await slot.getByRole("button", { name: "取消图片处理", exact: true }).click();
  await expect(page.locator("#photo-selfie-1")).toBeEnabled();
  await expect(page.locator("#photo-selfie-1-error")).toContainText("取消");
  await page.evaluate(() => globalThis.__releasePhotoReads());
  expect(await savedPhotos(page)).toEqual(baseline);
  await expect(slot.getByRole("status")).toHaveCount(0);
});

test("打开相册超过九秒后返回，同一页面仍能保存照片", async ({ page }) => {
  await openPhotos(page);
  await suspendBeyondLease(page);
  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    ),
  );
  await choose(page, "photo-selfie-1", file());
  expect(await savedPhotos(page)).toHaveLength(1);
  await expect(
    page.getByRole("button", { name: "重新读取本机草稿", exact: true }),
  ).toHaveCount(0);
});

test("后台读取期间第二页接管，旧页恢复不会覆盖新文字或保存迟到照片", async ({
  page,
  context,
}) => {
  await installReadFault(page);
  await openPhotos(page);
  await page.evaluate(() => {
    globalThis.__photoReadMode = "pending";
  });
  await page
    .locator("#photo-selfie-1")
    .setInputFiles(file(0, { name: "cloud-photo.jpg" }));
  await expect
    .poll(() => page.evaluate(() => globalThis.__photoPendingReads.length))
    .toBe(1);
  await suspendBeyondLease(page);
  const other = await takeoverPage(context);
  await other.locator("#basic-name").fill("第二页已保存的虚构姓名");
  await expect
    .poll(async () => (await storageSummary(other)).name)
    .toBe("第二页已保存的虚构姓名");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByRole("button", { name: "重新读取本机草稿", exact: true }),
  ).toBeEnabled();
  await page.evaluate(() => globalThis.__releasePhotoReads());
  await expect(page.locator("#photo-selfie-1")).toBeDisabled();
  // 系统选择器可能在页面失去编辑权之后才发送 change，禁用控件仍可能收到此前的结果。
  await page.locator("#photo-selfie-1").setInputFiles(file(3));
  await expect(page.locator("#photo-selfie-1-error")).toContainText(
    "本页暂不可编辑",
  );
  expect(await storageSummary(other)).toMatchObject({
    name: "第二页已保存的虚构姓名",
    photos: 0,
  });
  await other.close();
});

test("后台读取期间第二页明确清除，迟到照片不会使草稿复活", async ({
  page,
  context,
}) => {
  await installReadFault(page);
  await openPhotos(page);
  await page.evaluate(() => {
    globalThis.__photoReadMode = "pending";
  });
  await page
    .locator("#photo-selfie-1")
    .setInputFiles(file(0, { name: "cloud-photo.jpg" }));
  await expect
    .poll(() => page.evaluate(() => globalThis.__photoPendingReads.length))
    .toBe(1);
  await suspendBeyondLease(page);
  const other = await takeoverPage(context);
  await other
    .getByRole("button", { name: "清除本应用数据", exact: true })
    .click();
  await other.getByRole("button", { name: "确认清除", exact: true }).click();
  await expect(
    other.getByRole("heading", { name: "应用内填写数据已清除" }),
  ).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByRole("heading", { name: "应用内填写数据已清除" }),
  ).toBeVisible();
  await page.evaluate(() => globalThis.__releasePhotoReads());
  expect(await storageSummary(other)).toMatchObject({
    draft: false,
    photos: 0,
    name: null,
  });
  await other.close();
});

test("相册把合法 PNG 标成 JPEG 时按真实内容保存", async ({ page }) => {
  await openPhotos(page);
  await choose(
    page,
    "photo-selfie-1",
    file(1, { name: "converted-camera.jpg", mimeType: "image/jpeg" }),
  );
  expect(await savedPhotos(page)).toMatchObject([
    { mime: "image/png", name: "converted-camera.jpg" },
  ]);
  await expect(page.locator("#photo-selfie-1-error")).toHaveCount(0);
});

test("相册读取超时后解锁控件，重新选择仍能保存", async ({ page }) => {
  await installReadFault(page);
  await openPhotos(page);
  await page.clock.install();
  await page.evaluate(() => {
    globalThis.__photoReadMode = "pending";
  });
  const image = file(0, { name: "cloud-photo.jpg" });
  await page.locator("#photo-selfie-1").setInputFiles(image);
  await expect
    .poll(() => page.evaluate(() => globalThis.__photoPendingReads.length))
    .toBe(1);
  await page.clock.fastForward(21_000);
  await expect(page.locator("#photo-selfie-1-error")).toContainText(
    /等待过久|超时/,
  );
  await expect(page.locator("#photo-selfie-1")).toBeEnabled();
  expect(await savedPhotos(page)).toEqual([]);
  await page.evaluate(() => {
    globalThis.__photoReadMode = "normal";
    return globalThis.__releasePhotoReads();
  });
  await choose(page, "photo-selfie-1", image);
});

test("Worker 没有任何回调时超时退出并在页面中完成图片", async ({ page }) => {
  await page.addInitScript(() => {
    globalThis.__silentImageWorker = { posted: 0, terminated: 0 };
    window.Worker = class {
      postMessage() {
        globalThis.__silentImageWorker.posted++;
      }
      terminate() {
        globalThis.__silentImageWorker.terminated++;
      }
    };
  });
  await openPhotos(page);
  await page.clock.install();
  await page.locator("#photo-selfie-1").setInputFiles(file());
  await expect
    .poll(() => page.evaluate(() => globalThis.__silentImageWorker.posted))
    .toBe(1);
  await page.clock.fastForward(31_000);
  await expect(page.locator("#photo-selfie-1")).toBeEnabled();
  await expect(
    page.getByRole("img", { name: "自拍第1张预览", exact: true }),
  ).toBeVisible();
  expect(await savedPhotos(page)).toHaveLength(1);
  expect(
    await page.evaluate(() => globalThis.__silentImageWorker.terminated),
  ).toBe(1);
});

for (const fallback of [false, true]) {
  test(`Adam7 与带方向的 PNG 能生成实际预览${fallback ? "（普通 canvas）" : "（默认处理）"}`, async ({
    page,
  }) => {
    if (fallback)
      await page.addInitScript(() => {
        for (const key of ["Worker", "OffscreenCanvas", "createImageBitmap"])
          Object.defineProperty(window, key, {
            configurable: true,
            value: undefined,
          });
      });
    await openPhotos(page);
    const images = [
      { buffer: png({ interlace: 1 }), width: 9, height: 7 },
      { buffer: png({ exif: exifOrientation(6, true) }), width: 7, height: 9 },
      { buffer: png({ exif: exifOrientation(8, false) }), width: 7, height: 9 },
    ];
    for (const [index, image] of images.entries()) {
      await choose(page, `photo-selfie-${index + 1}`, {
        name: `synthetic-png-${index}.png`,
        mimeType: "image/png",
        buffer: image.buffer,
      });
      const dimensions = await page
        .getByRole("img", { name: `自拍第${index + 1}张预览`, exact: true })
        .evaluate((element) => ({
          width: element.naturalWidth,
          height: element.naturalHeight,
        }));
      expect(dimensions).toEqual({ width: image.width, height: image.height });
    }
  });
}

test("预览地址创建失败仍保留已存照片，重选后旧预览错误不移除新预览", async ({
  page,
}) => {
  await openPhotos(page);
  await choose(page, "photo-selfie-1", file());
  const oldPreview = await page
    .getByRole("img", { name: "自拍第1张预览", exact: true })
    .elementHandle();
  await page.evaluate(() => {
    const create = URL.createObjectURL.bind(URL);
    globalThis.__restorePreviewUrls = () => {
      URL.createObjectURL = create;
    };
    URL.createObjectURL = () => {
      throw new Error("Synthetic URL failure");
    };
  });
  await page.locator("#photo-selfie-1").setInputFiles(file(3));
  const slot = page
    .locator(".photo-slot")
    .filter({ has: page.locator("#photo-selfie-1") });
  await expect(slot.getByRole("alert")).toContainText(
    "图片已加入，但预览无法显示",
  );
  await expect(page.locator("#photo-selfie-1")).toBeEnabled();
  expect(await savedPhotos(page)).toMatchObject([{ name: file(3).name }]);
  await page.evaluate(() => globalThis.__restorePreviewUrls());
  await choose(page, "photo-selfie-1", file(6));
  await oldPreview.evaluate((element) =>
    element.dispatchEvent(new Event("error")),
  );
  await expect(slot.getByRole("alert")).toHaveCount(0);
  await expect(slot.locator("img")).toBeVisible();
  expect(await savedPhotos(page)).toMatchObject([{ name: file(6).name }]);
});

test("本机图片写入失败保留原槽位，恢复存储后同文件可重试", async ({ page }) => {
  await openPhotos(page);
  await choose(page, "photo-selfie-1", file());
  const baseline = await savedPhotos(page);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    globalThis.__restorePhotoWrites = () => {
      IDBObjectStore.prototype.put = put;
    };
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === "photos")
        throw new DOMException(
          "Synthetic image quota exhausted",
          "QuotaExceededError",
        );
      return put.apply(this, args);
    };
  });
  await page.locator("#photo-selfie-1").setInputFiles(file(3));
  await expect(page.locator("#photo-selfie-1-error")).toBeVisible();
  await expect(page.locator("#photo-selfie-1")).toBeEnabled();
  expect(await savedPhotos(page)).toEqual(baseline);
  await page.evaluate(() => globalThis.__restorePhotoWrites());
  await choose(page, "photo-selfie-1", file(3));
  expect(await savedPhotos(page)).toMatchObject([{ name: file(3).name }]);
});
