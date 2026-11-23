import assert from 'node:assert/strict'
import test from 'node:test'

import { buildListQuery, DEFAULT_LIMIT, MAX_LIMIT, pageToPageNum } from './matchResults.js'

test('buildListQuery 缺省不带 matched，页码从 0 起', () => {
  const query = new URLSearchParams(buildListQuery())
  assert.equal(query.has('matched'), false)
  assert.equal(query.get('pageNum'), '0')
  assert.equal(query.get('pageSize'), String(DEFAULT_LIMIT))
})

test('buildListQuery 只发新契约的键名', () => {
  const query = new URLSearchParams(buildListQuery({ pageNum: 2, pageSize: 10 }))
  assert.equal(query.get('pageNum'), '2')
  assert.equal(query.get('pageSize'), '10')
  assert.equal(query.has('skip'), false)
  assert.equal(query.has('limit'), false)
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
  assert.equal(new URLSearchParams(buildListQuery({ pageSize: 5000 })).get('pageSize'), String(MAX_LIMIT))
  assert.equal(new URLSearchParams(buildListQuery({ pageSize: 0 })).get('pageSize'), '20')
  assert.equal(new URLSearchParams(buildListQuery({ pageSize: -3 })).get('pageSize'), '1')
})

test('buildListQuery 页码非法或为负都回落到第一页', () => {
  assert.equal(new URLSearchParams(buildListQuery({ pageNum: 'x' })).get('pageNum'), '0')
  assert.equal(new URLSearchParams(buildListQuery({ pageNum: -2 })).get('pageNum'), '0')
  assert.equal(new URLSearchParams(buildListQuery({ pageNum: 2.7 })).get('pageNum'), '2')
})

test('pageToPageNum 由 1 起页码换算 0 起 pageNum', () => {
  assert.equal(pageToPageNum(1), 0)
  assert.equal(pageToPageNum(3), 2)
  assert.equal(pageToPageNum(0), 0)
  assert.equal(pageToPageNum('x'), 0)
  assert.equal(pageToPageNum(-5), 0)
  assert.equal(pageToPageNum(2.7), 1)
})
