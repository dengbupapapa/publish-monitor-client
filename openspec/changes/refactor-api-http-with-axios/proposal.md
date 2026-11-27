# Proposal

## Why

客户端网络层目前用 `fetch` 手写 HTTP 细节：自己拼 baseURL、自己序列化 JSON、自己判定 `response.ok`、自己拼查询串，还要为可测试性在每一层透传 `fetchImpl` 与 `base`。每新增一个端点，这些机械动作就重复一遍，而真正属于业务的规则（信封 `{code, msg, data}` 剥离、404 语义、中文错误文案）反而混在同一段代码里，改一处要同时盯传输细节和业务语义。

换成 axios 后，传输层交给库内建能力（`params` 序列化、JSON body、错误响应、取消），项目只需要维护一个实例和两个拦截器分支，把业务语义表达清楚。

## What Changes

- `src/api/http.js` 改为模块级**单例 axios 实例**（`baseURL` 取现有 `apiBase()`），公共语义放进响应拦截器：
  - 成功分支：信封 `code !== 200` 抛 `ApiError`（保留数字业务码），否则直接返回 `data`
  - 失败分支：取消原样抛出、无响应归为「无法连接后端服务」、HTTP 404 归为 `NotFoundError`、其余归为 `ApiError`
  - 导出 `http`、`ApiError`、`NotFoundError`、`isAbort`；**移除** `request()`
- **移除** `fetchImpl` / `base` 注入参数及其 JSDoc（`src/api/scheduledTasks.js` 6 处调用点）
- `buildListQuery` → `buildListParams`：返回对象交给 axios 的 `params`，删除手写 `URLSearchParams` 拼串；「空值不带参数」的语义保留
- 三个视图的取消判定从 `error.name === 'AbortError'` 改为 `isAbort(error)`
- 单测改为向单例注入假适配器；HTTP 语义用例（信封、404、网络错误、取消、业务码）保持同等覆盖
- 新增运行时依赖 `axios`

明确不做（本次排除）：

- 不加 `timeout`、不加重试（会改变请求的失败面与用户可见文案）
- 不写请求拦截器（`baseURL` / `Accept` 是实例静态配置，参数归一化属于各端点的领域知识）
- 不改变任何错误文案、404 语义、查询参数命名与页面行为
- 不改后端接口，不动 `vite.config.js` 的 `/api` 代理

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

（无——`match-result-list`、`match-result-detail`、`scheduled-task-list` 的需求不变，本次是纯内部重构，对外行为与错误文案保持一致）

因此本变更在 `.openspec.yaml` 中声明 `skip_specs: true`。

## Impact

- 代码：`src/api/http.js`（重写，约 90 行 → 约 50 行）、`src/api/matchResults.js`、`src/api/scheduledTasks.js`、`src/views/MatchResultList.vue`、`src/views/MatchResultDetail.vue`、`src/views/ScheduledTaskList.vue`
- 测试：`src/api/http.test.js`（改为假适配器）、`src/api/matchResults.test.js`、`src/api/scheduledTasks.test.js`
- 依赖：新增 `axios`（运行时），需更新 `pnpm-lock.yaml`
- API：与服务端的契约完全不变（仍为 `/api` 前缀 + `{code, msg, data}` 信封）
