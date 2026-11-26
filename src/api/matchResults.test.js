import assert from 'node:assert/strict'
import test from 'node:test'

import { BIZ_SCOPE_MAX_LENGTH, buildListQuery, DEFAULT_LIMIT, JOB_TYPE_MAX_LENGTH, KEYWORD_MAX_LENGTH, listMatchResults, listRunBizScopeOptions, listRunJobTypes, MAX_LIMIT, normalizeBizScope, normalizeJobType, normalizeKeyword, pageToPageNum, WARN_SCOPE } from './matchResults.js'

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

test('buildListQuery 只在 scope 为 warn 时带上关注集', () => {
  assert.equal(new URLSearchParams(buildListQuery({ scope: WARN_SCOPE })).get('scope'), 'warn')
  for (const scope of [undefined, null, '', 'all', 'needs_attention']) {
    assert.equal(new URLSearchParams(buildListQuery({ scope })).has('scope'), false)
  }
})

test('buildListQuery 只在关键词非空时带上', () => {
  assert.equal(new URLSearchParams(buildListQuery({ keyword: '某某通知' })).get('keyword'), '某某通知')
  for (const keyword of [undefined, null, '', '   ']) {
    assert.equal(new URLSearchParams(buildListQuery({ keyword })).has('keyword'), false)
  }
})

test('buildListQuery 关键词去首尾空白并截断到上限', () => {
  assert.equal(new URLSearchParams(buildListQuery({ keyword: '  通知  ' })).get('keyword'), '通知')

  const long = '稿'.repeat(KEYWORD_MAX_LENGTH + 30)
  assert.equal(new URLSearchParams(buildListQuery({ keyword: long })).get('keyword').length, KEYWORD_MAX_LENGTH)
})

test('normalizeKeyword 空值与非字符串都收敛成字符串', () => {
  assert.equal(normalizeKeyword(undefined), '')
  assert.equal(normalizeKeyword(null), '')
  assert.equal(normalizeKeyword(' a '), 'a')
  assert.equal(normalizeKeyword(123), '123')
})

test('buildListQuery 关键词与关注集、匹配态叠加', () => {
  const query = new URLSearchParams(
    buildListQuery({ pageNum: 1, pageSize: 10, matched: '1', scope: WARN_SCOPE, keyword: '通知' }),
  )
  assert.equal(query.get('keyword'), '通知')
  assert.equal(query.get('scope'), WARN_SCOPE)
  assert.equal(query.get('matched'), '1')
  assert.equal(query.get('pageNum'), '1')
})

test('pageToPageNum 由 1 起页码换算 0 起 pageNum', () => {
  assert.equal(pageToPageNum(1), 0)
  assert.equal(pageToPageNum(3), 2)
  assert.equal(pageToPageNum(0), 0)
  assert.equal(pageToPageNum('x'), 0)
  assert.equal(pageToPageNum(-5), 0)
  assert.equal(pageToPageNum(2.7), 1)
})

test('listMatchResults 只在关注集时透传 scope', async () => {
  const calls = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    calls.push(String(url))
    return {
      ok: true,
      status: 200,
      json: async () => ({ code: 200, msg: 'ok', data: { total: 0, rows: [] } }),
    }
  }

  try {
    await listMatchResults({ page: 2, size: 10, matched: '1', scope: WARN_SCOPE })
    await listMatchResults({ page: 1 })
  } finally {
    globalThis.fetch = originalFetch
  }

  const scoped = new URL(calls[0], 'http://stub')
  assert.equal(scoped.pathname, '/api/match-results')
  assert.equal(scoped.searchParams.get('scope'), 'warn')
  assert.equal(scoped.searchParams.get('matched'), '1')
  assert.equal(scoped.searchParams.get('pageNum'), '1')

  assert.equal(new URL(calls[1], 'http://stub').searchParams.has('scope'), false)
})

test('listMatchResults 透传关键词，不传时不带该键', async () => {
  const calls = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    calls.push(String(url))
    return {
      ok: true,
      status: 200,
      json: async () => ({ code: 200, msg: 'ok', data: { total: 0, rows: [] } }),
    }
  }

  try {
    await listMatchResults({ page: 1, keyword: ' 关于某某 ' })
    await listMatchResults({ page: 1 })
  } finally {
    globalThis.fetch = originalFetch
  }

  assert.equal(new URL(calls[0], 'http://stub').searchParams.get('keyword'), '关于某某')
  assert.equal(new URL(calls[1], 'http://stub').searchParams.has('keyword'), false)
})

test('buildListQuery 缺省不带运行维度条件', () => {
  const query = new URLSearchParams(buildListQuery())
  assert.equal(query.has('job_type'), false)
  assert.equal(query.has('biz_scope'), false)
  for (const value of [undefined, null, '', '   ']) {
    assert.equal(new URLSearchParams(buildListQuery({ jobType: value })).has('job_type'), false)
    assert.equal(new URLSearchParams(buildListQuery({ bizScope: value })).has('biz_scope'), false)
  }
})

test('buildListQuery 运行维度去首尾空白并截断到上限', () => {
  assert.equal(new URLSearchParams(buildListQuery({ jobType: '  article_diff ' })).get('job_type'), 'article_diff')
  assert.equal(new URLSearchParams(buildListQuery({ bizScope: ' 城市更新 ' })).get('biz_scope'), '城市更新')

  const longType = 't'.repeat(JOB_TYPE_MAX_LENGTH + 10)
  const longScope = '账'.repeat(BIZ_SCOPE_MAX_LENGTH + 10)
  assert.equal(new URLSearchParams(buildListQuery({ jobType: longType })).get('job_type').length, JOB_TYPE_MAX_LENGTH)
  assert.equal(new URLSearchParams(buildListQuery({ bizScope: longScope })).get('biz_scope').length, BIZ_SCOPE_MAX_LENGTH)
})

test('normalizeJobType 与 normalizeBizScope 空值与非字符串都收敛成字符串', () => {
  assert.equal(normalizeJobType(undefined), '')
  assert.equal(normalizeJobType(null), '')
  assert.equal(normalizeJobType(' a '), 'a')
  assert.equal(normalizeBizScope(123), '123')
  assert.equal(normalizeBizScope('   '), '')
})

test('buildListQuery 运行维度与关键词、关注集、匹配态叠加', () => {
  const query = new URLSearchParams(
    buildListQuery({
      pageNum: 1,
      pageSize: 10,
      matched: '1',
      scope: WARN_SCOPE,
      keyword: '通知',
      jobType: 'article_diff',
      bizScope: '城市更新',
    }),
  )
  assert.equal(query.get('job_type'), 'article_diff')
  assert.equal(query.get('biz_scope'), '城市更新')
  assert.equal(query.get('keyword'), '通知')
  assert.equal(query.get('scope'), WARN_SCOPE)
  assert.equal(query.get('matched'), '1')
})

test('listMatchResults 透传运行维度，不传时不带该键', async () => {
  const calls = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    calls.push(String(url))
    return {
      ok: true,
      status: 200,
      json: async () => ({ code: 200, msg: 'ok', data: { total: 0, rows: [] } }),
    }
  }

  try {
    await listMatchResults({ page: 1, jobType: ' article_diff ', bizScope: ' 城市更新 ' })
    await listMatchResults({ page: 1 })
  } finally {
    globalThis.fetch = originalFetch
  }

  const withDimensions = new URL(calls[0], 'http://stub').searchParams
  assert.equal(withDimensions.get('job_type'), 'article_diff')
  assert.equal(withDimensions.get('biz_scope'), '城市更新')

  const plain = new URL(calls[1], 'http://stub').searchParams
  assert.equal(plain.has('job_type'), false)
  assert.equal(plain.has('biz_scope'), false)
})

function stubFetch(body) {
  const calls = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    calls.push(String(url))
    return {
      ok: true,
      status: 200,
      json: async () => ({ code: 200, msg: 'ok', data: body }),
    }
  }
  return {
    calls,
    restore() {
      globalThis.fetch = originalFetch
    },
  }
}

test('listRunJobTypes 请求运行记录字典并解包', async () => {
  const stub = stubFetch([{ value: 'article_diff', label: '公众号文章对比' }])
  let result
  try {
    result = await listRunJobTypes()
  } finally {
    stub.restore()
  }

  const url = new URL(stub.calls[0], 'http://stub')
  assert.equal(url.pathname, '/api/diff-run-options/job-types')
  assert.deepEqual(result, [{ value: 'article_diff', label: '公众号文章对比' }])
})

test('listRunJobTypes 非数组响应回落为空数组', async () => {
  const stub = stubFetch(null)
  let result
  try {
    result = await listRunJobTypes()
  } finally {
    stub.restore()
  }
  assert.deepEqual(result, [])
})

test('listRunBizScopeOptions 按任务类型收窄，空类型不带参数', async () => {
  const stub = stubFetch([{ value: '1', label: '城市更新' }])
  let scoped
  let all
  try {
    scoped = await listRunBizScopeOptions(' article_diff ')
    all = await listRunBizScopeOptions('')
  } finally {
    stub.restore()
  }

  const scopedUrl = new URL(stub.calls[0], 'http://stub')
  assert.equal(scopedUrl.pathname, '/api/diff-run-options/biz-scopes')
  assert.equal(scopedUrl.searchParams.get('job_type'), 'article_diff')

  const allUrl = new URL(stub.calls[1], 'http://stub')
  assert.equal(allUrl.searchParams.has('job_type'), false)

  assert.deepEqual(scoped, [{ value: '1', label: '城市更新' }])
  assert.deepEqual(all, [{ value: '1', label: '城市更新' }])
})

test('listRunBizScopeOptions 非数组响应回落为空数组', async () => {
  const stub = stubFetch({})
  let result
  try {
    result = await listRunBizScopeOptions('article_diff')
  } finally {
    stub.restore()
  }
  assert.deepEqual(result, [])
})
