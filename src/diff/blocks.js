/**
 * 块索引与行原子。
 *
 * 对照区把「一行 = 两侧各若干块」拼在一起，因此需要把 Markdown 的
 * 顶层块与源码偏移对应起来；列表要按项拆开，才能让前后不一致的
 * 列表逐项对齐而不是整块错位。
 */

import { marked } from 'marked'

/**
 * 把正文切成顶层块，返回每块的源码区间。
 *
 * `space` 令牌不产块，但其长度要计入偏移；顶层列表按 `items[].raw`
 * 逐项切分，最后一项吞掉列表尾部的空白（marked 对结尾换行的归属与
 * 单项不同）。任何一步对不上都返回 `null`，由调用方降级。
 *
 * @param {string} body 正文
 * @returns {Array<{start:number,end:number}>|null}
 */
export function lexBlocks(body) {
  const tokens = marked.lexer(body, { gfm: true, breaks: false })
  const spans = []
  let offset = 0

  for (const token of tokens) {
    const raw = token.raw || ''
    if (token.type !== 'space') {
      if (token.type === 'list' && token.items && token.items.length) {
        let cursor = offset
        let sum = 0
        for (const item of token.items) {
          const itemRaw = item.raw || ''
          spans.push({ start: cursor, end: cursor + itemRaw.length })
          cursor += itemRaw.length
          sum += itemRaw.length
        }
        // 项内切分必须严丝合缝：超出或有非空白残留都说明结构不可信
        if (sum > raw.length || /\S/.test(raw.slice(sum))) return null
        // 尾部只剩空白：最后一个列表项的换行归属不同，把空白补进它的区间
        if (sum < raw.length) spans[spans.length - 1].end = offset + raw.length
      } else {
        spans.push({ start: offset, end: offset + raw.length })
      }
    }
    offset += raw.length
  }

  return offset === body.length ? spans : null
}

/**
 * 原子计划：顶层列表拆成「每项一个容器」，其它元素原样保留。
 *
 * 只吃子节点的最小描述（标签名与子节点标签名），不碰 DOM，
 * 因此这一层可以在 node 里单测——它也是最容易被写错的一段。
 *
 * @param {Array<{tagName:string, childTags?:string[]}>} children 顶层子节点描述
 * @returns {{entries: Array<{index:number,split:boolean,childCount:number}>, count:number}}
 */
export function planAtomEntries(children) {
  const entries = []
  let count = 0

  children.forEach((child, index) => {
    const tag = String(child.tagName || '').toUpperCase()
    const childTags = child.childTags || []
    const splittable =
      (tag === 'UL' || tag === 'OL') &&
      childTags.length > 0 &&
      childTags.every((item) => String(item).toUpperCase() === 'LI')

    if (splittable) {
      entries.push({ index, split: true, childCount: childTags.length })
      count += childTags.length
    } else {
      entries.push({ index, split: false, childCount: 1 })
      count += 1
    }
  })

  return { entries, count }
}

/**
 * 有序列表的起始序号；缺省从 1 开始。
 *
 * 拆项时要按 `起始序号 + k` 逐项写回，否则编号会从 1 重排。
 *
 * @param {string|number|null|undefined} value `start` 属性值
 * @returns {number}
 */
export function orderedStartValue(value) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : 1
}
