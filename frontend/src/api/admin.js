/**
 * 管理员 API 模块
 *
 * 职责：封装管理员系统的所有 HTTP 接口。
 * 包括登录、退出登录、提交列表查询、详情查询、PDF 导出。
 * 管理员 token 存储在 localStorage 中，通过请求头传递。
 */
import axios from 'axios'
import request from './index'
import { getAdminToken, handleAdminUnauthorized } from '../lib/adminAuth'
import { blobErrorMessage, downloadBlob, filenameFromHeaders } from './download'

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
 * 管理员退出登录
 *
 * @returns {Promise} 退出登录响应
 */
export function adminLogout() {
  return request.post('/admin/logout')
}

/**
 * 分页获取已提交的列表
 *
 * @param {number} page 当前页码
 * @param {number} pageSize 每页数量
 * @returns {Promise} 提交列表
 */
export function getSubmissionList(page = 1, pageSize = 20) {
  return request.get('/admin/submissions', {
    params: { page, pageSize }
  })
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
  const token = getAdminToken()
  const response = await axios.get(`/api/admin/export-pdf/${submissionId}`, {
    responseType: 'blob',
    validateStatus: status => status >= 200 && status < 600,
    headers: { 'X-Admin-Token': token }
  })
  if (response.status === 401) {
    handleAdminUnauthorized()
    throw new Error('管理员未登录或 token 已过期')
  }
  if (response.status !== 200) {
    throw new Error(await blobErrorMessage(response, 'PDF 导出失败'))
  }

  downloadBlob(response.data, filenameFromHeaders(response.headers, 'webtable_export.pdf'), 'application/pdf')
}
