/**
 * 结论相关接口。
 *
 * 两个端点都只读：列表按服务端分页与过滤，详情按结论编号取五键结构。
 */

import { request } from './http.js'

/** 后端对 `limit` 的硬上限（`MAX_MATCH_RESULT_LIMIT`）。 */
export const MAX_LIMIT = 200

/** 默认每页条数。 */
export const DEFAULT_LIMIT = 20

/**
 * 页码换算成 `skip`。
 *
 * @param {number} page 从 1 开始
 * @param {number} size 每页条数
 * @returns {number}
 */
export function pageToSkip(page, size) {
  const safePage = Math.max(1, Math.floor(Number(page) || 1))
  const safeSize = Math.min(MAX_LIMIT, Math.max(1, Math.floor(Number(size) || DEFAULT_LIMIT)))
  return (safePage - 1) * safeSize
}

/**
 * 拼装列表查询串；`matched` 为空表示「全部」，不带这个参数。
 *
 * @param {{skip?:number, limit?:number, matched?:number|string|null}} [params]
 * @returns {string}
 */
export function buildListQuery(params = {}) {
  const skip = Math.max(0, Math.floor(Number(params.skip) || 0))
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(Number(params.limit) || DEFAULT_LIMIT)))
  const search = new URLSearchParams({ skip: String(skip), limit: String(limit) })

  const matched = params.matched
  if (matched !== null && matched !== undefined && matched !== '') {
    search.set('matched', String(matched))
  }

  return search.toString()
}

/**
 * 拉取结论列表。
 *
 * @param {{skip?:number, limit?:number, matched?:number|string|null, signal?:AbortSignal}} [params]
 * @returns {Promise<{total:number, items:Array}>}
 */
export function listMatchResults(params = {}) {
  const query = buildListQuery(params)
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
