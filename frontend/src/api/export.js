/**
 * 导出 API 模块
 *
 * 职责：封装 Excel 导出的 HTTP 接口。
 * 导出所有已完成提交的数据为 .xlsx 文件。
 */
import axios from 'axios'

/**
 * 导出所有已完成提交的数据为 Excel
 *
 * 使用原生 axios（不走统一拦截器）直接下载文件，
 * 因为响应类型是二进制 blob，需要特殊处理。
 * 下载后自动触发浏览器保存文件对话框。
 */
export async function exportAll() {
  const token = sessionStorage.getItem('sessionToken')
  const response = await axios.get('/api/export/all', {
    responseType: 'blob',
    headers: { 'X-Session-Token': token }
  })

  // 从响应头中提取文件名，优先使用 filename* (RFC 5987)
  const contentDisposition = response.headers['content-disposition']
  let filename = 'webtable_export.xlsx'
  if (contentDisposition) {
    const starredMatch = contentDisposition.match(/filename\*=UTF-8''(.+)/i)
    if (starredMatch) {
      filename = decodeURIComponent(starredMatch[1])
    } else {
      const match = contentDisposition.match(/filename="?([^";\s]+)"?/)
      if (match) {
        filename = match[1]
      }
    }
  }

  // 创建 Blob 对象并触发浏览器下载
  const blob = new Blob([response.data], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  // 释放 URL 对象，避免内存泄漏
  window.URL.revokeObjectURL(url)
}
