/**
 * 记录视图的桥接层。
 *
 * 详情接口给的是「记录行 + 区间行」两张扁平表，而对照区要的是
 * 「一条记录两侧各有几段、摘要是什么」。这一层只做重组与切分，
 * 不改判定结果。
 */

import {
  DEFAULT_UNIT,
  SIDES,
  SUMMARY_MAX_CHARS,
  TEXT_JOINER,
  UNIT_BY_CONTENT_TYPE,
} from './constants.js'

/**
 * 把区间行按 `record_id + side` 归拢，两侧都按 `seq` 还原顺序。
 *
 * @param {Array<{record_id:string,side:string,seq:number,start:number,end:number}>} ranges
 * @returns {Map<string, {reference: Array, input: Array}>}
 */
export function groupRanges(ranges) {
  const grouped = new Map()
  for (const row of ranges || []) {
    const key = String(row.record_id ?? '')
    if (!grouped.has(key)) grouped.set(key, { reference: [], input: [] })
    const entry = grouped.get(key)
    const side = String(row.side || '')
    if (!entry[side]) continue
    entry[side].push({ seq: Number(row.seq) || 0, start: Number(row.start) || 0, end: Number(row.end) || 0 })
  }
  for (const entry of grouped.values()) {
    for (const side of SIDES) entry[side].sort((a, b) => a.seq - b.seq)
  }
  return grouped
}

/**
 * 按区间从正文切出摘要；空侧得到空串。
 *
 * 连接符与后端 `side_text` 一致，超出上限时截断——卡片本来就是
 * 单行省略，截断只是避免把整段正文塞进节点。
 *
 * @param {string} body 该侧正文
 * @param {Array<{start:number,end:number}>} ranges 已按 `seq` 排序
 * @param {number} [maxChars]
 * @returns {string}
 */
export function sliceSummary(body, ranges, maxChars = SUMMARY_MAX_CHARS) {
  const text = ranges.map((range) => body.slice(range.start, range.end)).join(TEXT_JOINER)
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars) + '…'
}

/**
 * 生成对照区消费的记录视图。
 *
 * @param {Array} records 接口返回的记录行（扁平）
 * @param {Array} ranges 接口返回的区间行（扁平）
 * @param {{reference:string, input:string}} bodies 两侧正文
 * @returns {Array} 按 `ord` 升序的记录视图
 */
export function buildRecordViews(records, ranges, bodies) {
  const grouped = groupRanges(ranges)

  return (records || [])
    .slice()
    .sort((a, b) => (Number(a.ord) || 0) - (Number(b.ord) || 0))
    .map((row) => {
      const id = String(row.record_id ?? '')
      const perSide = grouped.get(id) || { reference: [], input: [] }
      const view = {
        id,
        ord: Number(row.ord) || 0,
        kind: String(row.change_kind || ''),
        changeType: String(row.change_type || ''),
        contentType: String(row.content_type || ''),
        unit: UNIT_BY_CONTENT_TYPE[row.content_type] || DEFAULT_UNIT,
      }

      for (const side of SIDES) {
        const items = perSide[side] || []
        const scope = items.map((item) => ({ start: item.start, end: item.end }))
        view[side] = {
          ranges: scope,
          count: scope.length,
          text: sliceSummary(bodies?.[side] || '', scope),
          empty: scope.length === 0,
        }
      }

      return view
    })
}

/**
 * 把某侧全部区间摊平成注入用的间隔，按起点升序。
 *
 * @param {Array} views `buildRecordViews` 的结果
 * @param {string} side 侧标识
 * @returns {Array<{start:number,end:number,rid:string,kind:string}>}
 */
export function collectSpans(views, side) {
  const spans = []
  for (const view of views) {
    for (const range of view[side]?.ranges || []) {
      spans.push({ start: range.start, end: range.end, rid: view.id, kind: view.kind })
    }
  }
  return spans.sort((a, b) => a.start - b.start || a.end - b.end)
}

/**
 * 列表页的差异汇总：按变化方向计数，不看区间。
 *
 * @param {Array<{change_kind:string}>} records 记录行
 * @returns {{added:number, removed:number, replaced:number, total:number}}
 */
export function summarizeChanges(records) {
  const counts = { added: 0, removed: 0, replaced: 0 }
  for (const row of records || []) {
    const kind = String(row.change_kind || '')
    if (kind in counts) counts[kind] += 1
  }
  return { ...counts, total: (records || []).length }
}

/** 列表「结果」列的展示分支与固定文案。 */
const RESULT_TEXT = {
  suspectedUnreviewed: { text: '疑似未审', hint: '发布侧未匹配到内部稿件，疑似没有经过内部审核' },
  notCompared: { text: '未完成比对', hint: '匹配态未知，两侧尚未完成比对' },
  pending: { text: '待核查', hint: '' },
  processing: { text: '核查中', hint: '' },
  failed: { text: '核查失败', hint: '核查未完成，没有产生差异记录' },
  same: { text: '一致', hint: '' },
}

function resultOf(tone) {
  const entry = RESULT_TEXT[tone]
  return { tone, parts: [], text: entry.text, hint: entry.hint }
}

/**
 * 列表页「结果」列的判定。
 *
 * 差异记录为空不等于两侧一致：未匹配、未完成比对、核查失败都会给出空数组，
 * 因此先看记录，再看匹配态，最后看核查状态，先命中者生效。
 *
 * @param {{matched?:number, status?:string, reference?:object|null, records?:Array}} record 列表条目
 * @returns {{tone:'counts'|'same'|'suspectedUnreviewed'|'notCompared'|'pending'|'processing'|'failed',
 *            parts:Array<{kind:string,count:number}>, text:string, hint:string}}
 */
export function changeSummary(record = {}) {
  const counts = summarizeChanges(record.records)
  if (counts.total > 0) {
    const parts = ['added', 'removed', 'replaced']
      .filter((kind) => counts[kind] > 0)
      .map((kind) => ({ kind, count: counts[kind] }))
    const known = parts.reduce((sum, part) => sum + part.count, 0)
    // 出现未知方向时只报总数，否则三类计数之和会小于记录条数
    return known === counts.total
      ? { tone: 'counts', parts, text: '', hint: '' }
      : { tone: 'counts', parts: [], text: `${counts.total} 处`, hint: '' }
  }

  const matched = Number(record.matched)
  if (matched === 0 || !record.reference) return resultOf('suspectedUnreviewed')
  if (matched === 2) return resultOf('notCompared')
  if (matched !== 1) return resultOf('suspectedUnreviewed')

  const status = String(record.status || '').toLowerCase()
  if (status === 'pending') return resultOf('pending')
  if (status === 'processing') return resultOf('processing')
  if (status === 'failed') return resultOf('failed')
  return resultOf('same')
}
