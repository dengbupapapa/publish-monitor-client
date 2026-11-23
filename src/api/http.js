/**
 * 接口访问层：只关心「请求 → 数据」和「错误 → 可展示文案」。
 *
 * 后端统一返回 `{code, msg, data}` 信封，HTTP 状态与业务码同源：
 * 404 表示这条结论不存在或不可渲染，其它失败都归为可重试的错误。
 */

const DEFAULT_BASE = '/api'

/** 生效的接口基址：开发期走 Vite 代理，生产期假定同域反向代理。 */
export function apiBase() {
  const configured = typeof import.meta === 'undefined' ? undefined : import.meta.env?.VITE_API_BASE
  return configured || DEFAULT_BASE
}

/** 可以展示给用户的接口错误。 */
export class ApiError extends Error {
  constructor(message, { status = 0, code = 0 } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

/** 结论不存在或不可渲染（后端统一给 404）。 */
export class NotFoundError extends ApiError {
  constructor(message, options = {}) {
    super(message, { status: 404, ...options })
    this.name = 'NotFoundError'
  }
}

/**
 * 发起 GET 请求并剥掉信封。
 *
 * @param {string} path 以 `/` 开头、不含 `/api` 前缀的路径
 * @param {{signal?: AbortSignal, fetchImpl?: Function, base?: string}} [options]
 * @returns {Promise<any>} 信封里的 `data`
 */
export async function request(path, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch
  const base = options.base ?? apiBase()

  let response
  try {
    response = await fetchImpl(base + path, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: options.signal,
    })
  } catch (error) {
    // 主动取消不是错误，原样抛出让调用方忽略
    if (error && error.name === 'AbortError') throw error
    throw new ApiError('无法连接后端服务，请确认服务已启动后重试')
  }

  let payload = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (response.status === 404) {
    throw new NotFoundError(payload?.msg || '未找到这条结论')
  }
  if (!response.ok) {
    throw new ApiError(payload?.msg || `请求失败（HTTP ${response.status}）`, {
      status: response.status,
      code: payload?.code ?? response.status,
    })
  }
  if (!payload || payload.code !== 200) {
    throw new ApiError(payload?.msg || '服务端返回了无法识别的响应', {
      status: response.status,
      code: payload?.code ?? 0,
    })
  }

  return payload.data
}
