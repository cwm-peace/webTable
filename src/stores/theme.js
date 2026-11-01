/** 本机外观偏好：两套原型风格共用明暗模式，只保存显示设置，不发送网络请求。 */
import { defineStore } from "pinia";
import { ref } from "vue";

export const useThemeStore = defineStore("theme", () => {
  const theme = ref("minimal");
  const mode = ref("dark");
  /** 界面风格：submission 为现有设计，midnight 为第二套蓝黑风格。 */
  const style = ref("submission");
  let media;
  /**
   * 将当前外观写入页面根节点，系统模式跟随设备设置。
   * @returns {void} 无返回值
   */
  function apply() {
    document.documentElement.dataset.theme = theme.value;
    document.documentElement.dataset.style = style.value;
    const dark =
      mode.value === "dark" || (mode.value === "system" && media?.matches);
    document.documentElement.classList.toggle("dark", Boolean(dark));
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  }
  /**
   * 恢复风格与显示模式并监听系统变化；旧版科技/扁平主题键不参与选择。
   * @returns {void} 无返回值
   */
  function load() {
    try {
      const savedMode = localStorage.getItem("webtable-color-mode");
      if (["system", "light", "dark"].includes(savedMode))
        mode.value = savedMode;
      const savedStyle = localStorage.getItem("webtable-ui-style");
      if (["submission", "midnight"].includes(savedStyle))
        style.value = savedStyle;
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
   * 保留旧调用入口的兼容标记，旧主题值不能覆盖当前风格与明暗偏好。
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
  /**
   * 切换两套界面风格，只改变视觉令牌，不影响草稿或填写逻辑。
   * @param {string} value submission 或 midnight
   * @returns {void} 无返回值
   */
  function setStyle(value) {
    if (!["submission", "midnight"].includes(value)) return;
    style.value = value;
    persist("webtable-ui-style", value);
    apply();
  }
  /**
   * 在两套风格间往返切换，保留当前明暗模式，供单个按钮使用。
   * @returns {void} 无返回值
   */
  function toggleStyle() {
    setStyle(style.value === "submission" ? "midnight" : "submission");
  }
  return { theme, mode, style, load, setTheme, setMode, setStyle, toggleStyle };
});
