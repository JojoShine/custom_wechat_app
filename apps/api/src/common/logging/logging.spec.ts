import { safeRequestRecord } from './request-logger.js'
import { safeErrorRecord } from './logger.js'

it('logs request and exception metadata without query, body, token or phone', () => {
  const request = { method: 'POST', requestId: 'req-1', route: { path: '/users/me' }, path: '/users/me?phone=13800138000', originalUrl: '/users/me?Signature=secret', headers: { authorization: 'Bearer secret' }, body: { phone: '13800138000' } }
  const entries = [safeRequestRecord(request, 200, 12), safeErrorRecord(request, 500, 'INTERNAL_ERROR')]
  expect(entries[0]).toMatchObject({ category: 'request', method: 'POST', path: '/users/me', status: 200 })
  expect(entries.map((entry) => entry.requestId)).toEqual(['req-1', 'req-1'])
  const output = JSON.stringify(entries)
  expect(output).not.toMatch(/secret|13800138000|Signature|Bearer|authorization|body/i)
})
