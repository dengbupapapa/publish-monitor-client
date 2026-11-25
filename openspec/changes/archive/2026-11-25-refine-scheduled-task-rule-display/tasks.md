# Tasks

## 1. 安全中文转换

- [x] 1.1 在 `src/components/cron/cronText.js` 基于 `describeCron` 增加安全转换，有效值返回中文、转换异常返回原始表达式、空值返回空文本，并在 `cronText.test.js` 覆盖这三种情况；运行 `node --test src/components/cron/cronText.test.js` 验证通过。

## 2. 列表与表单展示

- [x] 2.1 在 `ScheduledTaskList.vue` 的现有行派生逻辑中生成 `cronDescription`，将列名改为「任务规则」并以中文作为单元格主要内容，保留省略展示、空占位及包含完整中文和原始表达式的悬浮提示，无效值回退原始表达式；运行 `npm run build` 验证模板编译通过。
- [x] 2.2 将 `ScheduledTaskForm.vue` 的共享字段标签和 `CronInput.vue` 的无效规则提示改为「任务规则」，保留只读表达式、技术格式说明、中文预览和未来执行时间；在新建与编辑弹窗中分别检查标签和既有点选预览行为。

## 3. 默认校验文案

- [x] 3.1 更新 `scheduledTasks.js` 中本地校验及无服务端文案时的默认 Cron 错误提示，使其以「任务规则」指代字段，并保持服务端 `message` 原样返回和既有错误字段归位；同步更新 `scheduledTasks.test.js` 断言，运行 `node --test src/api/scheduledTasks.test.js` 验证通过。

## 4. 整体验证

- [x] 4.1 运行完整 `npm test` 与 `npm run build`，确认所有单元测试和生产构建通过。
- [x] 4.2 在定时任务页面使用常见规则、复杂长规则和无效历史规则检查中文展示、省略与悬浮提示及其他行正常渲染，并检查新建、编辑表单默认提示；通过既有请求测试或网络请求确认创建和编辑仍提交原始 `cron` 字符串且未新增展示字段。
