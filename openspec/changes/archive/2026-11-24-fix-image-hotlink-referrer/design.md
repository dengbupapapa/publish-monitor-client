# Design

## Context

动机见 `proposal.md - Why`，行为契约见 `specs/match-result-detail/spec.md`。

现状与约束（都已在代码中确认）：

- 正文的唯一渲染链路是 `src/diff/render.js` 的 `renderSide`：`marked.parse` → `DOMPurify.sanitize` → 在 holder 上做结构修正 → `outerHTML` 快照成原子 → 上层 `v-html`。DOM 只在这一层被触碰，其余都是纯函数。
- 该层已有两处 post-sanitize 修正：给 `mark.hl` 中只含图片的节点加 `hl-image` 类；给 `a[href]` 补 `target` / `rel`。本次追加的属性补齐属于同一模式。
- `DOMPurify` 3.x 的默认属性白名单**不含** `referrerpolicy`（已在 `node_modules/dompurify/dist/purify.cjs.js` 的属性表中核实），因此写在原始 markdown / 服务端 HTML 上的该属性会被 sanitize 剥掉。
- 测试跑在 `node --test` 下，只有纯函数有用例；`render.js` 依赖 DOM，没有对应用例，也没有 jsdom 依赖。
- 后端不在本仓库，`/api` 只是开发期代理转到 `127.0.0.1:8001`。

## Goals / Non-Goals

**Goals:**

- 正文图片（含被 `hl-image` 轮廓标记的图片）在应用内取图时不携带本站来源信息，从而与"地址栏直开"取得同样的响应。
- 修复落在 `renderSide` 已有的 post-sanitize 修正位置，不扩散到全局策略、不改页面其它请求。

**Non-Goals:**

- 不追求"识别并提示取图失败"：防盗链返回 200，无法用 `error` 事件判定，且判定占位图尺寸属脏手段。
- 不处理 `data-src` 懒加载图片的补位；当前正文的 `<img>` 带 `src`，若日后出现只有 `data-src` 的内容需另立变更。
- 不引入服务端图片代理与缓存，也不做开发期 URL 改写。

## Decisions

**1. 逐图设置 `referrerpolicy="no-referrer"`，而非全局 `<meta name="referrer">`。**

在 sanitize 之后遍历 holder 里所有 `img` 写入该属性，随 `outerHTML` 进入原子。选择理由：作用域精确到正文图片，不改变 `fetch`/XHR 与静态资源的来源信息（spec 第四条场景）；而 `<meta name="referrer" content="no-referrer">` 是整站级开关，将来若接入需要 Referer 的第三方会踩坑。

备选：全局 meta（一行改完，但粒度过粗）；开发期 Vite 代理改写图片 URL（生产无效且要正则改写正文 HTML，脆）；后端图片代理（最稳但要跨仓库改动，且生产必须同域反代）。

**2. 属性在 sanitize 之后写入 DOM，而不是靠 sanitize 保留。**

`DOMPurify` 默认白名单不含 `referrerpolicy`，`ADD_ATTR` 也能做到，但那要改 sanitize 配置、扩大白名单面。既有的 `a[target]` 修正已证明"消毒后在 holder 上补属性"这条路能进入最终快照，复用它更小、更少配置。

**3. 只作用于 `img`，不碰 `srcset` 之外的其它取图通道。**

`referrerpolicy` 对 `src` 与 `srcset` 同时生效，无需额外处理。不设置 `crossorigin`、不引入 `loading="lazy"`（会改变行高时序，牵动连线重算与 `blocksOk` 之外的布局行为），避免把一次取图修复扩大成布局变更。

**4. 不新增单测。**

该修复位于依赖 DOM 的一层，仓库没有 jsdom 依赖，为一行属性引入测试环境不划算。验收方式：Network 面板确认图片请求 `Referer` 为空，且图片内容为真图；同时回归 `pnpm test`、逐行对齐与 `hl-image` 轮廓表现。

## Risks / Trade-offs

- [极旧浏览器忽略 `referrerpolicy`] → 现代 Chromium / Firefox / Safari 均支持；目标环境为内部使用的最新浏览器，不做降级。
- [图床日后改为校验其它请求条件（签名、Cookie）] → 本方案不再生效，需要升级为后端图片代理；届时另立变更，本次的属性补齐不会成为障碍。
- [取图失败仍不可见] → 与现状一致，未使情况变差；若要提示需先能判定失败（见 Non-Goals）。
- [大量图片同时刷新导致加载变慢] → 与"地址栏直开"同量级，且此前实际加载的是占位图，属预期内的流量变化。
