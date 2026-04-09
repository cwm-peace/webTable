/**
 * Vue 应用入口文件
 *
 * 职责：创建 Vue 应用实例，注册全局依赖。
 * 包括 Pinia 状态管理、Vue Router 路由、Motion 动画、VxeTable 表格。
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { MotionPlugin } from '@vueuse/motion'
import VXETable from 'vxe-table'
import 'vxe-table/lib/style.css'
import router from './router'
import App from './App.vue'
import './style.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(MotionPlugin)
// vxe-table 用于第3步的自评表格编辑
app.use(VXETable)

app.mount('#app')
