# Proposal

## Why

前序探索变更 `try-cron-zen-editor` 在接入前考察中发现 `@cron-zen/core` 硬编码 Quartz 七段方言（`getCronTabs` 固定七段、`generateCron` 必产秒字段与 `?`），无法配置为服务端 croniter 要求的标准五段式——闸门一不可满足，按其设计 D5 应回滚。后续调研确定替代方案 `@vue-js-cron/light`：默认即标准五段式、内置中文 locale、CSS 变量驱动的暗色主题、上游持续维护，且与自研 CronInput 的 `v-model`/`disabled` 契约天然契合。

## What Changes

- 回滚 cron-zen 试验：卸载 `@cron-zen/vue3` 与 `@cron-zen/core`（CronInput 未被改动，无需还原代码）；将 `try-cron-zen-editor` 变更剩余任务标记为取消、记录结论后归档
- 在 `CronInput.vue` 内部接入 `@vue-js-cron/light`（精确锁版 5.2.4，`theme="ant"` + 内置 `cn` locale），与现有文本输入框组成混合模式：点选生成 + 直接键入共享同一 `v-model`
- 三项验证闸门（任一失败即按设计回滚）：
  1. 五段式：点选产物与键入值始终为标准五段式，`isValidCron` 闸门与服务端 croniter 兜底不变
  2. 主题：暗色主题下 CronLight 渲染可读（通过其 `--cl-*` CSS 变量覆盖适配）
  3. 预览与校验：cronText.js 的实时中文描述 + 3 次执行时间预览保留；组件 `@error` 事件接入现有表单错误链路；重点实测非法文本输入时组件内部状态表现
- 备选退路：若 CronLight 观感不可接受，切换同包的 `CronCore` 无渲染组件 + antd4 原生组件自建 UI（契约相同，仅换渲染层）

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `scheduled-task-list`：`创建定时任务` 需求——cron 编辑方式从纯文本输入升级为"文本输入 + 可视化点选"混合模式；无效表达式的错误展示与提交禁用行为不变；实时中文描述与下次执行时间预览保留

## Impact

- 代码：`src/components/cron/CronInput.vue`（内部新增 CronLight，对外契约不变）；`ScheduledTaskList.vue` 不动
- 依赖：移除 `@cron-zen/vue3`、`@cron-zen/core`；新增 `@vue-js-cron/light@5.2.4`（精确锁版，含 `@floating-ui/vue` 传递依赖）；`cronstrue`/`cron-parser` 保留
- 变更管理：归档 `try-cron-zen-editor`（记录验证未通过结论）
- 服务端：无改动，croniter 最终校验闸门不变
- 回滚：还原 CronInput.vue、调整依赖清单即回到现状，无数据迁移
