import type { AuthTokens } from '@template/contracts'

export interface StoredSession {
  accessToken?: string
  refreshToken?: string
}

export interface SessionStorage {
  read(): Promise<StoredSession>
  write(session: StoredSession): Promise<void>
  clear(): Promise<void>
}

export interface RequestOptions {
  url: string
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  data?: unknown
  header?: Record<string, string>
}

export interface Response<T = unknown> {
  statusCode: number
  data: T
}

export interface SessionDependencies {
  request<T>(options: RequestOptions): Promise<Response<T>>
  getCode(): Promise<string>
  storage: SessionStorage
}

export function createSessionClient(deps: SessionDependencies) {
  let pendingRefresh: Promise<boolean> | undefined

  async function send<T>(options: RequestOptions): Promise<Response<T>> {
    return deps.request<T>(options)
  }

  async function refreshSession(): Promise<boolean> {
    if (!pendingRefresh) {
      pendingRefresh = (async () => {
        const { refreshToken } = await deps.storage.read()
        if (!refreshToken) return false
        try {
          const result = await send<AuthTokens>({ url: '/auth/refresh', method: 'POST', data: { refreshToken } })
          if (result.statusCode !== 200) throw new Error('Refresh rejected')
          await deps.storage.write({ accessToken: result.data.accessToken, refreshToken: result.data.refreshToken })
          return true
        } catch {
          await deps.storage.clear()
          return false
        }
      })().finally(() => { pendingRefresh = undefined })
    }
    return pendingRefresh
  }

  async function apiRequest<T>(options: RequestOptions): Promise<T> {
    const initial = await deps.storage.read()
    const header: Record<string, string> = { ...options.header }
    if (initial.accessToken) header.Authorization = `Bearer ${initial.accessToken}`
    const result = await send<T>({ ...options, header })
    if (result.statusCode !== 401) {
      if (result.statusCode >= 400) throw new Error(`HTTP_${result.statusCode}`)
      return result.data
    }

    const current = await deps.storage.read()
    const ready = current.accessToken && current.accessToken !== initial.accessToken
      ? true : await refreshSession()
    if (!ready) throw new Error('AUTH_REQUIRED')
    const updated = await deps.storage.read()
    const retry = await send<T>({ ...options, header: { ...options.header, Authorization: `Bearer ${updated.accessToken}` } })
    if (retry.statusCode === 401) {
      await deps.storage.clear()
      throw new Error('AUTH_REQUIRED')
    }
    if (retry.statusCode >= 400) throw new Error(`HTTP_${retry.statusCode}`)
    return retry.data
  }

  async function loginWithWeChat(): Promise<void> {
    const code = await deps.getCode()
    if (!code) throw new Error('WECHAT_CODE_REQUIRED')
    const result = await send<AuthTokens>({ url: '/auth/wechat', method: 'POST', data: { code } })
    if (result.statusCode !== 200 && result.statusCode !== 201) throw new Error('WECHAT_LOGIN_FAILED')
    await deps.storage.write({ accessToken: result.data.accessToken, refreshToken: result.data.refreshToken })
  }

  async function logout(): Promise<void> {
    const { refreshToken } = await deps.storage.read()
    try {
      if (refreshToken) await send({ url: '/auth/logout', method: 'POST', data: { refreshToken } })
    } finally {
      await deps.storage.clear()
    }
  }

  return { apiRequest, loginWithWeChat, refreshSession, logout }
}
