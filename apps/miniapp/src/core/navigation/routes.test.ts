import { enabledPages } from './routes'

test('default pages keep the portal first and omit the payment demo', () => {
  expect(enabledPages(false)).toEqual(['pages/portal/index', 'pages/login/index', 'pages/profile/index'])
})

test('enabled payment demo adds its page after the shared pages', () => {
  expect(enabledPages(true)).toEqual(['pages/portal/index', 'pages/login/index', 'pages/profile/index', 'pages/demo-payment/index'])
})
