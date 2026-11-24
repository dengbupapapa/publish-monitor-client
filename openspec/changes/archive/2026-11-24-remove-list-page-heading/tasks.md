# Tasks

## 1. 移除页头两行文案

- [x] 1.1 删除 `src/views/MatchResultList.vue` 中 `<header class="page-head">` 内的 `<h1>稿件核查结论</h1>`、`<p>只读视图：…</p>`，以及包住它们的 `<div>`，使 header 下只剩 `<div class="filters">`；验证：`grep -n "稿件核查结论\|只读视图" src/views/MatchResultList.vue` 无命中，且 `<header class="page-head">` 与 `.filters` 之间不再有其它节点
- [x] 1.2 确认两行文案删除未波及控件：`a-input-search`（关键词检索）与「仅看疑似未审或有差异」勾选项仍在 `.filters` 内，属性（`maxlength`、`allow-clear`、`aria-label`、`title`）完整；验证：`pnpm dev` 下页头仍能输入并检索、能勾选，勾选后地址出现 `scope=warn` 且页码回到 1

## 2. 收敛页头样式

- [x] 2.1 把 `.page-head` 的 `justify-content: space-between` 改为 `flex-end`；验证：dev 下将窗口拉宽到 1440px 以上，过滤条整体贴近页头右缘，且其右边缘与表格右边缘对齐
- [x] 2.2 删除 `.page-head` 中已无参照的 `align-items: flex-start` 与 `gap: 16px`；验证：页头高度、控件下方与表格之间的间距与改动前目视一致，检索框与勾选项之间仍为 16px（来自 `.filters`）
- [x] 2.3 删除 `.page-head h1`、`.page-head p` 两条 scoped 规则；验证：`grep -n "page-head h1\|page-head p" src/views/MatchResultList.vue` 无命中，且 `--pm-muted` 仍被 `.placeholder` / `.time` / `.disabled-link` 引用，这些位置的灰字未变色、页面无样式告警

## 3. 集成核对

- [x] 3.1 运行 `pnpm test`，确认 API、`listPrefs` 与既有 diff 用例全部通过（本次不改任何断言期望值）
- [x] 3.2 运行 `pnpm build`，确认构建通过且 `git diff --stat` 只涉及 `src/views/MatchResultList.vue`（模板两行 + 一条对齐规则 + 三条被删规则）
- [x] 3.3 手工走查页头收缩后的四条规格场景：页头不出现标题与说明、两项控件齐备且右对齐、页头不塌陷（与表格间距不变）、浏览器标签标题仍为「稿件核查结论」；验证：逐条核对并通过窗口缩放确认无空白占位残留
