/** 生产构建的填写、导出与清理回归；只使用虚构文字及合成图片。 */
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  acceptAge,
  fillBasic,
  syntheticImages,
  seedDraft,
  storageSummary,
  goToExport,
} from "./helpers.js";

test("真实填写、刷新恢复、图片判重、PDF 下载和跨标签页清除", async ({
  page,
  context,
}, testInfo) => {
  const requests = [];
  const pageErrors = [];
  context.on("request", (request) =>
    requests.push({
      url: request.url(),
      method: request.method(),
      body: request.postData(),
    }),
  );
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await acceptAge(page);
  await page.getByRole("button", { name: "检查并继续" }).click();
  await expect(page.locator("#issues-title")).toHaveText("还有 32 项需要完成");
  await expect(page.locator("#basic-name")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  const name = `回归测试-${testInfo.project.name}`;
  await fillBasic(page, name);
  await page.reload();
  await expect(page.locator("#basic-name")).toHaveValue(name);
  await expect(page.locator("#basic-name")).toBeEnabled();
  await expect(page.locator("#age-confirm")).toHaveCount(0);
  await page.getByRole("button", { name: "检查并继续" }).click();
  await expect(page.locator("#photo-selfie-1")).toBeVisible();
  const images = syntheticImages();
  for (const [index, image] of images.entries()) {
    const slot = page.locator(`#photo-${image.category}-${image.slot}`);
    await slot.setInputFiles({
      name: image.name,
      mimeType: image.mimeType,
      buffer: image.buffer,
    });
    await expect(
      slot.locator("..").getByText(image.name, { exact: true }),
    ).toBeVisible();
    await expect(slot).toBeEnabled();
    if (index === 0) {
      await page.locator("#photo-selfie-2").setInputFiles({
        name: "renamed-duplicate.jpg",
        mimeType: image.mimeType,
        buffer: image.buffer,
      });
      await expect(
        page.getByRole("alert").filter({ hasText: "已在其他槽位使用" }),
      ).toBeVisible();
      await expect
        .poll(async () => (await storageSummary(page)).photos)
        .toBe(1);
    }
  }
  await expect.poll(async () => (await storageSummary(page)).photos).toBe(16);
  await page.getByRole("button", { name: "检查并继续" }).click();
  await page.getByRole("button", { name: "检查并生成 PDF" }).click();
  await expect(page.locator("#issues-title")).toContainText("250");
  // 125 个答案由 IndexedDB 准备，后续仍通过正式页面更改和校验代表性答案。
  await seedDraft(page, { answersOnly: true });
  await goToExport(page);
  await page.locator(".assessment-group summary").first().click();
  await page.locator("#grade-1").selectOption("B");
  await page.locator("#remark-1").fill("通过真实输入完成的自评备注");
  const started = Date.now();
  await page.getByRole("button", { name: "检查并生成 PDF" }).click();
  await expect(page.getByRole("heading", { name: "PDF 已生成" })).toBeVisible();
  const generatedMs = Date.now() - started;
  await expect(
    page.getByRole("button", { name: "确认已保存，清除本应用数据" }),
  ).toBeDisabled();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("link", { name: "下载 PDF", exact: true }).click();
  const download = await downloadEvent;
  expect(await download.failure()).toBeNull();
  const bytes = new Uint8Array(await readFile(await download.path()));
  const pdfBytes = bytes.byteLength;
  const pdf = getDocument({
    data: bytes,
    isEvalSupported: false,
    useSystemFonts: false,
  });
  const document = await pdf.promise;
  try {
    const attachments = await document.getAttachments();
    expect(attachments.size).toBe(16);
    for (const [id, attachment] of attachments) {
      const file = images.find((image) =>
        attachment.filename.includes(`${image.category}-${image.slot}-`),
      );
      expect(file).toBeTruthy();
      const content = await document.getAttachmentContent(id);
      expect(createHash("sha256").update(content).digest("hex")).toBe(
        file.sha256,
      );
    }
    let text = "";
    for (let index = 1; index <= document.numPages; index += 1) {
      const pdfPage = await document.getPage(index);
      text += (await pdfPage.getTextContent()).items
        .map((item) => item.str)
        .join("");
    }
    expect(text).toContain(name);
    expect(text).toContain("通过真实输入完成的自评备注");
    expect(text).toContain("测试备注125");
    expect(await document.getJSActions()).toBeNull();
  } finally {
    await pdf.destroy();
  }
  expect((await storageSummary(page)).draft).toBe(true);
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.locator("#basic-name")).toHaveValue(name);
  await expect(other.locator("#basic-name")).toBeDisabled();
  await page
    .getByRole("checkbox", {
      name: "我已把 PDF 保存到设备，并检查了文件内容。",
    })
    .check();
  await page
    .getByRole("button", { name: "确认已保存，清除本应用数据" })
    .click();
  await page.getByRole("button", { name: "已保存，确认清除" }).click();
  await expect(
    page.getByRole("heading", { name: "应用内填写数据已清除" }),
  ).toBeVisible();
  await expect(
    other.getByRole("heading", { name: "应用内填写数据已清除" }),
  ).toBeVisible();
  expect(await storageSummary(page)).toMatchObject({
    draft: false,
    photos: 0,
    name: null,
    stateKeys: ["control"],
  });
  await other.reload();
  await expect(other.locator("#age-confirm")).toBeVisible();
  expect(await storageSummary(other)).toMatchObject({
    draft: false,
    photos: 0,
  });
  expect(pageErrors).toEqual([]);
  expect(
    requests.every(
      (request) => request.method === "GET" && request.body === null,
    ),
  ).toBe(true);
  expect(
    requests.every(
      (request) =>
        new URL(request.url).origin === new URL(page.url()).origin ||
        request.url.startsWith("blob:"),
    ),
  ).toBe(true);
  await testInfo.attach("export-metrics", {
    body: JSON.stringify({
      browser: testInfo.project.name,
      generatedMs,
      pdfBytes,
      attachments: 16,
    }),
    contentType: "application/json",
  });
});

test("取消、字体加载失败和重试都保留草稿，返回修改使旧 PDF 失效", async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    const revoke = URL.revokeObjectURL.bind(URL);
    globalThis.__testRevokedObjectUrls = [];
    URL.revokeObjectURL = (url) => {
      globalThis.__testRevokedObjectUrls.push(String(url));
      return revoke(url);
    };
  });
  await seedDraft(page);
  await goToExport(page);
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const pauseWorker = async (route) => {
    await pending;
    await route.continue().catch(() => {});
  };
  await context.route("**/assets/pdf.worker-*.js", pauseWorker);
  await page.getByRole("button", { name: "检查并生成 PDF" }).click();
  await page.getByRole("button", { name: "取消生成" }).click();
  release();
  await context.unroute("**/assets/pdf.worker-*.js", pauseWorker);
  await expect(
    page.getByRole("alert").filter({ hasText: "已取消 PDF 生成" }),
  ).toBeVisible();
  expect(await storageSummary(page)).toMatchObject({ draft: true, photos: 16 });
  const failFont = (route) => route.abort();
  await context.route("**/fonts/NotoSansSC-Regular.otf", failFont);
  await page.getByRole("button", { name: "检查并生成 PDF" }).click();
  await expect(
    page.getByRole("button", { name: "检查并生成 PDF" }),
  ).toBeEnabled();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("heading", { name: "PDF 已生成" })).toHaveCount(
    0,
  );
  expect(await storageSummary(page)).toMatchObject({ draft: true, photos: 16 });
  await context.unroute("**/fonts/NotoSansSC-Regular.otf", failFont);
  await page.getByRole("button", { name: "检查并生成 PDF" }).click();
  await expect(page.getByRole("heading", { name: "PDF 已生成" })).toBeVisible();
  const previousUrl = await page
    .getByRole("link", { name: "下载 PDF", exact: true })
    .getAttribute("href");
  await page.getByRole("button", { name: "返回修改" }).click();
  await expect(
    page.getByRole("link", { name: "下载 PDF", exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      (url) => globalThis.__testRevokedObjectUrls.includes(url),
      previousUrl,
    ),
  ).toBe(true);
  expect(await storageSummary(page)).toMatchObject({ draft: true, photos: 16 });
});

test("字体缺字的 emoji 自动用占位符代替并明确提示", async ({ page }) => {
  await seedDraft(page, { name: "合成😀😀姓名" });
  await goToExport(page);
  await page.getByRole("button", { name: "检查并生成 PDF" }).click();
  await expect(page.getByRole("heading", { name: "PDF 已生成" })).toBeVisible();
  const notice = page
    .getByRole("status")
    .filter({ hasText: "PDF 中文字体无法显示" });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("2 个字符");
  await expect(notice).toContainText("U+1F600");
  await expect(notice).toContainText("草稿内容不会改变");
  // 下载链接仍需可用，导出没有被缺字中断。
  const download = page.getByRole("link", { name: "下载 PDF", exact: true });
  await expect(download).toBeVisible();
  expect(await download.getAttribute("href")).toMatch(/^blob:/);
});

test("三步骤在四个宽度和六种外观下无横向溢出，严重可访问性问题为零", async ({
  page,
}, testInfo) => {
  await seedDraft(page);
  const measurements = [];
  for (const theme of ["minimal", "tech", "flat"])
    for (const mode of ["light", "dark"]) {
      await page
        .getByRole("combobox", { name: "界面风格" })
        .selectOption(theme);
      await page.getByRole("combobox", { name: "明暗模式" }).selectOption(mode);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      for (const width of [375, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        for (let step = 1; step <= 3; step += 1) {
          await page
            .getByRole("navigation", { name: "填写步骤" })
            .getByRole("button")
            .nth(step - 1)
            .click();
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - window.innerWidth,
          );
          expect(
            overflow,
            `${theme}/${mode}/${width}/step${step}`,
          ).toBeLessThanOrEqual(1);
          measurements.push({ theme, mode, width, step, overflow });
          if (
            width === 1440 &&
            step === 1 &&
            mode === "light" &&
            theme === "minimal"
          ) {
            await page.screenshot({
              path: testInfo.outputPath("minimal-light-1440.png"),
              fullPage: false,
            });
          }
        }
      }
      await page.setViewportSize({ width: 375, height: 900 });
      await page.locator(".assessment-group summary").first().click();
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      const severe = result.violations.filter((item) =>
        ["serious", "critical"].includes(item.impact),
      );
      expect(
        severe.map((item) => ({
          id: item.id,
          targets: item.nodes.map((node) => node.target),
        })),
      ).toEqual([]);
      await page.screenshot({
        path: testInfo.outputPath(`${theme}-${mode}-375.png`),
        fullPage: false,
      });
      await page.locator(".assessment-group summary").first().click();
    }
  await page.getByRole("combobox", { name: "明暗模式" }).selectOption("system");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await testInfo.attach("layout-matrix", {
    body: JSON.stringify(measurements),
    contentType: "application/json",
  });
});
