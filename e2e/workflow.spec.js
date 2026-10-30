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
  await page.getByRole("button", { name: "检查并进入自评" }).click();
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
  await page.getByRole("button", { name: "检查并进入自评" }).click();
  await expect(page.locator("#assessment-heading")).toBeVisible();
  await page.getByRole("button", { name: "检查并添加照片" }).click();
  await expect(page.locator("#issues-title")).toContainText("250");
  // 125 个答案由 IndexedDB 准备，代表性答案仍通过真实 radio 与备注编辑器修改。
  await seedDraft(page, { answersOnly: true, currentStep: 2 });
  await page.locator('label[for="grade-1-B"]').click();
  await page
    .locator(".question-card")
    .first()
    .getByRole("button", { name: /展开备注/ })
    .click();
  await page.locator("#remark-1").fill("通过真实输入完成的自评备注");
  await page.getByRole("button", { name: "检查并添加照片" }).click();
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
  await expect(other.locator("#step-heading")).toHaveText("照片及导出");
  await expect(other.locator("#photo-selfie-1")).toBeDisabled();
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

test("两种风格日间和夜间在四种宽度无溢出，偏好恢复、系统跟随和填写数据保留", async ({
  page,
}, testInfo) => {
  // 五次刷新会等待旧页租约自然到期，给状态驱动的等待保留足够时间。
  test.setTimeout(150_000);
  // 旧风格偏好不应改变原型；只初始化一次，刷新仍能检验新选择的持久化。
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("display-mode-regression")) {
      localStorage.setItem("webtable-theme", "tech");
      localStorage.setItem("webtable-color-mode", "light");
      sessionStorage.setItem("display-mode-regression", "ready");
    }
  });
  await seedDraft(page);
  await expect(page.getByRole("combobox", { name: "界面风格" })).toHaveCount(0);
  const root = page.locator("html");
  const styleSwitch = page.getByRole("button", { name: "切换界面风格" });
  const displayMode = page.getByRole("combobox", { name: "显示模式" });
  const steps = page
    .getByRole("navigation", { name: "填写步骤" })
    .getByRole("button");
  const savedStatus = page
    .getByRole("status")
    .filter({ hasText: "已保存在此浏览器" });
  await expect(root).toHaveAttribute("data-style", "submission");
  await expect(styleSwitch).toHaveText("风格：臣服");
  await expect(styleSwitch).toHaveAttribute("aria-pressed", "false");
  await expect(displayMode).toHaveValue("light");
  await expect(displayMode.locator("option")).toHaveText([
    "跟随系统",
    "日间",
    "夜间",
  ]);
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--primary")
        .trim(),
    ),
  ).toBe("#7f1f3d");
  // 用真实输入与评级修改草稿，避免仅验证准备数据而漏掉切换时重置编辑状态。
  const name = "风格切换后保留的合成姓名";
  await page.locator("#basic-name").fill(name);
  await steps.nth(1).click();
  await page.locator('label[for="grade-1-B"]').click();
  await expect(page.locator("#grade-1-B")).toBeChecked();
  const measurements = [];
  const appearances = [
    {
      style: "submission",
      label: "臣服",
      backgrounds: { light: "rgb(241, 232, 219)", dark: "rgb(13, 11, 14)" },
    },
    {
      style: "midnight",
      label: "午夜",
      backgrounds: { light: "rgb(226, 229, 234)", dark: "rgb(10, 15, 22)" },
    },
  ];
  for (const { style, label, backgrounds } of appearances) {
    if (style === "midnight") await styleSwitch.click();
    await expect(root).toHaveAttribute("data-style", style);
    await expect(styleSwitch).toHaveText(`风格：${label}`);
    await expect(styleSwitch).toHaveAttribute(
      "aria-pressed",
      String(style === "midnight"),
    );
    for (const mode of ["light", "dark"]) {
      await displayMode.selectOption(mode);
      // 检查实际绘制颜色，确保 data-style 的变化确实应用了第二套色板。
      await expect(page.locator("body")).toHaveCSS(
        "background-color",
        backgrounds[mode],
      );
      for (const width of [375, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        for (let step = 1; step <= 3; step += 1) {
          await steps.nth(step - 1).click();
          await expect(page.locator("#step-heading")).toHaveText(
            ["基础信息", "喜好自评", "照片及导出"][step - 1],
          );
          if (step === 1) {
            await expect(page.locator("#basic-name")).toHaveValue(name);
            if (style === "midnight")
              await expect(page.locator("#basic-name")).toHaveCSS(
                "background-color",
                mode === "light" ? "rgb(233, 237, 242)" : "rgb(16, 23, 34)",
              );
          }
          if (step === 2)
            await expect(page.locator("#grade-1-B")).toBeChecked();
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - window.innerWidth,
          );
          expect(
            overflow,
            `${style}/${mode}/${width}/step${step}`,
          ).toBeLessThanOrEqual(1);
          measurements.push({ style, mode, width, step, overflow });
          if (style === "midnight" && width === 1440 && step === 1)
            await page.screenshot({
              path: testInfo.outputPath(`midnight-${mode}-1440.png`),
            });
        }
      }
      await page.setViewportSize({ width: 375, height: 900 });
      await steps.nth(1).click();
      await expect(page.locator("#grade-1-B")).toBeChecked();
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
        `${style}/${mode}/375 accessibility`,
      ).toEqual([]);
      await page.screenshot({
        path: testInfo.outputPath(`${style}-${mode}-375.png`),
      });
    }

    await displayMode.selectOption("light");
    // 阶段也通过防抖保存，等成功后刷新才能断言恢复到第二步。
    await expect(savedStatus).toBeVisible();
    await page.reload();
    // 刷新保留旧页租约；等编辑权恢复后再导航，避免把只读状态误测为外观回归。
    await expect(page.locator("#grade-1-B")).toBeEnabled({ timeout: 16_000 });
    await expect(root).toHaveAttribute("data-style", style);
    await expect(styleSwitch).toHaveText(`风格：${label}`);
    await expect(styleSwitch).toHaveAttribute(
      "aria-pressed",
      String(style === "midnight"),
    );
    await expect(displayMode).toHaveValue("light");
    await expect(root).not.toHaveClass(/dark/);
    await expect(page.locator("body")).toHaveCSS(
      "background-color",
      backgrounds.light,
    );
    await steps.first().click();
    await expect(page.locator("#basic-name")).toHaveValue(name);
    await steps.nth(1).click();
    await expect(page.locator("#grade-1-B")).toBeChecked();

    await displayMode.selectOption("system");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(root).toHaveClass(/dark/);
    await expect(page.locator("body")).toHaveCSS(
      "background-color",
      backgrounds.dark,
    );
    await expect(savedStatus).toBeVisible();
    await page.reload();
    await expect(page.locator("#grade-1-B")).toBeEnabled({ timeout: 16_000 });
    await expect(displayMode).toHaveValue("system");
    await expect(root).toHaveAttribute("data-style", style);
    await expect(root).toHaveClass(/dark/);
    await page.emulateMedia({ colorScheme: "light" });
    await expect(root).not.toHaveClass(/dark/);
    await expect(page.locator("body")).toHaveCSS(
      "background-color",
      backgrounds.light,
    );
  }

  await expect(page.locator(".theme-atmosphere")).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  const atmosphereOrbs = page.locator(".theme-atmosphere span");
  expect(await atmosphereOrbs.count()).toBeGreaterThan(0);
  for (const orb of await atmosphereOrbs.all())
    await expect(orb).toHaveCSS("animation-name", "none");
  await styleSwitch.click();
  await expect(root).toHaveAttribute("data-style", "submission");
  await expect(styleSwitch).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".theme-atmosphere")).toHaveCSS("display", "block");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    appearances[0].backgrounds.light,
  );
  // 切回后的刷新需覆盖旧午夜偏好，不能仅以初始默认值证明臣服风格可恢复。
  await expect(savedStatus).toBeVisible();
  await page.reload();
  await expect(page.locator("#grade-1-B")).toBeEnabled({ timeout: 16_000 });
  await expect(root).toHaveAttribute("data-style", "submission");
  await expect(styleSwitch).toHaveText("风格：臣服");
  await expect(styleSwitch).toHaveAttribute("aria-pressed", "false");
  await expect(displayMode).toHaveValue("system");
  await expect(page.locator(".theme-atmosphere")).toHaveCSS("display", "block");
  await steps.first().click();
  await expect(page.locator("#basic-name")).toHaveValue(name);
  await steps.nth(1).click();
  await expect(page.locator("#grade-1-B")).toBeChecked();
  await testInfo.attach("layout-matrix", {
    body: JSON.stringify(measurements),
    contentType: "application/json",
  });
});
