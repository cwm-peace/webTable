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
    // 目标浏览器：Safari 14+、Chrome 87+、Edge 88+、Firefox 88+
    // 覆盖：macOS Safari、iOS Safari 14+、Chrome/Edge 现代版本、鸿蒙（Chromium 内核）
    target: ['es2015', 'chrome87', 'safari14', 'edge88', 'firefox88']
  },
  server: {
    port: 5173,
    allowedHosts: ['sj.frp.one'],
    proxy: {
      '/api': {
        target: 'http://localhost:8081',
        changeOrigin: true
      }
    }
  }
})
