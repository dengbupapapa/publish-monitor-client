# Tasks

## 1. 接口层校验

- [x] 1.1 `scheduledTasks.js` 的 `validateForm` 增加 `biz_scope` 必填校验，同步更新 JSDoc 注释、参数与返回值类型；验证：`node --test` 全部通过
- [x] 1.2 `scheduledTasks.test.js` 新增或扩展校验断言，覆盖 `validateForm` 对空 `biz_scope` 返回字段级错误；验证：`node --test src/api/scheduledTasks.test.js` 通过

## 2. 表单组件

- [x] 2.1 `ScheduledTaskForm.vue`：errors reactive 加 `biz_scope`，watch 增加对 `form.biz_scope` 的监听与清理，submit 解包处理 `errors.biz_scope`，`applyServerError` 加 `field === 'biz_scope'` 分支；验证：`npm run build` 通过
- [x] 2.2 模板中账号 `a-form-item` 加 `required` / `:validate-status` / `:help`，placeholder 改为必填提示；验证：`npm run build` 通过，打开新增弹窗账号字段显示红星

## 3. 集成验证

- [x] 3.1 `node --test` 与 `npm run build` 全部通过
- [x] 3.2 浏览器走查：新建空账号提交被拦截、账号填值后可提交、编辑清空账号提交被拦截；验证：临时创建的任务随后删除，列表恢复初始状态
