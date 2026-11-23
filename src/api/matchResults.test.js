import assert from 'node:assert/strict'
import test from 'node:test'

import { buildListQuery, MAX_LIMIT, pageToSkip } from './matchResults.js'

test('buildListQuery 缺省不带 matched', () => {
  const query = new URLSearchParams(buildListQuery())
  assert.equal(query.has('matched'), false)
  assert.equal(query.get('skip'), '0')
  assert.equal(query.get('limit'), '20')
})

test('buildListQuery 空字符串与 null 都视为全部', () => {
  assert.equal(new URLSearchParams(buildListQuery({ matched: '' })).has('matched'), false)
  assert.equal(new URLSearchParams(buildListQuery({ matched: null })).has('matched'), false)
})

test('buildListQuery 带上过滤值', () => {
  for (const matched of [0, 1, 2, '1']) {
    assert.equal(new URLSearchParams(buildListQuery({ matched })).get('matched'), String(matched))
  }
})

test('buildListQuery 每页条数受上限约束', () => {
  assert.equal(new URLSearchParams(buildListQuery({ limit: 5000 })).get('limit'), String(MAX_LIMIT))
  assert.equal(new URLSearchParams(buildListQuery({ limit: 0 })).get('limit'), '20')
  assert.equal(new URLSearchParams(buildListQuery({ limit: -3 })).get('limit'), '1')
})

test('pageToSkip 由页码换算 skip', () => {
  assert.equal(pageToSkip(1, 20), 0)
  assert.equal(pageToSkip(3, 20), 40)
  assert.equal(pageToSkip(0, 20), 0)
  assert.equal(pageToSkip('x', 'y'), 0)
  assert.equal(pageToSkip(2, 5000), 200)
})
