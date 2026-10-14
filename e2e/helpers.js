/** 浏览器回归的虚构资料与合成图片；直接操作 IndexedDB 只用于测试准备，不增加生产入口。 */
import { createHash } from "node:crypto";
import { createCanvas } from "@napi-rs/canvas";
import { expect } from "@playwright/test";
import fields from "../src/data/fields.json" with { type: "json" };
import questions from "../src/data/questions.json" with { type: "json" };

export { fields, questions };
export const categories = ["selfie", "nude", "dick", "other"];

/**
 * 生成 16 张颜色与格式不同的小图片，不使用实际个人照片。
 * @returns {Array<{name:string,mimeType:string,buffer:Buffer,sha256:string,category:string,slot:number}>} 可供 setInputFiles 使用的文件
 */
export function syntheticImages() {
  return Array.from({ length: 16 }, (_, index) => {
    const mimeType = ["image/jpeg", "image/png", "image/webp"][index % 3];
    const canvas = createCanvas(40 + index, 32 + index);
    const context = canvas.getContext("2d");
    context.fillStyle = `rgb(${20 + index * 12}, ${180 - index * 5}, ${80 + index * 7})`;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#ffffff";
    context.fillRect(index + 1, 3, 6, 7);
    const extension =
      mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1];
    const buffer = canvas.toBuffer(mimeType);
    return {
      name: `synthetic-${index + 1}.${extension}`,
      mimeType,
      buffer,
      sha256: createHash("sha256").update(buffer).digest("hex"),
      category: categories[Math.floor(index / 4)],
      slot: (index % 4) + 1,
    };
  });
}

/**
 * 通过真实界面确认年龄，等待首份草稿保存成功。
 * @param {import('@playwright/test').Page} page 当前测试页面
 * @returns {Promise<void>} 基础表单可以填写后兑现
 */
export async function acceptAge(page) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "仅限已满 18 周岁者使用" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "确认并开始" })).toBeDisabled();
  await page.locator("#age-confirm").check();
  await page.getByRole("button", { name: "确认并开始" }).click();
  await expect(page.locator("#basic-name")).toBeEnabled();
}

/**
 * 用明确的“不适用”完成全部基础字段，并输入一个可核对姓名。
 * @param {import('@playwright/test').Page} page 当前测试页面
 * @param {string} name 本轮使用的虚构姓名
 * @returns {Promise<void>} 本机自动保存完成后兑现
 */
export async function fillBasic(page, name = "回归测试资料") {
  for (const field of fields)
    await page.locator(`#basic-${field.key}`).fill("无");
  await page.locator("#basic-name").fill(name);
  await expect(
    page.getByRole("status").filter({ hasText: "已保存在此浏览器" }),
  ).toBeVisible();
}

/**
 * 在空白的同源测试页面读写已有数据库，避免应用保存队列与准备数据互相覆盖。
 * @param {import('@playwright/test').Page} page 当前测试页面
 * @param {object} options answersOnly仅补齐答案；images用于创建完整图片草稿
 * @returns {Promise<void>} 准备完成并回到正式页面
 */
export async function seedDraft(
  page,
  {
    answersOnly = false,
    images = syntheticImages(),
    name = "测试本地草稿",
  } = {},
) {
  await page.route("**/__e2e_seed", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Isolated seed</title>",
    }),
  );
  await page.goto("/__e2e_seed");
  const payload = images.map((image) => ({
    ...image,
    buffer: [...image.buffer],
  }));
  await page.evaluate(
    async ({ fields, questions, images, answersOnly, name }) => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open("webtable-local-v1", 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore("state");
          request.result.createObjectStore("photos", { keyPath: "key" });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const photos = [];
      if (!answersOnly)
        for (const image of images) {
          const blob = new Blob([new Uint8Array(image.buffer)], {
            type: image.mimeType,
          });
          const bitmap = await createImageBitmap(blob);
          const canvas = document.createElement("canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          canvas.getContext("2d").drawImage(bitmap, 0, 0);
          const previewBlob = await new Promise((resolve) =>
            canvas.toBlob(resolve, "image/jpeg", 0.9),
          );
          photos.push({
            key: `${image.category}-${image.slot}`,
            category: image.category,
            slot: image.slot,
            blobBytes: await blob.arrayBuffer(),
            blobType: blob.type,
            previewBytes: await previewBlob.arrayBuffer(),
            previewType: previewBlob.type,
            sourceSha256: image.sha256,
            sha256: image.sha256,
            mime: image.mimeType,
            name: image.name,
            size: blob.size,
            width: bitmap.width,
            height: bitmap.height,
            compressed: false,
          });
          bitmap.close();
        }
      await new Promise((resolve, reject) => {
        const transaction = db.transaction(["state", "photos"], "readwrite");
        const state = transaction.objectStore("state");
        const request = state.get("draft");
        request.onsuccess = () => {
          const draft = answersOnly
            ? request.result
            : {
                formatVersion: 1,
                id: "synthetic-only",
                ageConfirmedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                basicInfo: Object.fromEntries(
                  fields.map((field) => [
                    field.key,
                    field.key === "name" ? name : "无",
                  ]),
                ),
              };
          if (!draft) {
            transaction.abort();
            return;
          }
          draft.answers = questions.map((question) => ({
            questionId: question.id,
            grade: "A",
            remark: `测试备注${question.id}`,
          }));
          state.put(draft, "draft");
          state.put(
            { generation: 0, version: 1, owner: null, leaseUntil: 0 },
            "control",
          );
          if (!answersOnly) {
            const storage = transaction.objectStore("photos");
            storage.clear();
            for (const photo of photos) storage.put(photo);
          }
        };
        transaction.oncomplete = resolve;
        transaction.onabort = () =>
          reject(transaction.error || new Error("Seed failed"));
      });
      db.close();
    },
    { fields, questions, images: payload, answersOnly, name },
  );
  await page.unroute("**/__e2e_seed");
  await page.goto("/");
  await expect(page.locator("#basic-name")).toBeEnabled();
}

/**
 * 读取存储数量与虚构姓名，检查刷新和清理时不泄露图片内容到日志。
 * @param {import('@playwright/test').Page} page 当前同源页面
 * @returns {Promise<{draft:boolean,photos:number,name:string|null,stateKeys:string[]}>} 不含实际文件的存储摘要
 */
export async function storageSummary(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("webtable-local-v1");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const result = await new Promise((resolve, reject) => {
      const transaction = db.transaction(["state", "photos"]);
      const draft = transaction.objectStore("state").get("draft");
      const photos = transaction.objectStore("photos").count();
      const keys = transaction.objectStore("state").getAllKeys();
      transaction.oncomplete = () =>
        resolve({
          draft: Boolean(draft.result),
          photos: photos.result,
          name: draft.result?.basicInfo?.name || null,
          stateKeys: keys.result,
        });
      transaction.onabort = () => reject(transaction.error);
    });
    db.close();
    return result;
  });
}

/**
 * 从完整草稿进入最终导出步骤，保留真实的步骤完整性检查。
 * @param {import('@playwright/test').Page} page 当前表单页面
 * @returns {Promise<void>} 最后一步按钮出现后兑现
 */
export async function goToExport(page) {
  await page.getByRole("button", { name: "检查并继续" }).click();
  await expect(page.locator("#photo-selfie-1")).toBeVisible();
  await page.getByRole("button", { name: "检查并继续" }).click();
  await expect(
    page.getByRole("button", { name: "检查并生成 PDF" }),
  ).toBeVisible();
}
