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

/** 后端对列表 `pageSize` 的硬上限（`MAX_DIFF_SCHEDULE_LIMIT`）。 */
export const MAX_LIMIT = 200

/** 列表默认每页条数，与后端缺省一致。 */
export const DEFAULT_LIMIT = 20

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
 * 表单校验：返回字段级错误映射，空对象表示通过。
 *
 * `job_type` 由后端改为创建/编辑必填，这里同步拦截空值。`biz_scope` /
 * `biz_type` 为可选，`biz_name` / `params` 不在界面暴露、不参与校验。
 *
 * @param {{name?: string, job_type?: string, cron?: string}} form
 * @returns {{name?: string, job_type?: string, cron?: string}}
 */
export function validateForm(form = {}) {
  const errors = {}
  if (!normalizeName(form.name)) errors.name = '请输入任务名称'
  if (!String(form.job_type ?? '').trim()) errors.job_type = '请选择任务类型'
  if (!isValidCron(form.cron)) errors.cron = '请输入合法的五段式 cron 表达式（分 时 日 月 周）'
  return errors
}

/**
 * 由表单值构造提交载荷：只含界面暴露的五个字段，空文本归一为空串（不传 null）。
 *
 * `biz_name` / `params` 不在界面暴露，因此这里也不产出，编辑时它们保持原值。
 *
 * @param {{name?:string, job_type?:string, cron?:string, biz_scope?:string, biz_type?:string}} form
 * @returns {{name:string, job_type:string, cron:string, biz_scope:string, biz_type:string}}
 */
export function buildSchedulePayload(form = {}) {
  return {
    name: normalizeName(form.name),
    job_type: String(form.job_type || '').trim(),
    cron: String(form.cron || '').trim(),
    biz_scope: String(form.biz_scope ?? '').trim(),
    biz_type: String(form.biz_type ?? '').trim(),
  }
}

/**
 * 页码换算成后端从 0 起的 `pageNum`。
 *
 * @param {number} page 从 1 开始
 * @returns {number}
 */
export function pageToPageNum(page) {
  const safePage = Math.max(1, Math.floor(Number(page) || 1))
  return safePage - 1
}

/**
 * 拼装列表查询串；`job_type` 为空表示「全部」，不带这个参数。
 *
 * @param {{pageNum?:number, pageSize?:number, jobType?:string|null}} [params]
 * @returns {string}
 */
export function buildListQuery(params = {}) {
  const pageNum = Math.max(0, Math.floor(Number(params.pageNum) || 0))
  const pageSize = Math.min(
    MAX_LIMIT,
    Math.max(1, Math.floor(Number(params.pageSize) || DEFAULT_LIMIT)),
  )
  const search = new URLSearchParams({ pageNum: String(pageNum), pageSize: String(pageSize) })

  const jobType = typeof params.jobType === 'string' ? params.jobType.trim() : ''
  if (jobType) search.set('job_type', jobType)

  return search.toString()
}

/**
 * 拉取定时任务分页数据。
 *
 * @param {{page?:number, size?:number, jobType?:string, signal?:AbortSignal,
 *          fetchImpl?:Function, base?:string}} [params]
 * @returns {Promise<{total:number, rows:Array}>}
 */
export async function listScheduledTasks(params = {}) {
  const query = buildListQuery({
    pageNum: pageToPageNum(params.page),
    pageSize: params.size,
    jobType: params.jobType,
  })
  const data = await request(`/diff-schedules?${query}`, {
    fetchImpl: params.fetchImpl,
    base: params.base,
    signal: params.signal,
  })
  return {
    total: Number(data?.total) || 0,
    rows: Array.isArray(data?.rows) ? data.rows : [],
  }
}

/**
 * 拉取流程类型字典（`value` 判定、`label` 展示）。
 *
 * @param {{signal?:AbortSignal, fetchImpl?:Function, base?:string}} [options]
 * @returns {Promise<Array<{value:string, label:string}>>}
 */
export async function listJobTypes(options = {}) {
  const data = await request('/job-types', {
    fetchImpl: options.fetchImpl,
    base: options.base,
    signal: options.signal,
  })
  return Array.isArray(data) ? data : []
}

/**
 * 创建定时任务。
 *
 * @param {{name:string, job_type:string, cron:string, biz_scope?:string, biz_type?:string}} payload
 * @param {{signal?:AbortSignal}} [options]
 * @returns {Promise<any>}
 */
export function createScheduledTask(payload, options = {}) {
  return request('/diff-schedules', {
    method: 'POST',
    body: {
      name: normalizeName(payload.name),
      job_type: String(payload.job_type || '').trim(),
      cron: String(payload.cron || '').trim(),
      biz_scope: String(payload.biz_scope ?? '').trim(),
      biz_type: String(payload.biz_type ?? '').trim(),
    },
    fetchImpl: options.fetchImpl,
    base: options.base,
    signal: options.signal,
  })
}

/**
 * 编辑定时任务：只把 `patch` 里明确提供的字段发给后端，未提供的字段保留原值。
 *
 * 平台/账号清空时传空串（后端归一为「无」）；绝不传 `null`（后端视其为非法）。
 *
 * @param {number|string} id 任务编号
 * @param {{name?:string, job_type?:string, cron?:string, biz_scope?:string,
 *          biz_type?:string, enabled?:boolean}} patch
 * @param {{signal?:AbortSignal}} [options]
 * @returns {Promise<any>}
 */
export function updateScheduledTask(id, patch = {}, options = {}) {
  const body = {}
  const provided = (key) => Object.prototype.hasOwnProperty.call(patch, key)

  if (provided('name')) body.name = normalizeName(patch.name)
  if (provided('job_type')) body.job_type = String(patch.job_type || '').trim()
  if (provided('cron')) body.cron = String(patch.cron || '').trim()
  if (provided('biz_scope')) body.biz_scope = String(patch.biz_scope ?? '').trim()
  if (provided('biz_type')) body.biz_type = String(patch.biz_type ?? '').trim()
  if (provided('enabled')) body.enabled = Boolean(patch.enabled)

  return request(`/diff-schedules/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body,
    fetchImpl: options.fetchImpl,
    base: options.base,
    signal: options.signal,
  })
}

/** 后端相关业务码（见 `exceptions.py`）。 */
export const SCHEDULE_ERROR_CODE = {
  INVALID_CRON: 40002,
  JOB_PARAMS: 40004,
  UNKNOWN_JOB_TYPE: 40005,
  DUPLICATE: 40902,
}

/**
 * 把创建/编辑失败归位到表单字段。
 *
 * 优先级：业务码 → HTTP 状态。名称冲突与业务范围冲突同为 40902，后端只在
 * 业务范围冲突的文案里带「业务范围」，据此区分归位到名称还是表单级。
 *
 * @param {{code?:number|string, status?:number, message?:string}} [error]
 * @returns {{field:'name'|'job_type'|'cron'|'form', message:string}}
 */
export function classifyScheduleError(error = {}) {
  const code = Number(error?.code)
  const status = Number(error?.status)
  const message = error?.message || ''

  if (code === SCHEDULE_ERROR_CODE.INVALID_CRON) {
    return { field: 'cron', message: message || '请输入合法的五段式 cron 表达式' }
  }
  if (code === SCHEDULE_ERROR_CODE.UNKNOWN_JOB_TYPE) {
    return { field: 'job_type', message: message || '任务类型不受支持' }
  }
  if (code === SCHEDULE_ERROR_CODE.JOB_PARAMS) {
    return { field: 'form', message }
  }
  if (code === SCHEDULE_ERROR_CODE.DUPLICATE || status === 409) {
    if (message.includes('业务范围')) return { field: 'form', message }
    return { field: 'name', message: message || '任务名称已存在' }
  }
  if (status === 400) {
    return { field: 'cron', message: message || '请检查填写内容' }
  }
  if (status === 422) {
    return { field: 'form', message: message || '服务端校验失败，请检查填写内容' }
  }
  return { field: 'form', message: message || '操作失败，请稍后重试' }
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
