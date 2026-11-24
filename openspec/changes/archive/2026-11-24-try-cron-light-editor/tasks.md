# Tasks

## 1. cron-zen 收尾（D6）

- [x] 1.1 卸载 `@cron-zen/vue3` 与 `@cron-zen/core`；验证 `package.json` 与 lockfile 无残留、`pnpm build` 通过
- [x] 1.2 在 `try-cron-zen-editor/proposal.md` 追加验证结论（Quartz 七段硬编码、闸门一不可满足、转向 vue-js-cron/light），其 tasks.md 剩余项标记为 cancelled；验证 `openspec validate try-cron-zen-editor` 后由用户归档该变更

## 2. 依赖接入

- [x] 2.1 安装 `@vue-js-cron/light` 并精确锁版 5.2.4；验证 `pnpm install` 成功且 `pnpm build` 通过
- [x] 2.2 在 `CronInput.vue` 引入 `CronLight`（`import '@vue-js-cron/light/dist/light.css'`），与文本框共享 cron ref 组成混合模式，`disabled` 透传；验证 `pnpm build` 通过且 `node --test src/api/scheduledTasks.test.js` 不受影响

## 3. 联动与错误链路

- [x] 3.1 双向联动：键入合法表达式同步 CronLight 选中态、点选回显文本框；实测键入非法表达式时 CronLight 内部表现，确定联动策略（值合法才参与联动）并落地；验证浏览器手测两种方向联动均生效
  - 实测结论：非法键入时文本框值保留、组件内部报错不破坏；联动需 period 推断——键入值含日/月/周字段时切到"每年"周期再解析，否则隐藏字段被静默丢弃（已在 CronInput 落地）
- [x] 3.2 `@error` 事件接入 `formErrors.cron`，非法值时提交禁用（沿用现有 validateFields 链路）；验证单测覆盖 `isValidCron` 拦截非五段式值（`node --test src/api/scheduledTasks.test.js` 通过）
  - 评估结论：组件 `@error` 文案为英文且与本地 `isValidCron` 判定同源，不直接展示；错误展示由 CronInput 现有中文校验文案承担，提交禁用沿用 validateForm 链路；单测补 `?` 与 Quartz 六段式拒绝用例

## 4. 验证闸门（D5：任一失败即回滚）

- [x] 4.1 闸门一（五段式）：真实页面点选各周期（分钟/小时/日/周/月）与键入粘贴，确认全部产物为五段式且无 `?`/秒/年；curl 提交点选产物到服务端得 201
  - 结论：六周期 × 点选产物均为五段式；键入 `0 9 * * 1-5`/`0 10 * * 0,6` 等均保留五段式；`5 * * * *` 与 `0 9 * * 1-5` 服务端 croniter 均 201
- [x] 4.2 闸门二（主题）：暗色主题下走查 CronLight（按钮/格子/下拉菜单对比度），用 `--cl-*` 变量覆盖完成适配并复查；不可接受则触发 D4 renderless 退路评估
  - 结论：`.ant .cl-menu` 硬编码白底，仅靠 `--cl-*` 覆盖无效；改用库内置 `.dark .ant` 组合（dark 祖先 + theme="ant"）后菜单为 #1f1f1f，按钮/格子/选中态均可读，D4 退路无需触发
- [x] 4.3 闸门三（预览与校验）：编辑过程中实时中文描述 + 3 次执行时间（cronText.js）正常展示；无效表达式展示校验错误且提交按钮禁用——对照 delta spec 场景逐条核对
  - 结论：合法值实时展示中文描述 + 3 次执行时间 + 免责标注；`* * *` 展示中文校验错误且点击创建被拦截（弹窗保留、无新任务产生）
- [x] 4.4 闸门结论落盘：三项全过 → 继续；任一失败 → 还原 CronInput.vue、卸载 light、记录"验证未通过 + 原因"；验证 `pnpm build` 与 `node --test` 全部通过
  - 结论：三闸门全过，无需回滚；`pnpm build` 通过，`node --test` 全量结果见 5.1

## 5. 集成走查

- [x] 5.1 创建表单全流程走查：点选生成 → 预览 → 提交成功 → 服务端列表可见 → 删除清理冒烟数据；运行全部单测通过
  - 结论：UI 创建 `pm-ui-smoke` / `*/5 * * * *` 成功（列表与服务端一致）；三条冒烟数据全部删除，`/diff-schedules` 返回空列表；`node --test` 100/100 通过、`pnpm build` 通过、`openspec validate` 通过
