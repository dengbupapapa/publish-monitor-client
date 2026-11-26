# Tasks

## 1. API 层：运行维度参数与选项接口

- [x] 1.1 在 `src/api/matchResults.js` 增加 `JOB_TYPE_MAX_LENGTH = 32`、`BIZ_SCOPE_MAX_LENGTH = 128` 与对应归一函数，扩展 `buildListQuery` / `listMatchResults` 接受 `jobType` / `bizScope`：归一后为空不带参数，超长截断，仍与 `matched` / `scope` / `keyword` 叠加。验证：在 `src/api/matchResults.test.js` 增加缺省、去空白、截断、叠加用例，`npm test` 通过。
- [x] 1.2 在 `src/api/matchResults.js` 新增 `listRunJobTypes()` 与 `listRunBizScopeOptions(jobType)`，分别请求 `/diff-run-options/job-types` 与 `/diff-run-options/biz-scopes`（`jobType` 为空时不带该参数），解包信封并对非数组响应回落为空数组。验证：用 fetch 桩断言请求路径、查询串与解包结果，`npm test` 通过。

## 2. 地址状态与页头控件

- [x] 2.1 把 `MatchResultList.vue` 的 `state`、`explicitState`、`toListQuery` 与规范化 watcher 扩展到七个键：新增 `job_type` / `biz_scope`，缺省值不写地址，超长按 32 / 128 截断。验证：手改地址确认缺省、超长与多余键都被改写为规范形态，`npm test` 与 `npm run build` 通过。
- [x] 2.2 在页头按「任务类型 → 账号 → 关键词 → 勾选项」加入两个 `a-select`，缺省「全部」；宽度、间距与右对齐沿用现有布局。验证：`npm run build` 通过，关键词防抖与勾选写缓存等既有交互不变。
- [x] 2.3 更新 README 的列表页说明与地址参数，补上 `job_type`、`biz_scope` 与新增的两个过滤控件。验证：文档描述与页面实际控件、地址参数一致。

## 3. 级联、失败降级与回显

- [x] 3.1 页面挂载时加载任务类型选项，并随 `job_type` 变化加载账号选项；两路请求使用独立序号与中止控制，失败保留上次成功的选项，首屏失败时两个下拉只剩「全部」。验证：在浏览器中屏蔽两个选项请求，确认列表仍正常加载且下拉降级；恢复后选项可再次加载。
- [x] 3.2 级联串行化：切换任务类型后先取新账号选项，仅当当前账号不在新选项中才清空账号并回第一页，再取列表；不得先按旧账号请求列表。验证：构造「两个类型共有的账号」与「仅某类型有的账号」两种数据，观察 Network 中列表请求只发一次，账号分别被保留与清空。
- [x] 3.3 把地址中的账号并入选项候选：接口未返回该值时，下拉以原值显示并仍按其请求。验证：手改地址为运行记录里未出现过的账号，确认下拉回显该值、请求携带它、空态提示为条件组合无结果。

## 4. 空态与集成验证

- [x] 4.1 空态新增「运行维度条件无命中」分支，排在关键词无命中之后，仅当 `job_type` 或 `biz_scope` 有值时出现。验证：选定无结果的类型/账号组合，文案与「关键词无命中」「关注集与未知匹配态无交集」均不同。
- [x] 4.2 整体验证：`npm test` 与 `npm run build` 通过；在页面上核对默认加载、带条件地址直开后的回显与级联、翻页、从详情返回后的条件与页码恢复。
