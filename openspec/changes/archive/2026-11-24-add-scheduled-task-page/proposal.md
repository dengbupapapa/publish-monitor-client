# Proposal

## Why

服务端（publish-compliance-monitor）已实现差异分析定时任务（`diff_schedule` 表 + `/diff-schedules` API），但客户端没有任何页面可以查看和管理这些任务，用户目前无法在界面上创建任务、控制任务启停或删除任务。

## What Changes

- 新增"定时任务"列表页：
  - 展示已创建的定时任务（名称、cron 表达式、启停状态、上次触发时间）
  - 创建定时任务（名称 + cron 表达式；cron 通过文本输入 + 校验 + 可读描述 + 下次执行时间预览的方式编辑）
  - 每行提供启停开关（a-switch，调用 PATCH 接口）
  - 每行提供删除操作（a-popconfirm 二次确认，调用 DELETE 接口）
- 扩展 `src/api/http.js` 的 `request()`，支持 POST / PATCH / DELETE 等带 body 的请求方法（当前只封装了 GET）
- 新增 API 模块 `src/api/scheduledTasks.js`，对接服务端 4 个端点
- 路由注册新页面（懒加载）

不做（明确排除）：
- 定时任务的编辑（改名/改 cron）：服务端 PATCH 目前只支持 `enabled`，待后端实现后再加
- 列表分页：服务端 `GET /diff-schedules` 返回全量列表，任务数量少，不做分页

## Capabilities

### New Capabilities

- `scheduled-task-list`: 定时任务列表页——展示定时任务、创建定时任务（名称 + cron 编辑）、启停开关、删除

### Modified Capabilities

（无——现有 `match-result-list`、`match-result-detail` 的需求不变）

## Impact

- 代码：`src/api/http.js`（扩展请求方法）、新增 `src/api/scheduledTasks.js`（含单测 `scheduledTasks.test.js`）、新增 `src/views/ScheduledTaskList.vue`、`src/router/index.js`（新增路由）
- 依赖：新增 `cronstrue`（cron 表达式中文可读描述，纯前端）；下次执行时间预览用 `cron-parser`（纯前端本地计算，避免依赖服务端扩展）
- API：依赖服务端 `POST/GET/PATCH/DELETE /diff-schedules`，均已存在，无需服务端改动；错误信封 `{code, msg, data}` 与现有 `http.js` 剥壳逻辑兼容
