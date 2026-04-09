/**
 * 表单 API 模块
 *
 * 职责：封装表单生命周期管理和步骤数据读写的所有 HTTP 接口。
 * 包括创建提交、查询状态、完成提交、以及三步数据的读写操作。
 */
import request from './index'

/**
 * 创建新的提交记录
 *
 * 前端首次访问时调用，返回 submissionId 和 sessionToken。
 * sessionToken 存储在 sessionStorage 中供后续请求使用。
 *
 * @returns {Promise} 包含 submissionId 和 sessionToken 的响应
 */
export function createSubmission() {
  return request.post('/form')
}

/**
 * 查询提交状态
 *
 * 根据 sessionToken 查询当前步骤进度和完成状态。
 * 用于页面刷新后恢复填写进度。
 *
 * @returns {Promise} 包含 currentStep 和 completed 的响应
 */
export function getStatus() {
  return request.get('/form/status')
}

/**
 * 标记提交为已完成
 *
 * @returns {Promise} 操作结果
 */
export function completeSubmission() {
  return request.put('/form/complete')
}

// ==================== 第1步：基础信息 ====================

/**
 * 读取基础信息
 *
 * @param {number} submissionId 提交记录ID
 * @returns {Promise} 基础信息对象
 */
export function getStep1(submissionId) {
  return request.get(`/form/step1/${submissionId}`)
}

/**
 * 保存基础信息
 *
 * @param {number} submissionId 提交记录ID
 * @param {Object} data 基础信息数据
 * @returns {Promise} 操作结果
 */
export function saveStep1(submissionId, data) {
  return request.put(`/form/step1/${submissionId}`, data)
}

// ==================== 第3步：接受程度自评 ====================

/**
 * 读取左侧栏自评数据
 *
 * @param {number} submissionId 提交记录ID
 * @returns {Promise} 左侧栏自评列表
 */
export function getStep3Left(submissionId) {
  return request.get(`/form/step3/left/${submissionId}`)
}

/**
 * 保存左侧栏自评数据
 *
 * @param {number} submissionId 提交记录ID
 * @param {Array} rows 左侧栏行数据
 * @returns {Promise} 操作结果
 */
export function saveStep3Left(submissionId, rows) {
  return request.put(`/form/step3/left/${submissionId}`, rows)
}

/**
 * 读取右侧栏自评数据
 *
 * @param {number} submissionId 提交记录ID
 * @returns {Promise} 右侧栏自评列表
 */
export function getStep3Right(submissionId) {
  return request.get(`/form/step3/right/${submissionId}`)
}

/**
 * 保存右侧栏自评数据
 *
 * @param {number} submissionId 提交记录ID
 * @param {Array} rows 右侧栏行数据
 * @returns {Promise} 操作结果
 */
export function saveStep3Right(submissionId, rows) {
  return request.put(`/form/step3/right/${submissionId}`, rows)
}

// ==================== 模板数据 ====================

/**
 * 获取左侧栏评估项目模板
 *
 * 返回预设的左侧栏评估项目列表，前端新用户首次加载第3步时使用。
 *
 * @returns {Promise} 左侧栏模板列表
 */
export function getLeftTemplate() {
  return request.get('/form/template/left')
}

/**
 * 获取右侧栏评估项目模板
 *
 * @returns {Promise} 右侧栏模板列表
 */
export function getRightTemplate() {
  return request.get('/form/template/right')
}
