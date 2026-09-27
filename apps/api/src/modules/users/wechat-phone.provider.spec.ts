import { WechatPhoneProvider } from './wechat-phone.provider.js'

it('caches the app token and refreshes it after expiry', async () => {
  const fetcher = vi.fn(async (url: URL) => ({ ok: true, json: async () => url.pathname.includes('/cgi-bin/token') ? { access_token: `token-${fetcher.mock.calls.length}`, expires_in: 3600 } : { phone_info: { countryCode: '86', purePhoneNumber: '13800138000' } } }))
  let now = 0
  process.env.WECHAT_APP_ID = 'app'; process.env.WECHAT_APP_SECRET = 'secret'
  const provider = new WechatPhoneProvider()
  provider.fetcher = fetcher as never; provider.now = () => now
  await provider.exchangeCode('code-1')
  await provider.exchangeCode('code-2')
  expect(fetcher.mock.calls.filter(([url]) => url.pathname.includes('/cgi-bin/token'))).toHaveLength(1)
  now = 3_601_000
  await provider.exchangeCode('code-3')
  expect(fetcher.mock.calls.filter(([url]) => url.pathname.includes('/cgi-bin/token'))).toHaveLength(2)
})

it('rejects failed WeChat exchange', async () => {
  const fetcher = vi.fn(async (url: URL) => ({ ok: true, json: async () => url.pathname.includes('/cgi-bin/token') ? { access_token: 'token', expires_in: 3600 } : { errcode: 40029 } }))
  process.env.WECHAT_APP_ID = 'app'; process.env.WECHAT_APP_SECRET = 'secret'
  const provider = new WechatPhoneProvider()
  provider.fetcher = fetcher as never; provider.now = () => 0
  await expect(provider.exchangeCode('invalid')).rejects.toThrow()
})
