import assert from 'node:assert/strict'
import test from 'node:test'

import { describeCron, describeCronSafely, formatRunTime, nextRunTimes, PREVIEW_COUNT } from './cronText.js'
import { isValidCron } from '../../api/scheduledTasks.js'

test('describeCron 输出中文描述', () => {
  assert.equal(describeCron('*/5 * * * *'), '每隔 5 分钟')
  assert.ok(describeCron('0 8 * * *').includes('08:00'))
})

test('describeCronSafely 处理有效、无效与空表达式', () => {
  assert.equal(describeCronSafely('*/5 * * * *'), '每隔 5 分钟')
  assert.equal(describeCronSafely('not a cron'), 'not a cron')
  assert.equal(describeCronSafely(''), '')
  assert.equal(describeCronSafely(null), '')
})

test('nextRunTimes 默认返回 3 次升序时间', () => {
  const times = nextRunTimes('*/5 * * * *', {
    currentDate: new Date('2026-11-24T10:00:00+08:00'),
  })
  assert.equal(times.length, PREVIEW_COUNT)
  assert.ok(times.every((time) => time instanceof Date))
  assert.ok(times[0] < times[1] && times[1] < times[2])
})

test('nextRunTimes 可指定次数与起始时间', () => {
  const times = nextRunTimes('0 8 * * *', {
    count: 1,
    currentDate: new Date('2026-11-24T10:00:00+08:00'),
  })
  assert.equal(times.length, 1)
  assert.equal(times[0].getHours(), 8)
})

test('formatRunTime 输出 24 小时制本地格式', () => {
  const text = formatRunTime(new Date(2026, 10, 24, 8, 5, 0))
  assert.match(text, /08:05/)
  assert.match(text, /2026/)
})
