/**
 * 生产环境预览服务器
 *
 * 职责：服务 dist/ 静态文件 + 将 /api 请求代理到后端 (localhost:8081)。
 * 用于 frp 内网穿透场景，替代 vite dev server，避免大量模块请求导致代理超时。
 *
 * 用法：node serve.js
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(__dirname, 'dist')
const BACKEND = 'http://localhost:8081'
const PORT = 5173

/** MIME 类型映射 */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.webp': 'image/webp',
}

const server = http.createServer((req, res) => {
  // /api 请求代理到后端
  if (req.url.startsWith('/api')) {
    const proxyReq = http.request(`${BACKEND}${req.url}`, {
      method: req.method,
      headers: { ...req.headers, host: new URL(BACKEND).host }
    }, proxyRes => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers)
      proxyRes.pipe(res)
    })
    proxyReq.on('error', () => {
      res.writeHead(502)
      res.end('Backend unavailable')
    })
    req.pipe(proxyReq)
    return
  }

  // 静态文件服务
  let filePath = path.join(DIST, req.url === '/' ? 'index.html' : req.url)
  // 去除查询参数（如 ?v=xxx）
  filePath = filePath.split('?')[0]
  // SPA fallback：非文件路径一律返回 index.html
  if (!path.extname(filePath)) {
    filePath = path.join(DIST, 'index.html')
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // 兜底返回 index.html（SPA 路由）
      fs.readFile(path.join(DIST, 'index.html'), (e, html) => {
        if (e) { res.writeHead(404); res.end('Not Found'); return }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(html)
      })
      return
    }
    const ext = path.extname(filePath)
    const contentType = MIME[ext] || 'application/octet-stream'

    // 静态资源（带 hash 的文件）设置长期缓存，index.html 不缓存
    const isAsset = /-[A-Za-z0-9]{8,}\.\w+$/.test(path.basename(filePath))
    const cacheControl = isAsset ? 'public, max-age=31536000, immutable' : 'no-cache'

    // gzip 压缩：客户端支持且文件 > 1KB 时压缩
    const acceptEncoding = req.headers['accept-encoding'] || ''
    if (acceptEncoding.includes('gzip') && data.length > 1024) {
      zlib.gzip(data, (err, compressed) => {
        if (err) {
          res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': cacheControl })
          res.end(data)
          return
        }
        res.writeHead(200, {
          'Content-Type': contentType,
          'Content-Encoding': 'gzip',
          'Cache-Control': cacheControl
        })
        res.end(compressed)
      })
    } else {
      res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': cacheControl })
      res.end(data)
    }
  })
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Preview server running: http://0.0.0.0:${PORT}`)
  console.log(`Serving static files from: ${DIST}`)
  console.log(`Proxying /api → ${BACKEND}`)
})
