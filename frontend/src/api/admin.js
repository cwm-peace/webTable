/**
 * 管理员 API 模块
 *
 * 职责：封装管理员系统的所有 HTTP 接口。
 * 包括登录、提交列表查询、详情查询、PDF 导出。
 * 管理员 token 存储在 localStorage 中，通过请求头传递。
 */
import axios from 'axios'
import request from './index'

/**
 * 管理员登录
 *
 * @param {string} password 管理员密码
 * @returns {Promise} 包含 adminToken 的响应
 */
export function adminLogin(password) {
  return request.post('/admin/login', { password })
}

/**
 * 获取所有已提交的列表
 *
 * @returns {Promise} 提交列表
 */
export function getSubmissionList() {
  return request.get('/admin/submissions')
}

/**
 * 获取单个提交的完整详情
 *
 * @param {number} submissionId 提交记录ID
 * @returns {Promise} 完整详情
 */
export function getSubmissionDetail(submissionId) {
  return request.get(`/admin/submissions/${submissionId}`)
}

/**
 * 导出单个提交的 PDF
 *
 * 使用原生 axios（不走统一拦截器），因为响应是二进制 blob。
 *
 * @param {number} submissionId 提交记录ID
 */
export async function exportPdf(submissionId) {
  const token = localStorage.getItem('adminToken')
  const response = await axios.get(`/api/admin/export-pdf/${submissionId}`, {
    responseType: 'blob',
    headers: { 'X-Admin-Token': token }
  })

  // 从响应头提取文件名
  const contentDisposition = response.headers['content-disposition']
  let filename = 'webtable_export.pdf'
  if (contentDisposition) {
    const match = contentDisposition.match(/filename="?(.+)"?/)
    if (match) {
      filename = decodeURIComponent(match[1])
    }
  }

  // 触发浏览器下载
  const blob = new Blob([response.data], { type: 'application/pdf' })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.URL.revokeObjectURL(url)
}
