# 原型显示模式收敛实施计划

> **For agentic workers:** 按已获用户确认的设计执行；不修改 PDF 生成、布局、Worker 或字体。

**Goal:** 删除界面风格选择及其科技/扁平效果，只保留原型纸色/酒红视觉，并将明暗模式文案改为显示模式。

**Architecture:** 主题状态继续由现有 Pinia store 管理，固定 `minimal` 原型样式作为唯一视觉主题；仅持久化并读取 `light`、`dark`、`system` 显示偏好。组件、CSS、浏览器回归和项目文档同步更新。

**Tech Stack:** Vue 3、Pinia、Tailwind CSS、Playwright。

---

### Task 1: 先验证新的显示模式契约

- [x] 更新浏览器回归断言：无“界面风格”控件，存在“显示模式”并提供“跟随系统/日间/夜间”，旧 `tech` 偏好仍回到原型色板。
- [x] 运行该用例确认在旧实现下失败。

### Task 2: 收敛主题实现

- [x] 删除 ThemeControl 的风格下拉框。
- [x] 固定 theme store 为原型主题，保留显示模式持久化。
- [x] 删除 tech/flat CSS 变量分支与相关设计规范描述。

### Task 3: 同步文档与验证

- [x] 更新 README、CHANGELOG、plan、USER_MANUAL、COMPATIBILITY、VERIFICATION 和任务记录。
- [x] 运行构建、模块测试、目标浏览器回归、diff 检查和 PDF 校验和。
