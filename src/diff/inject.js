/**
 * 差异高亮的注入计划。
 *
 * 流程与后端一致：先把区间过一遍安全判据，通过的再按起点合并，
 * 最后倒序插 <mark>。不安全区间不是被裁剪而是整条跳过——半截高亮
 * 会把 Markdown 结构撑裂，宁可少标一处。
 */

import {
  AT_LINE_START,
  BLANK_LINE,
  IMAGE_SPAN,
  LINK_SPAN,
  STARTS_BLOCK_AT,
} from './constants.js'

/**
 * 判断区间能否安全地包进行内 `<mark>`。
 *
 * @param {string} body 正文
 * @param {number} start 区间起点
 * @param {number} end 区间终点（不含）
 * @returns {string|null} 拒绝原因；`null` 表示可以注入
 */
export function unsafeReason(body, start, end) {
  if (start < 0 || end > body.length || end <= start) return '区间越界或为空'

  const segment = body.slice(start, end)
  if (BLANK_LINE.test(segment)) return '区间内含空行，会跨段落'
  if (AT_LINE_START.test(segment)) return '区间内换行后跟块标记'
  if ((start === 0 || body[start - 1] === '\n') && STARTS_BLOCK_AT.test(body.slice(start))) {
    return '区间起点落在行首块标记上'
  }

  // 图片语法不能从中间撕开：要么整段包住，要么完全不相交。
  IMAGE_SPAN.lastIndex = 0
  let match = IMAGE_SPAN.exec(body)
  while (match) {
    const imgStart = match.index
    const imgEnd = imgStart + match[0].length
    if (imgStart < end && imgEnd > start && !(start <= imgStart && end >= imgEnd)) {
      return '区间边界切断图片语法'
    }
    match = IMAGE_SPAN.exec(body)
  }

  // 链接只比较目标地址所在的那一段，与后端 match.start(2)/end(2) 对齐。
  LINK_SPAN.lastIndex = 0
  match = LINK_SPAN.exec(body)
  while (match) {
    const targetStart = match.index + match[0].lastIndexOf('](') + 2
    const targetEnd = targetStart + match[2].length
    if (targetStart < end && targetEnd > start && !(start <= targetStart && end >= targetEnd)) {
      return '区间边界切断链接地址'
    }
    match = LINK_SPAN.exec(body)
  }

  return null
}

/**
 * 把区间摊成可注入块。
 *
 * 合并判据是 `start <= 上一个 end`（半开区间语义下的重叠或首尾相接），
 * 合并后终点取最大值，记录标识与变化方向取并集。
 *
 * @param {string} body 正文
 * @param {Array<{start:number,end:number,rid:*}>} spans 已按起点升序的区间
 * @returns {{blocks: Array, unsafe: Array}} `blocks` 是注入块，`unsafe` 是被拒区间
 */
export function buildInjectPlan(body, spans) {
  const safe = []
  const unsafe = []

  for (const span of spans) {
    const reason = unsafeReason(body, span.start, span.end)
    if (reason) {
      unsafe.push({ ...span, reason })
      continue
    }
    safe.push(span)
  }

  const blocks = []
  for (const span of safe) {
    const last = blocks[blocks.length - 1]
    if (last && span.start <= last.end) {
      last.end = Math.max(last.end, span.end)
      last.rids = [...new Set([...last.rids, span.rid])].sort()
      last.kinds = [...new Set([...last.kinds, span.kind])].sort()
      continue
    }
    blocks.push({
      start: span.start,
      end: span.end,
      rids: [span.rid],
      kinds: [span.kind],
    })
  }

  return { blocks, unsafe }
}

/**
 * 把 `<mark>` 插回正文。
 *
 * 必须倒序插入：正序插入会让后面每个偏移都错位。
 * `data-rids` 用空格分隔，便于按整词匹配。
 *
 * @param {string} body 正文
 * @param {Array} blocks `buildInjectPlan` 产出的块
 * @returns {string} 带标记的 Markdown 源
 */
export function injectMarks(body, blocks) {
  let out = body
  const ordered = blocks.slice().sort((a, b) => b.start - a.start)
  for (const block of ordered) {
    const attrs = ` class="hl" data-rids="${block.rids.join(' ')}" data-kinds="${(block.kinds || []).join(' ')}"`
    out = out.slice(0, block.start) + '<mark' + attrs + '>' + out.slice(block.start, block.end) + '</mark>' + out.slice(block.end)
  }
  return out
}
