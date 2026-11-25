# Proposal

## Why

上一轮 UI 优化把「平台/账号」合并为单一账号输入框并绑到后端 `biz_scope`，但账号字段在界面上仍是可选项。后端业务范围判重键为 `job_type + biz_scope + biz_type`，`biz_scope` 为空会让多个任务落到同一「空范围」并在创建时被服务端拦截；同时界面缺少必填校验会产生「保存失败 → 回来补填」的无效往返。这次让账号与名称、任务类型、cron 一样在前端强制必填，与后端语义对齐。

## What Changes

- `validateForm` 增加对 `biz_scope` 的必填拦截，返回字段级错误
- `ScheduledTaskForm.vue` 的 errors 映射、watch 清理、submit 解包、`applyServerError` 字段分支、模板表单项全部同步新增 `biz_scope`
- 表单 placeholder 从「账号标识（可留空）」改为必填提示
- 主 spec 中「账号可选」改为「账号必填」，创建/编辑的必填校验场景扩充为四字段

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `scheduled-task-list`: 创建/编辑表单的账号字段由可选改为必填；必填校验覆盖账号；spec 中引用「账号可选」的表述改写

## Impact

- 前端组件：`src/components/schedule/ScheduledTaskForm.vue`
- 前端接口层：`src/api/scheduledTasks.js` 的 `validateForm` 函数与 JSDoc；`classifyScheduleError` 现有服务端错误字段集合无需改动
- Spec：`openspec/specs/scheduled-task-list/spec.md`（经本变更 delta 更新）
- 测试：`src/api/scheduledTasks.test.js` 现有测试未断言 biz_scope 校验，原则上无需改；如需补充新校验断言可作为实现时的附加项
- 依赖与后端：无
