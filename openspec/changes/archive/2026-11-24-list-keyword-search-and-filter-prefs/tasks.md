# Tasks

## 1. 接口层：关键词参数

- [x] 1.1 `src/api/matchResults.js` 的 `buildListQuery` 增加 `keyword`：`trim` 后为空不写入查询串，超过 128 字符截断为前 128 再写入；验证：`npm test` 中新增用例分别断言「带值」「空串」「纯空白」「超长」四种输入下的查询串。
- [x] 1.2 `listMatchResults` 接收并透传 `keyword`，同步更新其 JSDoc 参数说明；验证：`npm test` 中断言 `listMatchResults({ keyword })` 实际请求的 URL 含 `keyword`，且不传时不含该键。
- [x] 1.3 在 `src/api/matchResults.test.js` 补齐组合用例：`keyword` 与 `scope=warn`、`matched=1` 同时存在时三个键都在查询串中，顺序无关；验证：`npm test` 全绿，且既有 `matched` / `scope` 用例不回归。

## 2. 本地偏好模块

- [x] 2.1 新建 `src/stores/listPrefs.js`，导出 `readAttentionOnly()` 与 `writeAttentionOnly(value)`：key 为 `pm.list.attentionOnly`，值写 `'1'` / `'0'`，读写均带 `typeof localStorage === 'undefined'` 守卫与 `try/catch`，读取缺省返回 `false`；验证：新增 `src/stores/listPrefs.test.js`，stub `globalThis.localStorage` 后写入 `true` 再读取得到 `true`。
- [x] 2.2 `listPrefs.test.js` 覆盖降级路径：无 `localStorage` 时读取返回 `false` 且不抛；`getItem` 抛错时读取返回 `false`；`setItem` 抛错时写入不抛；存储中出现非 `'1'` 的值时读取返回 `false`；验证：`npm test` 全绿。

## 3. 列表页改造

- [x] 3.1 从 `src/views/MatchResultList.vue` 移除匹配态下拉控件、`MATCHED_OPTIONS`、`matchedOption`、`onMatchedChange` 与 `.matched-filter` 样式；保留 `MATCHED_VALUES`、`state.matched`、`load()` 透传、`toListQuery` 写入、规范化键数组与「关注集 × 未知」空态分支；验证：页面控制区不再出现匹配态下拉，且直接打开 `?matched=1` 时请求仍带 `matched=1`、列表只显示匹配条目。
- [x] 3.2 `state` 增加 `keyword`（`String` 化后 `trim`，超过 128 截断），`toListQuery` 在非空时写入 `keyword`，地址规范化的比对键数组加入 `keyword`，`load()` 透传该值；验证：直接打开 `?keyword=某某` 时请求带该参数、输入框回显、页码回到 1；清空关键词后地址中不再含 `keyword`。
- [x] 3.3 新增关键词输入控件（带可清空与搜索图标、`maxlength=128`）与 300ms 防抖写入：写地址用 `router.replace`，写前比对 `trim` 后的输入与当前 `state.keyword` 相等则跳过，地址外部变化与组件卸载时清掉挂起的定时器；验证：连续输入多个字符后点浏览器返回只回退一次页面而不是逐字回退，停顿后列表按新关键词请求，后退恢复旧关键词后不会被挂起回调改回。
- [x] 3.4 拆出 `explicitScope`（地址取值）与 `effectiveScope`（含缓存兜底），地址规范化与 `toListQuery` 只用 `explicitScope`，`openDetail` 用 `effectiveScope`，缓存写入只放在 `onScopeChange`；验证：勾选后刷新页面仍为勾选；本地未勾选时打开 `?scope=warn` 得到的页面为勾选且地址保持不变；打开该分享地址后不操作直接重开无参数地址，仍按本地偏好呈现，说明缓存未被分享地址改写。
- [x] 3.5 `emptyDescription` 插入「关键词无命中」一级，位于「关注集 × 未知无交集」之后、「没有符合条件的结论」之前；验证：输入不存在的关键词时显示专门文案且输入框与勾选项仍可用，清空后恢复一般文案。
- [x] 3.6 调整控制区布局：关键词输入在前（约 240px 宽）、勾选项在后，窄屏下不挤压标题；验证：`npm run dev` 下目视核对控制区只剩两项、无残留空位与折行错位。

## 4. 集成核对

- [x] 4.1 运行 `npm test`，确认 API、缓存模块与既有 diff 相关用例全部通过。
- [x] 4.2 连真实后端（`publish-compliance-monitor` 需带 `keyword` 参数的分支）手工走查：关键词命中两侧标题任一命中、关键词与勾选项叠加、直开带关键词与勾选态的分享地址、从详情返回恢复关键词与勾选态、页码越界回第一页、断网时失败提示与重试入口。
