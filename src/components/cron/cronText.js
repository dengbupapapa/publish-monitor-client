/**
 * cron 文本的可读化：中文描述与接下来的执行时间。
 *
 * 纯函数集中在这里，便于 node:test 直接验证；组件只负责展示。
 * `cronstrue/i18n` 是内置全部语言的构建，用 `locale` 选项切换到 zh_CN。
 */

import cronstrue from 'cronstrue/i18n.js'
import { CronExpressionParser } from 'cron-parser'

/** 预览的「接下来执行」次数。 */
export const PREVIEW_COUNT = 3

/**
 * cron 表达式的中文可读描述。
 *
 * 调用方需保证表达式可解析（见 `isValidCron`）；无效表达式抛出的是
 * 普通字符串而非 Error 实例。
 *
 * @param {string} expression 五段式 cron 表达式
 * @returns {string}
 */
export function describeCron(expression) {
  return cronstrue.toString(expression, { locale: 'zh_CN' })
}

/**
 * 接下来的若干次执行时间。
 *
 * @param {string} expression 五段式 cron 表达式
 * @param {{count?: number, currentDate?: Date, timezone?: string}} [options]
 * @returns {Date[]} 升序的执行时间
 */
export function nextRunTimes(expression, options = {}) {
  const count = Math.max(1, Math.floor(Number(options.count) || PREVIEW_COUNT))
  const parsed = CronExpressionParser.parse(expression, {
    currentDate: options.currentDate,
    timezone: options.timezone,
  })
  const times = []
  for (let i = 0; i < count; i += 1) {
    times.push(parsed.next().toDate())
  }
  return times
}

/**
 * 执行时间的人类可读格式（本地时区，24 小时制）。
 *
 * @param {Date} date
 * @returns {string}
 */
export function formatRunTime(date) {
  return date.toLocaleString('zh-CN', { hour12: false })
}
