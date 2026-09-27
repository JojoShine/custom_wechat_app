import { bindPhoneFromEvent } from './bind'

test('refused consent makes no request', async () => {
  const request = jest.fn()
  await expect(bindPhoneFromEvent({}, request)).resolves.toBeNull()
  expect(request).not.toHaveBeenCalled()
})

test('valid consent code is sent to the profile endpoint', async () => {
  const request = jest.fn(async () => ({ phoneBound: true }))
  await expect(bindPhoneFromEvent({ code: 'one-use' }, request as never)).resolves.toEqual({ phoneBound: true })
  expect(request).toHaveBeenCalledWith({ url: '/users/me/phone', method: 'POST', data: { code: 'one-use' } })
})
