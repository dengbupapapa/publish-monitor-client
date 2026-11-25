# Proposal

## Why

后端 `publish-compliance-monitor` 已把定时任务能力扩展到位：任务支持按 `job_type`/`biz_scope`/`biz_type`/`biz_name`/`params` 组合判重与编辑（`PATCH /diff-schedules/{id}` 全字段增量更新），并新增了流程类型字典接口 `GET /job-types`（`{value, label}`）与列表分页/筛选。前端 `publish-monitor-client` 的定时任务页仍停留在「名称 + cron」的极简版：无法编辑已有任务，看不到任务类型/平台/账号，且列表仍按「返回数组」解析——后端已改为 `{total, rows}` 分页结构，不改会直接坏掉。本次把前端补齐到与后端契约一致。

## What Changes

- **任务可编辑**：列表每行新增「编辑」，点击打开预填表单，`PATCH /diff-schedules/{id}` 保存。新建与编辑共用同一个表单组件。
- **表单参数新增**：任务类型 `job_type`（下拉，必填，选项来自 `GET /job-types`）、平台 `biz_scope`（文本）、账号 `biz_type`（文本）。
- **不暴露字段**：`biz_name`、`params` 不在界面展示，编辑时也不发送（PATCH 只改提供的字段，原值自然保留）。
- **列表展示新增列**：任务类型（`job_type` 经 `/job-types` 的 `label` 转中文）、平台、账号。
- **列表适配后端分页（BREAKING 契约变更）**：`GET /diff-schedules` 由数组改为 `{total, rows}`，并接受 `pageNum`/`pageSize` 与筛选参数。前端改为分页渲染。
- **任务类型筛选用「全部」承载原语义**：由于后端已把创建时 `job_type` 改为**必填**，「全部=不传 job_type」在创建表单中不再成立；「全部」下移为列表「任务类型」筛选项的默认值（不传筛选参数即全部）。该取舍在 design.md 记录并向评审明示。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `scheduled-task-list`：
  - 「定时任务列表展示」——新增任务类型/平台/账号列，改为分页展示，新增按任务类型筛选
  - 「创建定时任务」——表单新增必填任务类型下拉与平台/账号文本字段；`biz_name`/`params` 不暴露
  - 新增「编辑定时任务」——行内编辑入口、预填表单、PATCH 增量保存与错误归位

## Impact

- 代码（本仓库）：
  - `src/views/ScheduledTaskList.vue`——列表列、分页、编辑入口、共用表单接线
  - 新增 `src/components/schedule/ScheduledTaskForm.vue`（新建/编辑共用表单）
  - `src/api/scheduledTasks.js`——列表分页与筛选、创建补字段、新增 `updateScheduledTask` 与 `listJobTypes`、错误按业务码归位
  - `src/api/scheduledTasks.test.js`——随契约更新
- 依赖后端接口：`PATCH /diff-schedules/{id}`（已存在）、`GET /job-types`（已存在）、`GET /diff-schedules` 分页（已存在）。本次不改后端。
- 已知外部缺口（不在本变更范围）：后端 `openspec/specs/diff-schedule/spec.md` 尚未补 `/job-types` 的字典需求（代码与测试已实现）。
- 前置提示：本仓库存在已终止的试验变更 `try-cron-zen-editor`（代码零改动、任务全取消），归档前建议先处理它，避免其失效的 spec delta 干扰主 spec。
