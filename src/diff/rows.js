/**
 * 行规划：把两侧的渲染块装进同一行。
 *
 * 对齐映射（alignment）给的是「参考侧某段 ↔ 发布侧某段」，这里把段
 * 换算成块号，再逐条推进游标。任何一条映射自相矛盾、或自检发现某
 * 块出现两次/顺序倒退，就返回 `null`，由调用方退回「按块序配对」并
 * 显示降级提示——宁可对齐得粗略，也不要错位。
 */

import { SIDE_INPUT, SIDE_REFERENCE } from './constants.js'

/** 六列映射行的列前缀。 */
const ALIGN_COLUMNS = [
  [SIDE_REFERENCE, 'ref'],
  [SIDE_INPUT, 'inp'],
]

/**
 * 偏移落在第几个块里；超出末尾时归最后一块。
 *
 * @param {Array<{start:number,end:number}>} blocks
 * @param {number} offset
 * @returns {number} 块号；无块时 -1
 */
export function blockIndexAt(blocks, offset) {
  if (!blocks || !blocks.length || typeof offset !== 'number' || !Number.isFinite(offset)) return -1
  for (let i = 0; i < blocks.length; i += 1) {
    if (offset < blocks[i].end) return i
  }
  return blocks.length - 1
}

/**
 * 区间覆盖到的块号范围；插入点或空区间代表这一侧没有内容。
 *
 * 右边界按「块起点 < range.end」统计：映射里的 end 是下一块的起点，
 * 块尾的空行落在区间里，用 `end - 1` 去探块会把下一块也算进来。
 *
 * @param {Array<{start:number,end:number}>} blocks
 * @param {{start:number,end:number}|null} range
 * @returns {{from:number,to:number}|null}
 */
export function covered(blocks, range) {
  if (!range || range.end <= range.start) return null
  const from = blockIndexAt(blocks, range.start)
  if (from < 0) return null
  let to = from
  for (let i = from; i < blocks.length && blocks[i].start < range.end; i += 1) to = i
  return { from, to }
}

/**
 * 把六列映射行还原成 `{kind, reference, input}` 的嵌套形态。
 *
 * 区间三列与插入点位置列互斥使用；两者都缺就是坏数据，返回 `null`
 * 让上游走降级，不抛异常打断整页。
 *
 * @param {Array} rows 接口返回的对齐行
 * @returns {Array|null}
 */
export function alignmentEntries(rows) {
  const entries = []
  const ordered = (rows || []).slice().sort((a, b) => (Number(a.ord) || 0) - (Number(b.ord) || 0))

  for (const row of ordered) {
    const entry = { kind: String(row.kind || '') }
    for (const [side, prefix] of ALIGN_COLUMNS) {
      const position = row[`${prefix}_position`]
      if (position !== null && position !== undefined) {
        entry[side] = { position: Number(position) }
        continue
      }
      const start = row[`${prefix}_start`]
      const end = row[`${prefix}_end`]
      if (start === null || start === undefined || end === null || end === undefined) return null
      entry[side] = { start: Number(start), end: Number(end) }
    }
    entries.push(entry)
  }

  return entries
}

/**
 * 按对齐映射生成行。
 *
 * 1. 条目按顺序推进，只认游标之后、起点落在自己区间里的块：块起点比条目更靠前，
 *    说明这块已经被前面的条目用掉（列表、表格、软换行段落会这样），合并成一行
 *    就是不拆块——同一块里的多处差异共行；
 * 2. 条目区间末尾也可能盖住多块（整段新增/删除），逐块成行；
 * 3. 条目两侧都有内容时按 k 1:1，多出的一侧单独成行；
 * 4. 没有条目认领的块（首尾、条目间隙）各自成行，一个都不丢。
 *
 * 自检：每侧每个块恰好属于一行、顺序不变；不满足返回 `null`。
 *
 * @param {Array} refBlocks
 * @param {Array} inpBlocks
 * @param {Array} entries `alignmentEntries` 的结果
 * @returns {Array<{reference:number,input:number}>|null}
 */
export function planRows(refBlocks, inpBlocks, entries) {
  if (!entries || !entries.length) return null
  const refs = refBlocks || []
  const inps = inpBlocks || []
  if (!refs.length && !inps.length) return null

  const rangeOf = (value) =>
    value && typeof value.start === 'number' && typeof value.end === 'number' ? value : null
  const pointOf = (value) => (value && typeof value.position === 'number' ? value.position : null)
  /** 条目在某侧的起点：区间取 start，插入点取 position，都没有给 -Infinity */
  const startOf = (value) => {
    const range = rangeOf(value)
    if (range) return range.start
    const point = pointOf(value)
    return point === null ? -Infinity : point
  }

  const rows = []
  let r = 0
  let p = 0
  let lastRef = -Infinity
  let lastInp = -Infinity

  for (const entry of entries) {
    const refStart = startOf(entry.reference)
    const inpStart = startOf(entry.input)
    // 映射自相矛盾：条目往回走，产出任何布局都会错位，直接退化
    if (refStart < lastRef || inpStart < lastInp) return null
    lastRef = refStart
    lastInp = inpStart

    const refSlice = covered(refs, rangeOf(entry.reference))
    const inpSlice = covered(inps, rangeOf(entry.input))
    const refFrom = refSlice ? Math.max(refSlice.from, r) : -1
    const inpFrom = inpSlice ? Math.max(inpSlice.from, p) : -1

    // 条目之前的块还没归属：各自成行
    while (refSlice && r < refFrom) {
      rows.push({ reference: r, input: -1 })
      r += 1
    }
    while (inpSlice && p < inpFrom) {
      rows.push({ reference: -1, input: p })
      p += 1
    }

    const refTo = refSlice ? refSlice.to : -1
    const inpTo = inpSlice ? inpSlice.to : -1
    let k = 0
    while ((refFrom >= 0 && refFrom + k <= refTo) || (inpFrom >= 0 && inpFrom + k <= inpTo)) {
      rows.push({
        reference: refFrom >= 0 && refFrom + k <= refTo ? refFrom + k : -1,
        input: inpFrom >= 0 && inpFrom + k <= inpTo ? inpFrom + k : -1,
      })
      k += 1
    }
    if (refTo >= 0) r = Math.max(r, refTo + 1)
    if (inpTo >= 0) p = Math.max(p, inpTo + 1)
  }

  // 末尾还有没被认领的块：各自成行
  while (r < refs.length) {
    rows.push({ reference: r, input: -1 })
    r += 1
  }
  while (p < inps.length) {
    rows.push({ reference: -1, input: p })
    p += 1
  }

  // 自检：每侧块恰好一次、序号严格递增；不满足就不拿错位布局凑合
  let lastR = -1
  let lastP = -1
  let usedR = 0
  let usedP = 0
  for (const row of rows) {
    if (row.reference >= 0) {
      if (row.reference <= lastR) return null
      lastR = row.reference
      usedR += 1
    }
    if (row.input >= 0) {
      if (row.input <= lastP) return null
      lastP = row.input
      usedP += 1
    }
  }
  if (usedR !== refs.length || usedP !== inps.length) return null
  return rows
}

/**
 * 降级：两侧按块序 1:1 配对，多出的块各自成行。
 *
 * @param {number} refCount
 * @param {number} inpCount
 * @returns {Array<{reference:number,input:number}>}
 */
export function pairByOrder(refCount, inpCount) {
  const rows = []
  const total = Math.max(refCount, inpCount)
  for (let i = 0; i < total; i += 1) {
    rows.push({ reference: i < refCount ? i : -1, input: i < inpCount ? i : -1 })
  }
  return rows
}

/**
 * 行规划入口：能逐行对齐就逐行，否则退回块序配对并给出原因。
 *
 * @param {object} input
 * @param {Array} input.refBlocks
 * @param {Array} input.inpBlocks
 * @param {boolean} input.refOk 参考侧块索引是否建立成功
 * @param {boolean} input.inpOk 发布侧块索引是否建立成功
 * @param {Array|null} input.alignment `alignmentEntries` 的结果
 * @returns {{rows: Array, reason: string}} `reason` 为空表示没有降级
 */
export function planLayout({ refBlocks = [], inpBlocks = [], refOk = true, inpOk = true, alignment }) {
  if (alignment === null) {
    return { rows: pairByOrder(refBlocks.length, inpBlocks.length), reason: '对齐映射自相矛盾或覆盖不全' }
  }
  if (!alignment || !alignment.length) {
    return { rows: pairByOrder(refBlocks.length, inpBlocks.length), reason: '结果文件没有对齐映射' }
  }
  if (!refOk || !inpOk) {
    return { rows: pairByOrder(1, 1), reason: '渲染结构与解析结果对不上' }
  }
  const rows = planRows(refBlocks, inpBlocks, alignment)
  if (rows) return { rows, reason: '' }
  return { rows: pairByOrder(refBlocks.length, inpBlocks.length), reason: '对齐映射自相矛盾或覆盖不全' }
}
