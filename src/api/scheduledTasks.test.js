import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createScheduledTask,
  deleteScheduledTask,
  isValidCron,
  listScheduledTasks,
  NAME_MAX_LENGTH,
  normalizeName,
  setScheduledTaskEnabled,
  validateForm,
} from './scheduledTasks.js'

test('normalizeName 去首尾空白并截断到上限', () => {
  assert.equal(normalizeName('  每日比对 '), '每日比对')
  assert.equal(normalizeName(undefined), '')
  assert.equal(normalizeName(123), '123')

  const long = '名'.repeat(NAME_MAX_LENGTH + 30)
  assert.equal(normalizeName(long).length, NAME_MAX_LENGTH)
})

test('isValidCron 接受常见五段式表达式', () => {
  for (const expression of [
    '*/5 * * * *',
    '0 8 * * *',
    '30 2 1,15 * 1-5',
    '0 0 * * 0',
    '59 23 31 12 6',
    '10-20/2 * * * *',
    '* * * * *',
    '  0   8  *  *  *  ',
  ]) {
    assert.ok(isValidCron(expression), expression)
  }
})

test('isValidCron 拒绝非五段式与非法取值', () => {
  for (const expression of [
    '',
    '   ',
    '* * *',
    '* * * * * *',
    '* * * * * ?',
    '0 0/5 * * * ?',
    null,
    undefined,
    123,
    'a b c d e',
    '*/0 * * * *',
    '60 * * * *',
    '20-10 * * * *',
    '1-5/0 * * * *',
    '0 8 * * ',
  ]) {
    assert.equal(isValidCron(expression), false, String(expression))
  }
})

test('validateForm 只在缺字段时报错', () => {
  assert.deepEqual(validateForm({ name: '任务', cron: '0 8 * * *' }), {})

  assert.deepEqual(validateForm({ cron: '0 8 * * *' }), { name: '请输入任务名称' })
  assert.deepEqual(validateForm({ name: '任务', cron: '* * *' }), {
    cron: '请输入合法的五段式 cron 表达式（分 时 日 月 周）',
  })
  assert.deepEqual(
    validateForm({}),
    {
      name: '请输入任务名称',
      cron: '请输入合法的五段式 cron 表达式（分 时 日 月 周）',
    },
  )
})

/** 造一个只回一个响应并记录调用的假 fetch。 */
const recordingFetch = (payload) => {
  const calls = []
  const impl = async (url, options) => {
    calls.push({ url, options })
    return {
      ok: true,
      status: 200,
      json: async () => payload,
    }
  }
  impl.calls = calls
  return impl
}

test('listScheduledTasks 请求 GET /diff-schedules 并剥壳', async () => {
  const fetchImpl = recordingFetch({
    code: 200,
    msg: 'success',
    data: [{ id: 1, name: '每日比对', cron: '0 8 * * *', enabled: true, last_fired_at: null }],
  })

  const rows = await listScheduledTasks({ fetchImpl, base: '/api' })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].name, '每日比对')

  const call = fetchImpl.calls[0]
  assert.equal(call.url, '/api/diff-schedules')
  assert.equal(call.options.method, 'GET')
  assert.equal(call.options.body, undefined)
})

test('createScheduledTask POST 归一化后的字段', async () => {
  const fetchImpl = recordingFetch({
    code: 200,
    msg: 'success',
    data: { id: 2, name: '每日比对', cron: '0 8 * * *', enabled: true, last_fired_at: null },
  })

  await createScheduledTask({ name: '  每日比对  ', cron: ' 0 8 * * * ' }, { fetchImpl, base: '/api' })

  const call = fetchImpl.calls[0]
  assert.equal(call.url, '/api/diff-schedules')
  assert.equal(call.options.method, 'POST')
  assert.equal(call.options.headers['Content-Type'], 'application/json')
  assert.deepEqual(JSON.parse(call.options.body), { name: '每日比对', cron: '0 8 * * *' })
})

test('setScheduledTaskEnabled PATCH 布尔启停', async () => {
  const fetchImpl = recordingFetch({ code: 200, msg: 'success', data: null })

  await setScheduledTaskEnabled(7, true, { fetchImpl, base: '/api' })

  const call = fetchImpl.calls[0]
  assert.equal(call.url, '/api/diff-schedules/7')
  assert.equal(call.options.method, 'PATCH')
  assert.deepEqual(JSON.parse(call.options.body), { enabled: true })
})

test('deleteScheduledTask DELETE 走任务详情路径', async () => {
  const calls = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options })
    return {
      ok: true,
      status: 200,
      json: async () => ({ code: 200, msg: 'success', data: null }),
    }
  }

  try {
    await deleteScheduledTask(3)
  } finally {
    globalThis.fetch = originalFetch
  }

  assert.equal(calls[0].url, '/api/diff-schedules/3')
  assert.equal(calls[0].options.method, 'DELETE')
})
