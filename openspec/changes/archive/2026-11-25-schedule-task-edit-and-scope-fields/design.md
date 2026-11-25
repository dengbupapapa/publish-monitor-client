# Design

## Context

See proposal.md - Why. 现状与约束（已核实）：

- **后端契约（`publish-compliance-monitor`，代码已实现）**
  - `GET /diff-schedules` 返回分页对象 `{pageNum, pageSize, total, rows}`，支持筛选参数 `name` / `job_type` / `biz_scope` / `biz_type` / `biz_name`；`pageSize` 上限 200。
  - `GET /job-types` 返回 `[{value, label}]`，`value` 来自流程注册表，`label` 为中文展示名（当前仅 `article_diff` → 「微信公众号文章对比」）。
  - `POST /diff-schedules`：`job_type` **必填且非空白**（缺失/空串/全空白 → 422）；`biz_scope`/`biz_type`/`biz_name`/`params` 可选。
  - `PATCH /diff-schedules/{id}`：增量更新，`null` 表示"未提供"、显式 `null` 或空 body → 422；不可识别字段 → 422；未知 `job_type` → 400（code 40005）；cron 非法 → 400（code 40002）；名称/业务范围冲突 → 409（code 40902），业务范围冲突文案含"业务范围"。修改 `job_type`/`biz_scope`/`biz_type` 会重算判重键，可能撞 409。
  - `biz_name`/`params` 由后端按层级名称派生/存储，前端无需也不应发送。
- **前端现状（本仓库）**
  - `src/views/ScheduledTaskList.vue`：本地 `tasks` ref 存全量数组，无分页/筛选；新建弹窗仅「名称 + cron」；操作列仅删除；`PATCH` 仅用于启停。
  - `src/api/scheduledTasks.js`：`listScheduledTasks()` 期望返回数组；`createScheduledTask` 只发 `{name, cron}`；`setScheduledTaskEnabled` 发 `PATCH {enabled}`；`send()` 把 `422` 归到 cron 错误、其余走 message。
  - `src/api/http.js`：拆信封 `{code, message, data}`，非成功码抛 `ApiError(code, message, status)`；业务码形如 `40002`/`40005`/`40902`。
  - `src/components/schedule/CronInput.vue`：已提供五段式「文本 + 可视化」编辑器与预览，本次复用，不改。
  - `src/views/MatchResultList.vue` + `src/stores/listPrefs.js`：已有成熟的分页 + 筛选模式（页码/条数走 route query、`pageNum` 从 1 起、条数选项、越界回落）。定时任务列表复用该模式以保持一致。
- **测试约定**：`node:test` + `node --test`，用 `withRecordingFetch` 录制 fetch、断言 URL 与 body。参见 `src/api/scheduledTasks.test.js`、`src/api/matchResults.test.js`。

## Goals / Non-Goals

**Goals:**
- 前端与后端新契约完全对齐，页面不再因分页结构变更而报错。
- 新建/编辑共用同一表单组件，字段与后端 ``job_type``/``biz_scope``/``biz_type`` 一致。
- 列表以中文展示任务类型并提供分页与任务类型筛选。
- 错误按业务码精确归位到字段/表单级。

**Non-Goals:**
- 不改后端代码与后端 spec。
- 不实现 `biz_name`/`params` 的展示或编辑。
- 不实现按名称/平台/账号的多字段筛选栏（后端已支持，留待后续；本次仅任务类型筛选）。
- 不改造 `CronInput.vue` 的编辑器逻辑。

## Decisions

### D1 · 新建与编辑共用一个表单组件

新增 `src/components/schedule/ScheduledTaskForm.vue`，入参 `mode: 'create' | 'edit'` 与可选的 `initial`（编辑时的任务对象）。同组件渲染字段、共用校验与预览。`ScheduledTaskList.vue` 负责打开/关闭与提交。

- 备选：新建沿用现有内联弹窗、编辑另写一个 → 字段重复、两处校验易漂移。放弃。

### D2 · `job_type` 在表单中必填，选项来自字典接口；「全部」只在列表筛选

- 表单下拉数据源为 `listJobTypes()`；创建时默认选中第一项（当前即 `article_diff`），提交必须带非空 `job_type`。
- 因后端已把 `job_type` 改为必填，「全部 = 不传 `job_type`」在创建/编辑表单不再成立。原「全部」语义下移为**列表**「任务类型」筛选项的默认值（不传 `job_type` 筛选参数 = 不限类型）。
- 该取舍偏离了最初 Q2 对表单的设想，已在 proposal 明示，供评审确认；若后续要求创建表单出现「全部」，需改后端为可省略，不在本变更范围。
- 字典接口拉取失败时：表单下拉退化为空并提示无法加载任务类型（禁用提交）；列表展示回退原始 `job_type` 标识。

- 备选：前端硬编码 `[{value:'article_diff',label:'微信公众号文章对比'}]` → 后端新增流程时前端需改代码，且违背"后端提供 map"的既定决策。放弃。

### D3 · 列表分页与筛选沿用 `MatchResultList` 的 route-query 模式

- 页码/条数/筛选写入路由 query（`pageNum` 从 1 起、`pageSize` 选项沿用项目约定、`job_type` 为筛选值，空值即「全部」时不写 query）。
- 请求参数映射：`pageNum`→`pageNum`、`pageSize`→`pageSize`、`job_type`→`job_type`（为空则省略）。
- 后端 `pageSize` 上限 200，前端条数选项不超过 200；页码越界（`(pageNum-1)*pageSize >= total`）回落到最后一页。
- 列：编号 | 名称 | 任务类型 | 平台 | 账号 | cron | 启用 | 上次触发 | 操作（编辑、删除）。宽表允许横向滚动。

- 备选：固定 `pageSize=200` 一次拉全、隐藏分页 → 任务超过 200 条会静默截断，属正确性缺陷。放弃。

### D4 · PATCH 增量语义 + 错误按业务码归位

编辑提交构造 payload 时：

- 只放表单展示字段：`name`、`job_type`、`cron`、`biz_scope`、`biz_type`。
- `biz_name`/`params` 一律不发送 → 后端保留原值。
- 平台/账号留空时发送 `""`（空串），后端会转为 `None` 并清空对应业务名称；**不得**发送 `null`（会触发 422）。
- `job_type` 始终为非空具体值。

错误归位（`send()` 需按 `ApiError.code` 优先、`status` 兜底）：

| 失败 | code / status | 归位 |
| --- | --- | --- |
| cron 非法 | `40002` / 400 | cron 字段 |
| 未知任务类型 | `40005` / 400 | 表单级（任务类型） |
| 名称冲突（文案不含"业务范围"） | `40902` / 409 | 名称字段 |
| 业务范围冲突（文案含"业务范围"） | `40902` / 409 | 表单级，展示后端文案 |
| 结构校验 | — / 422 | 表单级（前端校验应先拦截） |

- 顺带修正现状：现有 `send()` 把 `422` 归到 cron，导致真实的 400 cron 错误落到通用提示。改为按 code 判定。
- 名称冲突与业务范围冲突同为 `40902`，用文案是否含"业务范围"区分——这是后端唯一可区分信号。

### D5 · API 层签名调整

`src/api/scheduledTasks.js`：

- `listScheduledTasks(params)` → `GET /diff-schedules?pageNum&pageSize&job_type`，返回 `{total, rows}`；保持信封拆解。
- `createScheduledTask(payload)` → payload 扩展为 `{name, job_type, cron, biz_scope?, biz_type?}`（空的可选文本传 `""` 或不传，统一传 `""` 以与编辑一致）。
- 新增 `updateScheduledTask(id, patch)` → `PATCH /diff-schedules/{id}`。
- 新增 `listJobTypes()` → `GET /job-types`，返回 `[{value,label}]`。
- 保留 `deleteScheduledTask`、`setScheduledTaskEnabled`、`normalizeName`。

## Risks / Trade-offs

- **后端 `job_type` 必填与原「全部」诉求冲突** → 已在 proposal/design 明示，表单不含「全部」，改为列表筛选承载；评审可据此决定是否回退后端。
- **409 靠文案区分名称/业务范围冲突，脆弱** → 后端若改文案会误归位；退化为表单级提示仍可接受（不阻塞提交）。记录为已知耦合。
- **字典接口不可用时无法新建/编辑任务类型** → 表单禁用提交并提示；列表回退原始标识，不白屏。
- **分页结构为 breaking 变更** → 若后端未同步部署，旧数组响应会被新前端误判；两者需一起发布。
- **后端 spec 缺 `/job-types` 需求** → 与本仓库无关，仅在 proposal 记录，避免误以为后端能力未经声明。
- **死变更 `try-cron-zen-editor` 仍在途** → 其 spec delta 描述的是已放弃的 cron-zen 编辑器；归档前先处理，避免污染主 spec。

## Migration Plan

- 纯前端改造，无需数据迁移。
- 发布顺序：先确认后端 `/job-types` 与分页已上线，再发前端；回滚即回退前端版本。

## Open Questions

- 后端 `diff-schedule` spec 是否补 `/job-types` 字典需求（属后端仓库）。
- 名称/平台/账号多字段筛选是否后续补齐（本次仅任务类型）。
