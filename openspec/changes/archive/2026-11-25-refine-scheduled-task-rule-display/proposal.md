# Proposal

## Why

定时任务列表直接展示原始 cron 表达式，理解成本较高，且列表与新建、编辑表单的字段命名不够面向用户。需要统一以「任务规则」呈现，并复用现有中文描述能力，让用户无需掌握 cron 语法即可理解执行频率。

## What Changes

- 将定时任务列表的「cron 表达式」列更名为「任务规则」，有效表达式改为展示中文可读描述。
- 列表保留原始表达式的悬浮查看能力；中文描述过长时仍可省略展示，但悬浮提示须能查看完整中文描述与原始表达式。
- 无法解析的历史表达式不得导致列表渲染失败，回退展示原始表达式以便排查。
- 新建与编辑表单共用字段的标签改为「任务规则」，客户端生成的相关默认校验文案同步使用该名称。
- 保留现有可视化点选、只读表达式回显、中文预览和未来执行时间预览；服务端返回的业务错误文案仍原样展示。
- 不修改后端 `cron` 字段、接口载荷、五段式格式约束或实际调度行为，不新增组件或依赖。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `scheduled-task-list`: 调整列表任务规则的展示方式，以及新建、编辑表单中任务规则的命名与默认校验提示。

## Impact

- 影响 `src/views/ScheduledTaskList.vue` 的列定义与任务规则单元格展示。
- 影响 `src/components/schedule/ScheduledTaskForm.vue`、`src/components/cron/CronInput.vue` 和 `src/api/scheduledTasks.js` 的用户可见文案。
- 复用 `src/components/cron/cronText.js` 的现有 `describeCron`，并补充或调整 `src/api/scheduledTasks.test.js`、`src/components/cron/cronText.test.js` 等相关测试。
- 不涉及后端、路由、接口结构、数据库或依赖变更。
