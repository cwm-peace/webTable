/**
 * 导出 API 模块
 *
 * 职责：封装 Excel 导出的 HTTP 接口。
 * 导出所有已完成提交的数据为 .xlsx 文件。
 */
import axios from 'axios'
import { getAdminToken, handleAdminUnauthorized } from '../lib/adminAuth'
import { blobErrorMessage, downloadBlob, filenameFromHeaders } from './download'

/**
 * 导出所有已完成提交的数据为 Excel
 *
 * 使用原生 axios（不走统一拦截器）直接下载文件，
 * 因为响应类型是二进制 blob，需要特殊处理。
 * 该接口仅供管理员系统使用，必须携带 X-Admin-Token。
 * 下载后自动触发浏览器保存文件对话框。
 */
export async function exportAll() {
  const token = getAdminToken()
  const response = await axios.get('/api/export/all', {
    responseType: 'blob',
    validateStatus: status => status >= 200 && status < 600,
    headers: { 'X-Admin-Token': token }
  })
  if (response.status === 401) {
    handleAdminUnauthorized()
    throw new Error('管理员未登录或 token 已过期')
  }
  if (response.status !== 200) {
    throw new Error(await blobErrorMessage(response, 'Excel 导出失败'))
  }

  downloadBlob(
    response.data,
    filenameFromHeaders(response.headers, 'webtable_export.xlsx'),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )
}
