import { createNavigationGuard, safeReturnTarget } from './guard'

describe('protected navigation', () => {
  const navigateTo = jest.fn(async (_url: string) => {})
  const readSession = jest.fn(async () => ({} as { accessToken?: string }))
  const guard = createNavigationGuard({ navigateTo, readSession })

  beforeEach(() => jest.clearAllMocks())

  it('sends a guest to login with a safe return path', async () => {
    await guard.navigateProtected('/pages/profile/index')
    expect(navigateTo).toHaveBeenCalledWith('/pages/login/index?returnTo=%2Fpages%2Fprofile%2Findex')
  })

  it('goes straight to a protected page when signed in', async () => {
    readSession.mockResolvedValueOnce({ accessToken: 'token' })
    await guard.navigateProtected('/pages/profile/index')
    expect(navigateTo).toHaveBeenCalledWith('/pages/profile/index')
  })

  it('rejects external and unknown return paths', () => {
    expect(safeReturnTarget('https://evil.example')).toBe('/pages/portal/index')
    expect(safeReturnTarget('//evil.example')).toBe('/pages/portal/index')
    expect(safeReturnTarget('/pages/unknown/index')).toBe('/pages/portal/index')
    expect(safeReturnTarget('/pages/profile/index')).toBe('/pages/profile/index')
    expect(safeReturnTarget('%2Fpages%2Fprofile%2Findex')).toBe('/pages/profile/index')
  })
})
