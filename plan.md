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

### 前端
- Vue 3 + Vite + vue-router
- shadcn-vue（Reka UI + Lucide + Slate 主题）
- Tailwind CSS v4 + @tailwindcss/vite
- @vueuse/motion（动画）
- vxe-table（第3步自评表格编辑）
- axios、pinia

## 2. 配置（application.yml）

- Spring Boot 3.5.13，端口 8081
- 数据源：`jdbc:mysql://localhost:3306/webtable`
- Redis：localhost:6379，无密码
- MyBatis-Plus：驼峰映射 + SQL 日志
- 文件上传限制：50MB
- 管理员密码：`admin.password`

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

## 5. 后端结构

```
com.peace.webtable/
├── config/          RedisConfig, CorsConfig, MyBatisPlusConfig, AdminConfig
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

- CORS 只允许 localhost:5173，限制 HTTP 方法和请求头
- 照片上传白名单校验（jpeg/png/gif/webp/bmp）
- 文件名去除路径分隔符
- 日志中 session token 只显示前4位
- 错误信息不暴露内部异常
- 管理员 token 验证（Redis 存储，24h 过期）

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
| GET | `/api/export/all` | 导出 Excel |

### 管理系统
| 方法 | 路径 | 功能 |
|---|---|---|
| POST | `/api/admin/login` | 管理员登录 |
| GET | `/api/admin/submissions` | 提交列表 |
| GET | `/api/admin/submissions/{id}` | 提交详情 |
| GET | `/api/admin/export-pdf/{id}` | 导出 PDF |

## 7. 前端结构

```
frontend/src/
├── App.vue                          路由出口（<router-view />）
├── main.js                          入口（Pinia + Router + Motion + VxeTable）
├── style.css                        Tailwind + shadcn-vue CSS 变量
├── lib/utils.js                     cn() 工具函数
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
│   ├── Step3Assessment.vue          自评表格（vxe-table）
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
- [ ] 联调测试

## 8.1 当前实施变更

### 手机端适配与 PC 端宽屏布局
- 所有页面容器：`max-w-[1100px]` → `px-4 sm:px-6 lg:px-10` 全宽
- PC 端（lg: ≥1024px）：Step1 3列网格，Step2 4列网格，Step3 左右栏并排，AdminDetail 信息 4列/照片 6列
- 手机端（<768px）：`style.css` 全局补丁，input/button 最小高度 44px
- 步骤标签：`text-xs sm:text-sm` 防小屏溢出；导航按钮 `h-11 sm:h-9`
- 草稿恢复改为优先复用已存在会话，前端 token 持久化到 localStorage + sessionStorage，切步时分步保存
- 后端 `completeSubmission()`、步骤读写接口支持 Redis miss 后回源数据库，并校验 `sessionToken -> submissionId` 归属关系
- 最终提交后清理本地 token 与 Redis 草稿缓存，避免继续复用旧草稿

## 9. 验证方式

- `./mvnw clean compile` 后端编译通过
- `npm run dev` 前端启动
- 填写流程测试 + 预览弹窗 + 保存
- /admin 登录 → 列表 → 详情 → 导出 PDF
- 手机浏览器访问各页面
