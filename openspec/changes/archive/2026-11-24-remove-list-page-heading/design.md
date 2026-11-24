# Design

## Context

动机见 `proposal.md`，行为契约见 `specs/match-result-list/spec.md`。

现状（`src/views/MatchResultList.vue`）：

```
<header class="page-head">          .page-head {
  <div>                               display: flex;
    <h1>稿件核查结论</h1>            align-items: flex-start;
    <p>只读视图：…</p>               justify-content: space-between;
  </div>                              gap: 16px;
  <div class="filters">…</div>        margin-bottom: 16px;
</header>                             flex-wrap: wrap;
                                    }
```

约束：

- `page-head` 是纯展示容器，不持有任何状态；`state` / `toListQuery` / 规范化 `watch` / `listPrefs` / `openDetail` 都在别处，与本区域无耦合。
- `.page` 为 `max-width: 1440px` + `padding: 24px`，过滤条右缘与表格右缘因此天然对齐。
- `.filters`（`display:flex` / `gap:16px` / `flex-shrink:0` / `flex-wrap:wrap`）内部承载两项控件，本次不动。
- 详情页页头同样没有 `heading`，只有返回入口与坐标版本。

## Goals / Non-Goals

**Goals:**

- 页头收缩为单行工具条，控件右对齐且与改前逐像素一致的宽度与间距
- 不留下空容器、占位高度或失效的 scoped 规则
- 让「靠右」这一意图在样式里可读，而不是靠单子元素下退化的 `space-between` 巧合成立

**Non-Goals:**

- 不重排过滤条与表格的从属关系（不把过滤条并进表格上方工具区）
- 不引入视觉隐藏标题或其它无障碍补丁
- 不触碰数据通路、地址参数、缓存优先级与详情跳转

## Decisions

### 1. 右对齐用 `justify-content: flex-end`，而不是 `.filters { margin-left: auto }`

只剩一个子元素后，`space-between` 退化为 `flex-start`，写在那里的意图已经失真；改 `flex-end` 是把「靠右」写回容器，符合 `.page-head` 负责整体对齐、`.filters` 负责内部排布的职责划分。

被否决的替代方案：

- `.filters { margin-left: auto }`：手感等价，但把容器的对齐意图藏进子元素，且要理解 flex 剩余空间分配才看得懂。唯一优势是极窄视口下对溢出更宽容（见风险项），本案不覆盖该视口。
- 保留空 `<div>` 作占位：违反「不塌陷」要求，且留下无意义节点。
- 把过滤条移出 `<header>` 独立成工具条：改动面变大而行为收益为零。

### 2. 连带删除 `align-items: flex-start`、`gap: 16px`、`.page-head h1`、`.page-head p`

`align-items` 在单行子元素下没有参照物；`gap` 在单子元素下不生效（控件之间的 16px 来自 `.filters` 自身，保留不动）；后两条规则失去被修饰对象。`--pm-muted` 变量本身仍被 `.placeholder` / `.time` / `.disabled-link` 使用，删规则不影响变量定义与其它位置。

### 3. 结构上一次删到「只留 `<header>` + `<div class="filters">`」

删掉包裹 `div` 而不只是删 `h1`/`p`，避免 `<header>` 下留一个 0 高度子节点——它会被 `gap: 16px` 计入，产生不可见的额外间距（正是「页头不塌陷」场景要防的）。

### 4. 不补视觉隐藏标题

移除后列表页与详情页一致：两页都用浏览器标签标题（`index.html` 的 `<title>`）标识自己，表格列头与控件的 `aria-label` 足以支撑键盘与读屏操作。单独给列表页塞一个 `sr-only` 标题会让纯视觉改动引入语义分叉，将来若做整体无障碍收敛，两页应一起处理。

### 5. 逻辑层零改动

本次不修改任何脚本、`<script setup>` 内容、请求参数或 CSS 变量，改动范围仅限模板中的三行节点与 `<style scoped>` 中的四条规则。

## Risks / Trade-offs

- **宽视口下页头左半边空白** → 过滤条与表格右缘共用 `.page` 的 padding，视觉上仍然对齐成一条线，不构成"悬空"；若日后觉得空，可把过滤条并入表格上方工具区，属于另一次改动。
- **`flex-end` 在极窄视口下会从左侧裁掉溢出内容** → 触发需要视口约小于 470px（控件合计宽度 + 两侧 padding），内部只读工具不覆盖该场景；如需支持，改回 `.filters { margin-left: auto }` 是一行回退。
- **使用者失去「这是只读视图」的显式提示** → 该信息由表格无编辑入口与 README 承担，proposal 已确认不保留。
- **有人以页头标题作为选择器或文案断言的依赖** → 全仓检索确认只有页面自身、`README.md`、`index.html` 三处出现该文案，且无测试断言，不存在隐性依赖。

## Migration Plan

无灰度、无数据或地址参数迁移；回滚即把两行文案与三条样式规则还原。
