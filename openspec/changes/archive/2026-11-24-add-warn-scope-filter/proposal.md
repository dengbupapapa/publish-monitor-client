# Proposal

## Why

后端结论列表已支持 `scope=warn` 集合（未匹配的篇目，或匹配成功且存在差异记录的篇目），但前端列表页没有使用它。使用者想找出「需要人看一眼」的结论时，只能把匹配态在三态之间来回切、逐页人工筛，而把 `matched=0` 与 `matched=1` 分别取回再在客户端合并会破坏分页与总数。列表页需要一个使用该参数的筛选入口。

## What Changes

- 列表页新增一个勾选项，文案为「仅看疑似未审或有差异」，勾选时列表请求带上 `scope=warn`，不勾选时不带该参数（等同后端 `all`）。
- 该勾选项与既有的匹配态过滤**正交叠加**：`scope` 决定集合，`matched` 在集合内继续收窄，两者不做互斥、不设优先级。
- 勾选状态进入页面地址（`scope=warn`，缺省不写入），使地址可分享，并让从详情返回列表时恢复原视图；非法取值回落为不勾选。
- `scope=warn` 与匹配态「未知」的组合按后端契约返回空集，页面 MUST NOT 报错；空态文案 SHALL 说明该组合无交集并提示切换匹配态，过滤控件保持可用。
- 集合范围以服务端为准：页面 MUST NOT 用本地字段重新推导集合，「疑似未审」在本勾选项内指匹配态为不匹配的那一支；参考侧缺失等异常数据是否出现在集合内由服务端决定。
- 不在本次范围：`核查失败` 是否纳入该集合（由后端后续扩展 `scope` 取值），以及勾选项对结果列文案的任何改动。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `match-result-list`: 过滤维度由单一的匹配态扩展为「关注集（`scope`）+ 匹配态（`matched`）」两个正交维度，并规定勾选项的文案、地址表达、与「未知」组合的空态呈现，以及集合判定以服务端为准。

## Impact

- `src/api/matchResults.js`：`buildListQuery` 与 `listMatchResults` 接受 `scope`，仅在其取值为 `warn` 时写入查询串。
- `src/api/matchResults.test.js`：补充查询串用例（不带 `scope`、带 `scope=warn`、非法取值不带）。
- `src/views/MatchResultList.vue`：新增勾选项控件、`scope` 的地址读写与规范化、定向空态文案；详情跳转已复用 `toListQuery(state.value)`，无需另加处理。
- 后端契约：依赖 `publish-compliance-monitor` 已实现的 `scope` 查询参数（`all` / `warn`），不新增接口、不改响应结构。
- 不做数据库、依赖、构建相关改动。
