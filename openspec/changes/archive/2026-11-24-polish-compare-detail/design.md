# Design

## Context

对照区（`DiffWorkspace.vue` + `diff.css`）现在是「表头在 `.rows-scroll` 外、行在容器内」的两段式结构，两边都声明 `grid-template-columns: 1fr var(--pm-gutter) 1fr`，列宽一致依赖两处 1fr 恰好相等；纵向滚动条一旦出现（Windows 经典滚动条约 17px），容器内可用宽收窄而表头不减，错位约半条滚动条宽。连线（`src/diff/wires.js`）已按记录配对并着色，但变化方向只能靠颜色读。

标签所需的归组信息已有现成来源：`DiffWorkspace.measureAnchors` 已经在统计「记录 → 命中行号」映射，连线端点的 y 坐标落在哪一行可由同样的高亮矩形推导。

## Goals / Non-Goals

**Goals:**

- 让「表头列宽 = 行列宽」成为结构保证，不受滚动条、横向溢出、缩放影响。
- 每条记录的变化方向在发布稿行左上角以悬停小字可读，绝对定位、不参与布局。

**Non-Goals:**

- 不改连线几何、配色、联动（悬停/点击）行为本身。
- 不在 SVG 连线上直接画字（用户已否决）。
- 不改后端数据与接口。

## Decisions

### D1. 表头移入滚动容器，sticky 固定

把 `.compare-head` 从 `.compare` 下的独立块移进 `.rows-scroll` 内（`.rows-body` 之前、行内容之上），`position: sticky; top: 0; z-index: 3`。表头与 `.rows-body` 同处一个滚动上下文，宽度天然一致；横向滚动时表头随内容一起移动（期望行为：表头列始终盖在对应正文列上）。

- 替代方案 B（`scrollbar-gutter` + JS 补偿滚动条宽）与 C（自绘细滚动条）都是在「两段式结构」上打补丁，跨浏览器滚动条形态一变就再漂移，放弃。
- sticky 后表头本身也参与 `.rows-scroll` 的横向滚动条判定；表头内容均不横向溢出（标题已 ellipsis），不会引入新的横向滚动。
- z-index 层级：行内 `svg.wires` 为 2，sticky 表头取 3，保证正文滚到表头下方时连线不会盖住表头。

### D2. 标签归组复用连线端点的行归属，随重算刷新

标签归组不另起一套统计：在 `DiffWorkspace` 里扩展锚点统计，除「记录 → 行号」外再产出「行号 → { rid, kind } 列表」（按该记录在发布稿侧的端点行归组；仅参考侧命中、发布稿侧以半线端点落到某行的记录，按连线 `wires.js` 里 `y2` 的取值规则归到对应行）。连线重算（`measureAnchors` / `scheduleWires` 的既有触发时机：挂载、ResizeObserver、媒体 load/error、字体就绪、rows 变化）时一并刷新，保证「布局变化后标签归组正确」。

标签渲染为 `.row` 发布稿单元格内的一个绝对定位层（`DiffRow.vue` 加 prop 或由 `DiffWorkspace` 直接注入 data 属性 + CSS 显隐），每行一个 flex 横排容器。

### D3. 标签常驻 DOM、悬停显隐，纯 CSS 实现

每个标签是行内绝对定位的小 `<span>`（或按钮，沿用连线的点击选中记录语义可后续加），默认 `opacity: 0`，`.row:hover` 下 `opacity: 1`。常驻 DOM 让显隐零 JS 开销，且不引起任何布局变化（绝对定位 + 不参与文档流）。字号取 10–11px，带半透明底色药丸（同 kind 颜色文字 + `--pm-panel` 底），压在正文首行上也能读清。

- 替代方案：v-if 按 hover 状态挂载/卸载（JS 状态驱动）。显隐更省渲染但每次悬停都要 diff/挂载，且移动端无 hover 时永不出现；CSS 方案在触屏设备上至少可通过点击行触发 `:hover` 等效态，倾向 CSS。
- 悬停粒度用「行」而不是「连线端点」：连线细、不易命悬，行悬停区域大且稳定。

### D4. 未知 kind 如实标注

标签文案走 `KIND_LABELS[kind] || kind`：三类之外的变化方向直接显示原始 kind 值（与记录卡的降级文案一致），不冒充「修改」。连线颜色仍按 `wires.js` 现状兜底 replaced，颜色与文字的这处不一致是既有行为，本次不改。

## Risks / Trade-offs

- [sticky 表头遮挡正文首行导致首行标签/高亮点不进] → sticky 区高度固定（表头约 3 行小字），标签在最左侧角落、悬停才出现；连线点击区域主要在中缝，实测回归即可。
- [同一行多条记录标签横排超出单元格宽度] → 标签 flex 横排 + `max-width: 100%` + 超出折行/省略，极端情况下以「第 N 条」计数标签兜底（实现时视效果取舍，记录在 tasks 验证项）。
- [触屏无 hover] → 触屏上点按行会触发 `:hover` 等效态；不为此引入额外的点击切换逻辑（Non-Goal）。
- [wires.js 的半线 y2 取对侧值，归组依赖同一规则] → 归组逻辑与 wires.js 的 y 取值放在相邻代码并互引注释，改连线几何时能同步发现。

## Migration Plan

纯前端改动，无数据迁移。回滚即还原 `DiffWorkspace.vue` / `DiffRow.vue` / `diff.css` 三处。

## Open Questions

（无）
