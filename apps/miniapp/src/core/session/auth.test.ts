import { createSessionClient } from './auth'

describe('miniapp session client', () => {
  const state: { accessToken?: string; refreshToken?: string } = {}
  const storage = {
    read: jest.fn(async () => ({ ...state })),
    write: jest.fn(async (value: typeof state) => { Object.assign(state, value) }),
    clear: jest.fn(async () => { delete state.accessToken; delete state.refreshToken })
  }
  const request = jest.fn()
  const getCode = jest.fn(async () => 'wx-code')

  beforeEach(() => {
    jest.clearAllMocks()
    delete state.accessToken
    delete state.refreshToken
  })

  function client() { return createSessionClient({ request, getCode, storage }) }

  it('logs in with a WeChat code and stores backend tokens', async () => {
    request.mockResolvedValueOnce({ statusCode: 200, data: { accessToken: 'access', refreshToken: 'refresh', expiresIn: 900 } })
    await client().loginWithWeChat()
    expect(getCode).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ url: '/auth/wechat', data: { code: 'wx-code' } }))
    expect(state).toEqual({ accessToken: 'access', refreshToken: 'refresh' })
  })

  it('adds the access token to requests', async () => {
    Object.assign(state, { accessToken: 'access', refreshToken: 'refresh' })
    request.mockResolvedValueOnce({ statusCode: 200, data: { id: 'me' } })
    await expect(client().apiRequest({ url: '/users/me', method: 'GET' })).resolves.toEqual({ id: 'me' })
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ header: { Authorization: 'Bearer access' } }))
  })

  it('refreshes once for concurrent expired requests and retries each once', async () => {
    Object.assign(state, { accessToken: 'old', refreshToken: 'refresh' })
    request.mockImplementation(async (options: { url: string; header?: Record<string, string> }) => {
      if (options.url === '/auth/refresh') return { statusCode: 200, data: { accessToken: 'new', refreshToken: 'next', expiresIn: 900 } }
      if (options.header?.Authorization === 'Bearer old') return { statusCode: 401, data: {} }
      return { statusCode: 200, data: { ok: true } }
    })
    const api = client()
    await expect(Promise.all([api.apiRequest({ url: '/a' }), api.apiRequest({ url: '/b' })]))
      .resolves.toEqual([{ ok: true }, { ok: true }])
    expect(request.mock.calls.filter(([options]) => options.url === '/auth/refresh')).toHaveLength(1)
    expect(state).toEqual({ accessToken: 'new', refreshToken: 'next' })
  })

  it('clears the session when refresh fails', async () => {
    Object.assign(state, { accessToken: 'old', refreshToken: 'refresh' })
    request.mockImplementation(async (options: { url: string }) => ({ statusCode: 401, data: { code: 'UNAUTHORIZED' } }))
    await expect(client().apiRequest({ url: '/users/me' })).rejects.toThrow('AUTH_REQUIRED')
    expect(state).toEqual({})
    expect(storage.clear).toHaveBeenCalledTimes(1)
  })

  it('clears a stale access token when no refresh token exists', async () => {
    state.accessToken = 'old'
    request.mockResolvedValueOnce({ statusCode: 401, data: {} })
    await expect(client().apiRequest({ url: '/users/me' })).rejects.toThrow('AUTH_REQUIRED')
    expect(state).toEqual({})
  })
})
