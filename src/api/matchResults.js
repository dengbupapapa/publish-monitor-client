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
 * @param {{pageNum?:number, pageSize?:number, matched?:number|string|null}} [params]
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

  return search.toString()
}

/**
 * 拉取结论列表。页码从 1 开始，请求时换算成后端从 0 起的 `pageNum`。
 *
 * @param {{page?:number, size?:number, matched?:number|string|null, signal?:AbortSignal}} [params]
 * @returns {Promise<{total:number, rows:Array}>}
 */
export function listMatchResults(params = {}) {
  const query = buildListQuery({
    pageNum: pageToPageNum(params.page),
    pageSize: params.size,
    matched: params.matched,
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
