/**
 * 二进制下载工具模块
 *
 * 职责：集中处理 PDF/Excel 等 blob 响应的文件名解析、下载触发和错误消息提取。
 * 原生 axios 下载不走统一 JSON 拦截器，因此这里补齐统一错误响应的解析能力。
 */

/**
 * 从响应头中提取文件名，优先使用 filename* (RFC 5987)。
 *
 * @param {object} headers 响应头
 * @param {string} defaultFilename 默认文件名
 * @returns {string} 下载文件名
 */
export function filenameFromHeaders(headers, defaultFilename) {
  const contentDisposition = headers?.['content-disposition']
  if (!contentDisposition) {
    return defaultFilename
  }

  const starredMatch = contentDisposition.match(/filename\*=UTF-8''(.+)/i)
  if (starredMatch) {
    return decodeURIComponent(starredMatch[1])
  }

  const match = contentDisposition.match(/filename="?([^";\s]+)"?/)
  return match ? match[1] : defaultFilename
}

/**
 * 触发浏览器保存 blob 文件。
 *
 * @param {Blob|ArrayBuffer} data 二进制响应体
 * @param {string} filename 文件名
 * @param {string} mimeType MIME 类型
 */
export function downloadBlob(data, filename, mimeType) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.URL.revokeObjectURL(url)
}

/**
 * 从 blob 错误响应中提取后端统一 ApiResponse.message。
 *
 * @param {object} response axios 响应对象
 * @param {string} fallbackMessage 默认错误文案
 * @returns {Promise<string>} 错误文案
 */
export async function blobErrorMessage(response, fallbackMessage) {
  const data = response?.data
  if (!data) {
    return fallbackMessage
  }

  if (data instanceof Blob) {
    const text = await data.text()
    if (!text) {
      return fallbackMessage
    }
    try {
      const parsed = JSON.parse(text)
      return parsed.message || fallbackMessage
    } catch {
      return fallbackMessage
    }
  }

  return data.message || fallbackMessage
}
