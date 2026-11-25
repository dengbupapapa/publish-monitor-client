# Proposal

## Why

定时任务的新增/编辑表单与列表在实际使用中有几处体验问题：cron 编辑区以文本框为主、点选器在下，重新打开任务时周期状态与用户选择不一致；列表操作列在宽表下需要横向滚动才能点到；任务类型默认选中首项，容易在无意识的情况下建错类型；业务范围有两个文本输入框（平台、账号），与实际只需填写一个账号信息的场景不符，且对应的后端字段是 `biz_scope`。

## What Changes

- cron 编辑区改为「可视化点选器在前 + 小号只读表达式文本」，移除文本输入框，不再支持手动键入/粘贴表达式（**BREAKING**：原有键入与点选双向联动能力移除）。
- 周期状态不回显问题定位为 `@vue-js-cron/light` 的周期推断策略（其推断永远落到「每年」），本次不修复库行为；仅清理项目侧强制 `period` 的临时代码，周期交由组件内部管理。
- 定时任务列表的操作列固定在右侧。
- 新建任务时任务类型默认为空，保持必填校验；移除字典晚到自动补首项的逻辑。
- 表单移除「平台」输入框，保留的「账号」输入框内容提交为后端的 `biz_scope`；`biz_type` 不再展示、不再提交，编辑时保留服务端原值（**BREAKING**：提交载荷字段变化，`biz_type` 不再出现在创建/编辑请求中）。
- 列表的「平台」「账号」两列合并为单一「账号」列，绑定 `biz_scope`；`biz_type` 列移除。
- 同步更新 `scheduledTasks.js` 的载荷构造与相关单测，以及 `scheduled-task-list` 的 spec 场景。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `scheduled-task-list`: 创建/编辑表单的字段清单与 cron 编辑方式改变（点选器单入口、移除平台、账号映射 `biz_scope`、`biz_type` 不展示）；列表展示的列清单改变（平台/账号合并为账号列）；任务类型的默认值行为改变。

## Impact

- 前端组件：`src/components/cron/CronInput.vue`、`src/components/schedule/ScheduledTaskForm.vue`、`src/views/ScheduledTaskList.vue`
- 前端接口层：`src/api/scheduledTasks.js`（`buildSchedulePayload`、`createScheduledTask`）
- 测试：`src/api/scheduledTasks.test.js`（`biz_type` 相关断言）
- Spec：`openspec/specs/scheduled-task-list/spec.md`（经本变更 delta 更新）
- 依赖与后端：不新增/不升级依赖（保留 `@vue-js-cron/light@5.2.4`）；无后端改动，后端 `biz_type` 为可选字段，缺省即保持原值/空值

## Non-Goals

- 不修复 `@vue-js-cron/light` 周期回显为「每年」的库行为，也不引入本地状态记住用户选择的周期
- 不调整后端业务范围判重规则，也不处理由存量 `biz_type` 引起的判重冲突
- 不在列表中展示存量 `biz_type` 数据
