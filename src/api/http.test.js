import assert from 'node:assert/strict'
import test, { afterEach } from 'node:test'

import { AxiosError } from 'axios'

import { ApiError, http, isAbort, NotFoundError } from './http.js'

/**
 * 假的传输层。
 *
 * axios 的 settle 在适配器内部执行，所以「非 2xx」必须由适配器自己 reject，
 * 否则拦截器的失败分支根本不会跑到，用例会假绿。
 */
const okAdapter = (payload, { status = 200 } = {}) => async (config) => ({
  data: payload,
  status,
  statusText: 'OK',
  headers: {},
  config,
})

const failAdapter = (status, payload) => async (config) => {
  const response = { data: payload, status, statusText: 'ERR', headers: {}, config }
  throw new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_RESPONSE', config, null, response)
}

const offlineAdapter = () => async (config) => {
  throw new AxiosError('Network Error', 'ERR_NETWORK', config)
}

/** 记录请求的适配器，`calls` 里是 axios 最终交给传输层的 config。 */
const recordingAdapter = (payload) => {
  const calls = []
  const impl = async (config) => {
    calls.push(config)
    return { data: payload, status: 200, statusText: 'OK', headers: {}, config }
  }
  impl.calls = calls
  return impl
}

let restore = null

/** 替换单例适配器，`afterEach` 负责还原，避免用例顺序耦合。 */
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

const header = (config, name) => {
  const value = config.headers?.get ? config.headers.get(name) : config.headers?.[name]
  return value === undefined || value === null ? undefined : String(value)
}

test('成功响应剥掉信封只返回 data', async () => {
  const adapter = recordingAdapter({ code: 200, msg: 'success', data: { total: 3, items: [] } })
  use(adapter)

  const data = await http.get('/match-results', { params: { pageNum: 0, pageSize: 20 } })

  assert.deepEqual(data, { total: 3, items: [] })
  const sent = adapter.calls[0]
  assert.equal(sent.baseURL, '/api')
  assert.equal(sent.url, '/match-results')
  assert.deepEqual(sent.params, { pageNum: 0, pageSize: 20 })
  // 没有 body 时 axios 不会补 Content-Type，也不会序列化出 data
  assert.equal(sent.data, undefined)
  assert.equal(header(sent, 'Content-Type'), undefined)
})

test('对象 body 按 JSON 发送并带 Content-Type', async () => {
  const adapter = recordingAdapter({ code: 200, msg: 'success', data: { id: 7 } })
  use(adapter)

  const data = await http.post('/diff-schedules', { name: '每日比对', cron: '0 8 * * *' })

  assert.deepEqual(data, { id: 7 })
  const sent = adapter.calls[0]
  assert.equal(sent.method, 'post')
  assert.equal(sent.data, JSON.stringify({ name: '每日比对', cron: '0 8 * * *' }))
  assert.match(header(sent, 'Content-Type'), /application\/json/)
})

test('业务码不为 200 的响应按失败处理并保留数字业务码', async () => {
  use(okAdapter({ code: 422, msg: '请求参数校验失败', data: null }))

  await assert.rejects(
    () => http.get('/match-results', { params: { matched: 9 } }),
    (error) => {
      assert.ok(error instanceof ApiError)
      assert.equal(error.code, 422)
      assert.equal(error.status, 200)
      assert.equal(error.message, '请求参数校验失败')
      return true
    },
  )
})

test('响应体无法识别时给出中性文案', async () => {
  use(okAdapter('<html>gateway</html>'))

  await assert.rejects(
    () => http.get('/match-results'),
    (error) => {
      assert.equal(error.message, '服务端返回了无法识别的响应')
      assert.equal(error.code, 0)
      return true
    },
  )
})

test('404 优先使用信封文案', async () => {
  use(failAdapter(404, { code: 404, msg: '匹配结论不存在', data: null }))

  await assert.rejects(
    () => http.get('/match-results/9/preview'),
    (error) => {
      assert.ok(error instanceof NotFoundError)
      assert.equal(error.message, '匹配结论不存在')
      assert.equal(error.status, 404)
      return true
    },
  )
})

test('404 没有信封文案时使用中性默认文案', async () => {
  use(failAdapter(404, { code: 404, msg: '', data: null }))

  await assert.rejects(
    () => http.delete('/diff-schedules/9'),
    (error) => {
      assert.ok(error instanceof NotFoundError)
      assert.equal(error.message, '请求的资源不存在')
      return true
    },
  )
})

test('其它 HTTP 失败归一为可展示错误，code 取数字', async () => {
  use(failAdapter(500, { code: 500, msg: '数据库操作失败，请稍后重试', data: null }))

  await assert.rejects(
    () => http.get('/match-results'),
    (error) => {
      assert.ok(error instanceof ApiError)
      assert.equal(error.status, 500)
      assert.equal(error.code, 500)
      assert.equal(error.message, '数据库操作失败，请稍后重试')
      return true
    },
  )
})

test('HTTP 失败没有信封文案时带上状态码', async () => {
  use(failAdapter(502, null))

  await assert.rejects(
    () => http.get('/match-results'),
    (error) => {
      assert.equal(error.status, 502)
      assert.equal(error.code, 502)
      assert.match(error.message, /HTTP 502/)
      return true
    },
  )
})

test('没有响应对象时归一为启动提示', async () => {
  use(offlineAdapter())

  await assert.rejects(
    () => http.get('/match-results'),
    (error) => {
      assert.ok(error instanceof ApiError)
      assert.equal(error.status, 0)
      assert.match(error.message, /无法连接后端服务/)
      return true
    },
  )
})

test('主动取消原样抛出且 isAbort 为真', async () => {
  use(offlineAdapter())
  const controller = new AbortController()
  controller.abort()

  await assert.rejects(
    () => http.get('/match-results', { signal: controller.signal }),
    (error) => {
      assert.equal(isAbort(error), true)
      assert.equal(error instanceof ApiError, false)
      return true
    },
  )
})

test('已归一的错误不会被二次判成连接失败', async () => {
  use(async () => {
    throw new ApiError('早先归一过的错误')
  })

  await assert.rejects(
    () => http.get('/match-results'),
    (error) => {
      assert.equal(error.message, '早先归一过的错误')
      return true
    },
  )
})

test('isAbort 兼容原始的 AbortError', () => {
  const error = new Error('aborted')
  error.name = 'AbortError'
  assert.equal(isAbort(error), true)
  assert.equal(isAbort(new ApiError('其它错误')), false)
})
