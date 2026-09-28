import { WEBVIEW_APPS_PATH, WEBVIEW_PAGE_PATH, enabledPages } from './routes'

test('default pages keep the portal first and omit the payment demo', () => {
  expect(enabledPages(false)).toEqual(['pages/portal/index', 'pages/login/index', 'pages/profile/index', 'pages/webview-apps/index', 'pages/webview/index'])
})

test('WebView app list and host pages are available in all builds', () => {
  expect(WEBVIEW_APPS_PATH).toBe('/pages/webview-apps/index')
  expect(WEBVIEW_PAGE_PATH).toBe('/pages/webview/index')
  expect(enabledPages(false)).toContain('pages/webview-apps/index')
  expect(enabledPages(true)).toContain('pages/webview/index')
})

test('enabled payment demo adds its page after the shared pages', () => {
  expect(enabledPages(true)).toContain('pages/demo-payment/index')
})

test('native capabilities live on the portal without a separate page', () => {
  expect(enabledPages(false)).not.toContain('pages/capabilities/index')
  expect(enabledPages(true)).not.toContain('pages/capabilities/index')
})
