import { CAPABILITIES_PATH, enabledPages } from './routes'

test('default pages keep the portal first and omit the payment demo', () => {
  expect(enabledPages(false)).toEqual(['pages/portal/index', 'pages/login/index', 'pages/profile/index', 'pages/capabilities/index'])
})

test('enabled payment demo adds its page after the shared pages', () => {
  expect(enabledPages(true)).toContain('pages/demo-payment/index')
})

test('capability center is a public page in all builds', () => {
  expect(CAPABILITIES_PATH).toBe('/pages/capabilities/index')
  expect(enabledPages(false)).toContain('pages/capabilities/index')
  expect(enabledPages(true)).toContain('pages/capabilities/index')
})
