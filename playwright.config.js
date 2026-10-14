/** 使用生产静态构建检查三类浏览器内核；每次启动独立测试服务器。 */
import { defineConfig, devices } from "@playwright/test";
const port = process.env.WEBTABLE_TEST_PORT || "5180";
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 12_000 },
  fullyParallel: false,
  workers: 2,
  retries: 0,
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/e2e-results.json" }],
  ],
  use: {
    baseURL,
    acceptDownloads: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: "node scripts/static-server.mjs",
    env: { PORT: port },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
