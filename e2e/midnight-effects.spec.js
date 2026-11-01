/** 两套风格的原型动效回归：只用虚构草稿，以浏览器动画时间和实际绘制样式验证效果。 */
import { test, expect } from "@playwright/test";
import { seedDraft } from "./helpers.js";

const effects = [
  [".draft-id .prototype-seal", null, "4.2s", ["transform"]],
  [".draft-id .prototype-seal", "::after", "4.2s", ["transform", "opacity"]],
  [".glow-one", null, "13s, 4.2s", ["transform", "opacity"]],
  [".glow-two", null, "17s, 4.2s", ["transform", "opacity"]],
  [".glow-three", null, "11s, 4.2s", ["transform", "opacity"]],
  [".theme-dust i", null, "9s", ["transform", "opacity"]],
  [".prototype-progress-fill", null, "3.2s", ["background-position"]],
  [".form-actions .bg-primary", null, "4.2s", ["transform", "box-shadow"]],
];

/**
 * 临时暂停动画并推进到确定的采样时间，读取真实渲染属性；调用方截图后恢复播放。
 * @param {import('@playwright/test').Page} page 当前页面
 * @param {number} time 动画开始后的毫秒数，延迟单独计入
 * @returns {Promise<Array<{duration:string, values:string[]}>>} 各目标的实际样式
 */
async function sampleEffects(page, time) {
  return page.evaluate(
    ({ effects, time }) => {
      for (const animation of document.getAnimations()) {
        if (!("animationName" in animation)) continue;
        animation.pause();
        animation.currentTime =
          time + Number(animation.effect.getTiming().delay);
      }
      return effects.map(([selector, pseudo, , properties]) => {
        const style = getComputedStyle(
          document.querySelector(selector),
          pseudo,
        );
        return {
          duration: style.animationDuration,
          values: properties.map((key) => style.getPropertyValue(key)),
        };
      });
    },
    { effects, time },
  );
}

for (const [style, mode] of [
  ["submission", "light"],
  ["submission", "dark"],
  ["midnight", "light"],
  ["midnight", "dark"],
]) {
  test(`原型动效在${style}/${mode}实际变化，徽记响应布局且填写可继续`, async ({
    page,
    browserName,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await seedDraft(page, { name: "合成动效资料" });
    if (style === "midnight")
      await page.getByRole("button", { name: "切换界面风格" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-style", style);
    await page.getByRole("combobox", { name: "显示模式" }).selectOption(mode);
    const backgrounds = {
      submission: { light: "rgb(241, 232, 219)", dark: "rgb(13, 11, 14)" },
      midnight: { light: "rgb(226, 229, 234)", dark: "rgb(10, 15, 22)" },
    };
    await expect(page.locator("body")).toHaveCSS(
      "background-color",
      backgrounds[style][mode],
    );
    await expect(page.locator(".theme-atmosphere")).toBeVisible();
    await expect(page.locator(".draft-id .prototype-seal")).toBeVisible();
    await expect(page.locator(".prototype-seal:visible")).toHaveCount(1);
    await expect(page.locator(".draft-id .prototype-seal svg")).toHaveAttribute(
      "viewBox",
      "0 0 24 24",
    );
    await expect(page.locator(".theme-dust i")).toHaveCount(6);
    const first = await sampleEffects(page, 1000);
    try {
      await page.screenshot({
        path: testInfo.outputPath(`${style}-${mode}-1000ms.png`),
      });
      const second = await sampleEffects(page, 2100);
      for (const [
        index,
        [selector, pseudo, duration, properties],
      ] of effects.entries()) {
        expect(first[index].duration, `${selector}${pseudo || ""}`).toBe(
          duration,
        );
        for (const [propertyIndex, property] of properties.entries())
          expect(
            second[index].values[propertyIndex],
            `${selector}${pseudo || ""} ${property}`,
          ).not.toBe(first[index].values[propertyIndex]);
      }
      await page.screenshot({
        path: testInfo.outputPath(`${style}-${mode}-2100ms.png`),
      });
    } finally {
      await page.evaluate(() =>
        document.getAnimations().forEach((animation) => animation.play()),
      );
    }
    const nextButton = page.getByRole("button", { name: "检查并进入自评" });
    await nextButton.focus();
    // macOS WebKit 的普通 Tab 默认跳过按钮，Option+Tab 才遍历所有可交互控件。
    await page.keyboard.press(
      browserName === "webkit" ? "Alt+Shift+Tab" : "Shift+Tab",
    );
    await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
    await expect(nextButton).toBeFocused();
    await expect(nextButton).toHaveCSS("outline-style", "solid");
    await expect(nextButton).toHaveCSS("outline-width", "2px");
    await page.locator("#basic-name").fill("切换后保留的合成资料");
    await page.getByRole("button", { name: "检查并进入自评" }).click();
    await page.locator('label[for="grade-1-B"]').click();
    await page
      .locator(".question-card")
      .first()
      .getByRole("button", { name: /展开备注/ })
      .click();
    await page.locator("#remark-1").fill("");
    await expect(
      page.getByRole("progressbar", { name: "喜好自评完成进度" }),
    ).toHaveAttribute("value", "124");
    await expect(
      page.getByRole("progressbar", { name: "喜好自评完成进度" }),
    ).toHaveAttribute("max", "125");
    expect(
      await page
        .locator(".prototype-progress-fill")
        .evaluate((element) => parseFloat(element.style.width)),
    ).toBeCloseTo(99.2);
    await page.getByRole("button", { name: "上一步", exact: true }).click();
    await expect(page.locator("#basic-name")).toHaveValue(
      "切换后保留的合成资料",
    );
    for (const width of [375, 768]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect(page.locator(".brand .mobile-draft-seal")).toBeVisible();
      await expect(page.locator(".prototype-seal:visible")).toHaveCount(1);
      await expect(page.locator(".draft-id .prototype-seal")).toBeHidden();
      await page.screenshot({
        path: testInfo.outputPath(`${style}-${mode}-${width}.png`),
      });
    }
  });
}

test("原型动效在两套风格遵循减少动态效果，取消设置与切回臣服后恢复", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await seedDraft(page);
  for (const [index, style] of [
    "submission",
    "midnight",
    "submission",
  ].entries()) {
    if (index > 0)
      await page.getByRole("button", { name: "切换界面风格" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-style", style);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect
      .poll(() =>
        page.evaluate(
          (effects) =>
            effects.map(
              ([selector, pseudo]) =>
                getComputedStyle(document.querySelector(selector), pseudo)
                  .animationName,
            ),
          effects,
        ),
      )
      .toEqual(effects.map(() => "none"));
    await expect(page.locator(".theme-dust")).toHaveCSS("display", "none");
    await expect(page.locator(".theme-dust i").first()).toBeHidden();
    await expect(page.locator(".theme-atmosphere")).toBeVisible();
    await expect(page.locator(".prototype-seal:visible")).toHaveCount(1);
    await expect(page.locator(".prototype-progress-fill")).toBeVisible();
    await page.emulateMedia({ reducedMotion: "no-preference" });
    // 容器仅含绝对定位粒子，高度可为零；可见性应由实际绘制的粒子验证。
    await expect(page.locator(".theme-dust")).toHaveCSS("display", "block");
    await expect(page.locator(".theme-dust i").first()).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          (effects) =>
            effects.map(([selector, pseudo]) => {
              const computed = getComputedStyle(
                document.querySelector(selector),
                pseudo,
              );
              return [
                computed.animationName !== "none",
                computed.animationDuration,
              ];
            }),
          effects,
        ),
      )
      .toEqual(effects.map(([, , duration]) => [true, duration]));
  }
});
