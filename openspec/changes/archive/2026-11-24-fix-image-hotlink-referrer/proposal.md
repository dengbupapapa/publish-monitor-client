# Proposal

## Why

正文里的图片在当前应用里全部显示成微信的占位图「此图片来自微信公众平台 未经允许不可引用」，而把同一段正文存成本地 HTML 用浏览器直接打开却显示正常。实测原因是跨站图床的防盗链：浏览器直开 `file://` 页面不发 `Referer`，图床放行；应用跑在 `localhost:5173`（以及线上自有域名）时 `Referer` 指向本站，不在图床白名单内，图床返回 200 + 占位图。

结果是详情页的逐行对照失去了图片这一维度：两侧图片看起来"一模一样"，图片类差异记录的 `hl-image` 轮廓贴在一张相同的占位图上，使用者无法判断图片到底变没变。请求是 200 成功，`onerror` 不会触发，页面也无从提示，属于静默的错误呈现。

## What Changes

- 单侧渲染时给正文中每张 `<img>` 补上 `referrerpolicy="no-referrer"`，让图片请求不带 `Referer`，与"纯 HTML 直开"的请求条件一致
- 该属性必须在 `DOMPurify.sanitize` **之后**写到 DOM 节点上：DOMPurify 的默认属性白名单不含 `referrerpolicy`（已在依赖源码中确认），写在原始 markdown 里会被剥掉；写入后再经 `outerHTML` 快照进入 `v-html`
- 明确不改动：不引入全局 `<meta name="referrer">`（避免波及 fetch/XHR 与将来可能的 Referer 校验）、不加后端图片代理、不做 dev 期 URL 改写、不改动图片在原子切块与 `hl-image` 轮廓通道中的既有行为
- 不新增依赖，不改构建配置，不改接口与数据结构

无 **BREAKING** 变更：仅影响图片请求头，页面结构与交互不变。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `match-result-detail`：新增「正文中的外部图片必须可正常显示」一条行为要求——跨站图床的防盗链不得使正文图片退化为占位图，且图片类差异标记仍须落在真实图片上

## Impact

- `src/diff/render.js`：在现有 post-sanitize 修正循环（`mark.hl-image` / `a[target]`）附近新增图片属性补齐
- 不涉及 `blocks.js` / `inject.js` / `rows.js` 等纯函数，原子切块与高亮位置不受影响
- 现有测试为 `node --test` 下的纯函数用例，`render.js` 依赖 DOM 未被覆盖，本次不新增单测，验收靠页面实测（Network 面板确认图片请求无 `Referer`）
- 不影响 `match-result-list`
