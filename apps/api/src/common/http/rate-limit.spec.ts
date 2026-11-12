import { createRateLimiter } from './rate-limit.js'

it('limits each client and route group and resets after the window', () => {
  let now = 0
  const limit = createRateLimiter(() => now)
  for (let i = 0; i < 10; i++) expect(limit('1.2.3.4', 'POST', '/auth/wechat')).toBeNull()
  expect(limit('1.2.3.4', 'POST', '/auth/wechat')).toBe(60)
  expect(limit('1.2.3.4', 'POST', '/AUTH/wechat/')).toBe(60)
  expect(limit('1.2.3.5', 'POST', '/auth/wechat')).toBeNull()
  expect(limit('1.2.3.4', 'GET', '/health')).toBeNull()
  now = 60_000
  expect(limit('1.2.3.4', 'POST', '/auth/wechat')).toBeNull()
})

it('applies a general limit to other routes and bounds stored clients', () => {
  const limit = createRateLimiter(() => 0)
  for (let i = 0; i < 120; i++) expect(limit('1.2.3.4', 'GET', '/users/me')).toBeNull()
  expect(limit('1.2.3.4', 'GET', '/users/me')).toBe(60)
})
