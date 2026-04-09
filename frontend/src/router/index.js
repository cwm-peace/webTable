/**
 * 路由配置模块
 *
 * 职责：配置 Vue Router 路由规则。
 * 包含填写页面路由和管理员系统路由。
 *
 * 路由结构：
 * / — 填写页面（三步向导）
 * /admin — 管理员登录页
 * /admin/dashboard — 提交列表页
 * /admin/detail/:id — 单个提交详情页
 */
import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: () => import('../components/FormWizard.vue')
  },
  {
    path: '/admin',
    name: 'AdminLogin',
    component: () => import('../components/admin/AdminLogin.vue')
  },
  {
    path: '/admin/dashboard',
    name: 'AdminDashboard',
    component: () => import('../components/admin/AdminDashboard.vue')
  },
  {
    path: '/admin/detail/:id',
    name: 'AdminDetail',
    component: () => import('../components/admin/AdminDetail.vue')
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
