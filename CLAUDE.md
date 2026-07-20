# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

个人信息收集系统（Spring Boot 3.5.13 + Java 21），包含**填写系统**和**查看管理系统**。填写系统支持上千人同时在线填写，管理员系统支持查看所有提交数据并导出 PDF。所有页面适配手机端。

## Build & Run Commands

```bash
# 后端编译
./mvnw clean package

# 后端运行（端口 8081）
./mvnw spring-boot:run

# 运行单个测试
./mvnw test -Dtest=WebTableApplicationTests#contextLoads

# 前端开发（在 frontend/ 目录）
npm run dev  # 端口 5173
```

## Tech Stack

- **后端：** Spring Boot 3.5.13 (Java 21) + MyBatis-Plus 3.5.9 + MySQL + Redis + Apache POI + OpenPDF
- **前端：** Vue 3 + Vite + shadcn-vue + Tailwind CSS v4 + @vueuse/motion + vxe-table + Pinia + vue-router

## Project Documentation

每次代码或需求变更必须同步更新：
- `plan.md` — 实现计划和设计文档
- `README.md` — 项目介绍和使用说明
- `CHANGELOG.md` — 变更记录

每次执行任务前必须先读取 `plan.md`。

## 修改文件准则

不要自行修改其他文件，除非该问题**必须要**修改该文件才能解决。修改前必须通过以下三个问题自检：

1. **真的要改吗？** — 是否存在不改文件也能解决问题的方案（如运行时配置、解释说明等）？
2. **必要性是什么？** — 明确说明本次修改为什么是不可避免的。
3. **会不会造成其他功能 bug？** — 评估本次修改对其他模块、已有功能的影响范围，确保不会引入回归问题。

只有三个问题都有明确肯定的回答时，才执行修改。

## Code Conventions

**后端（Java）：**
- Package root: `com.peace.webtable`
- Javadoc 类注释 + 方法注释，行注释说明原因
- Logger 关键操作日志，敏感信息脱敏（session token 只显示前4位）
- 按业务域命名 Controller

**前端（Vue/JS）：**
- 文件头部块注释，JSDoc 方法注释，模板行注释
- 使用 shadcn-vue 组件 + Tailwind class 样式
- 所有页面适配手机端（Tailwind 响应式断点 sm/md/lg）

## Architecture

```
后端：
com.peace.webtable/
├── config/          RedisConfig, CorsConfig, MyBatisPlusConfig, AdminConfig
├── controller/      FormController, PhotoController, ExportController, AdminController
├── service/         FormService, PhotoService, ExportService, AdminService + impl/
├── mapper/          7 个 Mapper（含 Template）
├── entity/          7 个 Entity（含 Template）
├── dto/             ApiResponse, StepDataRequest
└── util/            SessionUtil, RedisUtil

前端：
frontend/src/
├── App.vue                    路由出口
├── components/FormWizard.vue  填写向导
├── components/admin/          管理员页面（登录/列表/详情）
├── api/                       API 层（form/photo/export/admin）
├── stores/form.js             Pinia 状态管理
├── router/index.js            路由配置
└── components/ui/             shadcn-vue 组件库
```

## Routes

- `/` — 填写页面（三步向导）
- `/admin` — 管理员登录
- `/admin/dashboard` — 提交列表
- `/admin/detail/:id` — 提交详情
