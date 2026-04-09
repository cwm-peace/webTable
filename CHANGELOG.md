# CHANGELOG

所有项目的功能更新、bug 修复和需求变更都会记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)。

## [Unreleased]

### Added
- **管理员查看系统**
  - AdminConfig + AdminService + AdminServiceImpl + AdminController
  - 简单密码登录（application.yml 配置密码，Redis 存储 token，24h 过期）
  - 提交列表 API：GET /api/admin/submissions（所有已完成提交）
  - 提交详情 API：GET /api/admin/submissions/{id}（基础信息+照片+自评）
  - PDF 导出 API：GET /api/admin/export-pdf/{id}（OpenPDF 生成）
  - PDF 内容：基础信息字段表 + 照片（一行一张大图，按类别分组）+ 自评表格
  - 前端登录页 AdminLogin.vue（shadcn Card 居中布局）
  - 前端列表页 AdminDashboard.vue（桌面端表格 / 移动端卡片）
  - 前端详情页 AdminDetail.vue（基础信息卡片 + 照片展示 + 自评表格 + PDF 导出按钮）
- **前端路由系统**
  - 恢复 vue-router，配置 4 条路由（/、/admin、/admin/dashboard、/admin/detail/:id）
  - App.vue 改为 `<router-view />` 路由出口
  - FormWizard.vue 从 App.vue 拆分（填写向导逻辑）
  - axios 拦截器自动附加 X-Admin-Token 请求头
  - admin.js API 模块（登录/列表/详情/PDF导出）
- **手机端适配**
  - 所有页面使用 Tailwind 响应式断点（sm/md/lg）
  - 表单窄屏单列，宽屏双列
  - 表格窄屏转为卡片列表
  - 按钮窄屏全宽
  - 步骤导航窄屏纵向排列
- **前端 UI v3 重构：shadcn-vue + Tailwind CSS + @vueuse/motion**
- **保存流程重构**：统一保存 + 预览弹窗
- **安全加固**：CORS 限制、文件类型校验、日志脱敏、错误信息屏蔽
- OpenPDF 依赖（PDF 导出）
- 管理员密码配置（application.yml admin.password）

### Changed
- 前端技术栈从原生 CSS 迁移到 shadcn-vue + Tailwind CSS
- 保存流程从每步独立保存改为三步统一保存
- Spring Boot 从 4.0.5 降级到 3.5.13
- MyBatis-Plus 从 3.5.12 降级到 3.5.9 + 新增 jsqlparser
- Submission 实体废弃 photo/photoName/photoType 字段

### Completed
- [x] 后端全部代码（含 Admin 模块 + PDF 导出）
- [x] 数据库建表 DDL（7 张表 + 预设数据）
- [x] 前端 UI v1 → v2 → v3 迭代
- [x] shadcn-vue + Tailwind CSS + Motion 集成
- [x] 保存流程重构（统一保存 + 预览弹窗）
- [x] 安全加固
- [x] 管理员系统（登录+列表+详情+PDF 导出）
- [x] vue-router 路由配置
- [x] 手机端适配
- [x] 代码审查和 bug 修复

### To Do
- [ ] 联调测试
