import assert from 'node:assert/strict'
import test, { afterEach } from 'node:test'

import { AxiosError } from 'axios'

import { http, NotFoundError } from './http.js'
import {
  buildListParams,
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

test('validateForm 缺字段时报错，job_type 与 biz_scope 为必填', () => {
  assert.deepEqual(
    validateForm({ name: '任务', job_type: 'article_diff', cron: '0 8 * * *', biz_scope: '账号A' }),
    {},
  )

  assert.deepEqual(validateForm({ job_type: 'article_diff', cron: '0 8 * * *', biz_scope: '账号A' }), {
    name: '请输入任务名称',
  })
  assert.deepEqual(validateForm({ name: '任务', cron: '0 8 * * *', biz_scope: '账号A' }), {
    job_type: '请选择任务类型',
  })
  assert.deepEqual(validateForm({ name: '任务', job_type: 'article_diff', cron: '* * *', biz_scope: '账号A' }), {
    cron: '请输入合法的任务规则（五段式：分 时 日 月 周）',
  })
  assert.deepEqual(validateForm({ name: '任务', job_type: '   ', cron: '0 8 * * *', biz_scope: '账号A' }), {
    job_type: '请选择任务类型',
  })
  assert.deepEqual(validateForm({ name: '任务', job_type: 'article_diff', cron: '0 8 * * *' }), {
    biz_scope: '请输入账号',
  })
  assert.deepEqual(validateForm({ name: '任务', job_type: 'article_diff', cron: '0 8 * * *', biz_scope: '   ' }), {
    biz_scope: '请输入账号',
  })
  assert.deepEqual(validateForm({}), {
    name: '请输入任务名称',
    job_type: '请选择任务类型',
    cron: '请输入合法的任务规则（五段式：分 时 日 月 周）',
    biz_scope: '请输入账号',
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

test('buildListParams 缺省不带 job_type、夹紧条数上限', () => {
  assert.deepEqual(buildListParams({}), { pageNum: 0, pageSize: DEFAULT_LIMIT })
  assert.deepEqual(buildListParams({ pageNum: 2, pageSize: 10, jobType: 'article_diff' }), {
    pageNum: 2,
    pageSize: 10,
    job_type: 'article_diff',
  })
  assert.deepEqual(buildListParams({ jobType: '   ' }), { pageNum: 0, pageSize: DEFAULT_LIMIT })
  assert.deepEqual(buildListParams({ pageSize: MAX_LIMIT + 50 }), {
    pageNum: 0,
    pageSize: MAX_LIMIT,
  })
})

/** 记录请求的假适配器：把 axios 最终交给传输层的 config 收起来，统一回 `{code:200}` 信封。 */
const recording = (payload) => {
  const calls = []
  const adapter = async (config) => {
    calls.push(config)
    return { data: { code: 200, msg: 'success', data: payload }, status: 200, statusText: 'OK', headers: {}, config }
  }
  adapter.calls = calls
  return adapter
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

test('listScheduledTasks 分页取数并解析 {total, rows}', async () => {
  const adapter = recording({
    pageNum: 0,
    pageSize: 10,
    total: 1,
    rows: [{ id: 1, name: '每日比对', job_type: 'article_diff', cron: '0 8 * * *', enabled: true, last_fired_at: null }],
  })
  use(adapter)

  const page = await listScheduledTasks({ page: 1, size: 10, jobType: 'article_diff' })
  assert.equal(page.total, 1)
  assert.equal(page.rows.length, 1)
  assert.equal(page.rows[0].name, '每日比对')

  const call = adapter.calls[0]
  assert.equal(call.url, '/diff-schedules')
  assert.equal(call.method, 'get')
  assert.deepEqual(call.params, { pageNum: 0, pageSize: 10, job_type: 'article_diff' })
  assert.equal(call.data, undefined)
})

test('listScheduledTasks 缺省参数时不带 job_type', async () => {
  const adapter = recording({ total: 0, rows: [] })
  use(adapter)

  await listScheduledTasks({})

  assert.deepEqual(adapter.calls[0].params, { pageNum: 0, pageSize: DEFAULT_LIMIT })
})

test('listJobTypes 请求 GET /job-types 并返回数组', async () => {
  const adapter = recording([{ value: 'article_diff', label: '微信公众号文章对比' }])
  use(adapter)

  const types = await listJobTypes()
  assert.deepEqual(types, [{ value: 'article_diff', label: '微信公众号文章对比' }])
  assert.equal(adapter.calls[0].url, '/job-types')
  assert.equal(adapter.calls[0].method, 'get')
})

test('createScheduledTask POST 归一化后的字段（含 job_type 与 biz_scope）', async () => {
  const adapter = recording({ id: 2, name: '每日比对' })
  use(adapter)

  await createScheduledTask({
    name: '  每日比对  ',
    job_type: ' article_diff ',
    cron: ' 0 8 * * * ',
    biz_scope: ' 公众号 ',
  })

  const call = adapter.calls[0]
  assert.equal(call.url, '/diff-schedules')
  assert.equal(call.method, 'post')
  assert.match(header(call, 'Content-Type'), /application\/json/)
  assert.deepEqual(JSON.parse(call.data), {
    name: '每日比对',
    job_type: 'article_diff',
    cron: '0 8 * * *',
    biz_scope: '公众号',
  })
})

test('updateScheduledTask PATCH 只发送提供的字段，空串清空业务名称', async () => {
  const adapter = recording(null)
  use(adapter)

  await updateScheduledTask(9, {
    name: '  改名 ',
    job_type: 'article_diff',
    cron: ' */5 * * * * ',
    biz_scope: '',
    biz_type: ' 品牌B ',
  })

  const call = adapter.calls[0]
  assert.equal(call.url, '/diff-schedules/9')
  assert.equal(call.method, 'patch')
  assert.deepEqual(JSON.parse(call.data), {
    name: '改名',
    job_type: 'article_diff',
    cron: '*/5 * * * *',
    biz_scope: '',
    biz_type: '品牌B',
  })
})

test('updateScheduledTask 不含未提供的字段（不发 biz_name/params）', async () => {
  const adapter = recording(null)
  use(adapter)

  await updateScheduledTask(9, { enabled: false })

  assert.deepEqual(JSON.parse(adapter.calls[0].data), { enabled: false })
})

test('classifyScheduleError 按业务码归位字段', () => {
  assert.deepEqual(classifyScheduleError({ code: 40002, status: 400, message: 'cron 非法' }), {
    field: 'cron',
    message: 'cron 非法',
  })
  assert.deepEqual(classifyScheduleError({ code: 40002, status: 400 }), {
    field: 'cron',
    message: '请输入合法的任务规则',
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
  const adapter = recording(null)
  use(adapter)

  await setScheduledTaskEnabled(7, true)

  const call = adapter.calls[0]
  assert.equal(call.url, '/diff-schedules/7')
  assert.equal(call.method, 'patch')
  assert.deepEqual(JSON.parse(call.data), { enabled: true })
})

test('deleteScheduledTask DELETE 走任务详情路径', async () => {
  const adapter = recording(null)
  use(adapter)

  await deleteScheduledTask(3)

  assert.equal(adapter.calls[0].url, '/diff-schedules/3')
  assert.equal(adapter.calls[0].method, 'delete')
})

test('deleteScheduledTask 把 404 换成删除专用文案', async () => {
  use(async (config) => {
    const response = { data: { code: 404, msg: 'not found' }, status: 404, statusText: 'ERR', headers: {}, config }
    throw new AxiosError('Request failed with status code 404', 'ERR_BAD_RESPONSE', config, null, response)
  })

  await assert.rejects(
    () => deleteScheduledTask(3),
    (error) => {
      assert.ok(error instanceof NotFoundError)
      assert.equal(error.message, '任务不存在或已被删除')
      return true
    },
  )
})

test('deleteScheduledTask 其它失败保留原始文案', async () => {
  use(async (config) => {
    const response = { data: { code: 500, msg: '数据库操作失败，请稍后重试' }, status: 500, statusText: 'ERR', headers: {}, config }
    throw new AxiosError('Request failed with status code 500', 'ERR_BAD_RESPONSE', config, null, response)
  })

  await assert.rejects(
    () => deleteScheduledTask(3),
    (error) => {
      assert.equal(error.message, '数据库操作失败，请稍后重试')
      assert.equal(error.code, 500)
      return true
    },
  )
})
