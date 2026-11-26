# Proposal

## Why

匹配结果列表目前只能按关键词与「仅看疑似未审或有差异」收窄，无法回答「某个任务类型、某个账号的结论有哪些」。后端已就绪：`/match-results` 接受 `job_type` 与 `biz_scope` 等值过滤，`/diff-run-options/job-types` 与 `/diff-run-options/biz-scopes` 提供来自运行记录的选项（后者支持按 `job_type` 级联）。客户端尚未接入，本次把这两个下拉接上。

## What Changes

- 列表页页头新增两个下拉：任务类型（`job_type`）与账号（`biz_scope`），缺省均为「全部」。
- 选项取自运行记录：任务类型来自 `/diff-run-options/job-types`（含已下线类型）；账号来自 `/diff-run-options/biz-scopes`，并随已选任务类型级联收窄。
- 账号下拉的展示名与筛选值统一使用选项的 `label`（业务名称），以 `biz_scope` 参数发给列表接口；选项的 `value`（业务编号）不参与筛选。
- 切换任一条件回到第一页；两个条件与关键词、关注集、匹配态按逻辑与叠加。
- 两个条件写入页面地址，可分享、可从详情返回恢复；缺省值不写地址，非法/超长取值按既有规范回落。
- 选项接口失败不阻塞列表：保留上一次成功加载的选项，首屏失败时两个下拉只保留「全部」。
- 空结果提示新增「条件组合无结果」一类，与关键词无命中、关注集与未知匹配态无交集区分。
- **BREAKING**（对既有 spec 而言）：改写 `match-result-list` 中「控制区只有关键词输入与勾选项」的要求，允许并新增两个下拉。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `match-result-list`: 页头过滤控件从两个扩展为四个；新增运行维度（任务类型 / 账号）过滤及其选项加载、级联、地址状态与失败降级的行为要求；空态新增一类。

## Impact

- 客户端代码：`src/views/MatchResultList.vue`、`src/api/matchResults.js`（新增选项请求与 `job_type` / `biz_scope` 查询参数）。
- 依赖后端既有接口：`GET /diff-run-options/job-types`、`GET /diff-run-options/biz-scopes?job_type=`、`GET /match-results?job_type=&biz_scope=`。本次不改后端，不新增依赖。
- 非目标：不新增 `biz_type` / `biz_name` 下拉；不在列表行内展示任务类型或账号；不改定时任务页。
