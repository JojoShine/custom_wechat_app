import { loadConfig, loadWechatPayConfig, validateStartupConfig } from './app-config.js'

describe('API configuration', () => {
  it('rejects a missing database URL', () => {
    expect(() => loadConfig({})).toThrow('DATABASE_URL is required')
  })

  it('uses the supplied database URL', () => {
    const config = loadConfig({ DATABASE_URL: 'postgresql://local:test@localhost:5432/app' })
    expect(config.databaseUrl).toBe('postgresql://local:test@localhost:5432/app')
  })
})

describe('startup configuration', () => {
  const valid = {
    DATABASE_URL: 'postgresql://local:test@localhost:5432/app', PORT: '3000',
    JWT_SECRET: '0123456789abcdef0123456789abcdef', WECHAT_APP_ID: 'wx123', WECHAT_APP_SECRET: 'secret',
    OSS_REGION: 'cn-hangzhou', OSS_BUCKET: 'private-bucket', OSS_ENDPOINT: 'https://private-bucket.oss-cn-hangzhou.aliyuncs.com',
    OSS_ACCESS_KEY_ID: 'key', OSS_ACCESS_KEY_SECRET: 'secret'
  }
  it('accepts complete core settings without optional payment', () => {
    expect(() => validateStartupConfig(valid)).not.toThrow()
  })
  it.each([
    [{ JWT_SECRET: 'replace-with-a-random-secret' }, /JWT_SECRET/],
    [{ PORT: '0' }, /PORT/],
    [{ WECHAT_APP_SECRET: '' }, /WECHAT_APP_SECRET/],
    [{ OSS_ENDPOINT: 'http://private-bucket.example.com' }, /OSS_ENDPOINT/],
    [{ WECHAT_PAY_MCH_ID: 'merchant' }, /WeChat Pay config missing/]
  ])('rejects invalid startup settings', (override, message) => {
    expect(() => validateStartupConfig({ ...valid, ...override })).toThrow(message)
  })
})

describe('WeChat Pay configuration', () => {
  const valid = {
    WECHAT_APP_ID: 'wx-app', WECHAT_PAY_MCH_ID: 'mch', WECHAT_PAY_MERCHANT_SERIAL: 'serial',
    WECHAT_PAY_MERCHANT_PRIVATE_KEY: 'private', WECHAT_PAY_API_V3_KEY: '0123456789abcdef0123456789abcdef',
    WECHAT_PAY_PUBLIC_KEY_ID: 'PUB_KEY_ID_1', WECHAT_PAY_PUBLIC_KEY: 'public',
    WECHAT_PAY_NOTIFY_URL: 'https://example.com/payments/wechat/notify',
    WECHAT_PAY_REFUND_NOTIFY_URL: 'https://example.com/payments/wechat/refund-notify'
  }

  it('requires a 32-byte API v3 key, not merely 32 Unicode characters', () => {
    expect(() => loadWechatPayConfig({ ...valid, WECHAT_PAY_API_V3_KEY: '中'.repeat(32) })).toThrow(/32 bytes/)
  })

  it('keeps payment credentials optional until the payment gateway is configured', () => {
    expect(() => loadConfig({ DATABASE_URL: 'postgresql://local:test@localhost:5432/app' })).not.toThrow()
    expect(() => loadWechatPayConfig({})).toThrow(/missing/)
  })
})
