/**
 * 在真实浏览器内生成 32 MiB 合成附件，连续导出三次并检查取消和清理。
 * 图片由小 PNG 加合法私有数据块组成；不使用个人照片，也不经协议传送大文件。
 */
import { test, expect } from "@playwright/test";
import { open, stat } from "node:fs/promises";
import { fields, questions, goToExport, storageSummary } from "./helpers.js";

/**
 * 在浏览器中创建容量边界草稿，照片和摘要全部在页面本地计算。
 * @param {import('@playwright/test').Page} page 当前测试页面
 * @returns {Promise<{attachmentBytes:number,photoCount:number}>} 写入的附件数量和总字节数
 */
async function seedCapacityDraft(page) {
  await page.route("**/__e2e_capacity", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Synthetic capacity test</title>",
    }),
  );
  await page.goto("/__e2e_capacity");
  const result = await page.evaluate(
    async ({ fields, questions }) => {
      const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
        let value = index;
        for (let bit = 0; bit < 8; bit += 1)
          value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
        return value >>> 0;
      });
      /**
       * 用有效的私有 ancillary 块把 PNG 补到 2 MiB，随机块避免文件高度可压缩。
       * @param {Uint8Array} png 浏览器生成的小 PNG
       * @param {number} index 用于区分每张图的随机种子
       * @returns {Uint8Array} 保持原像素内容的 2 MiB PNG
       */
      function paddedPng(png, index) {
        const bytes = new Uint8Array(2 * 1024 * 1024);
        const insertion = png.length - 12;
        bytes.set(png.subarray(0, insertion));
        const length = bytes.length - png.length - 12;
        new DataView(bytes.buffer).setUint32(insertion, length);
        bytes.set([114, 97, 78, 100], insertion + 4); // raNd：私有、可忽略、保留位正确的 PNG 块。
        let state = 746193 + index * 97;
        for (
          let offset = insertion + 8;
          offset < insertion + 8 + length;
          offset += 1
        ) {
          state ^= state << 13;
          state ^= state >>> 17;
          state ^= state << 5;
          bytes[offset] = state & 255;
        }
        let crc = 0xffffffff;
        for (
          let offset = insertion + 4;
          offset < insertion + 8 + length;
          offset += 1
        )
          crc = crcTable[(crc ^ bytes[offset]) & 255] ^ (crc >>> 8);
        new DataView(bytes.buffer).setUint32(
          insertion + 8 + length,
          (crc ^ 0xffffffff) >>> 0,
        );
        bytes.set(png.subarray(insertion), bytes.length - 12);
        return bytes;
      }
      const photos = [];
      const categories = ["selfie", "nude", "dick", "other"];
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 96;
      const context = canvas.getContext("2d");
      for (let index = 0; index < 16; index += 1) {
        context.fillStyle = `rgb(${25 + index * 13}, ${180 - index * 5}, ${80 + index * 7})`;
        context.fillRect(0, 0, 128, 96);
        context.fillStyle = "#ffffff";
        context.fillRect(index * 3, 12, 8, 16);
        const pngBlob = await new Promise((resolve) =>
          canvas.toBlob(resolve, "image/png"),
        );
        const bytes = paddedPng(
          new Uint8Array(await pngBlob.arrayBuffer()),
          index,
        );
        const preview = await new Promise((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", 0.9),
        );
        const hash = await crypto.subtle.digest("SHA-256", bytes);
        const sha256 = [...new Uint8Array(hash)]
          .map((value) => value.toString(16).padStart(2, "0"))
          .join("");
        const category = categories[Math.floor(index / 4)],
          slot = (index % 4) + 1;
        photos.push({
          key: `${category}-${slot}`,
          category,
          slot,
          blobBytes: bytes.buffer,
          blobType: "image/png",
          previewBytes: await preview.arrayBuffer(),
          previewType: "image/jpeg",
          sourceSha256: sha256,
          sha256,
          mime: "image/png",
          name: `capacity-${index + 1}.png`,
          size: bytes.length,
          width: 128,
          height: 96,
          compressed: false,
        });
      }
      canvas.width = 1;
      canvas.height = 1;
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open("webtable-local-v1", 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore("state");
          request.result.createObjectStore("photos", { keyPath: "key" });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const transaction = db.transaction(["state", "photos"], "readwrite");
        const state = transaction.objectStore("state");
        state.put(
          {
            formatVersion: 1,
            id: "synthetic-capacity-only",
            ageConfirmedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            basicInfo: Object.fromEntries(
              fields.map((field) => [
                field.key,
                field.key === "name" ? "本机容量测试" : "无",
              ]),
            ),
            answers: questions.map((question) => ({
              questionId: question.id,
              grade: "A",
              remark: `容量备注${question.id}`,
            })),
          },
          "draft",
        );
        state.put(
          { generation: 0, version: 1, owner: null, leaseUntil: 0 },
          "control",
        );
        const storage = transaction.objectStore("photos");
        for (const photo of photos) storage.put(photo);
        transaction.oncomplete = resolve;
        transaction.onabort = () =>
          reject(transaction.error || new Error("Capacity seed failed"));
      });
      db.close();
      return {
        attachmentBytes: photos.reduce((sum, photo) => sum + photo.size, 0),
        photoCount: photos.length,
      };
    },
    { fields, questions },
  );
  await page.unroute("**/__e2e_capacity");
  await page.goto("/");
  await expect(page.locator("#basic-name")).toBeEnabled();
  return result;
}

/**
 * 读取浏览器公开的 JS 堆计数；不以此推断 Worker、Blob 或系统总内存。
 * @param {import('@playwright/test').Page} page 当前测试页面
 * @returns {Promise<{usedJSHeapSize:number,totalJSHeapSize:number,jsHeapSizeLimit:number}|null>} 不支持时返回 null
 */
async function heapSnapshot(page) {
  return page.evaluate(() => {
    const memory = performance.memory;
    return memory
      ? {
          usedJSHeapSize: memory.usedJSHeapSize,
          totalJSHeapSize: memory.totalJSHeapSize,
          jsHeapSizeLimit: memory.jsHeapSizeLimit,
        }
      : null;
  });
}

test("32 MiB 附件连续导出三次，取消与清除释放生成文件引用", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    const revoke = URL.revokeObjectURL.bind(URL);
    globalThis.__testRevokedObjectUrls = [];
    URL.revokeObjectURL = (url) => {
      globalThis.__testRevokedObjectUrls.push(String(url));
      return revoke(url);
    };
  });
  const capacity = await seedCapacityDraft(page);
  expect(capacity).toEqual({
    attachmentBytes: 32 * 1024 * 1024,
    photoCount: 16,
  });
  await goToExport(page);
  const measurements = {
    browser: testInfo.project.name,
    ...capacity,
    before: await heapSnapshot(page),
    exports: [],
    afterClear: null,
    limitation:
      "桌面自动化浏览器和合成小像素 PNG 容量边界；不代表手机真机、大像素解码、系统总内存或无内存泄漏证明。JS 堆计数不包含 Worker、Blob 和浏览器原生内存。",
  };
  for (let iteration = 1; iteration <= 3; iteration += 1) {
    const started = Date.now();
    await page.getByRole("button", { name: "检查并生成 PDF" }).click();
    await expect(page.getByRole("heading", { name: "PDF 已生成" })).toBeVisible(
      { timeout: 30_000 },
    );
    const durationMs = Date.now() - started;
    const url = await page
      .getByRole("link", { name: "下载 PDF", exact: true })
      .getAttribute("href");
    const downloadEvent = page.waitForEvent("download");
    await page.getByRole("link", { name: "下载 PDF", exact: true }).click();
    const download = await downloadEvent;
    expect(await download.failure()).toBeNull();
    const downloadPath = await download.path();
    const handle = await open(downloadPath, "r");
    const header = Buffer.alloc(8);
    try {
      await handle.read(header, 0, header.length, 0);
    } finally {
      await handle.close();
    }
    const file = {
      size: (await stat(downloadPath)).size,
      header: header.toString("ascii"),
    };
    // 测试只读取文件头和大小，不将每次40MiB文件复制到测试进程内存。
    await download.delete();
    expect(file.header.startsWith("%PDF-")).toBe(true);
    expect(file.size).toBeGreaterThan(32 * 1024 * 1024);
    expect(file.size).toBeLessThan(64 * 1024 * 1024);
    const generatedHeap = await heapSnapshot(page);
    await page.getByRole("button", { name: "返回修改" }).click();
    await expect(
      page.getByRole("link", { name: "下载 PDF", exact: true }),
    ).toHaveCount(0);
    const revoked = await page.evaluate(
      (url) => globalThis.__testRevokedObjectUrls.includes(url),
      url,
    );
    expect(revoked).toBe(true);
    measurements.exports.push({
      iteration,
      durationMs,
      ...file,
      generatedHeap,
      afterReturnHeap: await heapSnapshot(page),
      revoked,
    });
  }
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const hold = async (route) => {
    await pending;
    await route.continue().catch(() => {});
  };
  await context.route("**/assets/pdf.worker-*.js", hold);
  try {
    await page.getByRole("button", { name: "检查并生成 PDF" }).click();
    await page.getByRole("button", { name: "取消生成" }).click();
  } finally {
    release();
    await context.unroute("**/assets/pdf.worker-*.js", hold);
  }
  await expect(
    page.getByRole("alert").filter({ hasText: "已取消 PDF 生成" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "下载 PDF", exact: true }),
  ).toHaveCount(0);
  expect(await storageSummary(page)).toMatchObject({ draft: true, photos: 16 });
  await page
    .getByRole("button", { name: "清除本应用数据", exact: true })
    .click();
  await page.getByRole("button", { name: "确认清除", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "应用内填写数据已清除" }),
  ).toBeVisible();
  expect(await storageSummary(page)).toMatchObject({
    draft: false,
    photos: 0,
    stateKeys: ["control"],
  });
  measurements.afterClear = await heapSnapshot(page);
  await testInfo.attach("capacity-export-metrics", {
    body: JSON.stringify(measurements),
    contentType: "application/json",
  });
});
