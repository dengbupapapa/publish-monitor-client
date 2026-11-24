# Design

## Context

- 服务端（publish-compliance-monitor，FastAPI）已有完整实现，无需改动：`POST/GET/PATCH/DELETE /diff-schedules`，统一信封 `{code, msg, data}`，`GET` 返回全量列表（字段：`id`、`name`（唯一）、`cron`（五段式）、`enabled`、`last_fired_at`），错误文案为中文并已由 `http.js` 的 `ApiError` 透出。
- 客户端 Vue 3 + ant-design-vue 4（按需自动引入），无全局 store，API 层为 `src/api/http.js`（基于 fetch）+ 业务模块（如 `matchResults.js`）+ node:test 单测。
- `http.js` 的 `request()` 目前硬编码 `method: 'GET'`，不支持带 body 的请求——这是本变更唯一需要改动的既有模块。
- 仓库无任何 cron 相关依赖；现有页面 `MatchResultList.vue` 是列表页的组织范式（query 驱动、AbortController 防竞态、a-table + #bodyCell 插槽、a-alert 错误条）。

## Goals / Non-Goals

**Goals:**

- `http.js` 支持任意 method 与 JSON body，且不破坏现有 GET 调用方与单测
- 定时任务页遵循现有列表页范式，但状态本地化（无分页/筛选，不占用地址栏 query）
- cron 编辑采用"文本输入 + 本地校验 + 中文描述 + 下次执行时间预览"

**Non-Goals:**

- 定时任务编辑（改名/改 cron）——等服务端 PATCH 扩展后再加
- 列表分页、搜索、状态筛选
- 可视化分页签 cron 编辑器（分钟/小时/月/周日各一页签的那种）

## Decisions

### D1: cron 编辑器形态——文本输入 + 实时校验预览

新建任务的 cron 用单行文本输入框，输入时实时计算：中文可读描述（`cronstrue`，支持 zh_CN）+ 接下来 3 次执行时间（`cron-parser`）。两者均本地计算，不依赖服务端。

- 备选 A：可视化分页签编辑器——ant-design-vue 无现成组件，第三方 vue cron 组件风格不兼容 antd 且质量参差，自研成本高，放弃。
- 备选 B：纯提交时靠服务端 croniter 校验——用户输错要等一次请求才知道，且无法做实时预览，放弃。
- 五段式格式（分 时 日 月 周）在输入框 placeholder 与帮助文案中明确说明，与服务端 croniter 约定一致。

### D2: `http.js` 泛化 `request()`，而非新增并行函数

把 `method` 与 `body` 提升为 `options` 参数：`options.method` 缺省 `'GET'` 保持兼容；`options.body` 为对象时以 `Content-Type: application/json` 序列化发送。信封剥壳、错误分支逻辑不变。

- 备选：新增 `postJson()`/`patchJson()` 独立函数——会造成两套几乎相同的响应处理，后续维护两处，放弃。
- 404 的默认文案"未找到这条结论"是结论详情语境的，泛化时改为中性文案（如"请求的资源不存在"），调用方需自定义时可用 `options.notFoundMessage` 传入——现有结论详情调用方显式传入原文案。

### D3: 页面状态本地化，不进地址栏

`MatchResultList.vue` 把筛选/分页放进 `route.query` 是因为筛选条件需要可分享、可回退。定时任务列表无筛选无分页，这些都不成立；本地 ref + 手动刷新按钮即可，降低复杂度。

### D4: 启停/删除操作收敛到单行级状态

每行开关和删除各自维护 loading 态（按行 id 记录），请求期间禁用该行操作；失败回弹开关靠"先记旧值、失败时还原"实现，不做乐观锁之外的复杂处理。

### D5: API 模块遵循现有组织

新增 `src/api/scheduledTasks.js`：常量 + 纯函数（可单测的表单校验、字段归一化）+ 接口函数（`listScheduledTasks` / `createScheduledTask` / `setScheduledTaskEnabled` / `deleteScheduledTask`），配套 `scheduledTasks.test.js`（node:test，风格对齐 `matchResults.test.js`）。

## Risks / Trade-offs

- [cron-parser 与服务端 croniter 对"夏令时/日字段与星期同时指定"等边界的解释不完全一致] → 预览标注"预览仅供参考，以服务端实际触发为准"；服务端创建时 croniter 仍做最终校验，客户端解析失败的表达式提交前就被拦截，风险仅限两者都能解析但解释不同的极端情况。
- [重名冲突是服务端校验，客户端无法预判] → 创建失败时保留表单并展示服务端 msg，用户改名重试即可。
- [`http.js` 是现有页面共享模块，泛化有回归风险] → 现有单测保持通过 + 为新参数补单测；GET 调用方不传新参数时行为逐字节不变。
- [列表无分页，任务多时全量渲染] → 服务端场景任务数量个位数；antd 表格本身可承受百行量级，超出后再议分页（已列入 Non-Goals）。

## Migration Plan

纯客户端增量变更：新增文件 + 扩展 `http.js`，无数据迁移、无接口破坏性变更。回滚 = 还原 `http.js` 并移除新文件与路由项。

## Open Questions

（无）
