import { recoverProtectedError } from './recover'

it('returns to login after the session expires during a profile action', async () => {
  const redirect = jest.fn(async (_url: string) => {})
  const handled = await recoverProtectedError(new Error('AUTH_REQUIRED'), '/pages/profile/index', redirect)
  expect(handled).toBe(true)
  expect(redirect).toHaveBeenCalledWith('/pages/login/index?returnTo=%2Fpages%2Fprofile%2Findex')
})

it('leaves non-auth failures on the current page', async () => {
  const redirect = jest.fn(async (_url: string) => {})
  expect(await recoverProtectedError(new Error('HTTP_500'), '/pages/profile/index', redirect)).toBe(false)
  expect(redirect).not.toHaveBeenCalled()
})
