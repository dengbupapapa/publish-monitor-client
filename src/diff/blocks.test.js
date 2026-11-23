import assert from 'node:assert/strict'
import test from 'node:test'

import { lexBlocks, orderedStartValue, planAtomEntries } from './blocks.js'

test('lexBlocks 单个段落覆盖整篇', () => {
  const body = '一段文字'
  assert.deepEqual(lexBlocks(body), [{ start: 0, end: body.length }])
})

test('lexBlocks 多段落跳过空行但仍按原文偏移', () => {
  const body = 'a\n\nb'
  assert.deepEqual(lexBlocks(body), [
    { start: 0, end: 1 },
    { start: 3, end: 4 },
  ])
})

test('lexBlocks 顶层无序列表逐项切分', () => {
  const body = '- a\n- b\n- c'
  const spans = lexBlocks(body)
  assert.equal(spans.length, 3)
  assert.deepEqual(
    spans.map((span) => body.slice(span.start, span.end)),
    ['- a\n', '- b\n', '- c'],
  )
  assert.equal(spans[spans.length - 1].end, body.length)
})

test('lexBlocks 有序列表保留起始序号且区间连续', () => {
  const body = '3. a\n4. b'
  const spans = lexBlocks(body)
  assert.equal(spans.length, 2)
  assert.equal(body.slice(spans[0].start, spans[0].end).startsWith('3.'), true)
  assert.equal(body.slice(spans[1].start, spans[1].end).startsWith('4.'), true)
  assert.equal(spans[0].end, spans[1].start)
  assert.equal(spans[1].end, body.length)
})

test('lexBlocks 标题与段落各自成块', () => {
  const body = '# 标题\n\n段落'
  const spans = lexBlocks(body)
  assert.equal(spans.length, 2)
  assert.deepEqual(body.slice(spans[0].start, spans[0].end), '# 标题')
})

test('lexBlocks 偏移对不上时返回 null', () => {
  // marked 会把 CRLF 归一成 LF，raw 长度与原文不再一致
  assert.equal(lexBlocks('a\r\nb'), null)
})

test('planAtomEntries 列表拆成 N 项', () => {
  const plan = planAtomEntries([{ tagName: 'UL', childTags: ['LI', 'LI', 'LI'] }])
  assert.deepEqual(plan.entries, [{ index: 0, split: true, childCount: 3 }])
  assert.equal(plan.count, 3)
})

test('planAtomEntries 非列表算 1 个', () => {
  const plan = planAtomEntries([
    { tagName: 'H2' },
    { tagName: 'P' },
    { tagName: 'TABLE', childTags: ['THEAD', 'TBODY'] },
  ])
  assert.equal(plan.count, 3)
  assert.deepEqual(
    plan.entries.map((entry) => entry.split),
    [false, false, false],
  )
})

test('planAtomEntries 空列表与含非选项的列表都不拆', () => {
  assert.equal(planAtomEntries([{ tagName: 'UL', childTags: [] }]).count, 1)

  const mixed = planAtomEntries([{ tagName: 'OL', childTags: ['LI', 'P'] }])
  assert.equal(mixed.count, 1)
  assert.equal(mixed.entries[0].split, false)
})

test('orderedStartValue 缺省为 1', () => {
  assert.equal(orderedStartValue('3'), 3)
  assert.equal(orderedStartValue(null), 1)
  assert.equal(orderedStartValue(undefined), 1)
  assert.equal(orderedStartValue('x'), 1)
})
