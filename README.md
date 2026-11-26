# publish-monitor-client

稿件核查结论的只读前端：列出后端已落库的对比结论，并按「精简对比预览」的方式逐行对照两侧正文。

后端仓库：[publish-compliance-monitor](https://github.com/)（`E:\dev\example-langchain\publish-compliance-monitor`），默认监听 `http://127.0.0.1:8001`。

## 两个页面

| 地址 | 作用 |
| --- | --- |
| `/match-results` | 结论列表：服务端分页 + 任务类型／账号／关注集过滤，展示发布／内部稿件名、结果判定、状态与详情入口 |
| `/match-results/:id` | 结论详情：两侧正文逐行对照、差异高亮、记录侧栏与跨行连线 |

列表页的过滤与分页状态写在地址栏（`matched` / `scope` / `keyword` / `job_type` / `biz_scope` / `page` / `size`），可以直接分享或后退。
页头提供任务类型与账号两个下拉，选项取自运行记录（含已下线但仍有结论的历史类型）；账号按任务类型级联，筛选时以业务名称作为条件。
编号是按页码与条数算出的序号，不是结论编号（悬停可见）。
未匹配不代表无差异：结果列显示「疑似未审」，表示发布稿件没有对上任何内部稿件；
只有「匹配成功 + 核查完成 + 无差异记录」才显示「一致」。
只有匹配态为「匹配」的结论能进入详情；不可渲染的结论会显示「这条结论不可渲染」而不是空白页面。

## 启动

先确认后端已经在监听 `127.0.0.1:8001`（后端没有配置 CORS，因此前端一律走 `/api` 前缀代理，
由 `vite.config.js` 的 `server.proxy` 去掉前缀转发）。

```sh
pnpm install
pnpm dev        # 开发服务器，默认 http://localhost:5173
pnpm test       # 算法单测（node --test，纯函数，不需要浏览器）
pnpm build      # 生产构建
```

生产部署时假定同域反向代理把 `/api` 转发到后端；如需换前缀，设置构建期变量
`VITE_API_BASE`（默认 `/api`）。

## 目录

```text
src/
├─ api/                接口访问：信封解析、错误归一、参数拼装
├─ diff/
│  ├─ constants.js     侧标识、计数单位、五条注入安全判据的正则
│  ├─ inject.js        安全判定、区间合并、倒序插 <mark>
│  ├─ blocks.js        Markdown 顶层块区间、行原子计划
│  ├─ records.js       扁平记录行 + 区间行 → 记录视图与摘要
│  ├─ render.js        单侧渲染（唯一碰 DOM 的算法层，含 DOMPurify）
│  ├─ rows.js          对齐映射 → 行规格，失败退回块序配对
│  └─ wires.js         差异连线（整页 overlay SVG，可跨行）
├─ components/diff/    对照区、行、记录卡
├─ views/              列表页与详情页
└─ styles/             全局基座与对照区样式
```

## 与离线预览页的一致性

详情页的渲染算法移植自后端 `src/tools/md_diff_preview_template.html`：

- 高亮注入的五条安全判据逐字对应 `md_diff_viewer_data.unsafe_reason`，不安全区间整条跳过；
- 块切分依赖 `marked` 的 lexer，因此 `marked` 锁定为 `18.2.0`（后端内置同一版本），
  升级会让块区间与渲染结果对不上；
- 对齐映射自相矛盾或覆盖不全时不再硬凑布局，而是按块序配对并在顶部说明原因。

## 已知边界

- 不做虚拟滚动：单篇正文在 50–150KB 量级，一次渲染即可；
- 不提供源码视图、渲染自检、诊断与对象面板——那些是离线预览页的能力；
- 后端接口未提供结论状态与时间之外的运行期信息，详情页只显示编号与坐标版本。

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar)（并关闭 Vetur）。
