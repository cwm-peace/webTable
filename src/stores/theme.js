/** 本机显示偏好：固定原型色板和独立日间/夜间模式，不发送网络请求。 */
import { defineStore } from "pinia";
import { ref } from "vue";

export const useThemeStore = defineStore("theme", () => {
  const theme = ref("minimal");
  const mode = ref("dark");
  let media;
  /**
   * 将当前外观写入页面根节点，系统模式跟随设备设置。
   * @returns {void} 无返回值
   */
  function apply() {
    document.documentElement.dataset.theme = theme.value;
    const dark =
      mode.value === "dark" || (mode.value === "system" && media?.matches);
    document.documentElement.classList.toggle("dark", Boolean(dark));
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  }
  /**
   * 仅恢复显示模式并监听系统变化；旧风格偏好不再参与色板选择。
   * @returns {void} 无返回值
   */
  function load() {
    try {
      const savedMode = localStorage.getItem("webtable-color-mode");
      if (["system", "light", "dark"].includes(savedMode))
        mode.value = savedMode;
    } catch {
      /* 浏览器禁止存储时仍可使用默认外观。 */
    }
    if (!media) {
      media = matchMedia("(prefers-color-scheme: dark)");
      if (media.addEventListener) media.addEventListener("change", apply);
      else media.addListener(apply);
    }
    apply();
  }
  /**
   * 保存当前浏览器偏好，写入失败不影响页面操作。
   * @param {string} key 应用自己的偏好键名
   * @param {string} value 已验证的偏好值
   * @returns {void} 无返回值
   */
  function persist(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* 保留本次会话的选择。 */
    }
  }
  /**
   * 保留旧调用入口，但始终固定为原型色板，避免旧页面调用时报错。
   * @param {string} _value 已废弃的旧主题值
   * @returns {void} 无返回值
   */
  function setTheme(_value) {
    theme.value = "minimal";
    apply();
  }
  /**
   * 切换本机显示模式。
   * @param {string} value system、light 或 dark
   * @returns {void} 无返回值
   */
  function setMode(value) {
    if (!["system", "light", "dark"].includes(value)) return;
    mode.value = value;
    persist("webtable-color-mode", value);
    apply();
  }
  return { theme, mode, load, setTheme, setMode };
});
