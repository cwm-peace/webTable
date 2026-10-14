/** 创建纯浏览器应用；启动失败时保留基础说明，所有业务状态只在本机处理。 */
import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { useThemeStore } from "./stores/theme.js";
import "./style.css";
const app = createApp(App);
app.use(createPinia());
useThemeStore().load();
app.config.errorHandler = () => {
  // 不记录填写内容或组件状态，也不向外部上报异常。
  const notice = document.getElementById("runtime-failure");
  if (notice) notice.hidden = false;
};
app.mount("#app");
document.getElementById("boot-message")?.remove();
