# Design

## Context

动机见 `proposal.md`。当前实现的相关事实：

- `src/components/cron/CronInput.vue`：文本框与 `@vue-js-cron/light` 的 `CronLight` 共享同一表达式值，并用一个 `pickerPeriod` ref（默认 `year`）配合 watch 强制切换周期，避免键入的日/月/周字段被当前周期的可见字段裁剪。
- `@vue-js-cron/light@5.2.4` 的周期推断在 `dist/light.js`：`year` 周期的可见字段是 `month/day/dayOfWeek/hour/minute` 全集，推断函数按 `periods` 逆序（year 在前）查找，任何含值的五段式都会命中 `year`。周期本身不属于 cron 值，无法从表达式还原用户当初的选择。
- `src/components/schedule/ScheduledTaskForm.vue`：表单 state 含 `biz_scope`（平台）与 `biz_type`（账号）；创建态默认选中字典首项，并有「字典晚到补首项」的 watch。
- `src/api/scheduledTasks.js`：`buildSchedulePayload` 固定产出 `name/job_type/cron/biz_scope/biz_type`；`createScheduledTask` 固定发送这五个字段；`updateScheduledTask` 只发送 patch 中显式提供的字段。后端 `biz_type` 可选，缺省保持原值。
- `src/views/ScheduledTaskList.vue`：列「平台」绑 `biz_scope`、「账号」绑 `biz_type`，表格 `scroll.x = 1200`，操作列无固定。

## Goals / Non-Goals

**Goals:**

- cron 编辑区改为点选器单入口，并保持现有校验与执行时间预览能力
- 表单只暴露名称、任务类型、账号、cron 四个字段，账号映射 `biz_scope`
- 列表列、载荷字段与表单字段三者语义一致
- 用最小改动满足操作列固定与任务类型默认空

**Non-Goals:**

- 不修改/升级/打补丁 `@vue-js-cron/light`
- 不新增本地持久化来记住周期选择
- 不改后端判重规则，不做存量 `biz_type` 数据迁移

## Decisions

### D1: cron 编辑区采用点选器单入口

移除 `CronInput.vue` 中的 `a-input` 与 `onInput`，模板顺序改为：点选器 → 小号只读表达式文本（mono + muted）→ 错误提示/中文描述与接下来执行时间。表达式只由点选器的 `update:modelValue` 写入。

- 理由：用户明确要求移除输入框；单入口消除「键入值被周期裁剪」的双向联动复杂度。
- 代价：不支持手动键入与粘贴。历史数据中无法解析的表达式仍会按 `isValidCron` 展示校验错误并阻止提交，用户点选任一字段即可让组件基于字段值重建合法表达式。
- 备选：保留输入框并下移（不满足「移除输入框」）；只读文本可切换为可编辑（增加状态与交互，超出本次范围）。

### D2: 周期不回显不修库，仅清理项目侧临时代码

删除 `pickerPeriod` ref、监听 `props.modelValue` 的 watch，以及传给组件的 `:period` 与 `@update:period`。周期完全由组件内部管理与推断。

- 理由：根因是 `@vue-js-cron/light` 的逆序推断必然落到 `year`，且周期不编码在 cron 中，项目侧无法精确还原；按「库自身问题先不解决」的口径处理。
- 行为影响：重新打开任务时周期仍显示为「每年」，与现状一致。
- 备选：按表达式启发式推断周期（无法还原显式选择的更宽周期，且 minute/hour 周期可见字段为空或仅 minute，推断不可靠）；按任务 id 存 localStorage（引入额外状态，创建态无 id 不可覆盖）。均不采用。

### D3: 业务范围字段映射为「账号 → biz_scope」

- `ScheduledTaskForm.vue`：state 保留 `biz_scope`，删除 `biz_type`；账号输入框 `v-model` 绑定 `form.biz_scope`；编辑预填取 `initial.biz_scope`；删除平台表单项。
- `scheduledTasks.js`：`buildSchedulePayload` 只产出 `name/job_type/cron/biz_scope`；`createScheduledTask` 的 body 去掉 `biz_type`；`updateScheduledTask` 不动，patch 未带 `biz_type` 即保留原值。
- `ScheduledTaskList.vue`：删除「平台」「账号」两列，新增单列「账号」绑 `biz_scope`，并删除对应的 `biz_type` 渲染分支。
- 理由：界面只保留一个业务范围输入，且用户指定其对应后端 `biz_scope`；列表跟随同一语义，避免输入值显示到「平台」列。
- 已知影响：后端判重键包含 `biz_type`，存量 `biz_type` 不同造成的「业务范围重复」无法在界面消解；本次接受该限制。
- 备选：只改表单不改列表（语义错位）；编辑时显式清空 `biz_type`（丢失存量数据）。均不采用。

### D4: 任务类型默认空

删除 `initFromProps` 中创建态的默认首项赋值，以及字典晚到自动补首项的 watch。必填校验复用 `validateForm` 中现有的 `job_type` 判空。

- 理由：用户要求默认空且必填；字典失败时下拉本就禁用并提示加载失败，无需额外兜底。
- 备选：保留默认首项（与需求冲突）。

### D5: 操作列固定

`ScheduledTaskList.vue` 的 `actions` 列增加 `fixed: 'right'`。表格已有 `:scroll="{ x: 1200 }"`，满足 ant-design-vue 固定列的前提；列宽总和与 `scroll.x` 保持现状，必要时同步调整 `scroll.x`。

- 备选：CSS `position: sticky` 手写（与表格内部滚动容器耦合，不采用）。

## Risks / Trade-offs

- [失去 cron 手动键入/粘贴能力，历史不可解析表达式无法直接改字符串] → 编辑时仍展示校验错误；用户点选任一字段即可重建合法表达式。若后续确有需要，可再评估「只读文本切换手动编辑」。
- [存量 `biz_type` 在列表不可见，且由它引起的判重冲突界面无法消解] → 已确认为可接受；不做数据迁移，必要时后续单独处理。
- [空表单下点选器默认停在「每年」周期且字段全为 `*`，可读性一般] → 与现状一致，本次不引入默认周期或引导文案。
- [操作列固定后窄屏下列宽挤压] → 固定列依赖 `scroll.x`，走查时确认 1200 宽度下操作列完整可见。

## Migration Plan

纯前端发布，无数据迁移。上线后即刻生效：新建/编辑不再提交 `biz_type`，列表不再展示 `biz_type` 列。回滚只需还原 `CronInput.vue`、`ScheduledTaskForm.vue`、`ScheduledTaskList.vue`、`scheduledTasks.js` 与相关单测；后端无需变更。

## Open Questions

- 新建任务时 cron 为空，是否需要在只读表达式处补一句引导文案或预置默认表达式（不影响本次规格与实现路径，可后续迭代）。
