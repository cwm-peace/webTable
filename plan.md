# 个人信息收集系统 - 实现计划

## Context

基于范本文件 `奴测-空白版.xlsx` 构建个人信息收集系统，包含填写系统和查看管理系统。支持上千人同时在线填写，管理员查看所有提交数据并导出 PDF。所有页面适配手机端。

## 1. 依赖

### 后端
- Spring Boot 3.5.13 + Java 21
- `mybatis-plus-spring-boot3-starter` 3.5.9 + `mybatis-plus-jsqlparser` 3.5.9
- `gson`、`fastjson2` 2.0.53、`poi-ooxml` 5.3.0、`openpdf` 1.3.35
- `spring-boot-starter-web`、`spring-boot-starter-data-redis`、`spring-boot-starter-jdbc`
- `mysql-connector-j`、`lombok`、`spring-boot-devtools`
- 测试使用 `spring-boot-starter-test`，当前测试未使用 Mockito，已排除 Mockito 传递依赖以避免 JDK agent attach 依赖

### 前端
- Vue 3 + Vite + vue-router
- shadcn-vue（Reka UI + Lucide + Slate 主题）
- Tailwind CSS v4 + @tailwindcss/vite
- @vueuse/motion（动画）
- axios、pinia

## 2. 配置（application.yml）

- Spring Boot 3.5.13，端口 8081
- 数据源：通过 `WEBTABLE_DB_URL`、`WEBTABLE_DB_USERNAME`、`WEBTABLE_DB_PASSWORD` 配置，默认用户名为 `webtable` 且不内置数据库密码
- Redis：localhost:6379，无密码
- MyBatis-Plus：驼峰映射 + SQL 日志
- 文件上传限制：50MB
- 管理员密码：通过 `WEBTABLE_ADMIN_PASSWORD` 或 `admin.password` 配置，启动时拒绝空密码和默认弱密码
- 管理员登录限流：通过 `WEBTABLE_ADMIN_LOGIN_MAX_FAILURES`、`WEBTABLE_ADMIN_LOGIN_FAILURE_WINDOW_MINUTES`、`WEBTABLE_ADMIN_LOGIN_LOCK_MINUTES` 配置，默认 15 分钟内失败 5 次后锁定 15 分钟
- 公开创建草稿限流：通过 `WEBTABLE_SUBMISSION_CREATE_RATE_LIMIT_ENABLED`、`WEBTABLE_SUBMISSION_CREATE_RATE_LIMIT_MAX_REQUESTS`、`WEBTABLE_SUBMISSION_CREATE_RATE_LIMIT_WINDOW_MINUTES` 配置，默认单客户端 10 分钟内最多创建 20 个草稿
- 非 multipart API 请求体限制：通过 `WEBTABLE_MAX_JSON_BODY_BYTES` 或 `app.request.max-json-body-bytes` 配置，默认 1MB，照片上传继续使用 multipart 50MB 限制
- PDF 导出照片预算：通过 `WEBTABLE_PDF_MAX_PHOTO_BYTES` 或 `app.export.pdf.max-photo-bytes` 配置，默认 100MB，超限返回 HTTP 413

## 3. 数据库设计（7 张表）

```sql
submissions, personal_info, photos, assessment_left, assessment_right,
assessment_left_template（65条）, assessment_right_template（60条）
```

## 4. Redis 缓存策略

| 用途 | Key 格式 | TTL |
|---|---|---|
| 会话→提交映射 | `wt:session:{token}` → submissionId | 2h |
| 步骤1缓存 | `wt:step:{id}:1` → PersonalInfo | 2h |
| 步骤3左侧缓存 | `wt:step:{id}:3:left` → List | 2h |
| 步骤3右侧缓存 | `wt:step:{id}:3:right` → List | 2h |
| 管理员 token | `wt:admin:{token}` → "admin" | 24h |
| 管理员登录失败计数 | `wt:admin:login:fail:{clientKey}` → count | 默认 15m |
| 管理员登录锁定 | `wt:admin:login:lock:{clientKey}` → "locked" | 默认 15m |
| 创建草稿限流 | `wt:form:create:rate:{clientKey}` → count | 默认 10m |

## 5. 后端结构

```
com.peace.webtable/
├── config/          RedisConfig, CorsConfig, MyBatisPlusConfig, AdminConfig
│                    GlobalExceptionHandler, ApiResponseStatusAdvice, RequestBodySizeFilter, SecurityHeadersFilter
├── controller/      FormController, PhotoController, ExportController, AdminController
├── service/         FormService, PhotoService, ExportService, AdminService + impl/
├── mapper/          7 个 Mapper（含 Template）
├── entity/          7 个 Entity（含 Template）
├── dto/             ApiResponse, StepDataRequest
└── util/            SessionUtil, RedisUtil
```

## 5.1 代码规范

**后端：** Javadoc 类/方法注释，行注释说明原因，Logger 关键操作日志，敏感信息脱敏
**前端：** 文件头部块注释，JSDoc 方法注释，模板行注释

## 5.2 安全措施

- CORS 默认只允许 localhost/127.0.0.1:5173，可通过 `app.cors.allowed-origin-patterns` 显式配置局域网、域名或内网穿透来源
- 照片上传白名单校验（jpeg/png/gif/webp/bmp），并用文件头签名校验真实图片类型
- 公开 `POST /api/form` 创建草稿按客户端限流，默认 10 分钟最多 20 次，命中限流时返回 429 且不写入空 submission
- 非 multipart `/api/*` 请求在进入控制器和 JSON 反序列化前检查 `Content-Length`，默认超过 1MB 直接返回 HTTP 413，降低恶意超大 JSON 对内存、线程和解析器的消耗
- 照片类别白名单校验（selfie/nude/dick/other）与每类 4 张上限由服务端兜底
- 第3步自评保存限制请求行数：左侧最多 65 行、右侧最多 60 行，避免恶意超大数组造成数据库和 Redis 写放大
- 基础信息和自评字段增加服务端长度/枚举校验：基础信息按数据库字段或保守业务上限限制，自评类型/项目/备注按 schema 限制，级别只允许 A-E，空自评行和异常排序号在写库前拒绝
- 文件名去除路径分隔符
- 日志中 session token 只显示前4位
- `/api/*` 响应统一添加 `Cache-Control: no-store`、`X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY` 和 `Referrer-Policy: no-referrer` 等安全头，降低敏感数据缓存、MIME 嗅探、嵌入和来源泄露风险
- `GlobalExceptionHandler` 统一处理缺请求头、参数格式、JSON 解析、上传超限、数据库异常和未知异常，HTTP 4xx/5xx 响应仍返回 `ApiResponse` 且不暴露内部异常细节
- `ApiResponseStatusAdvice` 将 JSON API 业务错误的 `ApiResponse.code` 同步为 HTTP 状态码，避免鉴权失败、限流和参数错误被网关/监控误判为 HTTP 200
- 管理端列表、详情、PDF 和照片下载只允许访问已完成提交；列表不返回 `session_token`，详情只返回安全提交摘要，不暴露填写端 session token
- Excel 导出对用户输入的文本单元格执行公式前缀转义，避免管理员打开导出文件时触发 `=`、`+`、`-`、`@` 开头的公式注入
- PDF 导出在读取照片 LONGBLOB 前先用数据库聚合统计照片总字节数，默认超过 100MB 时返回 HTTP 413，避免多个大图组合造成导出内存压力
- PDF 导出统一使用系统/OpenPDF CJK 字体 fallback，导出文本写入前过滤 Unicode 增补平面字符，避免 emoji 等字符触发 OpenPDF 字体宽度异常
- 管理员 token 验证（Redis 存储，24h 过期）
- 管理员强密码启动校验，禁止空密码、默认密码和过短密码进入运行态
- 管理员登录按客户端限流，密码使用固定长度摘要常量时间比较，退出登录会立即吊销 Redis token

## 6. API 设计

### 填写系统
| 方法 | 路径 | 功能 |
|---|---|---|
| POST | `/api/form` | 新建提交 |
| GET | `/api/form/status` | 查询状态 |
| PUT | `/api/form/complete` | 标记完成 |
| GET/PUT | `/api/form/step1/{id}` | 基础信息 |
| GET/PUT | `/api/form/step3/left/{id}` | 左侧自评 |
| GET/PUT | `/api/form/step3/right/{id}` | 右侧自评 |
| GET | `/api/form/template/left|right` | 模板数据 |
| POST/GET/DELETE | `/api/photo/*` | 照片管理 |

### 管理系统
| 方法 | 路径 | 功能 |
|---|---|---|
| POST | `/api/admin/login` | 管理员登录 |
| POST | `/api/admin/logout` | 管理员退出登录并吊销 token |
| GET | `/api/admin/submissions` | 提交列表 |
| GET | `/api/admin/submissions/{id}` | 提交详情 |
| GET | `/api/admin/export-pdf/{id}` | 导出 PDF |
| GET | `/api/export/all` | 导出全部 Excel |

## 7. 前端结构

```
frontend/src/
├── App.vue                          路由出口（<router-view />）
├── main.js                          入口（Pinia + Router + Motion）
├── style.css                        Tailwind + shadcn-vue CSS 变量
├── lib/utils.js                     cn() 工具函数
├── lib/adminAuth.js                 管理员 token 读写、清理和会话失效跳转
├── router/index.js                  路由配置（4条路由）
├── api/
│   ├── index.js                     axios 实例（自动附加 sessionToken + adminToken）
│   ├── form.js                      填写系统 API
│   ├── photo.js                     照片 API
│   ├── export.js                    导出 Excel API
│   └── admin.js                     管理员 API（登录/列表/详情/PDF导出）
├── components/
│   ├── FormWizard.vue               填写向导页面（原 App.vue 拆分）
│   ├── StepWizard.vue               步骤指示器 + 导航按钮
│   ├── Step1BasicInfo.vue           基础信息（shadcn Card/Input）
│   ├── Step2Photos.vue              附图部分
│   ├── Step3Assessment.vue          自评分组表单（左右栏响应式布局）
│   ├── PhotoUploader.vue            照片上传（4 槽位）
│   ├── PreviewDialog.vue            预览弹窗（shadcn Dialog）
│   ├── admin/
│   │   ├── AdminLogin.vue           登录页（密码输入）
│   │   ├── AdminDashboard.vue       列表页（表格/卡片）
│   │   └── AdminDetail.vue          详情页（基础信息+照片+自评+导出PDF）
│   └── ui/                          shadcn-vue 组件库
└── stores/form.js                   Pinia store
```

### 路由
- `/` — 填写页面（三步向导）
- `/admin` — 管理员登录
- `/admin/dashboard` — 提交列表
- `/admin/detail/:id` — 提交详情

### 手机端适配
所有页面使用 Tailwind 响应式断点（sm/md/lg）：
- 表单：窄屏单列，宽屏双列
- 照片：窄屏 2 列，宽屏 4 列
- 表格：窄屏转为卡片列表
- 按钮：窄屏全宽
- 步骤导航：窄屏纵向排列

## 8. 实施进度

- [x] 后端全部代码
- [x] 数据库 DDL + 预设数据
- [x] 前端 UI v1 → v2 → v3
- [x] shadcn-vue + Tailwind CSS + Motion
- [x] 保存流程重构（统一保存 + 预览弹窗）
- [x] 安全加固
- [x] 管理员系统（登录+列表+详情+PDF导出）
- [x] vue-router 路由配置
- [x] 手机端适配 + PC 端宽屏差异化布局
- [x] 前端 UI/弱网体验优化（照片懒加载、上传进度、大图压缩、移动端自评纵向布局）
- [x] 部署指南 + SQL 脚本说明 + 用户/管理员手册初版
- [ ] 联调测试

## 8.1 当前实施变更

### 手机端适配与 PC 端宽屏布局
- 所有页面容器：`max-w-[1100px]` → `px-4 sm:px-6 lg:px-10` 全宽
- PC 端（lg: ≥1024px）：Step1 3列网格，Step2 4列网格，Step3 左右栏并排，AdminDetail 信息 4列/照片 6列
- 手机端（<768px）：`style.css` 全局补丁，input/button 最小高度 44px
- 步骤标签：`text-xs sm:text-sm` 防小屏溢出；导航按钮 `h-11 sm:h-9`
- UI 精修：首页改为带摘要数据的信息带，步骤导航和管理端操作按钮加入 lucide 图标，加载态统一使用 spinner，基础信息卡片减少视觉噪音
- 第3步自评在手机端从 `项目 + 选择 + 备注` 同行挤压改为纵向控件布局，select 和备注输入保持 44px 触控高度，提升 iOS、Android、鸿蒙窄屏操作稳定性
- 填写端照片槽位展示按后端 `photoOrder` 映射 1-4 槽，删除中间照片后仍保持正确槽位显示
- 填写端和管理端照片预览改为 IntersectionObserver 可视区域懒加载，并保留失败重试入口，避免弱网下进入页面后一次性拉取所有原图 blob
- 照片上传增加上传进度、上传专用 120 秒超时和浏览器端大图压缩；大于 2MB 的非 GIF 图片优先压缩为最长边 1600px 的 JPEG，压缩失败或 GIF 自动回退原文件
- 草稿恢复改为优先复用已存在会话，前端 token 持久化到 localStorage + sessionStorage，切步时分步保存
- 创建草稿入口增加 Redis 原子计数限流，按客户端哈希 key 限制默认 10 分钟最多 20 次，防止脚本刷库
- 后端 `completeSubmission()`、步骤读写接口支持 Redis miss 后回源数据库，并校验 `sessionToken -> submissionId` 归属关系
- 后端第3步保存接口按模板规模限制自评行数，左侧最多 65 行、右侧最多 60 行，超限时在删除旧数据前直接拒绝
- 最终提交后清理本地 token 与 Redis 草稿缓存；后端草稿读写和照片归属校验只允许访问未完成 submission，防止旧 token 通过数据库回源继续改写已提交数据

### 管理端导出边界修正
- 全量 Excel 导出统一归入管理员系统能力，仅携带 `X-Admin-Token` 访问 `/api/export/all`
- 填写端提交成功页不再展示全量 Excel 导出入口，避免普通填写用户触发管理员接口
- 管理员列表页新增全量 Excel 导出入口，与单条 PDF 导出形成清晰分工

### 构建工具链修正
- 补齐 Maven Wrapper（`mvnw`、`mvnw.cmd`、`.mvn/wrapper/maven-wrapper.properties`），保证 README 与 AGENTS 中的后端构建命令可直接执行
- `.gitignore` 保留 `maven-wrapper.jar` 忽略规则，但允许 wrapper 脚本和配置进入版本控制

### 照片上传一致性修正
- 后端 `PhotoServiceImpl` 增加照片类别白名单、MIME 白名单大小写归一、文件头签名校验、每类最多 4 张服务端限制
- 删除照片后再次上传会补回 1-4 中的第一个空槽，避免 `photo_order` 无限增长或重复
- `photos.photo_data` 改为 `LONGBLOB`，匹配应用层 50MB 上传限制；新增 `(submission_id, photo_category, photo_order)` 唯一索引防并发重复槽位
- 新增 `database/v3-photo-upload-constraints/migrate.sql`，用于存量库升级照片容量和槽位唯一约束
- 新增 `PhotoServiceImplTest` 覆盖非法类别、每类 4 张上限、补空槽逻辑、伪造 MIME 和声明类型/真实类型不匹配

### CORS 安全边界修正
- 后端 CORS 从默认全来源放开改为配置驱动白名单，默认仅允许 `localhost:5173` 与 `127.0.0.1:5173`
- CORS 请求头和方法改为显式白名单，并暴露 `Content-Disposition` 供前端下载文件名解析
- 新增 `CorsConfigTest`，防止跨域策略回退到 `*` / `**` 全开放

### 敏感配置与默认密码修正
- 数据库连接信息改为环境变量驱动，不再在 `application.yml` 中内置 root 账号和明文密码
- 管理员密码默认空值，必须显式配置强密码；`AdminConfig` 启动时拒绝空密码、默认弱密码和 12 位以下密码
- 新增 `AdminConfigTest` 覆盖空密码、默认弱密码和强密码校验

### 后端测试链路修正
- `WebTableApplicationTests` 使用测试专用强管理员密码启动应用上下文，不放松生产环境强密码校验
- 测试依赖排除未使用的 Mockito 传递依赖，避免 Mockito inline mock maker 依赖当前 JVM 的动态 agent attach 能力
- 完整后端测试命令 `./mvnw test` 已覆盖 `AdminConfigTest`、`CorsConfigTest`、`WebTableApplicationTests`、`PhotoServiceImplTest`

### 管理员登录安全加固
- 管理员密码比较改为 SHA-256 固定长度摘要 + `MessageDigest.isEqual` 常量时间比较，降低时间侧信道风险
- 管理员登录失败按客户端地址哈希后的 `clientKey` 计数，默认 15 分钟内失败 5 次后锁定 15 分钟
- 管理员登录成功后清理当前客户端失败记录，退出登录新增 `/api/admin/logout` 并立即删除 Redis token
- 前端管理端退出登录改为先请求后端吊销 token，再清理本地 `adminToken`
- 新增 `AdminServiceImplTest` 覆盖 token 创建/吊销、失败锁定和成功清理失败记录

### 前端管理端鉴权收敛
- 新增 `frontend/src/lib/adminAuth.js`，集中管理管理员 token 的读取、保存、清理和会话失效跳转
- 管理端路由增加 `requiresAdmin` / `guestOnly` meta 守卫：未登录不能进入列表/详情，已登录访问 `/admin` 自动进入列表
- Axios 统一响应拦截器遇到业务 `401` 或 HTTP `401` 时清理管理员 token 并 replace 到 `/admin`
- PDF、Excel、管理端照片下载等二进制请求补齐 401/403 处理，避免 token 过期后继续停留在敏感页面
- AdminDashboard/AdminDetail 移除重复的本地 token 检查，复用路由守卫和统一会话失效处理

### API 异常响应安全边界
- 新增 `GlobalExceptionHandler`，将 Spring MVC 参数异常、请求体解析异常、multipart 上传异常、上传超限、数据库异常和未知异常统一转换为 `ApiResponse`
- 请求头/参数缺失、类型错误、JSON 格式错误返回 HTTP 400；上传超限和 PDF 照片总量超限返回 HTTP 413；服务端和数据库异常返回 HTTP 500 并使用通用提示
- 新增 `ApiResponseStatusAdvice`，控制器返回 `ApiResponse.code=400/401/403/404/413/415/429/500` 等业务错误时同步设置 HTTP 状态码，便于前端拦截器、安全网关、访问日志和监控系统识别异常流量
- 新增 `RequestBodySizeFilter`，仅作用于 `/api/*` 的非 multipart POST/PUT/PATCH 请求，默认 1MB 上限，超限直接返回统一 `ApiResponse` 结构的 HTTP 413；multipart 照片上传继续走 Spring 50MB 上传限制
- `FormServiceImpl` 在写入数据库和 Redis 前校验基础信息单字段长度、自评单字段长度、A-E 级别、空行和排序号范围，避免绕过前端提交超长字符串造成数据库、Redis、PDF/Excel 导出和页面渲染压力
- 照片上传的非法类别、空文件、伪造图片、超大文件和不支持 MIME 类型分别归类为明确的 400/413/415，避免客户端输入错误被当作服务端 500
- 前端 Axios 拦截器兼容 HTTP 4xx/5xx 下的统一 `ApiResponse.message`，避免把用户可处理的 API 错误显示成含糊网络错误
- 新增 `GlobalExceptionHandlerTest` 覆盖缺请求头、JSON 格式错误、上传超限、数据库异常和未知异常的响应格式与脱敏文案；新增 `ApiResponseStatusAdviceTest` 覆盖业务错误同步 HTTP 状态和成功响应不改状态；新增 `RequestBodySizeFilterTest` 覆盖超大 JSON 拒绝、正常 JSON 放行、multipart 放行和非 API 跳过；`FormServiceImplTest` 覆盖基础信息/自评超长输入、非法级别、空行和异常排序号在删除旧数据或写库前被拒绝

### API 安全响应头
- 新增 `SecurityHeadersFilter`，仅作用于 `/api/*` 响应，不影响前端静态资源缓存策略
- API 响应统一设置 `Cache-Control: no-store, no-cache, must-revalidate, max-age=0`、`Pragma: no-cache`、`Expires`、`X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Referrer-Policy: no-referrer`
- 敏感 JSON、照片下载、PDF/Excel 导出响应都继承禁缓存与基础安全头，降低浏览器缓存、代理缓存、MIME 嗅探、点击劫持和来源泄露风险
- 新增 `SecurityHeadersFilterTest` 覆盖 API 响应加头和非 API 静态资源不加禁缓存头

### PDF 导出资源保护
- `/api/admin/export-pdf/{id}` 在生成 PDF 前先执行 `SUM(OCTET_LENGTH(photo_data))` 统计当前提交照片总字节数，默认上限 100MB，避免超大照片组合被读入应用内存后再交给 OpenPDF 处理
- 上限可通过 `WEBTABLE_PDF_MAX_PHOTO_BYTES` 或 `app.export.pdf.max-photo-bytes` 调整；配置必须为正数
- 照片总量超限时返回 HTTP 413 + 统一 `ApiResponse`，管理员前端 PDF 下载会解析 blob 错误响应并显示后端脱敏文案
- 新增 `AdminServiceImplTest` 覆盖 PDF 照片预算超限会在加载 LONGBLOB 前拒绝，`GlobalExceptionHandlerTest` 覆盖 `ResponseStatusException` 到统一响应的转换
- 新增 `frontend/src/api/download.js` 收敛 PDF/Excel 二进制下载的文件名解析、下载触发和 blob 错误文案解析，避免重复下载逻辑

### 管理端列表分页性能优化
- `/api/admin/submissions` 增加 `page`、`pageSize` 查询参数，默认每页 20 条，服务端限制单页最多 100 条，避免全量查询和浏览器全量渲染
- 后端列表查询只选择 ID、步骤、完成状态、创建时间、更新时间，不返回 `session_token` 等敏感字段
- 管理员列表页显示总数、当前页、总页数和每页数量选择，桌面端表格与移动端卡片都只渲染当前页数据
- `submissions` 新增 `(completed, create_time, id)` 组合索引，支撑已完成提交列表按时间倒序分页；存量库迁移脚本为 `database/v4-admin-list-pagination/migrate.sql`
- `AdminServiceImplTest` 增加分页参数归一、单页上限和列表脱敏断言

### Excel 导出分批查询优化
- 全量 Excel 导出保留单文件下载体验，但后端改为每 500 条已完成 submission 一批分页查询，避免一次性加载所有提交、基础信息和自评数据
- 每批内继续使用 `IN (submission_id)` 批量查基础信息、左侧自评和右侧自评，避免回到 N+1 查询
- 导出工作簿始终创建“基础信息”和“接受程度自评”两个 Sheet；无数据时也保留表头，方便管理员识别导出格式
- 文本单元格写入前会转义 `=`、`+`、`-`、`@` 开头的用户输入，防止 Excel 公式注入
- 新增 `ExportServiceImplTest` 覆盖跨批次写入、空数据表头、真实 `exportAllToExcel()` 输出字节和公式注入转义

### 管理端详情数据最小化
- `getSubmissionDetail()` 不再把完整 `Submission` 实体放入响应，改为只返回 `id/currentStep/completed/createTime/updateTime` 摘要
- 防止管理员详情接口把填写端 `sessionToken` 透传给前端，降低浏览器侧 token 泄露风险
- `AdminServiceImplTest` 增加详情响应脱敏断言，确保响应内容不包含原始 session token

### 管理端已完成提交边界
- `AdminService` 新增 `validateCompletedSubmission()`，作为管理端详情、PDF 和照片下载共同复用的已完成提交校验
- `getSubmissionDetail()` 和 `exportPdf()` 会拒绝不存在或尚未完成的 submission，避免管理员通过猜测 ID 访问填写中的草稿
- `PhotoController` 管理端照片下载路径除校验 `X-Admin-Token` 外，还会校验照片所属 submission 已完成；填写端本人草稿照片下载仍按 `X-Session-Token` 归属校验放行
- `AdminServiceImplTest` 覆盖草稿详情和草稿 PDF 拒绝；`PhotoControllerTest` 覆盖管理员不能下载草稿照片、能下载已完成照片，以及填写端本人仍可下载草稿照片

### PDF 导出字体链路修正
- 移除无效的 `src/main/resources/fonts/NotoEmoji-Regular.ttf` 资源；该文件实际为 HTML 文档而非 TTF 字体，继续打包会造成运行时误导和 fallback 噪音
- `AdminServiceImpl.createCjkBaseFont()` 改为直接按操作系统选择常见 CJK 字体，并最终回退到 OpenPDF 内置 `STSong-Light`
- PDF 基础信息、自评项目、备注和分组标题写入前统一通过 `safeStr()` 过滤 Unicode 增补平面字符，避免 emoji 等 SMP 字符触发 OpenPDF CJK 字体宽度异常
- `AdminServiceImplTest` 增加 PDF 导出测试，覆盖中文字段、emoji 输入和自评分组标题，断言导出结果为有效 `%PDF` 字节流

### 交付文档补齐
- 新增 `docs/DEPLOYMENT.md`，覆盖环境要求、数据库初始化、必需环境变量、预检脚本、后端/前端构建启动、Nginx 示例、跨端访问配置、生产检查清单和常见排障
- 新增 `docs/SQL_GUIDE.md`，覆盖 7 张业务表用途、新库初始化、v2/v3/v4 存量迁移顺序、备份建议、字符集、索引和数据库账号权限建议
- 新增 `docs/USER_MANUAL.md`，覆盖填写者三步填写/上传/提交流程、管理员登录/列表/详情/PDF/Excel/退出流程、常见问题和隐私安全提醒
- `README.md` 增加完整交付文档入口，方便部署、数据库维护和业务使用按角色查阅

## 9. 验证方式

- `./mvnw clean compile` 后端编译通过
- `./mvnw test` 后端完整测试通过（59 个测试），覆盖 `AdminConfigTest`、`CorsConfigTest`、`RequestBodySizeFilterTest`、`SecurityHeadersFilterTest`、`ApiResponseStatusAdviceTest`、`GlobalExceptionHandlerTest`、`AdminServiceImplTest`（含管理端草稿拒绝、PDF 中文/emoji fallback 导出）、`PhotoControllerTest`（管理端草稿照片拒绝）、`FormServiceImplTest`（含输入规模和自评级别边界）、`ExportServiceImplTest`、`PhotoServiceImplTest` 与应用上下文启动测试
- `npm run build` 前端生产构建通过；当前仅保留 Node/Vite 的 `[DEP0205] module.register()` deprecation warning
- 前端 UI 巡检：`npm run dev -- --host 127.0.0.1` + `./mvnw spring-boot:run` 本地联调可进入填写流程；390px 移动视口下 Step1/Step2/Step3 均无横向溢出，input/button/select/备注输入触控高度为 44px，Step2 上传槽位保持正方形，Step3 自评行改为纵向控件布局；1280px 桌面视口下 Step3 双栏行布局无横向溢出
- `scripts/preflight-check.sh` 联调/部署前置检查 Java、Node.js、Maven Wrapper、必要环境变量、Redis、MySQL、业务表、模板数量与端口占用；当前缺 `WEBTABLE_ADMIN_PASSWORD`、`WEBTABLE_DB_PASSWORD`，且 Redis `127.0.0.1:6379` 不可达，MySQL 连接因数据库密码为空被跳过，因此真实端到端联调暂未执行
- `docs/DEPLOYMENT.md`、`docs/SQL_GUIDE.md`、`docs/USER_MANUAL.md` 已补齐初版交付说明，后续真实联调完成后继续补充环境实测记录
- `npm run dev` 前端启动
- 填写流程测试 + 预览弹窗 + 保存
- /admin 登录 → 列表 → 详情 → 导出 PDF
- 手机浏览器访问各页面
