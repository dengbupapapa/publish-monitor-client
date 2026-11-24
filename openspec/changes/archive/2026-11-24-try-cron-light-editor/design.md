# Design

## Context

- 现状：`CronInput.vue` 为文本输入 + `cronText.js`（cronstrue 描述 + cron-parser 预览）；`isValidCron`/`validateForm` 客户端闸门 + 服务端 croniter 最终闸门；CronInput 未被 cron-zen 试验改动，工作区仅残留已安装的 `@cron-zen/*` 依赖。
- 目标库 `@vue-js-cron/light` 5.2.4：自带 UI（周期选择器 + 字段格子面板 + floating-ui 下拉），默认标准五段式，内置中文 locale（注册键为 `zh`，非 `cn`），`theme="ant"` 提供类 antd 观感，`--cl-*` CSS 变量驱动主题，`@error`/`disabled` 与现有契约匹配；组件无文本输入框。
- 家族结构：`CronCore`（renderless，同一契约）→ `CronLight`（成品 UI）。`CronAnt` 捆绑 antd-vue 3，排除。

## Goals / Non-Goals

**Goals:**

- CronInput 内部形成"文本输入 + CronLight 点选"混合模式，对外 `v-model`/`disabled` 契约不变
- 三项验证闸门（五段式 / 暗色主题 / 预览与校验联动）通过才落地
- 收尾 cron-zen 试验：卸载依赖、归档 `try-cron-zen-editor` 并记录结论

**Non-Goals:**

- 不改 `ScheduledTaskList.vue` 表单流程与错误归位逻辑
- 不退役 `cronText.js`（CronLight 无预览能力，继续承担描述与下次执行时间）
- 不基于 `CronCore` 自建 UI——仅作为退路记录（见 D4）

## Decisions

### D1: 混合模式，双向联动

文本框（保留现有）与 CronLight 共享同一个 cron ref：键入合法值 → CronLight 解析为选中态（demo 已验证该行为：初始值 `0 9 * * 1-5` 正常回显）；点选 → 文本框回显。键入非法值 → 文本框自身保留输入，CronLight 发 `@error`，接入 `formErrors.cron`。

- 备选：只用 CronLight 去掉文本框——熟练用户无法粘贴表达式，spec 的键入场景无法满足，放弃。

### D1a: period 推断（实测后补充）

组件按 `period` 决定可见字段；键入值含日/月/周字段时若当前周期隐藏了该字段，解析会静默丢弃（实测 `0 9 * * 1-5` 在"每天"周期下被改写成 `0 9 * * *`）。因此 CronInput 绑定 `v-model:period`，在键入合法表达式且含日/月/周非 `*` 字段时强制切到"每年"（唯一全字段可见的周期）后再交给组件解析；点选器自身切换周期时同步回写。

### D2: 五段式约束——组件默认 + 本地闸门双保险

CronLight 默认 fields 即五段式（分/时/日/月/周），无秒/年字段可选，从源头消除 Quartz 方言问题；`periods` 中 year 周期保留（产物仍是五段式，仅限定月/周维度）。`isValidCron` 继续拦截一切非五段式值，服务端 croniter 最终兜底。

### D3: cronText.js 保留

CronLight 无描述与执行时间预览，现有 cronText.js + cronstrue + cron-parser 原样承担 spec 的预览要求，预览免责标注不变。

### D4: 退路为同包 renderless 切换

若真实页面中 CronLight 的 `.ant` 主题 + CSS 变量覆盖仍不可接受，切换 `CronCore`：同一 `v-model`/`@error` 契约，用 antd4 原生组件（周期 a-select、字段多选 a-select）拼 slot UI，暗色 token 自动生效。逻辑层零改动，仅换渲染层。此为记录在案的设计退路，不预先实施。

### D5: 依赖精确锁版 + 闸门失败即回滚

`@vue-js-cron/light@5.2.4` 精确版本（上游活跃但避免 0.x 式漂移风险）。三项闸门任一失败：还原 CronInput.vue、卸载依赖、在本变更记录"验证未通过 + 原因"后归档，不强行变形通过。

### D6: cron-zen 收尾纳入本变更首个任务组

卸载 `@cron-zen/vue3`/`@cron-zen/core`；`try-cron-zen-editor` 的剩余任务标记为取消（cancelled），在其 proposal 追加结论"库硬编码 Quartz 七段方言，无法配置为标准五段式，闸门一不可满足，转向 vue-js-cron/light"后归档。CronInput 未被其改动，无代码还原工作。

## Risks / Trade-offs

- [非法键入时 CronLight 内部状态行为未知（清空选中 or 保留上次）] → 闸门三显式实测项；若表现混乱则以文本框自身校验状态为准展示错误，CronLight 仅在值合法时参与联动
- [.ant 主题与本项目暗色变量不完全匹配] → 实测 `.ant .cl-menu` 硬编码白底，仅 `--cl-*` 覆盖无效；最终采用库内置 `.dark .ant` 组合（dark 祖先 + `theme="ant"`）+ `--cl-*` token 对齐，闸门二通过，D4 退路未触发
- [`@floating-ui/vue` 传递依赖] → 体积小，随包管理，不单独锁
- [period=year 周期的产物用户理解成本] → 保留但依赖 cn locale 文案；如验证中发现歧义再裁剪 periods

## Migration Plan

前置：无（主 spec 已存在）。顺序：收尾 cron-zen（D6）→ 安装并锁版 light → CronInput 混合接入 → 三闸门验证 → 全量单测 + 构建 + 浏览器走查。回滚 = 还原 CronInput.vue + 卸载 light。

## Open Questions

- 无阻塞项。D5 闸门覆盖其余未知（非法键入表现、主题细节）。
