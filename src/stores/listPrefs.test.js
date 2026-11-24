import assert from 'node:assert/strict'
import test from 'node:test'

import { readAttentionOnly, writeAttentionOnly } from './listPrefs.js'

/** 临时替换全局 localStorage，结束后原样恢复（Node 默认没有这个全局）。 */
function withStorage(stub, fn) {
  const had = Object.hasOwn(globalThis, 'localStorage')
  const original = globalThis.localStorage

  if (stub === undefined) delete globalThis.localStorage
  else globalThis.localStorage = stub

  try {
    return fn()
  } finally {
    if (had) globalThis.localStorage = original
    else delete globalThis.localStorage
  }
}

/** 用 Map 支撑的最小 Storage 替身。 */
function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    data,
  }
}

test('没有 localStorage 时读取降级为 false 且不抛', () => {
  withStorage(undefined, () => {
    assert.equal(readAttentionOnly(), false)
    assert.doesNotThrow(() => writeAttentionOnly(true))
  })
})

test('写入后能读回，取消勾选也会被记录', () => {
  withStorage(fakeStorage(), () => {
    writeAttentionOnly(true)
    assert.equal(readAttentionOnly(), true)

    writeAttentionOnly(false)
    assert.equal(readAttentionOnly(), false)
  })
})

test('未写入过时读取为 false', () => {
  withStorage(fakeStorage(), () => {
    assert.equal(readAttentionOnly(), false)
  })
})

test('存储里的值不可识别时读取为 false', () => {
  const store = fakeStorage({ 'pm.list.attentionOnly': 'true' })
  withStorage(store, () => {
    assert.equal(readAttentionOnly(), false)
  })
})

test('getItem 抛错时读取降级为 false', () => {
  withStorage(
    {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {},
    },
    () => {
      assert.equal(readAttentionOnly(), false)
    },
  )
})

test('setItem 抛错时写入不抛', () => {
  withStorage(
    {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    },
    () => {
      assert.doesNotThrow(() => writeAttentionOnly(true))
    },
  )
})
