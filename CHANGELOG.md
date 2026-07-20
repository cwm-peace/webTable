# CHANGELOG

所有项目的功能更新、bug 修复和需求变更都会记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)。

## [Unreleased]

### Changed
- 非 multipart `/api/*` 请求新增默认 1MB 请求体限制，超限在进入控制器和 JSON 反序列化前返回 HTTP 413，照片 multipart 上传继续使用 50MB 限制
- 填写端基础信息和自评保存新增服务端输入规模校验，超长字段、非法自评级别、空自评行和异常排序号会在删除旧数据或写库前被拒绝，降低数据库、Redis、导出和页面渲染被恶意放大的风险
- JSON API 业务错误现在会将 `ApiResponse.code` 同步为 HTTP 状态码，避免鉴权失败、限流、参数错误和资源不存在被网关、日志或监控误判为 HTTP 200
- 照片上传错误分类更精确：非法类别、空文件、伪造图片内容归为 400，上传过大归为 413，不支持的图片 MIME 归为 415
- 管理员详情接口不再返回完整 `Submission` 实体，改为返回不含填写端 `sessionToken` 的安全提交摘要
- 管理端详情、PDF 导出和管理员照片下载统一限制为已完成提交，拒绝通过猜测 submission/photo ID 访问仍在填写中的草稿数据
- 公开创建草稿接口 `POST /api/form` 增加 Redis 客户端限流，默认 10 分钟最多 20 次，命中限流时返回 429 且不写入空 submission
- 填写端草稿读写和照片归属校验只允许访问未完成提交，防止最终提交后旧 `sessionToken` 通过数据库回源继续改写已提交数据
- 第3步自评保存增加服务端行数限制：左侧最多 65 行、右侧最多 60 行，超限请求会在删除旧数据前被拒绝，避免恶意超大数组造成写放大
- 全量 Excel 导出会转义用户输入中以 `=`、`+`、`-`、`@` 开头的文本单元格，防止管理员打开导出文件时触发公式注入
- 全量 Excel 导出改为按 500 条 submission 分批查询基础信息和自评数据，避免导出时一次性加载所有提交关联记录
- Excel 导出在空数据时也会生成包含“基础信息”和“接受程度自评”表头的工作簿，保持导出格式稳定
- PDF 导出新增照片总量预算，默认单个提交嵌入照片总字节数超过 100MB 时在读取 LONGBLOB 前返回 HTTP 413，可通过 `WEBTABLE_PDF_MAX_PHOTO_BYTES` 调整
- PDF 导出移除无效的 `NotoEmoji-Regular.ttf` 资源依赖，改为系统/OpenPDF CJK 字体 fallback，并在写入基础信息、自评行和分组标题前过滤 emoji 等 Unicode 增补平面字符，避免字体宽度异常
- 管理员提交列表改为服务端分页查询，默认每页 20 条并限制单页最多 100 条，前端列表页同步增加页码、总数和每页数量控制
- `submissions` 表新增 `(completed, create_time, id)` 组合索引，支撑管理员已完成记录列表按时间倒序分页查询
- API 响应新增禁缓存和基础安全响应头，覆盖 `/api/*` 下的 JSON、照片下载、PDF/Excel 导出，降低敏感数据缓存、MIME 嗅探、嵌入和来源泄露风险
- 后端新增全局异常响应边界，缺少请求头/参数、JSON 格式错误、上传超限、数据库异常和未知异常统一返回脱敏 `ApiResponse`
- 前端 Axios 错误拦截器兼容 HTTP 4xx/5xx 下的统一响应，优先展示后端脱敏后的 `message`
- 前端 PDF/Excel 二进制下载现在会解析 blob 中的统一错误响应，413/403 等下载失败场景能显示后端脱敏文案
- 照片上传增加文件头签名校验，拒绝伪造 MIME 或声明类型与真实图片类型不一致的文件
- 前端管理端管理员 token 读写和清理收敛到 `adminAuth.js`，路由守卫统一保护列表页和详情页
- Axios 响应拦截器和 PDF/Excel/照片二进制请求增加 401/403 会话失效处理，token 过期或被吊销时自动回登录页
- 管理员登录增加按客户端的 Redis 失败次数限流，默认 15 分钟内失败 5 次后锁定 15 分钟
- 管理员密码比较改为固定长度摘要 + 常量时间比较，降低登录时间侧信道风险
- 管理端退出登录改为调用后端 `/api/admin/logout`，立即吊销 Redis 中的管理员 token
- 完整后端测试链路修正：`WebTableApplicationTests` 使用测试专用强管理员密码启动上下文，生产环境仍强制显式配置管理员密码
- 测试依赖排除当前未使用的 Mockito 传递依赖，避免 Mockito inline mock maker 在 JDK 21+ 环境中依赖动态 agent attach
- 数据库连接和管理员密码改为环境变量驱动，移除 `application.yml` 中的 root 明文密码和默认管理员弱密码
- 管理员配置增加启动校验，空密码、默认弱密码和 12 位以下密码会阻止应用启动
- CORS 从默认全来源放开改为配置驱动白名单，默认仅允许本地开发来源，并显式限制跨域请求头和方法
- 照片上传规则改为前后端一致：服务端校验照片类别白名单、每类最多 4 张、MIME 类型大小写归一、图片文件头签名，并在删除后补回 1-4 的空槽
- `photos.photo_data` 从 MEDIUMBLOB 调整为 LONGBLOB，匹配 50MB 上传限制；新增照片槽位唯一索引防止并发重复排序
- 全量 Excel 导出入口从填写端提交成功页移至管理员列表页，前端请求改为携带 `X-Admin-Token`，与后端管理员鉴权保持一致
- 填写端草稿恢复改为优先复用已有会话，前端会话令牌兼容 localStorage + sessionStorage，降低刷新后误建 submission 的概率
- 第1步与第3步改为切步即保存，预览前先保存当前步骤，最终提交后清理本地会话和 Redis 草稿缓存
- 第3步接受程度自评从双 vxe-table 重构为按类型分组的卡片式表单，减少移动端横向滚动和内层滚动
- 后端步骤接口增加 sessionToken 与 submissionId 归属校验，completeSubmission 支持 Redis miss 后回源数据库
- **PC/手机端差异化布局**：所有页面去掉 `max-w-[1100px]` 居中限制，改为 `lg:px-10` 全宽布局；PC 端（≥1024px）多列网格充分利用宽屏；手机端（<768px）全局输入框/按钮最��高度 44px 减少误触；Step3 左右栏在 PC 端并排显示
- 新增"培养意向"字段：`personal_info` 表新增 `training_intention TEXT` 列（位于 `remark` 之后），前端填写页"其他"卡片同步新增 Textarea，管理员详情页和 PDF 导出同步展示

### Added
- `RequestBodySizeFilter` 和 `RequestBodySizeFilterTest`，覆盖超大 JSON 拒绝、正常 JSON 放行、multipart 放行和非 API 路径跳过
- `ApiResponseStatusAdvice` 和 `ApiResponseStatusAdviceTest`，覆盖 JSON API 业务错误同步 HTTP 状态以及成功响应不改写状态
- `frontend/src/api/download.js`，收敛 PDF/Excel 二进制下载的文件名解析、下载触发和 blob 错误文案解析
- `docs/DEPLOYMENT.md`，覆盖环境要求、数据库初始化、环境变量、预检、构建启动、Nginx 示例、跨端访问、生产检查和排障
- `docs/SQL_GUIDE.md`，覆盖完整 SQL 脚本、存量迁移顺序、备份、索引和数据库权限建议
- `docs/USER_MANUAL.md`，覆盖填写者流程、管理员流程、导出说明、常见问题和隐私安全提醒
- `AdminServiceImplTest` 新增 PDF 导出用例，覆盖中文字段、emoji 输入和自评分组标题，并断言生成有效 `%PDF` 字节流
- `PhotoControllerTest`，覆盖管理员不能下载草稿照片、管理员可下载已完成提交照片，以及填写端本人仍可下载草稿照片
- `SecurityHeadersFilterTest`，覆盖 `/api/*` 响应安全头和非 API 静态资源跳过禁缓存策略
- `scripts/preflight-check.sh`，用于联调/部署前检查 Java、Node.js、Maven Wrapper、必要环境变量、Redis、MySQL、业务表、模板数量和端口占用
- `ExportServiceImplTest`，覆盖 Excel 跨批次分页写入、空数据表头、真实导出字节输出和公式注入转义
- `FormServiceImplTest`，覆盖创建草稿限流、第3步左右自评行数上限、边界值保存、超限时不删除旧数据，以及已完成提交拒绝旧填写会话继续改写
- 数据库迁移 `database/v4-admin-list-pagination/migrate.sql`，用于给存量库补齐管理员列表分页查询索引
- `GlobalExceptionHandlerTest`，覆盖缺请求头、JSON 格式错误、上传超限、数据库异常和未知异常的统一响应与信息脱敏
- `AdminServiceImplTest`，覆盖管理员 token 创建/吊销、登录失败锁定、成功登录清理失败记录、提交列表分页脱敏和详情响应 session token 脱敏
- `AdminConfigTest`，覆盖管理员空密码、默认弱密码和强密码启动校验
- `CorsConfigTest`，覆盖 CORS 来源白名单，防止跨域策略退回全开放
- 数据库迁移 `database/v3-photo-upload-constraints/migrate.sql`，用于升级照片容量和槽位唯一约束
- `PhotoServiceImplTest`，覆盖照片非法类别、每类 4 张上限、删除后补空槽、伪造 MIME 和声明类型/真实类型不匹配
- Maven Wrapper 脚本与配置，确保 `./mvnw clean package`、`./mvnw spring-boot:run` 等后端命令在新环境可直接使用
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
