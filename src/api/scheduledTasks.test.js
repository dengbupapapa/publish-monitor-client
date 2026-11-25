import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildListQuery,
  buildSchedulePayload,
  classifyScheduleError,
  createScheduledTask,
  DEFAULT_LIMIT,
  deleteScheduledTask,
  isValidCron,
  listJobTypes,
  listScheduledTasks,
  MAX_LIMIT,
  NAME_MAX_LENGTH,
  normalizeName,
  pageToPageNum,
  setScheduledTaskEnabled,
  updateScheduledTask,
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

test('validateForm 缺字段时报错，job_type 为必填', () => {
  assert.deepEqual(
    validateForm({ name: '任务', job_type: 'article_diff', cron: '0 8 * * *' }),
    {},
  )

  assert.deepEqual(validateForm({ job_type: 'article_diff', cron: '0 8 * * *' }), {
    name: '请输入任务名称',
  })
  assert.deepEqual(validateForm({ name: '任务', cron: '0 8 * * *' }), {
    job_type: '请选择任务类型',
  })
  assert.deepEqual(validateForm({ name: '任务', job_type: 'article_diff', cron: '* * *' }), {
    cron: '请输入合法的五段式 cron 表达式（分 时 日 月 周）',
  })
  assert.deepEqual(validateForm({ name: '任务', job_type: '   ', cron: '0 8 * * *' }), {
    job_type: '请选择任务类型',
  })
  assert.deepEqual(validateForm({}), {
    name: '请输入任务名称',
    job_type: '请选择任务类型',
    cron: '请输入合法的五段式 cron 表达式（分 时 日 月 周）',
  })
})

test('buildSchedulePayload 只产出台面字段、空文本归一为空串', () => {
  assert.deepEqual(
    buildSchedulePayload({
      name: '  任务 ',
      job_type: ' article_diff ',
      cron: ' 0 8 * * * ',
      biz_scope: ' 公众号 ',
    }),
    { name: '任务', job_type: 'article_diff', cron: '0 8 * * *', biz_scope: '公众号' },
  )
  const payload = buildSchedulePayload({})
  assert.ok(!('biz_type' in payload))
  assert.ok(!('biz_name' in payload))
  assert.ok(!('params' in payload))
  assert.equal(payload.biz_scope, '')
})

test('pageToPageNum 从 1 起换算成 0 起并夹紧非法值', () => {
  assert.equal(pageToPageNum(1), 0)
  assert.equal(pageToPageNum(3), 2)
  assert.equal(pageToPageNum(0), 0)
  assert.equal(pageToPageNum(-5), 0)
  assert.equal(pageToPageNum(undefined), 0)
})

test('buildListQuery 缺省不带 job_type、夹紧条数上限', () => {
  assert.equal(buildListQuery({}), `pageNum=0&pageSize=${DEFAULT_LIMIT}`)
  assert.equal(
    buildListQuery({ pageNum: 2, pageSize: 10, jobType: 'article_diff' }),
    'pageNum=2&pageSize=10&job_type=article_diff',
  )
  assert.equal(buildListQuery({ jobType: '   ' }), `pageNum=0&pageSize=${DEFAULT_LIMIT}`)
  assert.equal(
    buildListQuery({ pageSize: MAX_LIMIT + 50 }),
    `pageNum=0&pageSize=${MAX_LIMIT}`,
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

test('listScheduledTasks 分页取数并解析 {total, rows}', async () => {
  const fetchImpl = recordingFetch({
    code: 200,
    msg: 'success',
    data: {
      pageNum: 0,
      pageSize: 10,
      total: 1,
      rows: [{ id: 1, name: '每日比对', job_type: 'article_diff', cron: '0 8 * * *', enabled: true, last_fired_at: null }],
    },
  })

  const page = await listScheduledTasks({ page: 1, size: 10, jobType: 'article_diff', fetchImpl, base: '/api' })
  assert.equal(page.total, 1)
  assert.equal(page.rows.length, 1)
  assert.equal(page.rows[0].name, '每日比对')

  const call = fetchImpl.calls[0]
  assert.equal(call.url, '/api/diff-schedules?pageNum=0&pageSize=10&job_type=article_diff')
  assert.equal(call.options.method, 'GET')
  assert.equal(call.options.body, undefined)
})

test('listScheduledTasks 缺省参数时不带 job_type', async () => {
  const fetchImpl = recordingFetch({ code: 200, msg: 'success', data: { total: 0, rows: [] } })

  await listScheduledTasks({ fetchImpl, base: '/api' })

  assert.equal(fetchImpl.calls[0].url, `/api/diff-schedules?pageNum=0&pageSize=${DEFAULT_LIMIT}`)
})

test('listJobTypes 请求 GET /job-types 并返回数组', async () => {
  const fetchImpl = recordingFetch({
    code: 200,
    msg: 'success',
    data: [{ value: 'article_diff', label: '微信公众号文章对比' }],
  })

  const types = await listJobTypes({ fetchImpl, base: '/api' })
  assert.deepEqual(types, [{ value: 'article_diff', label: '微信公众号文章对比' }])
  assert.equal(fetchImpl.calls[0].url, '/api/job-types')
  assert.equal(fetchImpl.calls[0].options.method, 'GET')
})

test('createScheduledTask POST 归一化后的字段（含 job_type 与 biz_scope）', async () => {
  const fetchImpl = recordingFetch({
    code: 200,
    msg: 'success',
    data: { id: 2, name: '每日比对', job_type: 'article_diff', cron: '0 8 * * *', enabled: true, last_fired_at: null },
  })

  await createScheduledTask(
    {
      name: '  每日比对  ',
      job_type: ' article_diff ',
      cron: ' 0 8 * * * ',
      biz_scope: ' 公众号 ',
    },
    { fetchImpl, base: '/api' },
  )

  const call = fetchImpl.calls[0]
  assert.equal(call.url, '/api/diff-schedules')
  assert.equal(call.options.method, 'POST')
  assert.equal(call.options.headers['Content-Type'], 'application/json')
  assert.deepEqual(JSON.parse(call.options.body), {
    name: '每日比对',
    job_type: 'article_diff',
    cron: '0 8 * * *',
    biz_scope: '公众号',
  })
})

test('updateScheduledTask PATCH 只发送提供的字段，空串清空业务名称', async () => {
  const fetchImpl = recordingFetch({ code: 200, msg: 'success', data: null })

  await updateScheduledTask(
    9,
    { name: '  改名 ', job_type: 'article_diff', cron: ' */5 * * * * ', biz_scope: '', biz_type: ' 品牌B ' },
    { fetchImpl, base: '/api' },
  )

  const call = fetchImpl.calls[0]
  assert.equal(call.url, '/api/diff-schedules/9')
  assert.equal(call.options.method, 'PATCH')
  assert.deepEqual(JSON.parse(call.options.body), {
    name: '改名',
    job_type: 'article_diff',
    cron: '*/5 * * * *',
    biz_scope: '',
    biz_type: '品牌B',
  })
})

test('updateScheduledTask 不含未提供的字段（不发 biz_name/params）', async () => {
  const fetchImpl = recordingFetch({ code: 200, msg: 'success', data: null })

  await updateScheduledTask(9, { enabled: false }, { fetchImpl, base: '/api' })

  assert.deepEqual(JSON.parse(fetchImpl.calls[0].options.body), { enabled: false })
})

test('classifyScheduleError 按业务码归位字段', () => {
  assert.deepEqual(classifyScheduleError({ code: 40002, status: 400, message: 'cron 非法' }), {
    field: 'cron',
    message: 'cron 非法',
  })
  assert.deepEqual(classifyScheduleError({ code: 40005, status: 400, message: '未知流程' }), {
    field: 'job_type',
    message: '未知流程',
  })
  assert.deepEqual(
    classifyScheduleError({ code: 40902, status: 409, message: 'DiffSchedule already exists' }),
    { field: 'name', message: 'DiffSchedule already exists' },
  )
  assert.deepEqual(
    classifyScheduleError({
      code: 40902,
      status: 409,
      message: 'DiffSchedule already exists: 业务范围与任务「X」（cron 0 8 * * *）重复',
    }).field,
    'form',
  )
  assert.equal(classifyScheduleError({ status: 422 }).field, 'form')
  assert.equal(classifyScheduleError({ status: 500 }).field, 'form')
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
