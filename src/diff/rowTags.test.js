import assert from 'node:assert/strict'
import test from 'node:test'

import { buildRowTags } from './rowTags.js'

const kindOf = (rid) => ({ r1: 'added', r2: 'removed', r3: 'replaced' }[rid] || 'replaced')
const records = [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }]

test('发布稿侧命中的记录归到本侧行', () => {
  const tags = buildRowTags(
    [
      { reference: ['r1'], input: ['r1'] },
      { reference: [], input: [] },
    ],
    kindOf,
    records,
  )
  assert.deepEqual(tags[0], [{ rid: 'r1', kind: 'added' }])
  assert.deepEqual(tags[1], [])
})

test('发布稿侧无命中的记录按半线端点归到参考侧行', () => {
  const tags = buildRowTags(
    [
      { reference: [], input: [] },
      { reference: ['r2'], input: [] },
    ],
    kindOf,
    records,
  )
  assert.deepEqual(tags[0], [])
  assert.deepEqual(tags[1], [{ rid: 'r2', kind: 'removed' }])
})

test('同行多条记录按记录顺序横向排列', () => {
  const tags = buildRowTags(
    [{ reference: ['r2'], input: ['r1', 'r3'] }],
    kindOf,
    records,
  )
  assert.deepEqual(
    tags[0].map((tag) => tag.rid),
    ['r1', 'r2', 'r3'],
  )
})

test('一行内同一记录的多处命中只产生一个标签', () => {
  const tags = buildRowTags(
    [{ reference: [], input: ['r1', 'r1'] }],
    kindOf,
    records,
  )
  assert.deepEqual(tags[0], [{ rid: 'r1', kind: 'added' }])
})
