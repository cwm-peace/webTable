/** 本机外观偏好：三种视觉主题和独立明暗模式，不发送网络请求。 */
import { defineStore } from "pinia";
import { ref } from "vue";

export const useThemeStore = defineStore("theme", () => {
  const theme = ref("minimal");
  const mode = ref("system");
  const themes = [
    { value: "minimal", label: "极简" },
    { value: "tech", label: "科技" },
    { value: "flat", label: "扁平" },
  ];
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
   * 恢复本机偏好并监听系统明暗变化，存储不可用时继续使用内存状态。
   * @returns {void} 无返回值
   */
  function load() {
    try {
      const savedTheme = localStorage.getItem("webtable-theme");
      const savedMode = localStorage.getItem("webtable-color-mode");
      if (themes.some((item) => item.value === savedTheme))
        theme.value = savedTheme;
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
   * 切换本机视觉主题。
   * @param {string} value minimal、tech 或 flat
   * @returns {void} 无返回值
   */
  function setTheme(value) {
    if (!themes.some((item) => item.value === value)) return;
    theme.value = value;
    persist("webtable-theme", value);
    apply();
  }
  /**
   * 切换本机明暗模式。
   * @param {string} value system、light 或 dark
   * @returns {void} 无返回值
   */
  function setMode(value) {
    if (!["system", "light", "dark"].includes(value)) return;
    mode.value = value;
    persist("webtable-color-mode", value);
    apply();
  }
  return { theme, mode, themes, load, setTheme, setMode };
});
