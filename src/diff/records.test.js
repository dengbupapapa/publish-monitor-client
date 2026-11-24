import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildRecordViews,
  changeSummary,
  collectSpans,
  groupRanges,
  sliceSummary,
  summarizeChanges,
} from './records.js'

const record = (id, ord, kind, contentType = 'text') => ({
  record_id: id,
  ord,
  change_kind: kind,
  change_type: 'changed',
  content_type: contentType,
})

const range = (recordId, side, seq, start, end) => ({ record_id: recordId, side, seq, start, end })

test('groupRanges 按记录与侧归拢并按 seq 排序', () => {
  const grouped = groupRanges([
    range('r1', 'input', 1, 10, 12),
    range('r1', 'input', 0, 0, 4),
    range('r1', 'reference', 0, 3, 6),
  ])
  assert.deepEqual(
    grouped.get('r1').input.map((item) => item.start),
    [0, 10],
  )
  assert.equal(grouped.get('r1').reference.length, 1)
})

test('buildRecordViews 空侧标注与文本切分', () => {
  const body = '参考正文开头，这里有关键词。'
  const views = buildRecordViews([record('r1', 0, 'added')], [], { reference: body, input: '' })
  assert.equal(views.length, 1)
  assert.equal(views[0].reference.empty, true)
  assert.equal(views[0].reference.text, '')
  assert.equal(views[0].kind, 'added')
})

test('buildRecordViews 多区间按 seq 拼接摘要', () => {
  const reference = '甲乙丙丁戊'
  const views = buildRecordViews(
    [record('r1', 0, 'replaced')],
    [range('r1', 'reference', 1, 3, 4), range('r1', 'reference', 0, 1, 2)],
    { reference, input: '' },
  )
  assert.equal(views[0].reference.count, 2)
  assert.equal(views[0].reference.text, '乙\n丁')
  assert.equal(views[0].reference.empty, false)
})

test('buildRecordViews 图片按张计数', () => {
  const views = buildRecordViews([record('r1', 0, 'removed', 'image')], [], { reference: '', input: '' })
  assert.equal(views[0].unit, '张')
})

test('buildRecordViews 记录按 ord 升序', () => {
  const views = buildRecordViews([record('b', 2, 'added'), record('a', 1, 'added')], [], {
    reference: '',
    input: '',
  })
  assert.deepEqual(
    views.map((view) => view.id),
    ['a', 'b'],
  )
})

test('sliceSummary 超出上限时截断', () => {
  const body = 'x'.repeat(30)
  const text = sliceSummary(body, [{ start: 0, end: 30 }], 10)
  assert.equal(text, 'x'.repeat(10) + '…')
  assert.equal(sliceSummary(body, [{ start: 0, end: 5 }], 10), 'xxxxx')
})

test('collectSpans 摊平并按起点排序，带上记录标识与方向', () => {
  const views = buildRecordViews(
    [record('r2', 1, 'removed'), record('r1', 0, 'added')],
    [range('r2', 'input', 0, 8, 9), range('r1', 'input', 0, 2, 3)],
    { reference: '', input: '0123456789' },
  )
  const spans = collectSpans(views, 'input')
  assert.deepEqual(spans, [
    { start: 2, end: 3, rid: 'r1', kind: 'added' },
    { start: 8, end: 9, rid: 'r2', kind: 'removed' },
  ])
})

test('summarizeChanges 按方向计数且保留总数', () => {
  const summary = summarizeChanges([
    { change_kind: 'added' },
    { change_kind: 'added' },
    { change_kind: 'removed' },
    { change_kind: 'replaced' },
  ])
  assert.deepEqual(summary, { added: 2, removed: 1, replaced: 1, total: 4 })
})

// 列表条目：默认是「匹配成功、已完成、无差异」这一种组合
const item = (patch = {}) => ({ matched: 1, status: 'completed', reference: { id: 1 }, records: [], ...patch })

test('changeSummary 有记录时按方向计数', () => {
  const result = changeSummary(
    item({ records: [{ change_kind: 'added' }, { change_kind: 'added' }, { change_kind: 'replaced' }] }),
  )
  assert.equal(result.tone, 'counts')
  assert.deepEqual(result.parts, [
    { kind: 'added', count: 2 },
    { kind: 'replaced', count: 1 },
  ])
  assert.equal(result.text, '')
})

test('changeSummary 出现未知方向时退为总数', () => {
  const result = changeSummary(
    item({ records: [{ change_kind: 'added' }, { change_kind: 'moved' }, { change_kind: 'reordered' }] }),
  )
  assert.equal(result.tone, 'counts')
  assert.deepEqual(result.parts, [])
  assert.equal(result.text, '3 处')
})

test('changeSummary 未匹配与内部稿件缺失都判为疑似未审', () => {
  const unmatched = changeSummary(item({ matched: 0, reference: null }))
  assert.equal(unmatched.tone, 'suspectedUnreviewed')
  assert.equal(unmatched.text, '疑似未审')
  assert.notEqual(unmatched.hint, '')
  assert.equal(changeSummary(item({ reference: null })).text, '疑似未审')
})

test('changeSummary 匹配态未知判为未完成比对', () => {
  const result = changeSummary(item({ matched: 2 }))
  assert.equal(result.tone, 'notCompared')
  assert.equal(result.text, '未完成比对')
  assert.notEqual(result.hint, '')
})

test('changeSummary 未完成的核查状态各自成档', () => {
  assert.equal(changeSummary(item({ status: 'pending' })).text, '待核查')
  assert.equal(changeSummary(item({ status: 'processing' })).text, '核查中')
  assert.equal(changeSummary(item({ status: 'failed' })).text, '核查失败')
  assert.equal(changeSummary(item({ status: 'failed' })).tone, 'failed')
})

test('changeSummary 仅匹配成功且已完成且无记录才是一致', () => {
  const result = changeSummary(item())
  assert.equal(result.tone, 'same')
  assert.equal(result.text, '一致')
  assert.deepEqual(result.parts, [])
})
