/**
 * 定时任务相关接口（服务端 `diff_schedule` 表）。
 *
 * 服务端已校验 cron（croniter 五段式）与名称唯一性；客户端的校验只是第一道
 * 拦截，最终以服务端为准。错误信封 `{code, msg, data}` 的文案由 `http.js`
 * 归一后透出，表单直接展示。
 */

import { request } from './http.js'

/** 后端对 `name` 的硬上限（`String(255)`）。 */
export const NAME_MAX_LENGTH = 255

/**
 * 名称归一化：去首尾空白，空串表示「没有名称」。
 *
 * 地址/弹窗可能绕过输入框限制，提交前在这里再截断一次作为保险。
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeName(value) {
  if (value === null || value === undefined) return ''
  return String(value).trim().slice(0, NAME_MAX_LENGTH)
}

/**
 * 本地解析五段式 cron（分 时 日 月 周），服务端 croniter 的第一道拦截。
 *
 * 不追求与 croniter 逐字节一致：两侧都能解析但解释不同的极端情况，
 * 由创建接口的最终校验兜底。
 *
 * @param {unknown} value
 * @returns {boolean} 是否为可解析的五段式表达式
 */
export function isValidCron(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) return false
  const fields = text.split(/\s+/)
  if (fields.length !== 5) return false
  return fields.every((field, position) => isValidCronField(field, position))
}

/** 五段式各字段的合法数值区间（周字段的 0 与 7 都是周日）。 */
const FIELD_BOUNDS = [
  { min: 0, max: 59 },
  { min: 0, max: 23 },
  { min: 1, max: 31 },
  { min: 1, max: 12 },
  { min: 0, max: 7 },
]

/** 月字段允许的英文名。 */
const MONTH_NAMES = new Set([
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
])

/** 周字段允许的英文名（周日按 0 计）。 */
const WEEK_NAMES = new Set(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'])

/** 允许英文名的字段位置：月（3）与周（4）。 */
const NAME_FIELDS = { 3: MONTH_NAMES, 4: WEEK_NAMES }

/**
 * 单字段校验：数字、`*`、通配加步进、`a-b`、`a-b/步进` 及其逗号组合。
 *
 * @param {string} field
 * @param {number} position 字段序号（0-4），决定数值边界与英文名白名单
 * @returns {boolean}
 */
function isValidCronField(field, position) {
  const bounds = FIELD_BOUNDS[position]
  const names = NAME_FIELDS[position]
  return field.split(',').every((part) => {
    // 裸通配
    if (part === '*') return true

    // `*/n` 的通配形式
    const wildcard = part.match(/^\*\/(\d+)$/)
    if (wildcard) return Number(wildcard[1]) > 0

    // `a-b` 或 `a-b/n`；纯数字视作 `a-a`
    const range = part.match(/^(\d+)(?:-(\d+))?(?:\/(\d+))?$/)
    if (!range) return Boolean(names && names.has(part.toLowerCase()))
    const [, start, end, step] = range
    if (step !== undefined && Number(step) === 0) return false
    if (Number(start) < bounds.min || Number(start) > bounds.max) return false
    if (end !== undefined) {
      if (Number(end) < bounds.min || Number(end) > bounds.max) return false
      if (Number(start) > Number(end)) return false
    }
    return true
  })
}

/**
 * 创建表单校验：返回字段级错误映射，空对象表示通过。
 *
 * @param {{name?: string, cron?: string}} form
 * @returns {{name?: string, cron?: string}}
 */
export function validateForm(form = {}) {
  const errors = {}
  if (!normalizeName(form.name)) errors.name = '请输入任务名称'
  if (!isValidCron(form.cron)) errors.cron = '请输入合法的五段式 cron 表达式（分 时 日 月 周）'
  return errors
}

/**
 * 拉取全部定时任务（服务端按 id 升序返回全量）。
 *
 * @param {{signal?: AbortSignal}} [options]
 * @returns {Promise<Array<{id:number, name:string, cron:string, enabled:boolean, last_fired_at:string|null}>>}
 */
export function listScheduledTasks(options = {}) {
  return request('/diff-schedules', {
    fetchImpl: options.fetchImpl,
    base: options.base,
    signal: options.signal,
  })
}

/**
 * 创建定时任务。
 *
 * @param {{name: string, cron: string}} payload
 * @param {{signal?: AbortSignal}} [options]
 * @returns {Promise<{id:number, name:string, cron:string, enabled:boolean, last_fired_at:string|null}>}
 */
export function createScheduledTask(payload, options = {}) {
  return request('/diff-schedules', {
    method: 'POST',
    body: { name: normalizeName(payload.name), cron: String(payload.cron || '').trim() },
    fetchImpl: options.fetchImpl,
    base: options.base,
    signal: options.signal,
  })
}

/**
 * 启停定时任务。
 *
 * @param {number|string} id 任务编号
 * @param {boolean} enabled 是否启用
 * @param {{signal?: AbortSignal}} [options]
 * @returns {Promise<any>}
 */
export function setScheduledTaskEnabled(id, enabled, options = {}) {
  return request(`/diff-schedules/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { enabled: Boolean(enabled) },
    fetchImpl: options.fetchImpl,
    base: options.base,
    signal: options.signal,
  })
}

/**
 * 删除定时任务。
 *
 * @param {number|string} id 任务编号
 * @param {{signal?: AbortSignal, notFoundMessage?: string}} [options]
 * @returns {Promise<any>}
 */
export function deleteScheduledTask(id, options = {}) {
  return request(`/diff-schedules/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    notFoundMessage: '任务不存在或已被删除',
    fetchImpl: options.fetchImpl,
    base: options.base,
    signal: options.signal,
  })
}
