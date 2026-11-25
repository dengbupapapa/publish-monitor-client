# Tasks

## 1. cron 编辑区改造

- [x] 1.1 `CronInput.vue` 移除文本输入框与 `onInput`，模板顺序改为「点选器 → 小号只读表达式文本 → 错误提示/中文描述与接下来执行时间」，并保留 `isValidCron` 校验与预览；验证：`npm run build` 通过，打开新增弹窗确认无文本框且点选后只读文本实时更新
- [x] 1.2 删除 `pickerPeriod` ref、监听 `modelValue` 的 watch，以及 `:period` 与 `@update:period` 绑定；验证：文件内无 `pickerPeriod` 残留且 `npm run build` 通过，打开编辑弹窗点选字段仍能正常生成表达式

## 2. 表单字段与载荷

- [x] 2.1 `ScheduledTaskForm.vue` 创建态任务类型默认空：删除 `initFromProps` 的默认首项赋值与「字典晚到补首项」watch；验证：打开新增弹窗任务类型为空，直接提交提示「请选择任务类型」
- [x] 2.2 `ScheduledTaskForm.vue` 删除平台表单项，账号输入框改绑 `form.biz_scope`，表单 state 移除 `biz_type`，编辑预填改取 `initial.biz_scope`；验证：打开编辑弹窗账号显示原 `biz_scope`，表单不含平台项
- [x] 2.3 `scheduledTasks.js` 的 `buildSchedulePayload` 不再产出 `biz_type`，`createScheduledTask` 请求 body 去掉 `biz_type`；验证：`node --test src/api/scheduledTasks.test.js` 在同步更新断言后通过
- [x] 2.4 更新 `scheduledTasks.test.js` 中 `biz_type` 相关断言，改为断言载荷只含 `name/job_type/cron/biz_scope`；验证：`node --test src/api/scheduledTasks.test.js` 全部通过

## 3. 列表展示

- [x] 3.1 `ScheduledTaskList.vue` 的 `actions` 列增加 `fixed: 'right'`；验证：缩小窗口出现横向滚动时操作列固定在右侧
- [x] 3.2 删除「平台」「账号」两列，改为单列「账号」绑定 `biz_scope`，并删除 `biz_type` 的 `bodyCell` 渲染分支；验证：列表账号列展示 `biz_scope`，`grep` 确认 `src/views/ScheduledTaskList.vue` 内无 `biz_type` 引用

## 4. 集成验证

- [x] 4.1 执行 `node --test` 与 `npm run build`，确认全部单测与构建通过
- [x] 4.2 浏览器走查：新建（任务类型为空拦截、点选生成 cron、只读表达式回显、账号提交后列表账号列展示 `biz_scope`）；编辑（预填、清空账号）；列表横向滚动时操作列固定
