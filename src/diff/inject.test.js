import assert from 'node:assert/strict'
import test from 'node:test'

import { buildInjectPlan, injectMarks, unsafeReason } from './inject.js'
import { buildRecordViews, collectSpans } from './records.js'

const mark = (rid, kind, start, end) => ({ rid, kind, start, end })

test('unsafeReason 拒绝越界或空区间', () => {
  assert.equal(unsafeReason('abc', 0, 5), '区间越界或为空')
  assert.equal(unsafeReason('abc', -1, 2), '区间越界或为空')
  assert.equal(unsafeReason('abc', 2, 2), '区间越界或为空')
  assert.equal(unsafeReason('abc', 0, 3), null)
})

test('unsafeReason 拒绝跨空行的区间', () => {
  const body = '一\n\n二'
  assert.equal(unsafeReason(body, 1, 3), '区间内含空行，会跨段落')
  // 单个换行不算空行
  assert.equal(unsafeReason('一\n二', 1, 2), null)
})

test('unsafeReason 拒绝换行后跟块标记的区间', () => {
  const body = '文本\n- 项'
  assert.equal(unsafeReason(body, 0, 5), '区间内换行后跟块标记')
  assert.equal(unsafeReason('文本\n项', 0, 4), null)
})

test('unsafeReason 拒绝起点落在行首块标记上', () => {
  assert.equal(unsafeReason('- 项', 0, 2), '区间起点落在行首块标记上')
  // 起点不在行首时，同一段文字可以注入
  assert.equal(unsafeReason('a- 项', 1, 3), null)
})

test('unsafeReason 拒绝切断图片语法', () => {
  const body = '前![图](a.png)后'
  assert.equal(unsafeReason(body, 0, 5), '区间边界切断图片语法')
  // 整段包住图片是允许的
  assert.equal(unsafeReason(body, 1, 12), null)
})

test('unsafeReason 拒绝切断链接地址', () => {
  const body = '看[文字](https://e.com/a)吧'
  assert.equal(unsafeReason(body, 0, 8), '区间边界切断链接地址')
  // 整条链接都被包住是允许的
  assert.equal(unsafeReason(body, 1, body.indexOf(')') + 1), null)
})

test('buildInjectPlan 合并不安全区间并累积记录标识', () => {
  const body = 'x'.repeat(10)
  const spans = [
    mark('a', 'added', 0, 4),
    mark('b', 'removed', 2, 6),
    mark('c', 'replaced', 8, 10),
  ]
  const { blocks, unsafe } = buildInjectPlan(body, spans)
  assert.equal(unsafe.length, 0)
  assert.equal(blocks.length, 2)
  assert.deepEqual(blocks[0], {
    start: 0,
    end: 6,
    rids: ['a', 'b'],
    kinds: ['added', 'removed'],
  })
})

test('buildInjectPlan 首尾相接合并、留缝不合并', () => {
  const body = 'x'.repeat(10)
  const touching = buildInjectPlan(body, [mark('a', 'added', 0, 2), mark('b', 'added', 2, 4)])
  assert.equal(touching.blocks.length, 1)

  const gapped = buildInjectPlan(body, [mark('a', 'added', 0, 2), mark('b', 'added', 3, 4)])
  assert.equal(gapped.blocks.length, 2)
})

test('buildInjectPlan 整条跳过不安全区间', () => {
  const body = '正文\n\n尾段'
  const { blocks, unsafe } = buildInjectPlan(body, [mark('a', 'added', 0, 4)])
  assert.equal(blocks.length, 0)
  assert.equal(unsafe.length, 1)
  assert.equal(unsafe[0].reason, '区间内含空行，会跨段落')
})

test('injectMarks 倒序插入且剥掉标记后还原正文', () => {
  const body = '一二三四五六七八'
  const blocks = [
    { start: 0, end: 2, rids: ['a'], kinds: ['added'] },
    { start: 6, end: 8, rids: ['b', 'c'], kinds: ['removed', 'replaced'] },
  ]
  const marked = injectMarks(body, blocks)

  assert.ok(marked.startsWith('<mark class="hl" data-rids="a" data-kinds="added">一二</mark>'))
  assert.ok(marked.includes('<mark class="hl" data-rids="b c" data-kinds="removed replaced">七八</mark>'))
  assert.equal(marked.replace(/<\/?mark[^>]*>/g, ''), body)
})

test('注入后每个块的切片仍不含空行与被切开的语法', () => {
  const body = '一段文字\n\n- 列表项一\n- 列表项二'
  const spans = [mark('a', 'added', 0, 4), mark('b', 'removed', 5, 8), mark('c', 'added', 9, 14)]
  const { blocks } = buildInjectPlan(body, spans)
  for (const block of blocks) {
    assert.equal(unsafeReason(body, block.start, block.end), null)
    assert.doesNotMatch(body.slice(block.start, block.end), /\n[ \t]*\n/)
  }
})

test('接口返回的区间只会产出安全标记', () => {
  const reference = [
    '# 標题',
    '',
    '第一段包含[链接](https://example.com/a)与图片 ![图](https://example.com/i.png)。',
    '',
    '- 列表项一',
    '- 列表项二',
    '',
    '| 列 | 值 |',
    '| --- | --- |',
    '| a | 1 |',
  ].join('\n')
  const at = (needle, width) => {
    const start = reference.indexOf(needle)
    return { start, end: start + width }
  }

  const records = [
    { record_id: 'r1', ord: 0, change_kind: 'added', change_type: 'changed', content_type: 'link' },
    { record_id: 'r2', ord: 1, change_kind: 'replaced', change_type: 'changed', content_type: 'text' },
    { record_id: 'r3', ord: 2, change_kind: 'added', change_type: 'changed', content_type: 'text' },
  ]
  const ranges = [
    { record_id: 'r1', side: 'reference', seq: 0, ...at('第一段', 3) },
    { record_id: 'r2', side: 'reference', seq: 0, ...at('列表项一', 4) },
    // 区间起点正好落在行首的列表标记上：必须被整条跳过
    { record_id: 'r3', side: 'reference', seq: 0, start: reference.indexOf('- 列表项二'), end: reference.indexOf('列表项二') },
  ]

  const views = buildRecordViews(records, ranges, { reference, input: '' })
  const spans = collectSpans(views, 'reference')
  const { blocks, unsafe } = buildInjectPlan(reference, spans)

  assert.equal(blocks.length, 2)
  assert.equal(unsafe.length, 1)
  assert.equal(unsafe[0].rid, 'r3')
  for (const block of blocks) {
    const slice = reference.slice(block.start, block.end)
    assert.equal(unsafeReason(reference, block.start, block.end), null)
    assert.doesNotMatch(slice, /\n[ \t]*\n/)
    assert.doesNotMatch(slice, /!\[[^\]]*\]\([^)]*$/, '图片语法被切开')
    assert.doesNotMatch(slice, /\]\([^)]*$/, '链接地址被切开')
  }
  assert.equal(injectMarks(reference, blocks).replace(/<\/?mark[^>]*>/g, ''), reference)
})
