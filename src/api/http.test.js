import assert from 'node:assert/strict'
import test from 'node:test'

import { ApiError, NotFoundError, request } from './http.js'

/** 造一个只回一个响应的假 fetch。 */
const fakeFetch = (body, init = {}) => {
  const calls = []
  const impl = async (url, options) => {
    calls.push({ url, options })
    return {
      ok: init.ok ?? (init.status ?? 200) < 400,
      status: init.status ?? 200,
      json: async () => {
        if (init.raw !== undefined) return init.raw
        return body
      },
    }
  }
  impl.calls = calls
  return impl
}

test('request 剥掉信封返回 data', async () => {
  const fetchImpl = fakeFetch({ code: 200, msg: 'success', data: { total: 3, items: [] } })
  const data = await request('/match-results?limit=1', { fetchImpl, base: '/api' })
  assert.deepEqual(data, { total: 3, items: [] })
  assert.equal(fetchImpl.calls[0].url, '/api/match-results?limit=1')
  assert.equal(fetchImpl.calls[0].options.method, 'GET')
})

test('request 把 404 归一为未找到', async () => {
  const fetchImpl = fakeFetch({ code: 404, msg: '匹配结论不存在', data: null }, { status: 404 })
  await assert.rejects(
    () => request('/match-results/9/preview', { fetchImpl, base: '/api' }),
    (error) => {
      assert.ok(error instanceof NotFoundError)
      assert.equal(error.message, '匹配结论不存在')
      return true
    },
  )
})

test('request 把其它失败归一为可展示错误', async () => {
  const serverError = fakeFetch({ code: 500, msg: '数据库操作失败，请稍后重试', data: null }, { status: 500 })
  await assert.rejects(
    () => request('/match-results', { fetchImpl: serverError, base: '/api' }),
    (error) => {
      assert.ok(error instanceof ApiError)
      assert.equal(error.status, 500)
      assert.equal(error.message, '数据库操作失败，请稍后重试')
      return true
    },
  )

  const emptyBody = fakeFetch(null, { status: 502, raw: null })
  await assert.rejects(
    () => request('/match-results', { fetchImpl: emptyBody, base: '/api' }),
    (error) => {
      assert.equal(error.status, 502)
      assert.match(error.message, /HTTP 502/)
      return true
    },
  )
})

test('request 把网络错误归一为启动提示', async () => {
  const offline = async () => {
    throw new TypeError('fetch failed')
  }
  await assert.rejects(
    () => request('/match-results', { fetchImpl: offline, base: '/api' }),
    (error) => {
      assert.equal(error.status, 0)
      assert.match(error.message, /无法连接后端服务/)
      return true
    },
  )
})

test('request 放过主动取消', async () => {
  const aborting = async () => {
    const error = new Error('aborted')
    error.name = 'AbortError'
    throw error
  }
  await assert.rejects(
    () => request('/match-results', { fetchImpl: aborting, base: '/api' }),
    (error) => error.name === 'AbortError',
  )
})

test('request 拒绝业务码不为 200 的响应', async () => {
  const fetchImpl = fakeFetch({ code: 422, msg: '请求参数校验失败', data: null })
  await assert.rejects(
    () => request('/match-results?matched=9', { fetchImpl, base: '/api' }),
    (error) => {
      assert.equal(error.code, 422)
      assert.equal(error.message, '请求参数校验失败')
      return true
    },
  )
})
