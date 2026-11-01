/** 原型交互的真实浏览器回归：仅使用虚构资料，覆盖键盘、备注、阶段恢复和确认清空。 */
import { test, expect } from "@playwright/test";
import { seedDraft, storageSummary } from "./helpers.js";

test("窄平板断点仍为每个 radio 保留完整等级含义", async ({ page }) => {
  await page.setViewportSize({ width: 660, height: 900 });
  await seedDraft(page, { currentStep: 2, emptyAnswers: true, images: [] });
  await expect(page.locator("#grade-1-A")).toHaveAccessibleName(/超级喜欢/);
  await expect(page.locator("#grade-1-E")).toHaveAccessibleName(/绝对不接受/);
});

test("A–E 与数字快捷键只作用于当前题，备注输入不触发评级", async ({ page }) => {
  await seedDraft(page, { currentStep: 2, emptyAnswers: true, images: [] });
  const first = page.locator("#grade-1-A");
  await expect(first).toBeVisible();
  await first.focus();
  await page.keyboard.press("e");
  await expect(page.locator("#grade-1-E")).toBeChecked();
  await page.keyboard.press("2");
  await expect(page.locator("#grade-1-B")).toBeChecked();
  await expect(page.locator("#remark-1")).toHaveValue("无");
  await page
    .locator(".question-card")
    .first()
    .getByRole("button", { name: /展开备注/ })
    .click();
  await expect(page.locator("#remark-1")).toBeFocused();
  await page.locator("#remark-1").fill("ABCDE12345 虚构说明");
  await expect(page.locator("#grade-1-B")).toBeChecked();
  await page
    .getByRole("button", { name: "将本题备注设为“不适用”", exact: true })
    .first()
    .click();
  await expect(page.locator("#remark-1")).toHaveValue("不适用");
  await page.locator('label[for="grade-1-E"]').click();
  await expect(page.locator("#remark-1")).toHaveValue("不适用");
  await page.getByRole("button", { name: "下一未完成项" }).click();
  await expect(page.locator("#grade-2-A")).toBeFocused();
});

test("阶段和备注刷新后恢复，错误定位展开备注且修正时不抢走焦点", async ({
  page,
}) => {
  await seedDraft(page, { currentStep: 2, images: [] });
  await expect(page.locator("#grade-1-A")).toBeVisible();
  await page
    .locator(".question-card")
    .first()
    .getByRole("button", { name: /展开备注/ })
    .click();
  await page.locator("#remark-1").fill("");
  await page.getByRole("button", { name: "检查并添加照片" }).click();
  await expect(page.locator("#issues-title")).toContainText("1 项");
  await page
    .getByRole("button", {
      name: "请填写第1项备注，没有内容可填“无”",
      exact: true,
    })
    .click();
  await expect(page.locator("#remark-1")).toBeFocused();
  await page.locator("#remark-1").fill("虚构补充");
  await expect(page.locator("#issues-title")).toHaveCount(0);
  await expect(page.locator("#remark-1")).toBeFocused();
  await page.getByRole("button", { name: "检查并添加照片" }).click();
  await expect(page.locator("#step-heading")).toHaveText("照片及导出");
  await expect
    .poll(async () => (await storageSummary(page)).currentStep)
    .toBe(3);
  await page.reload();
  await expect(page.locator("#step-heading")).toHaveText("照片及导出");
  // 刷新产生新的页面租约；等旧租约到期并重读取回编辑权后再操作。
  await expect(page.locator("#photo-selfie-1")).toBeEnabled({
    timeout: 16_000,
  });
  await page.getByRole("button", { name: /喜好自评/ }).click();
  await page
    .locator(".question-card")
    .first()
    .getByRole("button", { name: /展开备注/ })
    .click();
  await expect(page.locator("#remark-1")).toHaveValue("虚构补充");
});

test("清空自评必须明确确认，保留其他资料并可刷新恢复清空结果", async ({
  page,
}) => {
  await seedDraft(page, { currentStep: 2, images: [] });
  await page.getByRole("button", { name: "清空自评", exact: true }).click();
  await page.getByRole("button", { name: "保留自评", exact: true }).click();
  await expect(page.locator("#grade-1-A")).toBeChecked();
  await page.getByRole("button", { name: "清空自评", exact: true }).click();
  await page.getByRole("button", { name: "确认清空自评", exact: true }).click();
  await expect(page.locator("#grade-1-A")).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "清空自评", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("status").filter({ hasText: "已保存在此浏览器" }),
  ).toBeVisible();
  expect((await storageSummary(page)).name).toBe("测试本地草稿");
  await page.reload();
  await expect(page.locator("#grade-1-A")).not.toBeChecked();
  await expect(page.locator("#remark-1")).toHaveValue("");
});

test("第二标签页只读，不能用评级快捷键或清空按钮改写草稿", async ({
  page,
  context,
}) => {
  await seedDraft(page, { currentStep: 2, images: [] });
  const second = await context.newPage();
  await second.goto("/");
  await expect(second.locator("#grade-1-A")).toBeDisabled();
  await expect(
    second.getByRole("button", { name: "清空自评", exact: true }),
  ).toBeDisabled();
  await second.locator(".question-card").first().focus();
  await second.keyboard.press("E");
  await expect(second.locator("#grade-1-A")).toBeChecked();
  await expect(page.locator("#grade-1-A")).toBeChecked();
});

test("未记录阶段的旧草稿和异常阶段值都安全回到基础信息", async ({ page }) => {
  for (const currentStep of [null, 99, "2"]) {
    await seedDraft(page, { currentStep, images: [] });
    await expect(page.locator("#step-heading")).toHaveText("基础信息");
    await expect(page.locator("#basic-name")).toHaveValue("测试本地草稿");
    await expect(page.locator("#basic-name")).toBeEnabled();
  }
});

test("另一标签页清理后关闭旧自评确认框，不恢复旧答案", async ({
  page,
  context,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await seedDraft(page, { currentStep: 2, images: [] });
  await page.getByRole("button", { name: "清空自评", exact: true }).click();
  // 模拟后台标签页停止续租，让第二页经正式租约流程接管后再清理。
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent("pagehide")),
  );
  const second = await context.newPage();
  await second.goto("/");
  await expect(second.locator("#grade-1-A")).toBeEnabled({ timeout: 16_000 });
  await second
    .getByRole("button", { name: "清除本应用数据", exact: true })
    .click();
  await second.getByRole("button", { name: "确认清除", exact: true }).click();
  await page.bringToFront();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "应用内填写数据已清除" }),
  ).toBeVisible();
  expect(await storageSummary(page)).toMatchObject({ draft: false, photos: 0 });
  expect(errors).toEqual([]);
});
