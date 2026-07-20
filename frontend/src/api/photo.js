/**
 * 照片 API 模块
 *
 * 职责：封装照片上传、查询、下载和删除的所有 HTTP 接口。
 * 照片按类别分组（selfie-自拍 nude-裸照 dick-狗屌 other-其他）。
 */
import request from './index'

/**
 * 上传照片
 *
 * @param {number} submissionId 提交记录ID
 * @param {string} category 照片类别（selfie/nude/dick/other）
 * @param {File} file 照片文件
 * @param {object} options axios 上传配置（进度、超时等）
 * @returns {Promise} 操作结果
 */
export function uploadPhoto(submissionId, category, file, options = {}) {
  const formData = new FormData()
  formData.append('file', file, file.name || 'photo.jpg')
  formData.append('category', category)
  return request.post(`/photo/${submissionId}`, formData, {
    timeout: options.timeout || 120000,
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: options.onUploadProgress
  })
}

/**
 * 查询指定类别的照片列表（仅元信息，不含二进制数据）
 *
 * @param {number} submissionId 提交记录ID
 * @param {string} category 照片类别
 * @returns {Promise} 照片元信息列表
 */
export function listPhotos(submissionId, category) {
  return request.get(`/photo/list/${submissionId}`, { params: { category } })
}

/**
 * 获取照片下载 URL（供 img 标签 src 使用）
 *
 * @param {number} photoId 照片记录ID
 * @returns {string} 照片下载 URL
 */
export function getPhotoUrl(photoId) {
  return `/api/photo/download/${photoId}`
}

/**
 * 删除照片
 *
 * @param {number} photoId 照片记录ID
 * @returns {Promise} 操作结果
 */
export function deletePhoto(photoId) {
  return request.delete(`/photo/${photoId}`)
}
