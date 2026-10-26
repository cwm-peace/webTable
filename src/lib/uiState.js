/** 界面辅助状态的本机持久化：只存分组展开等偏好，不含任何填写内容。 */

export const GROUPS_STORAGE_KEY = "webtable-open-groups";
/** 持久化的分组数量上限，防止异常数据撑大存储或渲染。 */
const MAX_SAVED_GROUPS = 64;

/**
 * 读取上次展开的自评分组；数据缺失、损坏或存储不可用时回退到默认分组。
 * @param {Storage|null|undefined} storage 本机存储，隐私模式下可能抛错
 * @param {string} fallbackKey 默认展开的分组键名
 * @returns {Set<string>} 可安全使用的分组键集合
 */
export function loadOpenGroups(storage, fallbackKey) {
  const fallback = new Set(fallbackKey ? [fallbackKey] : []);
  try {
    const raw = storage?.getItem(GROUPS_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback;
    const keys = [
      ...new Set(parsed.filter((key) => typeof key === "string" && key)),
    ].slice(0, MAX_SAVED_GROUPS);
    return keys.length ? new Set(keys) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * 保存当前展开的分组；存储不可用时静默放弃，不影响填写。
 * @param {Storage|null|undefined} storage 本机存储
 * @param {Iterable<string>} keys 展开的分组键名
 * @returns {void} 无返回值
 */
export function saveOpenGroups(storage, keys) {
  try {
    const list = [...new Set([...(keys || [])])]
      .filter((key) => typeof key === "string" && key)
      .slice(0, MAX_SAVED_GROUPS);
    storage?.setItem(GROUPS_STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* 隐私模式或配额不足时放弃持久化 */
  }
}
