# WebTable - 个人信息收集系统

## 项目简介

基于 Spring Boot 3.5.13 + Vue 3 的个人信息收集系统，包含**填写系统**和**查看管理系统**。填写系统支持上千人同时在线填写，管理员系统支持查看所有提交数据并导出 PDF。UI 采用 shadcn-vue + Tailwind CSS + Motion 动画，所有页面适配手机端。

## 技术栈

### 后端
- Spring Boot 3.5.13 + Java 21
- MyBatis-Plus 3.5.9（数据库操作）
- MySQL（持久化存储）
- Redis（会话缓存 + 数据缓存，支撑千人并发）
- Apache POI（Excel 导出）
- OpenPDF（PDF 导出）

### 前端
- Vue 3 + Vite + vue-router
- shadcn-vue（UI 组件库）
- Tailwind CSS v4（样式）
- @vueuse/motion（动画效果）
- Vxe-Table（第3步自评表格编辑）
- Pinia（状态管理）
- Axios（HTTP 请求）

## 功能

### 填写系统（/）
1. **基础信息**：30+ 字段，shadcn Card 分组布局
2. **附图**：4 个类别 × 4 槽位田字格照片上传
3. **接受程度自评**：左右双栏表格，125 个评估项目，级别 A-E 选择
4. 三步全填完后点击"保存提交"，弹出预览弹窗确认后统一保存

### 管理系统（/admin）
1. **登录**：管理员密码验证
2. **列表**：查看所有已提交的记录（桌面端表格 / 移动端卡片）
3. **详情**：查看单个提交的完整数据（基础信息 + 照片 + 自评）
4. **导出 PDF**：生成包含基础信息、照片（一行一张大图）、自评表格的 PDF 文件

## 快速开始

### 后端启动

```bash
./mvnw clean package
./mvnw spring-boot:run  # 端口 8081
```

### 前端启动

```bash
cd frontend
npm install
npm run dev  # 端口 5173
```

### 环境要求

- JDK 21
- MySQL（localhost:3306，数据库名：webtable）
- Redis（localhost:6379，无密码）
- Node.js 18+

## 数据库

执行 `src/main/resources/schema.sql` 创建数据库和表结构（7 张表），同时初始化评估项目预设数据（65 条左侧 + 60 条右侧评估项目模板）。

- 
- 第3步接受程度自评改为左右双栏的分组卡片表单，适合手机端连续纵向填写
- 草稿会在切换步骤时分步保存，刷新或重新打开页面会优先恢复同一份未完成 submission
- 最终提交后会清理本地会话标识和 Redis 草稿缓存，避免继续写入旧草稿

- `/` — 填写页面
- `/admin` — 管理员登录
- `/admin/dashboard` — 提交列表
- `/admin/detail/:id` — 提交详情

## API 接口

所有接口以 `/api` 为前缀。填写系统通过 `X-Session-Token` 标识用户，管理系统通过 `X-Admin-Token` 验证管理员身份。

详见 `plan.md`。
