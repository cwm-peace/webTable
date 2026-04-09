<!--
  应用根组件

  职责：路由出口，根据当前 URL 渲染对应的页面组件。
  - / → FormWizard（填写页面）
  - /admin → AdminLogin（管理员登录）
  - /admin/dashboard → AdminDashboard（提交列表）
  - /admin/detail/:id → AdminDetail（提交详情）
-->
<template>
  <router-view />
</template>

<script setup>
/**
 * 应用根组件
 *
 * 使用 Vue Router 的 router-view 作为路由出口。
 * 所有页面逻辑由各自的路由组件处理。
 */
</script>
