# Proposal

## Why

后端结论列表接口 `GET /match-results` 已经切换分页契约：查询参数由 `skip` / `limit` 改为 `pageNum` / `pageSize`（页码从 0 起，`pageSize` 默认 20、上限 200），响应体由 `data.items` 改为 `data.rows`，并且旧参数被硬性忽略。前端仍按旧契约取数，请求里的偏移量与条数不再生效，响应里的条目也解析不到，列表会固定停在后端默认第一页并显示为空。

## What Changes

- **BREAKING** 列表请求改为传 `pageNum` / `pageSize`；页面地址中面向使用者的 1 起页码在请求边界换算为 0 起 `pageNum`。
- 列表响应解析由 `data.items` 改为 `data.rows`，总数仍取 `data.total`。
- 分页参数的拼装与兜底校验随新契约调整：`pageNum` 不得为负，`pageSize` 限制在 1..200。
- 更新对应单元测试与列表能力规格中「偏移量 + 每页条数」的分页表述。
- 不变更部分：结论详情接口 `/match-results/{id}/preview` 未改动，继续按原五键结构消费；`/wx-articles`、`/dep-manuscripts` 虽然也同步改了分页形态，但本前端未调用，不在本次范围。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `match-result-list`: 「列表必须以服务端分页与三态过滤为准」中分页请求参数与响应条目字段的形态由「偏移量 `skip` + 条数 `limit`，响应 `items`」改为「页码 `pageNum`（从 0 起）+ 条数 `pageSize`，响应 `rows`」。

## Impact

- 代码：`src/api/matchResults.js`（查询串拼装、页码换算）、`src/api/matchResults.test.js`、`src/views/MatchResultList.vue`（入参与响应字段读取）。
- 规格：`openspec/specs/match-result-list/spec.md` 经本变更的 delta 同步。
- 外部依赖：后端 `GET /match-results` 的新契约（`pageNum` / `pageSize`、`rows`）。
- 兼容性：不保留旧参数的双写或回退分支；后端已硬切，前端只对接新契约。
