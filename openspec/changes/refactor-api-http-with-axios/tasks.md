# Tasks

## 1. 依赖与基线

- [x] 1.1 运行 `pnpm test` 记录改造前基线，确认现有单测全绿（验证：命令退出码为 0，无失败用例）
- [x] 1.2 执行 `pnpm add axios`，确认 `package.json` 的 `dependencies` 出现 axios 且 `pnpm-lock.yaml` 已更新（验证：`node -e "import('axios').then(m=>console.log(typeof m.default.create))"` 输出 `function`）

## 2. 网络层重写（src/api/http.js）

- [x] 2.1 创建模块级 `axios.create({ baseURL: apiBase() })` 实例，实现 onFulfilled 信封剥离（`code !== 200` 抛 `ApiError` 并保留数字 `code`，否则返回 `payload.data`）（验证：`http.test.js` 中「剥掉信封返回 data」「业务码非 200 拒绝」两条用例通过）
- [x] 2.2 实现 onRejected 的五个分支：`ApiError` 原样抛 → 取消原样抛 → 无 `response` 归为「无法连接后端服务」→ 404 归为 `NotFoundError` → 其余归为 `ApiError`（验证：`http.test.js` 中断连、404 默认文案、HTTP 500 三条用例通过，且 `ApiError.code` 为数字）
- [x] 2.3 导出 `isAbort`（`axios.isCancel(error) || error?.name === 'AbortError'`），删除 `request()` 并确认 `http.js` 不再引用 `fetch`/`globalThis.fetch`（验证：`grep -n "fetch" src/api/http.js` 无结果；取消用例断言 `isAbort(error)` 为真）
- [x] 2.4 重写 `http.test.js`：用 `okAdapter(payload)` / `failAdapter(status, payload)` 替换 `fakeFetch`，假适配器在非 2xx 时 reject 带 `response` 的 `AxiosError`，并用 `useAdapter` helper 设置与还原 `http.defaults.adapter`（验证：`node --test src/api/http.test.js` 全部通过，且失败用例确实走到 onRejected 而不是假绿）

## 3. 领域模块与参数层

- [x] 3.1 `matchResults.js`：`buildListQuery` 改为 `buildListParams` 返回对象（保留 `pageSize` 夹紧、页码取整、`scope` 仅 `warn`、空值不带参数、`matched: 0` 保留），四个请求改为 `http.get(..., { params, signal })`，其中 `listRunBizScopeOptions` 不再手拼 `?${...}`（验证：`node --test src/api/matchResults.test.js` 通过，含空格关键词序列化后仍以 `+` 分隔）
- [x] 3.2 `scheduledTasks.js`：同上改为 `buildListParams`，删除全部 `fetchImpl` / `base` 透传及对应 JSDoc，五个请求方法改用 `http` 实例（验证：`node --test src/api/scheduledTasks.test.js` 通过，断言目标为 `config.params` / `config.data` 而非 URL 字符串）
- [x] 3.3 `deleteScheduledTask` 捕获 `NotFoundError` 后重包为文案「任务不存在或已被删除」，其余错误原样抛（验证：单测断言删除失败时 `error.message` 为该文案且仍为 `NotFoundError`）

## 4. 视图取消判断

- [x] 4.1 `MatchResultList.vue`、`MatchResultDetail.vue`、`ScheduledTaskList.vue` 的 `error.name === 'AbortError'` 改为 `isAbort(error)`（验证：`grep -rn "AbortError" src/` 仅剩 `http.js` 与测试中的兼容判断）

## 5. 集成验收

- [x] 5.1 运行 `pnpm test`，确认三份 API 单测与既有算法单测全部通过（验证：退出码 0，无失败与跳过异常）
- [x] 5.2 运行 `pnpm build` 确认构建通过、无未解析导入（验证：命令退出码 0）
- [ ] 5.3 手工冒烟：列表分页与筛选、详情页正常与不可渲染、创建重名报错、启停与删除、快速连续切换筛选不出现「canceled」提示、停掉后端后显示「无法连接后端服务，请确认服务已启动后重试」（验证：以上六项行为与改造前一致）
