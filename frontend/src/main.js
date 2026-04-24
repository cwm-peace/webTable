/**
 * Vue 应用入口文件
 *
 * 职责：创建 Vue 应用实例，注册全局依赖。
 * 包括 Pinia 状态管理、Vue Router 路由、Motion 动画。
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { MotionPlugin } from '@vueuse/motion'
import router from './router'
import App from './App.vue'
import './style.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(MotionPlugin)

app.mount('#app')
