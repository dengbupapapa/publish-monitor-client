# Design

## Context

- 现状：`CronInput.vue` 是薄壳（对外仅 `v-model` + `disabled`），内部为文本输入 + `cronText.js`（cronstrue 中文描述 + cron-parser 下次执行时间预览）；`scheduledTasks.js` 的 `isValidCron`/`validateForm` 是客户端校验闸门，服务端 croniter 是最终闸门。
- 目标库 `@cron-zen/vue3`（0.2.5，发布 13 天）：core + vanilla + vue3 三层架构，中文口语化展示、自带"接下来几次触发"预览，默认 Quartz 方言。
- 服务端约束：croniter 只接受标准五段式；Quartz 的秒/年字段与 `?` 占位符会导致 422。
- 前置依赖：`add-scheduled-task-page` 需先归档，本变更 delta 才能落主 spec。

## Goals / Non-Goals

**Goals:**

- 用 `@cron-zen/vue3` 替换 CronInput 内部的编辑器 UI，对外接口（`v-model`、`disabled`）不变
- 三项验证闸门全部通过才允许落地：五段式约束、暗色主题渲染、实时描述 + 预览
- 闸门通过后退役 `cronText.js` 及 `cron-parser`/`cronstrue` 依赖

**Non-Goals:**

- 不改 `ScheduledTaskList.vue` 的表单流程与错误归位逻辑
- 不引入编辑已有任务的能力（等后端 PATCH 扩展）
- 不追求把库的其他方言（Quartz 全量）暴露给用户

## Decisions

### D1: 替换发生在 CronInput 内部，组件对外契约不变

`ScheduledTaskList.vue` 只认识 `CronInput` 的 `v-model`/`disabled`。库组件塞进 CronInput 内部，表单层零改动——这是上一次变更刻意留下的接缝，兑现它。

### D2: 五段式约束双保险——库配置 + 本地校验闸门

库默认 Quartz 方言。接入时优先通过库配置锁定五段式（禁用秒/年字段）；同时 `isValidCron` 继续作为提交前闸门，凡含 `?`、六/七段的产出一律拦截。两道都挡不住的（库配置行为未知的边界）由服务端 croniter 兜底。

- 备选：只靠库配置——0.x 库的方言配置行为未经验证，不做单点依赖，放弃。

### D3: 预览与描述以库自带为准，cronText.js 按验证结果退役

闸门通过（库的中文描述 + 下次触发预览满足 spec 场景：实时性、中文、3 次执行时间、免责标注可由 CronInput 补一行）→ 删除 `cronText.js`、`cronText.test.js` 与两个解析依赖；库的预览能力不足 → 保留 cronText.js 叠加在编辑器下方，只退役不了的部分。这条在任务清单里是显式的条件任务，不做静态假设。

### D4: 依赖精确锁定 0.2.5

库发布 13 天、0.x 阶段，`^` 范围可能引入破坏性变更。`package.json` 固定精确版本，升级留待库进入 1.x 再评估。

### D5: 验证闸门即验收标准，失败即回滚

三项闸门在任务清单中对应明确的验证步骤（真实浏览器走查）。任一失败：还原 CronInput.vue 与依赖清单，`openspec archive` 前在本变更记录"验证未通过 + 原因"，不强行变形通过。

## Risks / Trade-offs

- [0.x 单人库，API 可能变动或有隐藏 bug] → 精确锁版 + 回滚路径；本变更本身就是"验证"性质，失败成本被设计为一次 git revert。
- [方言配置不足以锁定五段式] → D2 的本地闸门兜底拦截；若因此导致点选生成的常用频率不可用，视为闸门失败走回滚。
- [暗色主题下第三方组件观感差] → 优先用组件的样式变量/透传 class 修正；修不动视为闸门失败。
- [删除 cronText.js 后库预览口径与 cron-parser 有差异] → spec 只约束"中文描述 + 接下来 3 次执行时间"的行为，不绑定实现；口径差异在预览免责标注（"以服务端实际触发为准"）下可接受。

## Migration Plan

前置：归档 `add-scheduled-task-page`。然后：安装依赖（锁版）→ CronInput 内部替换 → 闸门验证 → 条件性退役 cronText.js → 全量单测 + 构建 + 浏览器走查。回滚 = 还原 CronInput.vue、卸载依赖、恢复 cronText.js。

## Open Questions

- 库的方言配置项的确切 API 形态（属性名/枚举值）——留待 apply 时按库文档确认，不阻塞任务拆分；配置失败本身已被 D5 的回滚闸门覆盖。
