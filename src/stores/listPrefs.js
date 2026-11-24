/**
 * 列表页的本地偏好：只记住「仅看疑似未审或有差异」这一项。
 *
 * 地址始终是过滤状态的唯一真相，这里只承担「地址没表态时的缺省值」。
 * 因此读写失败一律降级（读成 false、写忽略），绝不让浏览器设置影响首屏。
 */

const ATTENTION_ONLY_KEY = 'pm.list.attentionOnly'

/**
 * 取本地存储；隐私模式、被禁用以及测试环境下都可能没有或不可访问。
 *
 * @returns {Storage|null}
 */
function storage() {
  try {
    if (typeof localStorage === 'undefined' || !localStorage) return null
    return localStorage
  } catch {
    // 访问器本身可能抛（例如禁用第三方存储），等同没有存储
    return null
  }
}

/**
 * 读取「仅看疑似未审或有差异」的缓存值。
 *
 * @returns {boolean} 没有存储、没有值或值不可识别时为 false
 */
export function readAttentionOnly() {
  const store = storage()
  if (!store) return false
  try {
    return store.getItem(ATTENTION_ONLY_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * 写入「仅看疑似未审或有差异」的缓存值。
 *
 * 只应在使用者显式勾选或取消时调用，否则加载或地址恢复会改写偏好，
 * 打开他人分享的链接就会悄悄改掉自己的选择。
 *
 * @param {boolean} value
 */
export function writeAttentionOnly(value) {
  const store = storage()
  if (!store) return
  try {
    store.setItem(ATTENTION_ONLY_KEY, value ? '1' : '0')
  } catch {
    // 写不进去只影响「下次记住」，不影响本次浏览
  }
}
