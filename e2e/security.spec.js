/** 合成输入验证本机数据边界、CSP、临时清理和年龄门槛的多标签页恢复。 */
import { test, expect } from "@playwright/test";
import { acceptAge, seedDraft, goToExport } from "./helpers.js";

test("静态安全头与端点限制，生成PDF不发送填写内容", async ({
  page,
  request,
}) => {
  const requests = [];
  page.on("request", (item) =>
    requests.push({
      url: item.url(),
      method: item.method(),
      body: item.postData(),
    }),
  );
  const response = await page.goto("/");
  const origin = new URL(page.url()).origin;
  const policy = response.headers()["content-security-policy"];
  expect(policy).toContain("default-src 'none'");
  expect(policy).toContain("script-src 'self'");
  expect(policy).toContain("connect-src 'self'");
  expect(response.headers()["referrer-policy"]).toBe("no-referrer");
  for (const path of ["/api/form/current", "/admin"])
    expect((await request.get(path)).status()).toBe(404);
  expect(
    (
      await request.post("/api/form/current", { data: { synthetic: "test" } })
    ).status(),
  ).toBe(405);
  const blocked = await page.evaluate(async () => {
    try {
      await fetch("https://external.invalid/security-probe", {
        method: "POST",
        body: "synthetic",
      });
      return false;
    } catch {
      return true;
    }
  });
  expect(blocked).toBe(true);
  requests.length = 0;
  await seedDraft(page, { name: "NETWORK_BOUNDARY_SYNTHETIC_742" });
  await goToExport(page);
  await page
    .getByRole("button", { name: "检查并生成 PDF", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "PDF 已生成", exact: true }),
  ).toBeVisible({ timeout: 60000 });
  const network = requests.filter((item) => /^https?:/.test(item.url));
  expect(network.every((item) => new URL(item.url).origin === origin)).toBe(
    true,
  );
  expect(network.every((item) => item.method === "GET" && !item.body)).toBe(
    true,
  );
  expect(network.some((item) => /\/api\/|\/admin/.test(item.url))).toBe(false);
  expect(
    network.some((item) => item.url.includes("NETWORK_BOUNDARY_SYNTHETIC_742")),
  ).toBe(false);
});

test("恶意字符串保持文本，不创建元素或执行脚本", async ({ page }) => {
  await acceptAge(page);
  const value =
    '<img src=x onerror="window.__injected=1"><script>window.__injected=2</script>';
  await page.locator("#basic-selfDescription").fill(value);
  await expect(
    page.getByRole("status").filter({ hasText: "已保存在此浏览器" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator("#basic-selfDescription")).toHaveValue(value);
  expect(await page.evaluate(() => window.__injected)).toBeUndefined();
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
});

test("存储失败需明确选择临时模式，清内存并说明磁盘无法验证", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", {
      configurable: true,
      value: {
        open() {
          throw new DOMException("Synthetic denied storage", "SecurityError");
        },
      },
    });
  });
  await page.goto("/");
  await expect(
    page.getByText(
      "浏览器存储不可用。您可以选择临时填写，内容仅保留在当前页面，刷新或关闭会丢失。",
    ),
  ).toBeVisible();
  await expect(page.locator("#basic-name")).toHaveCount(0);
  await page
    .getByRole("button", { name: "我了解，改用临时填写", exact: true })
    .click();
  await page.locator("#age-confirm").check();
  await page.getByRole("button", { name: "确认并开始", exact: true }).click();
  await page.locator("#basic-name").fill("临时合成资料");
  await expect(
    page.getByRole("status").filter({ hasText: "临时填写" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "清除本应用数据", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "确认清除", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "当前页面内容已清除", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "无法确认此前的磁盘草稿已清除",
  );
  await expect(page.locator("#basic-name")).toHaveCount(0);
  await page.getByRole("button", { name: "开始新表单", exact: true }).click();
  await expect(page.locator("#age-confirm")).not.toBeChecked();
});

test("两个年龄确认页在首个标签页关闭后可继续", async ({ page, context }) => {
  await page.goto("/");
  await page.locator("#age-confirm").check();
  await expect(
    page.getByRole("button", { name: "确认并开始", exact: true }),
  ).toBeEnabled();
  const second = await context.newPage();
  await second.goto("/");
  await second.locator("#age-confirm").check();
  await expect(
    second.getByRole("button", { name: "确认并开始", exact: true }),
  ).toBeDisabled();
  await expect(
    second.getByRole("button", { name: "重新读取草稿", exact: true }),
  ).toBeVisible();
  await page.close();
  await expect(
    second.getByRole("button", { name: "确认并开始", exact: true }),
  ).toBeEnabled({ timeout: 16000 });
  await second.getByRole("button", { name: "确认并开始", exact: true }).click();
  await expect(second.locator("#basic-name")).toBeEnabled();
});
