import assert from 'node:assert/strict'
import test, { afterEach } from 'node:test'

import { BIZ_SCOPE_MAX_LENGTH, buildListParams, DEFAULT_LIMIT, JOB_TYPE_MAX_LENGTH, KEYWORD_MAX_LENGTH, listMatchResults, listRunBizScopeOptions, listRunJobTypes, MAX_LIMIT, normalizeBizScope, normalizeJobType, normalizeKeyword, pageToPageNum, WARN_SCOPE } from './matchResults.js'
import { http } from './http.js'

/** 记录请求的假适配器：把 axios 最终交给传输层的 config 收起来，统一回 `{code:200}` 信封。 */
const recording = (payload = null) => {
  const calls = []
  const adapter = async (config) => {
    calls.push(config)
    return { data: { code: 200, msg: 'ok', data: payload }, status: 200, statusText: 'OK', headers: {}, config }
  }
  adapter.calls = calls
  return adapter
}

let restore = null

const use = (adapter) => {
  const previous = http.defaults.adapter
  http.defaults.adapter = adapter
  restore = () => {
    http.defaults.adapter = previous
  }
}

afterEach(() => {
  restore?.()
  restore = null
})

test('buildListParams 缺省不带 matched，页码从 0 起', () => {
  assert.deepEqual(buildListParams(), { pageNum: 0, pageSize: DEFAULT_LIMIT })
})

test('buildListParams 只发新契约的键名', () => {
  assert.deepEqual(buildListParams({ pageNum: 2, pageSize: 10 }), { pageNum: 2, pageSize: 10 })
})

test('buildListParams 空字符串与 null 都视为全部', () => {
  assert.equal('matched' in buildListParams({ matched: '' }), false)
  assert.equal('matched' in buildListParams({ matched: null }), false)
})

test('buildListParams 带上过滤值', () => {
  for (const matched of [0, 1, 2, '1']) {
    assert.equal(buildListParams({ matched }).matched, matched)
  }
})

test('buildListParams 每页条数受上限约束', () => {
  assert.equal(buildListParams({ pageSize: 5000 }).pageSize, MAX_LIMIT)
  assert.equal(buildListParams({ pageSize: 0 }).pageSize, DEFAULT_LIMIT)
  assert.equal(buildListParams({ pageSize: -3 }).pageSize, 1)
})

test('buildListParams 页码非法或为负都回落到第一页', () => {
  assert.equal(buildListParams({ pageNum: 'x' }).pageNum, 0)
  assert.equal(buildListParams({ pageNum: -2 }).pageNum, 0)
  assert.equal(buildListParams({ pageNum: 2.7 }).pageNum, 2)
})

test('buildListParams 只在 scope 为 warn 时带上关注集', () => {
  assert.equal(buildListParams({ scope: WARN_SCOPE }).scope, WARN_SCOPE)
  for (const scope of [undefined, null, '', 'all', 'needs_attention']) {
    assert.equal('scope' in buildListParams({ scope }), false)
  }
})

test('buildListParams 只在关键词非空时带上', () => {
  assert.equal(buildListParams({ keyword: '某某通知' }).keyword, '某某通知')
  for (const keyword of [undefined, null, '', '   ']) {
    assert.equal('keyword' in buildListParams({ keyword }), false)
  }
})

test('buildListParams 关键词去首尾空白并截断到上限', () => {
  assert.equal(buildListParams({ keyword: '  通知  ' }).keyword, '通知')

  const long = '稿'.repeat(KEYWORD_MAX_LENGTH + 30)
  assert.equal(buildListParams({ keyword: long }).keyword.length, KEYWORD_MAX_LENGTH)
})

test('normalizeKeyword 空值与非字符串都收敛成字符串', () => {
  assert.equal(normalizeKeyword(undefined), '')
  assert.equal(normalizeKeyword(null), '')
  assert.equal(normalizeKeyword(' a '), 'a')
  assert.equal(normalizeKeyword(123), '123')
})

test('buildListParams 关键词与关注集、匹配态叠加', () => {
  assert.deepEqual(
    buildListParams({ pageNum: 1, pageSize: 10, matched: '1', scope: WARN_SCOPE, keyword: '通知' }),
    { pageNum: 1, pageSize: 10, matched: '1', scope: WARN_SCOPE, keyword: '通知' },
  )
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
  const adapter = recording({ total: 0, rows: [] })
  use(adapter)

  await listMatchResults({ page: 2, size: 10, matched: '1', scope: WARN_SCOPE })
  await listMatchResults({ page: 1 })

  assert.equal(adapter.calls[0].url, '/match-results')
  assert.deepEqual(adapter.calls[0].params, { pageNum: 1, pageSize: 10, matched: '1', scope: 'warn' })
  assert.equal('scope' in adapter.calls[1].params, false)
})

test('listMatchResults 透传关键词，不传时不带该键', async () => {
  const adapter = recording({ total: 0, rows: [] })
  use(adapter)

  await listMatchResults({ page: 1, keyword: ' 关于某某 ' })
  await listMatchResults({ page: 1 })

  assert.equal(adapter.calls[0].params.keyword, '关于某某')
  assert.equal('keyword' in adapter.calls[1].params, false)
})

test('关键词序列化后空格仍编码为 +', () => {
  const uri = http.getUri({
    url: '/match-results',
    params: buildListParams({ keyword: '某某 通知' }),
  })
  assert.equal(uri, '/api/match-results?pageNum=0&pageSize=20&keyword=%E6%9F%90%E6%9F%90+%E9%80%9A%E7%9F%A5')
})

test('buildListParams 缺省不带运行维度条件', () => {
  assert.equal('job_type' in buildListParams(), false)
  assert.equal('biz_scope' in buildListParams(), false)
  for (const value of [undefined, null, '', '   ']) {
    assert.equal('job_type' in buildListParams({ jobType: value }), false)
    assert.equal('biz_scope' in buildListParams({ bizScope: value }), false)
  }
})

test('buildListParams 运行维度去首尾空白并截断到上限', () => {
  assert.equal(buildListParams({ jobType: '  article_diff ' }).job_type, 'article_diff')
  assert.equal(buildListParams({ bizScope: ' 城市更新 ' }).biz_scope, '城市更新')

  const longType = 't'.repeat(JOB_TYPE_MAX_LENGTH + 10)
  const longScope = '账'.repeat(BIZ_SCOPE_MAX_LENGTH + 10)
  assert.equal(buildListParams({ jobType: longType }).job_type.length, JOB_TYPE_MAX_LENGTH)
  assert.equal(buildListParams({ bizScope: longScope }).biz_scope.length, BIZ_SCOPE_MAX_LENGTH)
})

test('normalizeJobType 与 normalizeBizScope 空值与非字符串都收敛成字符串', () => {
  assert.equal(normalizeJobType(undefined), '')
  assert.equal(normalizeJobType(null), '')
  assert.equal(normalizeJobType(' a '), 'a')
  assert.equal(normalizeBizScope(123), '123')
  assert.equal(normalizeBizScope('   '), '')
})

test('buildListParams 运行维度与关键词、关注集、匹配态叠加', () => {
  assert.deepEqual(
    buildListParams({
      pageNum: 1,
      pageSize: 10,
      matched: '1',
      scope: WARN_SCOPE,
      keyword: '通知',
      jobType: 'article_diff',
      bizScope: '城市更新',
    }),
    {
      pageNum: 1,
      pageSize: 10,
      matched: '1',
      scope: 'warn',
      keyword: '通知',
      job_type: 'article_diff',
      biz_scope: '城市更新',
    },
  )
})

test('listMatchResults 透传运行维度，不传时不带该键', async () => {
  const adapter = recording({ total: 0, rows: [] })
  use(adapter)

  await listMatchResults({ page: 1, jobType: ' article_diff ', bizScope: ' 城市更新 ' })
  await listMatchResults({ page: 1 })

  const withDimensions = adapter.calls[0].params
  assert.equal(withDimensions.job_type, 'article_diff')
  assert.equal(withDimensions.biz_scope, '城市更新')

  const plain = adapter.calls[1].params
  assert.equal('job_type' in plain, false)
  assert.equal('biz_scope' in plain, false)
})

test('listRunJobTypes 请求运行记录字典并解包', async () => {
  const adapter = recording([{ value: 'article_diff', label: '公众号文章对比' }])
  use(adapter)

  const result = await listRunJobTypes()

  assert.equal(adapter.calls[0].url, '/diff-run-options/job-types')
  assert.deepEqual(result, [{ value: 'article_diff', label: '公众号文章对比' }])
})

test('listRunJobTypes 非数组响应回落为空数组', async () => {
  use(recording(null))

  assert.deepEqual(await listRunJobTypes(), [])
})

test('listRunBizScopeOptions 按任务类型收窄，空类型不带参数', async () => {
  const adapter = recording([{ value: '1', label: '城市更新' }])
  use(adapter)

  const scoped = await listRunBizScopeOptions(' article_diff ')
  const all = await listRunBizScopeOptions('')

  assert.equal(adapter.calls[0].url, '/diff-run-options/biz-scopes')
  assert.deepEqual(adapter.calls[0].params, { job_type: 'article_diff' })
  assert.equal(adapter.calls[1].params, undefined)

  assert.deepEqual(scoped, [{ value: '1', label: '城市更新' }])
  assert.deepEqual(all, [{ value: '1', label: '城市更新' }])
})

test('listRunBizScopeOptions 非数组响应回落为空数组', async () => {
  use(recording({}))

  assert.deepEqual(await listRunBizScopeOptions('article_diff'), [])
})
