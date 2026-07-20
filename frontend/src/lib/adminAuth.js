/**
 * 管理员鉴权工具模块
 *
 * 职责：集中管理管理员 token 的读取、保存、清理和过期跳转逻辑。
 * 管理端页面、路由守卫和二进制下载接口统一使用这里的函数，避免鉴权逻辑散落。
 */

const ADMIN_TOKEN_KEY = 'adminToken'

/**
 * 获取管理员 token。
 *
 * @returns {string} 管理员 token
 */
export function getAdminToken() {
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

/**
 * 保存管理员 token。
 *
 * @param {string} token 管理员 token
 */
export function setAdminToken(token) {
  if (!token) return
  try {
    localStorage.setItem(ADMIN_TOKEN_KEY, token)
  } catch {
    // 浏览器隐私模式下 localStorage 可能不可用，保持静默失败。
  }
}

/**
 * 清理管理员 token。
 */
export function clearAdminToken() {
  try {
    localStorage.removeItem(ADMIN_TOKEN_KEY)
  } catch {
    // 忽略浏览器存储异常。
  }
}

/**
 * 判断是否已有管理员 token。
 *
 * @returns {boolean} 是否有 token
 */
export function hasAdminToken() {
  return Boolean(getAdminToken())
}

/**
 * 处理管理员会话失效。
 *
 * 清理本地 token 并跳转登录页。使用 replace 避免浏览器返回键回到受保护页面。
 */
export function handleAdminUnauthorized() {
  clearAdminToken()
  if (window.location.pathname !== '/admin') {
    window.location.replace('/admin')
  }
}
