import WebviewPage from './index'

jest.mock('../webview-apps/index.css', () => ({}))
jest.mock('@tarojs/taro', () => ({
  __esModule: true,
  default: { redirectTo: jest.fn() },
  useRouter: () => ({ params: { appId: 'demo' } })
}))
jest.mock('@tarojs/components', () => ({
  Button: 'Button', Text: 'Text', View: 'View', WebView: 'WebView'
}))
jest.mock('../../core/webview/pending', () => ({
  takePendingWebview: () => 'https://demo.example.com/?appId=demo&ticket=fresh'
}))

const states: unknown[] = []
let cursor = 0
jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useState: (initial: unknown) => {
    const index = cursor++
    if (!(index in states)) states[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial
    return [states[index], (next: unknown) => { states[index] = next }]
  }
}))

it('shows a fresh-entry action after a WebView load error', () => {
  states.length = 0
  const loading = WebviewPage()
  expect(loading.type).toBe('WebView')
  loading.props.onError()
  cursor = 0
  const failed = WebviewPage()
  expect(failed.type).toBe('View')
  expect(JSON.stringify(failed)).toContain('网页加载失败')
  expect(JSON.stringify(failed)).toContain('返回网页应用')
})
