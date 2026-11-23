# Tasks

## 1. API 层切换到新分页契约

- [x] 1.1 在 `src/api/matchResults.js` 用 `pageToPageNum(page)` 取代 `pageToSkip`：`page` 兜底为至少 1 的整数、非数字回落 1，返回 `page - 1`（每页条数的收敛留在 `buildListQuery`）；验证 `pnpm test` 中页码换算用例（1 → 0、3 → 2、0/非法 → 0）通过
- [x] 1.2 改写 `buildListQuery`：接收 `{pageNum, pageSize, matched}`，输出 `pageNum` / `pageSize`（`pageNum` 非负、缺省 0；`pageSize` 收敛 1..`MAX_LIMIT`、缺省 `DEFAULT_LIMIT`），`matched` 为空时不带该参数，且不再输出 `skip` / `limit`；验证单测断言查询串键名为 `pageNum`/`pageSize` 且不含 `skip`/`limit`
- [x] 1.3 让 `listMatchResults({page, size, matched, signal})` 内部调用 `pageToPageNum` 生成 `pageNum` 再拼查询串，返回体形状注释改为 `{total, rows}`；验证 `pnpm test` 全部通过

## 2. 列表视图读取新响应字段

- [x] 2.1 在 `src/views/MatchResultList.vue` 把 `pageData` 形状由 `{total, items}` 改为 `{total, rows}`，`load()` 请求改为传 `page`/`size`，响应读 `payload?.rows`（非数组按空数组兜底），总数仍读 `payload?.total`；验证首屏渲染后 DevTools Network 里 `/api/match-results` 请求带 `pageNum`/`pageSize`，表格条目与 `data.rows` 一一对应
- [x] 2.2 复核 `rows` 计算属性、序号派生、`row-key`、详情跳转只依赖条目自身 `id` 与顺序，翻页后编号继续为 `(页码 - 1) × 每页条数 + 本页次序`；验证切到第 2 页时首行编号为该页起点且「查看详情」打开对应结论
- [x] 2.3 更新 `src/api/matchResults.test.js`：删除 `skip`/`limit` 断言，新增「页码 1 → `pageNum=0`」「超上限收敛到 `MAX_LIMIT`」「非法值回落缺省」用例，并断言查询串不含 `skip`/`limit`；验证 `pnpm test` 通过

## 3. 联调与回归

- [x] 3.1 启动后端后请求 `GET /api/match-results?pageNum=1&pageSize=5`，确认响应 `data` 只有 `{total, rows}` 且 `rows` 与列表页展示一致；验证「全部/匹配/不匹配/未知」四种过滤与切换后回到第一页、每页条数切换均可用
- [x] 3.2 复核地址状态：带 `?matched=1&page=2&size=20` 直接打开按该条件取数，越界页码回落第一页，从详情返回仍保留原过滤与页码；验证手改非法参数不白屏、不报错
- [x] 3.3 复核失败与空态：停掉后端时显示错误提示与重试按钮而不是空列表，重试恢复后正常展示；验证「未知」过滤无数据时显示空结果提示且过滤控件仍可用

## 4. 修复验收暴露的地址状态缺陷（3.2 追加范围，经用户确认）

- [x] 4.1 列表加载后若总数不为 0 但当前页无条目且页码大于 1，判定页码越界并回到第 1 页；验证 `?matched=1&page=2&size=20` 最终落到 `?matched=1` 并展示第 1 页条目
- [x] 4.2 详情地址带上列表当前的过滤与分页 query，详情页「返回列表」回写同一 query；验证 `?page=2&size=10` 进详情再返回仍为 `?page=2&size=10` 且首行编号 11
