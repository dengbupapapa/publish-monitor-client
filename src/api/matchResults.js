/**
 * 结论相关接口。
 *
 * 两个端点都只读：列表按服务端分页与过滤，详情按结论编号取五键结构。
 */

import { http } from './http.js'

/** 后端对 `pageSize` 的硬上限（`MAX_MATCH_RESULT_LIMIT`）。 */
export const MAX_LIMIT = 200

/** 默认每页条数。 */
export const DEFAULT_LIMIT = 20

/**
 * 后端约定的关注集取值：未匹配的结论，或匹配成功且存在差异记录的结论。
 *
 * `all` 等同不传，因此只有这一个取值会进查询串。
 */
export const WARN_SCOPE = 'warn'

/** 后端对关键词的硬上限（`keyword` 的 `max_length`）。 */
export const KEYWORD_MAX_LENGTH = 128

/** 后端对任务类型的硬上限（`job_type` 的 `max_length`）。 */
export const JOB_TYPE_MAX_LENGTH = 32

/** 后端对账号名称的硬上限（`biz_scope` 的 `max_length`）。 */
export const BIZ_SCOPE_MAX_LENGTH = 128

/**
 * 关键词归一化：去首尾空白并按上限截断，空串表示「没有关键词」。
 *
 * 地址可能绕过输入框的长度限制，因此截断不能只留在控件上，否则超长取值会
 * 让请求被后端拒绝。
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeKeyword(value) {
  if (value === null || value === undefined) return ''
  return String(value).trim().slice(0, KEYWORD_MAX_LENGTH)
}

/**
 * 运行维度取值归一化：去首尾空白并按上限截断，空串表示「全部」。
 *
 * 与关键词同理，地址可能绕过下拉，超长取值必须在请求前截断。
 *
 * @param {unknown} value
 * @param {number} maxLength
 * @returns {string}
 */
export function normalizeDimension(value, maxLength) {
  if (value === null || value === undefined) return ''
  return String(value).trim().slice(0, maxLength)
}

/**
 * 任务类型归一化。
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeJobType(value) {
  return normalizeDimension(value, JOB_TYPE_MAX_LENGTH)
}

/**
 * 账号名称归一化。
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeBizScope(value) {
  return normalizeDimension(value, BIZ_SCOPE_MAX_LENGTH)
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
 * 拼装列表查询参数；序列化交给 axios。
 *
 * `matched` 为空表示「全部」，不带这个参数。
 * `scope` 只在取值为 `warn` 时发送，其余取值一律不带，避免把默认集合写进地址。
 * `keyword` 归一化后为空就不带，长度在这里再截断一次作为最后一道保险。
 * `job_type` / `biz_scope` 同理：归一化后为空表示「全部」，不带参数。
 *
 * 空值必须显式省略：axios 的默认序列化只丢弃 `null` / `undefined`，空串会被发出去。
 *
 * @param {{pageNum?:number, pageSize?:number, matched?:number|string|null, scope?:string|null, keyword?:string|null, jobType?:string|null, bizScope?:string|null}} [params]
 * @returns {{pageNum:number, pageSize:number, matched?:string|number, scope?:string, keyword?:string, job_type?:string, biz_scope?:string}}
 */
export function buildListParams(params = {}) {
  const pageNum = Math.max(0, Math.floor(Number(params.pageNum) || 0))
  const pageSize = Math.min(
    MAX_LIMIT,
    Math.max(1, Math.floor(Number(params.pageSize) || DEFAULT_LIMIT)),
  )
  const query = { pageNum, pageSize }

  const matched = params.matched
  if (matched !== null && matched !== undefined && matched !== '') {
    query.matched = matched
  }

  if (params.scope === WARN_SCOPE) {
    query.scope = WARN_SCOPE
  }

  const keyword = normalizeKeyword(params.keyword)
  if (keyword) {
    query.keyword = keyword
  }

  const jobType = normalizeJobType(params.jobType)
  if (jobType) {
    query.job_type = jobType
  }

  const bizScope = normalizeBizScope(params.bizScope)
  if (bizScope) {
    query.biz_scope = bizScope
  }

  return query
}

/**
 * 拉取结论列表。页码从 1 开始，请求时换算成后端从 0 起的 `pageNum`。
 *
 * @param {{page?:number, size?:number, matched?:number|string|null, scope?:string|null, keyword?:string|null, jobType?:string|null, bizScope?:string|null, signal?:AbortSignal}} [params]
 * @returns {Promise<{total:number, rows:Array}>}
 */
export function listMatchResults(params = {}) {
  const query = buildListParams({
    pageNum: pageToPageNum(params.page),
    pageSize: params.size,
    matched: params.matched,
    scope: params.scope,
    keyword: params.keyword,
    jobType: params.jobType,
    bizScope: params.bizScope,
  })
  return http.get('/match-results', { params: query, signal: params.signal })
}

/**
 * 拉取运行记录里出现过的任务类型选项。
 *
 * 与流程注册表字典不同，这里包含已下线但仍有结论的历史类型；`label` 由服务端
 * 取最新流程名，缺失时回落类型标识。
 *
 * @param {{signal?:AbortSignal}} [options]
 * @returns {Promise<Array<{value:string, label:string}>>}
 */
export async function listRunJobTypes(options = {}) {
  const data = await http.get('/diff-run-options/job-types', { signal: options.signal })
  return Array.isArray(data) ? data : []
}

/**
 * 拉取运行记录里出现过的账号选项，可按任务类型收窄。
 *
 * `jobType` 为空表示不级联；选项的 `value` 是业务编号，筛选值应使用 `label`。
 *
 * @param {string|null} [jobType]
 * @param {{signal?:AbortSignal}} [options]
 * @returns {Promise<Array<{value:string, label:string}>>}
 */
export async function listRunBizScopeOptions(jobType, options = {}) {
  const term = normalizeJobType(jobType)
  const data = await http.get('/diff-run-options/biz-scopes', {
    params: term ? { job_type: term } : undefined,
    signal: options.signal,
  })
  return Array.isArray(data) ? data : []
}

/**
 * 拉取结论详情（五键结构）。
 *
 * @param {number|string} id 结论编号
 * @param {{signal?:AbortSignal}} [options]
 * @returns {Promise<{article:object, records:Array, ranges:Array, alignment:Array, objects:Array}>}
 */
export function getMatchResultPreview(id, options = {}) {
  return http.get(`/match-results/${encodeURIComponent(id)}/preview`, { signal: options.signal })
}
