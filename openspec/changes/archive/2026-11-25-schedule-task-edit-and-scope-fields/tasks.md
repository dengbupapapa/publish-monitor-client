# Tasks

## 1. API 层与契约测试

- [x] 1.1 改造 `src/api/scheduledTasks.js` 的 `listScheduledTasks(params)`：接受 `pageNum`/`pageSize`/`job_type`，拼 query（空值省略），返回 `{total, rows}`；更新 `src/api/scheduledTasks.test.js` 断言 URL 含正确 query 且解析分页结构，`node --test src/api/scheduledTasks.test.js` 通过
- [x] 1.2 扩展 `createScheduledTask(payload)` 支持 `job_type`/`biz_scope`/`biz_type`；新增 `updateScheduledTask(id, patch)` 走 `PATCH /diff-schedules/{id}`；新增 `listJobTypes()` 走 `GET /job-types`；补测试断言请求方法与 body 字段，`node --test src/api/scheduledTasks.test.js` 通过
- [x] 1.3 重构错误归位：按 `ApiError.code`（`40002`→cron、`40005`→任务类型、`40902`→名称/业务范围）优先、`status` 兜底；业务范围冲突按文案含「业务范围」区分；补测试覆盖各码归位，`node --test src/api/scheduledTasks.test.js` 通过

## 2. 共用任务表单组件

- [x] 2.1 新增 `src/components/schedule/ScheduledTaskForm.vue`：支持 `mode: 'create' | 'edit'` 与 `initial`，渲染名称、任务类型下拉（数据来自 `listJobTypes()`，创建默认选中首项）、平台/账号文本框、复用 `CronInput`；不渲染 `biz_name`/`params`；通过组件测试或手动渲染验证三种字段存在且默认值正确
- [x] 2.2 表单提交构造 payload：仅含 `name`/`job_type`/`cron`/`biz_scope`/`biz_type`，空文本框传 `""`、不传 `null`，不发 `biz_name`/`params`；用组件/单元测试断言 payload 字段与空值处理正确
- [x] 2.3 表单内联校验：名称、任务类型、cron 必填且 cron 需通过 `CronInput` 有效性；无效时禁用提交；验证非法输入无法提交

## 3. 列表页接线

- [x] 3.1 `src/views/ScheduledTaskList.vue` 改为分页渲染：页码/条数/`job_type` 走 route query（`pageNum` 从 1 起，`pageSize` 不超过 200），越界页码回落最后一页；手动验证翻页、改条数、越界回落
- [x] 3.2 列表新增列：任务类型（用 `listJobTypes()` 建 `value→label` 映射转中文，缺失回退原值）、平台、账号；宽表允许横向滚动；手动验证列内容与中文映射、空值占位
- [x] 3.3 新增「任务类型」筛选下拉（默认「全部」= 不传 `job_type`），切换后回到第一页并刷新总数；手动验证筛选生效与重置
- [x] 3.4 操作列新增「编辑」，点击以 `mode='edit'` 预填打开共用表单，保存走 `updateScheduledTask`；成功后刷新列表并提示，失败保留表单并按错误归位；手动验证编辑成功、名称冲突、业务范围冲突三条路径
- [x] 3.5 新建入口改用共用表单组件，提交走 `createScheduledTask`，保持原有成功/失败/载体语义；`node --test` 全量通过并手动回归新建流程

## 4. 集成回归

- [x] 4.1 端到端回归：加载列表（分页）→ 筛选任务类型 → 新建（含平台/账号）→ 编辑（改任务类型/清空账号）→ 启停 → 删除；确认无控制台报错、任务类型显示中文、未展示 `biz_name`/`params`；运行 `npm test`（或 `node --test`）全部通过
