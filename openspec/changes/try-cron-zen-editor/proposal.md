# Proposal

## Why

当前定时任务创建表单的 cron 编辑是纯文本输入框（自研 CronInput + cronstrue/cron-parser 预览）。调研（见对话记录）显示 `@cron-zen/vue3` 是生态中唯一"原生 Vue3 + 中文口语化展示 + 自带下次触发预览"的可视化编辑器，值得实际接入验证——若验证通过，可用成熟可视化编辑器替换自研控件并退役 cronText.js；若不通过，按预留的回滚路径退回现状。

## What Changes

- 在 `CronInput.vue` 内部接入 `@cron-zen/vue3` 可视化编辑器（v-model 对外接口不变），用户可通过点选生成表达式，也保留直接输入能力
- 验证三项硬性闸门，全部通过才算落地：
  1. 输出被约束为服务端 croniter 接受的**标准五段式**（禁用 Quartz 的秒/年字段与 `?` 问号）
  2. 暗色主题下渲染正常
  3. 编辑过程中实时提供中文可读描述与"接下来几次触发"预览，满足现有 spec 场景
- 闸门通过后退役 `src/components/cron/cronText.js`（及 cron-parser/cronstrue 依赖）；`scheduledTasks.js` 的 `isValidCron`/`validateForm` 校验闸门与服务端校验保留不动
- 闸门任一不通过 → 按任务清单中的回滚步骤还原为现状实现，并在本变更记录结论

## 验证结论（2026-11-24，探索未通过、试验终止）

接入前 API 考察即触发了闸门一失败（按 design D5 终止，未改动任何代码）：

- `@cron-zen/core` 的 `CronState` 固定 Quartz 七段字段模型（`CronFieldName` 含 `second`/`year`），`getCronTabs()` 文档写死"七段"，`createDefaultCronState()` 示例产物即 `* * * * * ?`（含秒与 `?`）
- `GenerateOptions` 仅有 `weekFormat` 与日周互斥修正，**无标准五段式/方言配置项**；`CronZen.vue` 组件层也无方言开关——库无法被配置为五段式
- 附带发现：`CronZenPicker` 依赖 Element Plus，与本项目 antd-vue 4 冲突，不可用

后续调研确定替代方案 `@vue-js-cron/light`（默认即五段式、内置 cn locale、CSS 变量驱动主题、上游活跃），已立新变更 `try-cron-light-editor` 接入。本依赖（0.2.5）已卸载，CronInput 从未被改动。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `scheduled-task-list`：`创建定时任务` 需求——cron 编辑方式从纯文本输入改为可视化编辑器（点选生成 + 可输入），无效表达式的错误展示与提交禁用行为不变，实时中文描述与下次执行时间预览保留

## Impact

- 代码：`src/components/cron/CronInput.vue`（内部替换）、`src/components/cron/cronText.js` + `cronText.test.js`（闸门通过则删除）、`src/views/ScheduledTaskList.vue`（不动或仅微调）
- 依赖：新增 `@cron-zen/vue3`（+ 其 core 依赖）；闸门通过后移除 `cronstrue`、`cron-parser`
- 服务端：无改动——croniter 最终校验闸门保持不变
- 回滚：还原 CronInput.vue 与依赖清单即回到现状，无数据迁移
