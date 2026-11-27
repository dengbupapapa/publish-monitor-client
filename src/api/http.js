/**
 * 接口访问层：只关心「请求 → 数据」和「错误 → 可展示文案」。
 *
 * 后端统一返回 `{code, msg, data}` 信封，HTTP 状态与业务码同源：
 * 404 表示这条结论不存在或不可渲染，其它失败都归为可重试的错误。
 *
 * 传输细节（params 序列化、JSON body、取消、响应解析）交给 axios；这里只在
 * 响应拦截器里表达业务语义，因此调用方只写 `http.get(path, { params, signal })`。
 */

import axios from 'axios'

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

/** 全应用共用的 axios 实例，基址与默认请求头都在这里定死。 */
export const http = axios.create({ baseURL: apiBase() })

http.interceptors.response.use(
  // 成功分支：剥掉信封，业务码不为 200 一律当失败
  (response) => {
    const payload = response.data
    if (!payload || payload.code !== 200) {
      throw new ApiError(payload?.msg || '服务端返回了无法识别的响应', {
        status: response.status,
        code: payload?.code ?? 0,
      })
    }
    return payload.data
  },
  // 失败分支：按「取消 → 连不上 → 404 → 其它」归一出可展示错误
  (error) => {
    // 上面抛出的错误没有 response，不放行会被误判成「连不上」
    if (error instanceof ApiError) throw error
    // 主动取消不是错误，原样抛出让调用方忽略
    if (axios.isCancel(error)) throw error

    const response = error?.response
    if (!response) {
      throw new ApiError('无法连接后端服务，请确认服务已启动后重试')
    }

    const payload = response.data
    if (response.status === 404) {
      throw new NotFoundError(payload?.msg || '请求的资源不存在')
    }
    throw new ApiError(payload?.msg || `请求失败（HTTP ${response.status}）`, {
      status: response.status,
      code: payload?.code ?? response.status,
    })
  },
)

/** 请求是否由主动取消（`AbortSignal`）引发。取消不是失败，调用方应当忽略。 */
export function isAbort(error) {
  return axios.isCancel(error) || error?.name === 'AbortError'
}
