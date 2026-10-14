/** 静态站点构建：本地依赖、独立导出分包和可配置子路径；不配置后端代理。 */
import path from "node:path";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  base: process.env.WEBTABLE_BASE_PATH || "/",
  plugins: [vue(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
  // 编译目标只保证语法；实际 API、CSS 与系统下载流程仍需独立验证。
  build: {
    target: ["chrome111", "edge111", "firefox128", "safari16.4"],
    sourcemap: false,
  },
  worker: { format: "es" },
  server: { host: "127.0.0.1", port: 5174, strictPort: true },
});
