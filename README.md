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
- Pinia（状态管理）
- Axios（HTTP 请求）

## 功能

### 填写系统（/）
1. **基础信息**：30+ 字段，shadcn Card 分区布局，桌面多列、手机单列填写
2. **附图**：4 个类别 × 4 槽位田字格照片上传，前端大图压缩、上传进度和预览懒加载，后端同步限制类别、MIME、文件头签名、大小和每类 4 张上限
3. **接受程度自评**：按类型分组的左右双栏响应式表单，手机端改为纵向控件布局，125 个评估项目，级别 A-E 选择；服务端限制左侧最多 65 行、右侧最多 60 行
4. 三步全填完后点击"保存提交"，弹出预览弹窗确认后统一保存

### 管理系统（/admin）
1. **登录**：管理员密码验证
2. **列表**：分页查看所有已提交的记录（桌面端表格 / 移动端卡片）
3. **详情**：查看单个提交的完整数据（基础信息 + 照片 + 自评），照片按可视区域懒加载，弱网下可重试预览
4. **导出 PDF**：生成包含基础信息、照片（一行一张大图）、自评表格的 PDF 文件
5. **导出 Excel**：导出所有已完成提交的数据，仅管理员可用，并对公式样式文本执行安全转义

## 快速开始

完整交付文档：

- [部署指南](docs/DEPLOYMENT.md)：环境准备、生产启动、Nginx 示例、跨端访问和排障。
- [SQL 脚本说明](docs/SQL_GUIDE.md)：新库初始化、存量迁移、索引和权限建议。
- [用户与管理员手册](docs/USER_MANUAL.md)：填写流程、管理端流程、导出和常见问题。

### 后端启动

仓库已包含 Maven Wrapper，无需预先安装 Maven。

```bash
export WEBTABLE_DB_URL='jdbc:mysql://localhost:3306/webtable?useUnicode=true&characterEncoding=utf8&useSSL=false&serverTimezone=Asia/Shanghai&allowPublicKeyRetrieval=true'
export WEBTABLE_DB_USERNAME='webtable'
export WEBTABLE_DB_PASSWORD='请填写数据库密码'
export WEBTABLE_ADMIN_PASSWORD='至少12位的管理员强密码'
export WEBTABLE_ADMIN_LOGIN_MAX_FAILURES='5'
export WEBTABLE_ADMIN_LOGIN_FAILURE_WINDOW_MINUTES='15'
export WEBTABLE_ADMIN_LOGIN_LOCK_MINUTES='15'
export WEBTABLE_MAX_JSON_BODY_BYTES='1048576'
export WEBTABLE_PDF_MAX_PHOTO_BYTES='104857600'
export WEBTABLE_SUBMISSION_CREATE_RATE_LIMIT_ENABLED='true'
export WEBTABLE_SUBMISSION_CREATE_RATE_LIMIT_MAX_REQUESTS='20'
export WEBTABLE_SUBMISSION_CREATE_RATE_LIMIT_WINDOW_MINUTES='10'

scripts/preflight-check.sh
./mvnw clean package
./mvnw spring-boot:run  # 端口 8081
```

`scripts/preflight-check.sh` 会在联调或部署前检查 Java、Node.js、Maven Wrapper、必要环境变量、Redis、MySQL、7 张业务表、左右自评模板数量以及 8081/5173 端口占用。检查只读数据库元数据和模板数量，不写入业务数据。

### 后端测试

```bash
./mvnw test
```

应用上下文测试使用测试专用强管理员密码，不会降低生产环境必须显式配置 `WEBTABLE_ADMIN_PASSWORD` 的要求。当前测试未使用 Mockito，测试依赖已排除 Mockito 传递依赖，避免在 JDK 21+ 环境中依赖动态 agent attach。
后端测试覆盖管理员强密码配置、CORS 白名单、非 multipart API 请求体大小限制、API 安全响应头、JSON API 业务错误同步 HTTP 状态、统一异常响应、填写端创建草稿限流/基础信息和自评输入规模限制/提交后拒绝旧 token 改写、管理员登录限流/token 吊销、管理员列表分页、管理端草稿详情/PDF/照片拒绝、PDF 中文/emoji fallback 导出、PDF 照片总量预算、Excel 分批导出与公式注入转义、照片上传限制和应用上下文启动。

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

### 联调前置检查

```bash
scripts/preflight-check.sh
```

检查失败时先按输出修复环境。常见阻塞项包括：未设置 `WEBTABLE_ADMIN_PASSWORD`、未设置或错误设置 `WEBTABLE_DB_PASSWORD`、MySQL 用户无权访问 `webtable` 数据库、未执行 `src/main/resources/schema.sql`、Redis 未启动或端口被占用。

### 安全配置

- 后端不再内置数据库密码；请使用 `WEBTABLE_DB_URL`、`WEBTABLE_DB_USERNAME`、`WEBTABLE_DB_PASSWORD` 配置连接信息。
- 管理员密码必须通过 `WEBTABLE_ADMIN_PASSWORD` 或 `admin.password` 显式配置，且不少于 12 位；空密码和 `admin123` 等默认弱密码会导致应用启动失败。
- 管理员登录默认按客户端限流：15 分钟内失败 5 次后锁定 15 分钟，可通过 `WEBTABLE_ADMIN_LOGIN_MAX_FAILURES`、`WEBTABLE_ADMIN_LOGIN_FAILURE_WINDOW_MINUTES`、`WEBTABLE_ADMIN_LOGIN_LOCK_MINUTES` 调整。
- 公开创建草稿接口 `POST /api/form` 默认按客户端限流：10 分钟内最多创建 20 个草稿，可通过 `WEBTABLE_SUBMISSION_CREATE_RATE_LIMIT_ENABLED`、`WEBTABLE_SUBMISSION_CREATE_RATE_LIMIT_MAX_REQUESTS`、`WEBTABLE_SUBMISSION_CREATE_RATE_LIMIT_WINDOW_MINUTES` 调整；命中限流返回 429 且不会写入空 submission。
- 管理员退出登录会调用 `/api/admin/logout` 删除 Redis 中的当前 token，使其立即失效。
- 前端管理端使用路由守卫保护 `/admin/dashboard` 与 `/admin/detail/:id`；接口返回 401 时会清理本地管理员 token 并跳回 `/admin`。
- 管理端列表、详情、PDF 和照片下载只允许访问已完成提交；列表不返回 `session_token`，详情只返回安全提交摘要，避免填写端 session token 进入管理员浏览器响应。
- 填写端草稿读写和照片归属校验只允许访问未完成提交；最终提交后即使旧 `sessionToken` 仍存在于历史记录，也不能继续改写已提交数据。
- 非 multipart `/api/*` 请求体默认限制为 1MB，可通过 `WEBTABLE_MAX_JSON_BODY_BYTES` 或 `app.request.max-json-body-bytes` 调整；照片上传为 multipart 请求，继续使用 50MB 上传限制。
- PDF 导出默认限制单个提交嵌入照片总量不超过 100MB，可通过 `WEBTABLE_PDF_MAX_PHOTO_BYTES` 或 `app.export.pdf.max-photo-bytes` 调整；超限会在读取照片二进制前返回 HTTP 413，避免大图组合造成导出内存压力。
- 第3步自评保存接口限制请求行数，左侧最多 65 行、右侧最多 60 行，超限时在删除旧数据前直接拒绝，避免恶意超大数组造成数据库和 Redis 写放大。
- 基础信息和自评字段在服务端执行长度与枚举校验：基础信息按数据库字段或保守业务上限限制，自评类型/项目/备注按 schema 限制，自评级别只允许 A-E，空自评行和异常排序号会在写库前拒绝。
- 全量 Excel 导出会转义用户输入中以 `=`、`+`、`-`、`@` 开头的文本，防止管理员打开导出文件时触发公式注入。
- 照片上传不仅校验请求 MIME，还会检查 JPEG/PNG/GIF/WebP/BMP 文件头签名，拒绝伪造图片类型或声明类型与真实内容不一致的文件。
- `/api/*` 响应统一添加禁缓存和基础安全头：`Cache-Control: no-store`、`X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Referrer-Policy: no-referrer`，降低敏感数据缓存、MIME 嗅探、嵌入和来源泄露风险。
- 后端通过 `GlobalExceptionHandler` 统一处理缺少请求头/参数、JSON 格式错误、上传超限、数据库异常和未知异常；HTTP 4xx/5xx 仍返回统一 `ApiResponse`，并使用脱敏提示避免暴露堆栈、SQL 或内部类名。
- JSON API 的业务错误会将 `ApiResponse.code` 同步为 HTTP 状态码，例如未登录 401、无权访问 403、资源不存在 404、上传过大 413、不支持图片类型 415、限流 429，便于前端、网关、访问日志和监控系统准确识别异常请求。
- 前端 Axios 拦截器会优先读取后端统一响应中的 `message`，并在业务 401 或 HTTP 401 时清理管理员 token。
- PDF 导出使用系统/OpenPDF CJK 字体 fallback；导出文本会过滤 Unicode 增补平面字符，避免 emoji 等字符触发 OpenPDF 字体宽度异常。

### 跨端访问配置

后端 CORS 默认只允许 `http://localhost:5173` 和 `http://127.0.0.1:5173`。手机、平板、鸿蒙设备或内网穿透访问时，需要在 `application.yml` 或环境配置中显式追加前端来源：

```yaml
app:
  cors:
    allowed-origin-patterns: http://localhost:5173,http://127.0.0.1:5173,http://192.168.1.10:5173,https://form.example.com
```

## 数据库

执行 `src/main/resources/schema.sql` 创建数据库和表结构（7 张表），同时初始化评估项目预设数据（65 条左侧 + 60 条右侧评估项目模板）。

- 第3步接受程度自评改为左右双栏的分组卡片表单，适合手机端连续纵向填写
- 创建草稿入口使用 Redis 原子计数按客户端限流，默认 10 分钟最多 20 次，防止脚本刷出大量空 submission
- 第3步自评保存按模板规模限制行数，左侧最多 65 行、右侧最多 60 行
- 照片二进制字段使用 LONGBLOB，匹配 50MB 上传限制；`database/v3-photo-upload-constraints/migrate.sql` 可用于升级已有库
- 管理员提交列表使用分页查询，`submissions` 表通过 `(completed, create_time, id)` 组合索引支撑已完成记录按时间倒序分页；`database/v4-admin-list-pagination/migrate.sql` 可用于升级已有库
- PDF 导出不依赖无效的内嵌字体资源，中文字体按操作系统候选字体和 OpenPDF 内置 `STSong-Light` 逐级 fallback；用户输入中的 emoji 等增补平面字符会在写入 PDF 前过滤
- PDF 导出会先用数据库聚合统计当前提交照片总字节数，默认超过 100MB 时返回 HTTP 413，避免超限图片数据读入应用层内存
- 全量 Excel 导出按 500 条 submission 分批查询关联数据，保留单文件下载体验，同时避免一次性把所有基础信息和自评记录加载到内存；用户输入写入文本单元格前会执行公式前缀转义
- 草稿会在切换步骤时分步保存，刷新或重新打开页面会优先恢复同一份未完成 submission
- 最终提交后会清理本地会话标识和 Redis 草稿缓存；后端也会拒绝旧会话继续读写已完成提交
- 填写端照片预览和管理端详情照片预览按可视区域懒加载，不再进入页面后立即拉取所有原图；预览失败会保留重试入口
- 手机端第3步自评行改为纵向布局，选择框和备注输入保持 44px 触控高度，兼容 PC、iOS、Android 和鸿蒙浏览器/ WebView 的窄屏操作
- 上传大图会优先在浏览器端压缩为 JPEG，并显示上传进度；GIF 保留原文件，压缩失败时自动回退原图上传

## 路由

- `/` — 填写页面
- `/admin` — 管理员登录
- `/admin/dashboard` — 提交列表
- `/admin/detail/:id` — 提交详情

## API 接口

所有接口以 `/api` 为前缀。填写系统通过 `X-Session-Token` 标识用户，管理系统通过 `X-Admin-Token` 验证管理员身份。管理员提交列表接口为 `GET /api/admin/submissions?page=1&pageSize=20`，服务端限制 `pageSize` 最大 100。全量 Excel 导出接口 `/api/export/all` 属于管理员功能，只接受管理员 token；管理员退出接口为 `POST /api/admin/logout`。

普通 JSON 接口统一返回：

```json
{
  "code": 200,
  "message": "success",
  "data": {}
}
```

异常情况下仍尽量返回同样结构，例如请求格式错误返回 HTTP 400 + `code=400`，上传超限返回 HTTP 413 + `code=413`，服务端异常返回 HTTP 500 + 通用提示。

详见 `plan.md`。
