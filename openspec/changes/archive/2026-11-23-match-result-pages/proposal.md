# Proposal

## Why

后端 `publish-compliance-monitor` 已经把关卡核查结论落库，并提供 `GET /match-results` 与
`GET /match-results/{id}/preview` 两个只读接口；但目前唯一能看差异的方式，是在后端仓库里
用 Python 命令生成一个离线 HTML 文件。运营与审核人员没法自己查"哪一篇文章被判定有差异、
差异在哪"，每次都要找开发跑命令。

需要把这件事变成一个浏览器里可自助使用的只读界面：列表用来找结论，详情用来逐行看差异。

## What Changes

- 在本仓库（当前只有 Vue 脚手架）落地一个只读 SPA：`/match-results` 列表页与
  `/match-results/:id` 详情页，数据只来自上述两个接口。
- 列表页：按匹配态三态筛选、偏移量分页、展示两侧标题与差异汇总、仅对可渲染结论开放详情入口。
- 详情页：把后端"精简对比预览"的渲染内核移植到前端——按区间注入高亮、Markdown 渲染、
  源码偏移到渲染块的索引、按对齐映射逐行摆放、跨行差异连线、记录卡与高亮／连线联动。
  算法逻辑逐条对齐后端实现，呈现层用 Vue 组件重写。
- 保留对齐不可用时的显式降级（按块序配对 + 顶部提示）与"记录无可定位"提示，不伪造逐行对齐。
- 引入 `ant-design-vue`（外壳与列表）、`marked`（**锁定 18.2.0**，与后端内置版本一致）、
  `dompurify`（正文消毒）。
- 移除脚手架示例内容（占位 `App.vue`、`stores/counter.js`），补齐路由、API 封装、对照区组件。
- 不新增、不修改后端接口；开发期用 Vite 代理把 `/api` 指到 `127.0.0.1:8001`。

## Capabilities

### New Capabilities

- `match-result-list`: 结论列表的查询、筛选、分页、差异汇总与详情可进入性判定。
- `match-result-detail`: 单条结论的两侧逐行对照渲染、差异高亮、记录联动、跨行连线与降级行为。

### Modified Capabilities

无。本仓库此前没有任何 spec。

## Impact

- 代码：`src/` 全量落地（`api/`、`views/`、`diff/`、`components/`、`styles/`、`router/`），
  删除脚手架示例；`vite.config.js` 增加 `/api` 代理与 `unplugin-vue-components` 配置；
  `package.json` 增加运行时与构建期依赖；`index.html` 标题与语言。
- 依赖：`ant-design-vue@^4`、`marked@18.2.0`（精确）、`dompurify`、
  `unplugin-vue-components`（dev）。
- 后端：零改动。仅约定生产环境由同域反向代理把 `/api` 转发到后端；跨域部署不在本次范围。
- 非目标：源码视图与渲染自检、诊断与对象面板、统计徽章、虚拟滚动、写入类操作
  （触发运行／定时任务）。
