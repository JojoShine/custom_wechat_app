import { setPendingWebview, takePendingWebview } from './pending'

describe('WebView page handoff', () => {
  it('does not return a URL unless the app matches the latest launch', () => {
    setPendingWebview('demo', 'https://demo.example.com/?ticket=one')
    expect(takePendingWebview('other')).toBeNull()
    expect(takePendingWebview('demo')).toBeNull()
  })

  it('returns the trusted URL only once', () => {
    setPendingWebview('demo', 'https://demo.example.com/?ticket=two')
    expect(takePendingWebview('demo')).toBe('https://demo.example.com/?ticket=two')
    expect(takePendingWebview('demo')).toBeNull()
  })
})
