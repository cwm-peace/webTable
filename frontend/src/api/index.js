/**
 * Axios 实例封装模块
 *
 * 职责：创建统一的 HTTP 请求实例，配置基础 URL、超时时间和拦截器。
 * 所有 API 请求都通过此实例发送，确保请求头中自动携带会话令牌。
 *
 * 拦截器功能：
 * - 请求拦截器：自动添加 X-Session-Token 请求头
 * - 响应拦截器：统一处理错误信息
 */
import axios from 'axios'

const SESSION_TOKEN_KEY = 'sessionToken'

/**
 * 获取当前填写会话令牌
 *
 * 优先读取 localStorage，兼容旧版 sessionStorage。
 * 使用 try-catch 兼容隐私模式（Safari/Firefox）下 Storage 被禁用的情况。
 *
 * @returns {string} 会话令牌
 */
function getSessionToken() {
  try {
    return localStorage.getItem(SESSION_TOKEN_KEY) || sessionStorage.getItem(SESSION_TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

// 创建 axios 实例，所有 API 请求通过此实例发送
const request = axios.create({
  baseURL: '/api',
  timeout: 30000
})

/**
 * 请求拦截器
 *
 * 在每个请求发送前，自动从浏览器存储获取会话令牌并添加到请求头。
 */
request.interceptors.request.use(config => {
  // 填写页面的会话令牌
  const token = getSessionToken()
  if (token) {
    config.headers['X-Session-Token'] = token
  }
  // 管理员系统的 token
  const adminToken = localStorage.getItem('adminToken')
  if (adminToken) {
    config.headers['X-Admin-Token'] = adminToken
  }
  return config
})

/**
 * 响应拦截器
 *
 * 统一处理响应数据。如果后端返回的 code 不是 200，视为业务错误，
 * 弹出错误消息。网络错误也会被捕获并提示。
 */
request.interceptors.response.use(
  response => {
    const res = response.data
    if (res.code !== 200) {
      console.error('API 错误：', res.message)
      return Promise.reject(new Error(res.message))
    }
    return res
  },
  error => {
    console.error('网络错误：', error.message)
    return Promise.reject(error)
  }
)

export default request
