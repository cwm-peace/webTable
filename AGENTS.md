# 项目维护约定

当前项目是Vue 3纯静态本机填写工具，不再有Spring Boot、API、管理员、MySQL或Redis。任务开始前先读`plan.md`，修改需求或代码时同步`plan.md`、`README.md`、`CHANGELOG.md`。

使用Node.js≥22.13。根目录执行`npm ci`、`npm run dev`、`npm run build`、`npm test`、`npm run test:e2e`。完整固定版本验证执行`npm run verify:rounds`。

只修改当前任务必需的文件，修改前明确必要性及影响范围。保留未提交改动，不重置或删除重构前数据库。源码及旧后端恢复材料在项目外恢复目录，见plan.md；不要发布恢复材料。

所有填写数据留在浏览器。不得引入上传、IP采集、远程字体、统计或错误上报。新增行为必须保持用户明确确认保存后才清理，不把下载事件作为保存证明。处理Worker、Blob URL、自动保存、标签页版本和清除代次时须覆盖失败与竞态。

前端文件头解释用途；方法JSDoc解释参数、返回及用途；行注释说明原因。组件保持shadcn-vue和Tailwind语义样式，手机布局、可访问控件和可见错误反馈。元数据由src/data与formValidation统一维护，页面和PDF不另建题库。

纯前端、18岁声明和自动化测试不能证明内容合法。未真机验证的平台不得标为通过，法律报告不能承诺零风险。测试只能用虚构文字与合成图片。
