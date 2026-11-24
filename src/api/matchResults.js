/**
 * 结论相关接口。
 *
 * 两个端点都只读：列表按服务端分页与过滤，详情按结论编号取五键结构。
 */

import { request } from './http.js'

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
 * 拼装列表查询串；`matched` 为空表示「全部」，不带这个参数。
 *
 * `scope` 只在取值为 `warn` 时发送，其余取值一律不带，避免把默认集合写进地址。
 * `keyword` 归一化后为空就不带，长度在这里再截断一次作为最后一道保险。
 *
 * @param {{pageNum?:number, pageSize?:number, matched?:number|string|null, scope?:string|null, keyword?:string|null}} [params]
 * @returns {string}
 */
export function buildListQuery(params = {}) {
  const pageNum = Math.max(0, Math.floor(Number(params.pageNum) || 0))
  const pageSize = Math.min(
    MAX_LIMIT,
    Math.max(1, Math.floor(Number(params.pageSize) || DEFAULT_LIMIT)),
  )
  const search = new URLSearchParams({ pageNum: String(pageNum), pageSize: String(pageSize) })

  const matched = params.matched
  if (matched !== null && matched !== undefined && matched !== '') {
    search.set('matched', String(matched))
  }

  if (params.scope === WARN_SCOPE) {
    search.set('scope', WARN_SCOPE)
  }

  const keyword = normalizeKeyword(params.keyword)
  if (keyword) {
    search.set('keyword', keyword)
  }

  return search.toString()
}

/**
 * 拉取结论列表。页码从 1 开始，请求时换算成后端从 0 起的 `pageNum`。
 *
 * @param {{page?:number, size?:number, matched?:number|string|null, scope?:string|null, keyword?:string|null, signal?:AbortSignal}} [params]
 * @returns {Promise<{total:number, rows:Array}>}
 */
export function listMatchResults(params = {}) {
  const query = buildListQuery({
    pageNum: pageToPageNum(params.page),
    pageSize: params.size,
    matched: params.matched,
    scope: params.scope,
    keyword: params.keyword,
  })
  return request(`/match-results?${query}`, { signal: params.signal })
}

/**
 * 拉取结论详情（五键结构）。
 *
 * @param {number|string} id 结论编号
 * @param {{signal?:AbortSignal}} [options]
 * @returns {Promise<{article:object, records:Array, ranges:Array, alignment:Array, objects:Array}>}
 */
export function getMatchResultPreview(id, options = {}) {
  return request(`/match-results/${encodeURIComponent(id)}/preview`, { signal: options.signal })
}
