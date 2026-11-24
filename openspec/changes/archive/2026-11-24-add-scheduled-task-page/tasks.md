# Tasks

## 1. 依赖与基础设施

- [x] 1.1 安装 `cronstrue` 与 `cron-parser`，验证 `pnpm install` 成功且 `package.json` 记录依赖
- [x] 1.2 扩展 `src/api/http.js` 的 `request()`：支持 `options.method`（缺省 `GET` 保持兼容）与 `options.body`（对象按 JSON 序列化，带 `Content-Type: application/json`），404 默认文案改为中性并支持 `options.notFoundMessage` 覆盖；同步更新 `src/api/http.test.js` 覆盖新参数，运行 `node --test src/api/http.test.js` 及现有调用方（matchResults）单测全部通过

## 2. API 模块

- [x] 2.1 新建 `src/api/scheduledTasks.js`：定义任务字段归一化/表单校验纯函数（名称必填与长度、cron 五段式本地解析），导出 `listScheduledTasks` / `createScheduledTask` / `setScheduledTaskEnabled` / `deleteScheduledTask`，对接 `POST/GET/PATCH/DELETE /diff-schedules`
- [x] 2.2 新建 `src/api/scheduledTasks.test.js`（node:test，风格对齐 `matchResults.test.js`），覆盖校验函数与四个接口函数的请求构造/信封剥壳/错误透出，运行 `node --test src/api/scheduledTasks.test.js` 通过

## 3. cron 编辑能力

- [x] 3.1 新建 `src/components/cron/CronInput.vue`：cron 文本输入框，实时输出中文可读描述（cronstrue zh_CN）与接下来 3 次执行时间（cron-parser），无效表达式输出校验错误；预览区标注"以服务端实际触发为准"；为解析/描述的纯函数部分补单测并运行通过

## 4. 定时任务列表页

- [x] 4.1 新建 `src/views/ScheduledTaskList.vue`：a-table 展示名称、cron、启停开关（a-switch，按行 loading，失败回弹 + 错误提示）、上次触发时间（空值显示"未触发过"）、删除（a-popconfirm 二次确认，成功刷新、失败保留并提示）；本地 ref 状态 + 手动刷新按钮 + a-alert 错误条
- [x] 4.2 实现创建任务弹窗：a-modal + a-form（名称必填、cron 字段接入 `CronInput`），客户端校验拦截空值，提交调用创建接口，成功后关闭表单、刷新列表并提示成功，服务端校验失败（重名/无效 cron）保留表单展示错误文案
- [x] 4.3 在 `src/router/index.js` 注册懒加载路由 `/scheduled-tasks`，并在导航中提供入口；验证直接访问路由可正常加载

## 5. 集成验证

- [x] 5.1 启动服务端与 `pnpm dev`，走通全流程：列表加载 → 创建（有效/无效表达式、重名）→ 启停（成功/失败回弹）→ 删除（确认/取消/失败），对照 specs 场景逐条核对；运行全部单测通过
