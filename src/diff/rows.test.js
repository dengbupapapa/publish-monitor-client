import assert from 'node:assert/strict'
import test from 'node:test'

import {
  alignmentEntries,
  blockIndexAt,
  covered,
  pairByOrder,
  planLayout,
  planRows,
} from './rows.js'

/** 造 n 个首尾相接的块，每块 10 个字符。 */
const blocks = (n) =>
  Array.from({ length: n }, (_, i) => ({ start: i * 10, end: i * 10 + 9 }))

/** 第 i 块的源码区间。 */
const rangeOfBlock = (i) => ({ start: i * 10, end: i * 10 + 9 })

test('blockIndexAt 按块尾判定归属，超出末尾归最后一块', () => {
  const list = blocks(3)
  assert.equal(blockIndexAt(list, 0), 0)
  assert.equal(blockIndexAt(list, 9), 1)
  assert.equal(blockIndexAt(list, 100), 2)
  assert.equal(blockIndexAt([], 1), -1)
  assert.equal(blockIndexAt(list, Number.NaN), -1)
})

test('covered 右边界不含下一块', () => {
  const list = blocks(3)
  // 区间终点正好是下一块起点时，不该把下一块算进来
  assert.deepEqual(covered(list, { start: 0, end: 10 }), { from: 0, to: 0 })
  assert.deepEqual(covered(list, { start: 0, end: 25 }), { from: 0, to: 2 })
  assert.equal(covered(list, { start: 5, end: 5 }), null)
  assert.equal(covered(list, null), null)
})

test('planRows 两侧一一对应', () => {
  const entries = [
    { kind: 'same', reference: rangeOfBlock(0), input: rangeOfBlock(0) },
    { kind: 'same', reference: rangeOfBlock(1), input: rangeOfBlock(1) },
  ]
  assert.deepEqual(planRows(blocks(2), blocks(2), entries), [
    { reference: 0, input: 0 },
    { reference: 1, input: 1 },
  ])
})

test('planRows 整段单侧（另一侧没有块）', () => {
  const entries = [{ kind: 'added', input: rangeOfBlock(0) }]
  assert.deepEqual(planRows([], blocks(1), entries), [{ reference: -1, input: 0 }])
})

test('planRows 未被认领的首尾块各自成行', () => {
  const entries = [{ kind: 'same', reference: rangeOfBlock(1), input: rangeOfBlock(0) }]
  assert.deepEqual(planRows(blocks(3), blocks(1), entries), [
    { reference: 0, input: -1 },
    { reference: 1, input: 0 },
    { reference: 2, input: -1 },
  ])
})

test('planRows 一条区间盖住多块时逐块成行', () => {
  const entries = [
    { kind: 'same', reference: rangeOfBlock(0), input: rangeOfBlock(0) },
    { kind: 'removed', reference: { start: 10, end: 29 } },
  ]
  // 内部稿件多出两块、发布稿件没有对应，末尾各自成行；这里先看映射倒退的反例
  assert.equal(planRows(blocks(3), blocks(1), entries), null)
})

test('planRows 映射顺序倒退时返回 null', () => {
  const entries = [
    { kind: 'same', reference: rangeOfBlock(1), input: rangeOfBlock(1) },
    { kind: 'same', reference: rangeOfBlock(0), input: rangeOfBlock(0) },
  ]
  assert.equal(planRows(blocks(2), blocks(2), entries), null)
})

test('planRows 映射没覆盖到的块由尾部补齐', () => {
  // 内部稿件有两块，映射只认领了第一块；第二块仍要出现，不能丢
  const entries = [{ kind: 'same', reference: rangeOfBlock(0), input: rangeOfBlock(0) }]
  assert.deepEqual(planRows(blocks(2), blocks(1), entries), [
    { reference: 0, input: 0 },
    { reference: 1, input: -1 },
  ])
})

test('planRows 插入点优先于区间', () => {
  const entries = [
    { kind: 'added', reference: { position: 0 }, input: rangeOfBlock(0) },
    { kind: 'same', reference: rangeOfBlock(0), input: rangeOfBlock(1) },
  ]
  assert.deepEqual(planRows(blocks(1), blocks(2), entries), [
    { reference: -1, input: 0 },
    { reference: 0, input: 1 },
  ])
})

test('planRows 自检强度：随机合法映射下每侧块恰好出现一次且严格递增', () => {
  for (let trial = 0; trial < 200; trial += 1) {
    const refCount = 1 + Math.floor(Math.random() * 8)
    const inpCount = 1 + Math.floor(Math.random() * 8)
    const entries = []
    for (let k = 0; k < Math.max(refCount, inpCount); k += 1) {
      // 真实映射两侧总有值：没内容的一侧给插入点
      entries.push({
        kind: 'same',
        reference: k < refCount ? rangeOfBlock(k) : { position: k * 10 },
        input: k < inpCount ? rangeOfBlock(k) : { position: k * 10 },
      })
    }

    const rows = planRows(blocks(refCount), blocks(inpCount), entries)
    assert.ok(rows, `refCount=${refCount} inpCount=${inpCount} 不该退化`)
    assert.equal(rows.length, Math.max(refCount, inpCount))

    const usedRef = rows.filter((row) => row.reference >= 0).map((row) => row.reference)
    const usedInp = rows.filter((row) => row.input >= 0).map((row) => row.input)
    assert.deepEqual(usedRef, Array.from({ length: refCount }, (_, i) => i))
    assert.deepEqual(usedInp, Array.from({ length: inpCount }, (_, i) => i))
  }
})

test('pairByOrder 多出的一侧各自成行', () => {
  assert.deepEqual(pairByOrder(2, 1), [
    { reference: 0, input: 0 },
    { reference: 1, input: -1 },
  ])
  assert.deepEqual(pairByOrder(0, 0), [])
})

test('alignmentEntries 六列还原成嵌套形态', () => {
  const entries = alignmentEntries([
    { ord: 1, kind: 'same', ref_start: 10, ref_end: 19, inp_start: 10, inp_end: 19 },
    { ord: 0, kind: 'added', ref_position: 5, inp_start: 0, inp_end: 9 },
  ])
  assert.deepEqual(entries, [
    { kind: 'added', reference: { position: 5 }, input: { start: 0, end: 9 } },
    { kind: 'same', reference: { start: 10, end: 19 }, input: { start: 10, end: 19 } },
  ])
})

test('alignmentEntries 列缺失时返回 null', () => {
  assert.equal(alignmentEntries([{ ord: 0, kind: 'same', ref_start: 1 }]), null)
  assert.deepEqual(alignmentEntries([]), [])
})

test('planLayout 三条降级分支各有原因', () => {
  const noMapping = planLayout({ refBlocks: blocks(2), inpBlocks: blocks(1), alignment: [] })
  assert.equal(noMapping.reason, '结果文件没有对齐映射')
  assert.deepEqual(noMapping.rows, [
    { reference: 0, input: 0 },
    { reference: 1, input: -1 },
  ])

  const brokenBlocks = planLayout({
    refBlocks: [{ start: 0, end: 1 }],
    inpBlocks: [{ start: 0, end: 1 }],
    refOk: false,
    alignment: [{ kind: 'same', reference: { start: 0, end: 1 }, input: { start: 0, end: 1 } }],
  })
  assert.equal(brokenBlocks.reason, '渲染结构与解析结果对不上')
  assert.deepEqual(brokenBlocks.rows, [{ reference: 0, input: 0 }])

  const badAlignment = planLayout({
    refBlocks: blocks(2),
    inpBlocks: blocks(2),
    alignment: null,
  })
  assert.equal(badAlignment.reason, '对齐映射自相矛盾或覆盖不全')
})

test('planLayout 成功时不带降级原因', () => {
  const result = planLayout({
    refBlocks: blocks(1),
    inpBlocks: blocks(1),
    alignment: [{ kind: 'same', reference: { start: 0, end: 9 }, input: { start: 0, end: 9 } }],
  })
  assert.equal(result.reason, '')
  assert.deepEqual(result.rows, [{ reference: 0, input: 0 }])
})
