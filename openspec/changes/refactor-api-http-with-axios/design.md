# Design

## Context

现状（见 [http.js](file:///e:/dev/publish-monitor-client/src/api/http.js)）：

- 唯一出口是 `request(path, options)`，在内部完成 baseURL 拼接、JSON 序列化、`response.ok` 判定、信封剥离、错误归一、取消透出，约 90 行。
- 为可测试性支持 `fetchImpl` / `base` 注入；`scheduledTasks.js` 有 6 处调用点在透传这两个参数，`matchResults.js` 没有透传。
- 视图依赖两个错误类名：`error.name === 'AbortError'`（3 处）与 `error.name === 'NotFoundError'`（1 处）；`classifyScheduleError` 依赖错误上的**数字** `code`（40002 / 40902 等业务码）。
- 查询串由 `buildListQuery` + `URLSearchParams` 手工拼装，两处（`matchResults.js:100`、`scheduledTasks.js:156`）。
- 测试是纯 `node --test`，零测试依赖，靠假 `fetch` 注入；断言集中在 URL 字符串、`method`、`body`、`headers`。
- 后端信封为 `{code, msg, data}`，HTTP 状态与业务码同源；开发期由 Vite `server.proxy` 把 `/api` 转发到 `127.0.0.1:8001`。
- 当前未安装 axios。

约束：对外行为、错误文案、查询参数命名、404 语义都不得改变（proposal 已声明 `skip_specs`）。

## Goals / Non-Goals

**Goals:**

- 传输层交给 axios：`params` 序列化、JSON body、`transformResponse`、取消、错误响应对象。
- 业务语义（信封、404、网络错误、取消）只在 `http.js` 的**一个**响应拦截器注册里表达一次。
- 删掉 `fetchImpl` / `base` 注入链路，调用方只写 `http.get/post/patch/delete`。
- 测试仍保持零新增测试依赖。

**Non-Goals:**

- 不加 `timeout`、不加重试、不加日志/埋点、不写请求拦截器。
- 不改错误文案、不改后端契约、不改 `vite.config.js` 代理。
- 不管非 XHR 资源（详情页 `<img>` 走浏览器原生加载，`referrerpolicy` 由 [render.js#L93-L95](file:///e:/dev/publish-monitor-client/src/diff/render.js#L93-L95) 补），它们不受本次改动影响。

## Decisions

### D1: 单例实例 + 单个响应拦截器注册

`axios.create({ baseURL: apiBase() })` 在模块级创建一次；`http.interceptors.response.use(onFulfilled, onRejected)` 只注册一次。

不写请求拦截器：`baseURL`、`Accept` 是实例静态配置，axios 默认 `Accept: application/json, text/plain, */*` 已满足需要；鉴权头当前不存在。唯一"请求期"逻辑是参数归一化，那属于各端点领域知识（关键词 128、`pageSize` 夹紧、`scope` 只在 `warn` 时发送），放进拦截器会让 `http.js` 反向依赖 `matchResults` 的常量。

替代方案：保留 `request()` 薄壳。收益是调用方错误形状更统一，代价是多一层无逻辑转发，且测试注入点仍要设计。既然拦截器已经承担了剥离与归一，删除更符合"少一层"的目标。

### D2: 拦截器职责边界 —— 只做信封与错误归一

onFulfilled：`payload.code !== 200` 抛 `ApiError`（`code` 取 `payload.code`），否则 `return payload.data`。

onRejected 顺序固定：

```text
1. error instanceof ApiError          -> 原样抛（防止二次归一）
2. axios.isCancel(error)              -> 原样抛（取消不是失败）
3. !error.response                    -> ApiError('无法连接后端服务，请确认服务已启动后重试')
4. error.response.status === 404      -> NotFoundError(payload.msg || '请求的资源不存在')
5. 其余                                -> ApiError(payload.msg || `请求失败（HTTP ${status}）`, {status, code})
```

第 1 条是关键守卫：onFulfilled 里抛出的 `ApiError` 若被后续注册的拦截器再处理一次，它会因为**没有 `response`** 而被误判成「无法连接后端服务」。当前只有一个注册，这条守卫是为将来加拦截器时不踩坑。

同时 `ApiError` 的 `code` 必须是数字业务码，`classifyScheduleError` 依赖它；绝不能让 axios 原始的 `code: 'ERR_NETWORK' | 'ERR_CANCELED'` 字符串漏到调用方。

### D3: 取消识别收敛到 `isAbort`

axios 取消抛 `CanceledError`，`name` 是 `CanceledError` 而非 `AbortError`，三个视图现有的取消判断会失效，被取消的请求会以「canceled」文案展示给用户。

导出 `isAbort = (error) => axios.isCancel(error) || error?.name === 'AbortError'`，三个视图改用它。替代方案是把 `CanceledError` 的 `name` 改写回 `AbortError`，视图零改动，但等于伪造错误类型，会把 axios 的语义藏进一个谎言里，不采用。

### D4: `buildListQuery` → `buildListParams`，返回对象

```text
现在：new URLSearchParams({...}) + set(...) -> 'pageNum=0&pageSize=20&job_type=...'
之后：{ pageNum, pageSize, matched?, scope?, keyword?, job_type?, biz_scope? }
```

保留的语义：`pageSize` 夹紧到 `[1, MAX_LIMIT]`、页码取整回落到 0、`scope` 仅 `warn`、关键词与运行维度先归一化再判空、**空值不带参数**、`matched: 0` 必须保留（不能用真值判断）。

必须保留"空值不带"是因为 axios 的默认序列化只丢弃 `null` / `undefined`，**不丢空串**；`job_type=''` 若被发送，语义从「全部」变成「筛选空账号」。

编码差异不需要处理：axios 默认序列化与 `URLSearchParams.toString()` 都把空格编码成 `+`、中文走 UTF-8 百分号编码。

### D5: 删除 `request()` 与 `fetchImpl` / `base` 注入

调用方形态：

```text
listMatchResults   -> http.get('/match-results', { params, signal })
listRunBizScopeOptions -> http.get('/diff-run-options/biz-scopes', { params: { job_type }, signal })
deleteScheduledTask -> http.delete(`/diff-schedules/${id}`, { signal })
```

代价：域模块测试失去显式注入点，只能改单例的 `http.defaults.adapter`。这在单页前端里可接受（见 D7）。

### D6: 404 覆盖文案不放进 axios config

`deleteScheduledTask` 需要比默认文案更具体的「任务不存在或已被删除」。原方案是把 `notFoundMessage` 作为自定义键塞进请求 config，由拦截器读 `error.config.notFoundMessage`。这依赖 `mergeConfig` 保留未知键的隐式行为，且该行为不属于公开接口，为一个文案引入未经证实的假设不划算。

改为在 `deleteScheduledTask` 内 catch 后重包：

```text
NotFoundError -> new NotFoundError('任务不存在或已被删除')，其余错误原样抛
```

多 4 行，只影响一个函数，且可被单测直接覆盖。

### D7: 测试用假适配器替换单例适配器，且假适配器必须自己 settle

```text
http.defaults.adapter = async (config) => ({ data, status, statusText, headers, config })
```

关键陷阱：axios 的 `settle` 在**适配器内部**执行，`dispatchRequest` 不会替适配器判定状态。因此假适配器 resolve 一个 `status: 404` 时不会触发 `onRejected`，用例会假绿。模拟失败必须 reject 一个带 `response` 的 `AxiosError`。

因此 `http.test.js` 用两个 helper：`okAdapter(payload)`（resolve）与 `failAdapter(status, payload)`（reject `new AxiosError(msg, code, config, null, {status, data, headers, config})`）。断言目标从 URL 字符串改为 `config.url` + `config.params` + `config.data`，顺带不再锁死查询串顺序。

不引入 `axios-mock-adapter`：它同样是把正确性托付给第三方对 axios 内部行为的仿真，而我们需要假的东西只是传输层。

### D8: 单例适配器在测试中的隔离

`node --test` 每个测试文件独立进程，文件之间不会互相污染；文件内用 `useAdapter(fake)` helper 设置并在 `try/finally` 里恢复成原值，避免用例顺序耦合。

## Risks / Trade-offs

- [假适配器不 settle 导致假绿] → 先写 404 / 500 / 网络错误三条失败用例，确认它们真的走到 onRejected，再写成功路径
- [拦截器内抛错被再次归一] → onRejected 第一条守卫 `instanceof ApiError`；且只注册一次
- [视图漏改取消判断，取消被当成错误展示] → tasks 中逐个视图核对，用 `isAbort` 替换点作为完成判据
- [`error.code` 语义漂移，`classifyScheduleError` 失配] → 单测显式断言 `ApiError.code` 为数字业务码；取消分支断言 `isAbort` 为真且未进入错误展示
- [查询参数编码与后端期望不一致] → 保留一条含空格关键词的断言，验证序列化后仍为 `+` 分隔
- [单例适配器被测试泄漏] → 使用 `useAdapter` helper 统一恢复，禁止直接赋值后不还原
- [包体积增加] → axios 约 13KB gzip，相对收益可接受；不做按需拆分
- [行为回归无法靠类型发现（纯 JS）] → 以现有单测全绿 + 手工冒烟（列表 / 详情 / 创建 / 启停 / 删除 / 快速切换筛选触发取消 / 停掉后端看断连文案）为验收口径

## Migration Plan

1. `pnpm add axios`（更新 `package.json` 与 `pnpm-lock.yaml`）
2. 重写 `http.js`：实例 + 拦截器 + `isAbort`，移除 `request()`
3. 改域模块：`buildListParams`、三个请求方法、删除注入透传
4. 改三个视图的取消判断
5. 重写/调整三份单测，`pnpm test` 全绿
6. 手工冒烟

回滚：变更集中在 `src/api/` 与三个 `.vue` 的 4 行，单次提交可整体回退，并移除 axios 依赖。

## Open Questions

- 后端是否存在「HTTP 200 + 信封 `code: 404`」的返回？若有，404 判定应下沉到信封层，否则详情页会把「不可渲染」显示成「加载失败」。这是既有行为，本次保持不变；确认后再单独处理。
