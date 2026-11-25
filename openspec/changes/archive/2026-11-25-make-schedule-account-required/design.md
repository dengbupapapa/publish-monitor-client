# Design

## Context

上一轮 UI 优化已将 `biz_scope` 作为唯一业务范围输入，表单 state 只有四个字段（`name/job_type/cron/biz_scope`），载荷构造与 `validateForm` 都只处理这四个。当前 `validateForm` 只校验 `name/job_type/cron`，注释里明确写着 `biz_scope` 为可选。

## Goals / Non-Goals

**Goals:**

- 让账号（`biz_scope`）的必填校验覆盖创建和编辑路径
- 保持与现有字段同样的校验归位方式：`validateForm` 函数返回 `errors.biz_scope`，`ScheduledTaskForm.vue` 的 errors/watch/submit/applyServerError/模板表单项全部同步新增这一条

**Non-Goals:**

- 不改载荷构造或 API 层（`buildSchedulePayload` 已透传 `biz_scope`，必填与否与载荷无关）
- 不改列表或其他 UI
- 不处理后端存量 `biz_type` 导致的判重冲突（之前已确认该限制）

## Decisions

### D1: 复用 validateForm 模式，不新增独立校验

在 `validateForm` 里新增一行 `if (!String(form.biz_scope ?? '').trim()) errors.biz_scope = '请输入账号'`，让函数签名和返回值都自然扩展。

- 理由：`validateForm` 已统一收口 `name/job_type/cron` 的必填校验，四个字段都是「创建/编辑都要填」的语义，放一起最直观；调用方 `ScheduledTaskForm.vue` 的 submit 只需解包多一个字段。
- 备选：组件内单独写 biz_scope 的校验（分散逻辑，不采用）。

### D2: 组件侧按 name/job_type/cron 的同款模式新增 biz_scope

- errors reactive 加 `biz_scope: ''`
- watch 的依赖数组与清理分支加 `form.biz_scope` / `errors.biz_scope`
- submit 解包时多一行 `errors.biz_scope = result.biz_scope || ''`
- applyServerError 加 `else if (field === 'biz_scope') errors.biz_scope = message`（服务端若返回该字段归位可直接命中）
- 模板 `a-form-item label="账号"` 加 `required` 属性、`:validate-status`、`:help`、placeholder 改为「请输入账号」

- 理由：完全复用现有三字段的模式，改动局部且对称，不会引入新的组件状态分支。
- 备选：给四个字段抽一个通用的 validateStatus 计算属性（三个字段就够简单，四字段不复杂，不额外抽象）。

### D3: 清空账号场景由 UI 拦截

之前 spec 中的「清空账号」场景在账号可选时是可达的；改为必填后，空值会在前端被 `validateForm` 拦截，不再发送到后端。spec delta 里把该场景改为「编辑时清空账号被拦截」，并把 Requirement 正文中的「账号被清空时 SHALL 以空值保存 biz_scope」删掉。

- 理由：前端必填 + 后端同样必填，清空语义消失。`updateScheduledTask` 继续只发送 patch 里显式提供的字段（不发 biz_scope 时后端保留原值），也不会出现空值覆盖。
- 备选：前端必填但仍允许用户手动清空后提交（会被后端拦截，产生无效往返，不采用）。

## Risks / Trade-offs

- [存量任务 `biz_scope` 为空时，首次打开编辑再保存会被前端拦截] → 这是服务端数据质量问题，与本次必填对齐的语义一致，存量空数据需手动补填；后端判重键本身要求 `biz_scope` 非空，空数据是历史异常。
- [用户习惯了账号可选，突然被拦] → placeholder 从「可留空」改为必填提示，表单提交按钮旁的校验即时反馈会引导用户。

## Migration Plan

纯前端改动，无数据迁移。回滚只需还原三处文件（`validateForm`、`ScheduledTaskForm.vue`、spec delta 归档）。后端无需变更。
