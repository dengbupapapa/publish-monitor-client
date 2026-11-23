# Design

## Context

见 proposal.md 的 Why。实现侧现状：

- `src/api/matchResults.js` 是唯一对接结论列表的模块，导出 `MAX_LIMIT`、`DEFAULT_LIMIT`、`pageToSkip(page, size)`、`buildListQuery(params)`、`listMatchResults(params)`、`getMatchResultPreview(id, options)`；查询串用 `URLSearchParams` 拼装，`matched` 为空时不带该参数。
- `src/views/MatchResultList.vue` 内部页码是 1 起的用户语义（地址 `?page=2&size=20`），请求前用 `pageToSkip` 换成偏移量；响应直接读 `payload.items`。
- 后端新契约：`pageNum` 从 0 起；`pageSize` 1..200，越界返回 422；旧 `skip`/`limit` 被忽略；响应 `data` 只有 `{total, rows}`。
- 前端是纯只读客户端，没有本地缓存或历史数据需要迁移。

## Goals / Non-Goals

**Goals:**

- 列表取数在新契约下端到端可用：参数名、页码基数、响应字段三处同时对齐。
- 保持页面地址与 UI 的 1 起页码语义不变，使用者的书签与返回行为不受影响。
- 页码换算与参数兜底逻辑继续集中在 API 层，视图层只关心「第几页、每页几条」。

**Non-Goals:**

- 不兼容旧参数（不发、也不读兼容层），后端已硬切。
- 不改动详情接口与 `MatchResultDetail.vue`。
- 不为 `/wx-articles`、`/dep-manuscripts` 新增客户端。
- 不改变分页组件与过滤控件的交互；地址状态只修验收暴露的两处缺陷（越界页码、详情返回），见 Decisions 6。

## Decisions

**1. 页码换算函数改为 `pageToPageNum(page)`，语义是「1 起页码 → 0 起 pageNum」**

`pageToSkip` 的名字和返回值（偏移量）都绑在旧契约上，保留名字会误导后续维护者。新函数只做页码基数换算：`page` 兜底为至少 1 的整数（非数字回落 1），返回 `page - 1`。每页条数的收敛留在 `buildListQuery`，避免这里出现一个不影响返回值的 `size` 参数。

替代方案：保留 `pageToSkip` 但返回 `page - 1`（名称与语义不符，放弃）；签名保留 `(page, size)` 以便「共用数值规范化」（`size` 不参与结果，是死参数，放弃）；或在视图里直接 `page - 1`（把契约知识散落到视图，放弃）。

**2. `buildListQuery` 输出 `pageNum` / `pageSize`，并在入参为 `page`/`size` 或 `pageNum`/`pageSize` 之间只保留一种形态**

统一采用 `pageNum`/`pageSize` 作为该函数的入参键，符合后端词汇，避免函数内部再做一次「偏移量→页码」的反向换算。兜底规则：`pageNum` 取非负整数，缺省 0；`pageSize` 收敛到 1..`MAX_LIMIT`，缺省 `DEFAULT_LIMIT`。

替代方案：让 `buildListQuery` 继续接收 `skip`/`limit` 再换算（多一层无意义转换，放弃）。

**3. 视图层改为把 `state.page` 直接交给 API 层换算，响应读 `payload.rows`**

`load()` 里送 `page: state.value.page, size: state.value.size`，由 `listMatchResults` 内部调用 `pageToPageNum` 生成 `pageNum`；`pageData` 的形状由 `{total, items}` 改为 `{total, rows}`，`rows` 计算属性、序号派生、`row-key`、详情跳转全部沿用原有逻辑（它们只依赖条目自身的 `id` 与顺序）。

**4. 响应字段缺失时的兜底保持「空列表 + 服务端总数」**

`rows` 缺失或非数组时按空数组处理，与现有失败/空态处理共用一套：接口失败仍然清空列表并展示重试入口，不把「解析不到条目」静默呈现为「没有数据」之外的形态。

**5. 单元测试直接断言新查询串**

`matchResults.test.js` 的断言从 `skip`/`limit` 改为 `pageNum`/`pageSize`，并新增「页码 1 → `pageNum=0`、页码 3 → `pageNum=2`」「超上限收敛到 200」「非法值回落」三类用例；断言不再校验 `skip`/`limit` 存在性，改为断言不存在。

**6. 地址里的过滤与页码必须能「带去又带回」（验收暴露的追加范围）**

列表把当前 `matched`/`page`/`size` 折叠成一个 `toListQuery`，地址规范化、页码越界重定向、进详情时携带的 query 都只用这一个函数，避免多处手拼。越界判定放在取数之后：总数大于 0、当前页为空且页码大于 1 时用 `replace` 回第一页（不堆历史栈），页码 1 的空结果仍按普通空态展示。进详情时把该 query 一并带上，详情返回列表时原样回写，不再依赖历史栈，直接打开分享的详情地址也能回到对应视图。

替代方案：返回按钮改 `router.back()`（直接打开详情时没有列表历史可回，放弃）；用全局 store 记住列表状态（多一处需要同步的隐形状态，放弃）。

## Risks / Trade-offs

- [后端与前端发布不同步：新前端打到旧后端时，`pageNum`/`pageSize` 会被旧后端忽略，表现为固定第一页] → 本变更假定后端新契约已上线；若需要灰度，可在联调阶段用 `curl '/match-results?pageNum=1&pageSize=5'` 确认 `data.rows` 存在后再发布前端。
- [页码基数不一致导致的差一页] → 换算只发生在一处（API 层 `pageToPageNum`），视图与地址始终 1 起；单元测试覆盖 `page=1 → 0`、`page=3 → 2`。
- [`rows` 字段名与详情响应的 `records` 语义相近，易混用] → 列表只读 `rows`，详情只读五键结构，两处不做兜底互读。
- [移除 `pageToSkip` 是导出函数的行为破坏] → 仓库内只有 `MatchResultList.vue` 与单测引用，随本变更一并更新，无外部消费者。

## Migration Plan

单次发布即可，无数据迁移、无回滚脚本。回滚方式是与后端契约同步回退（前端恢复 `skip`/`limit` 与 `items`），因此发布前需确认后端已部署新契约。

## Open Questions

无。
