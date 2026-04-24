/**
 * Vite 配置文件
 *
 * 职责：配置 Vite 构建工具的行为。
 * - Tailwind CSS v4 Vite 插件
 * - @ 路径别名（shadcn-vue 组件导入需要）
 * - 开发服务器代理（/api → localhost:8081）
 */
import path from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  build: {
    // 覆盖所有现代浏览器（Chrome 87+、Safari 14+、Edge 88+、Firefox 88+、鸿蒙 Chromium 内核）
    target: 'chrome87'
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8081',
        changeOrigin: true
      }
    }
  }
})
