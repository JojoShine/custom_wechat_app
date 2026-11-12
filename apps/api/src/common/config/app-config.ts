export function loadConfig(env: NodeJS.ProcessEnv): { databaseUrl: string } {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required')
  }

  return { databaseUrl: env.DATABASE_URL }
}

export function validateStartupConfig(env: NodeJS.ProcessEnv): void {
  const databaseUrl = loadConfig(env).databaseUrl
  let database: URL
  try { database = new URL(databaseUrl) } catch { throw new Error('DATABASE_URL must be a PostgreSQL URL') }
  if (!['postgres:', 'postgresql:'].includes(database.protocol) || !database.hostname || !database.pathname || database.pathname === '/') {
    throw new Error('DATABASE_URL must be a PostgreSQL URL')
  }
  if (env.PORT !== undefined && (!/^\d+$/.test(env.PORT) || Number(env.PORT) < 1 || Number(env.PORT) > 65535)) throw new Error('PORT must be between 1 and 65535')
  if (env.TRUST_PROXY !== undefined && !['0', '1'].includes(env.TRUST_PROXY)) throw new Error('TRUST_PROXY must be 0 or 1')
  if (!env.JWT_SECRET || Buffer.byteLength(env.JWT_SECRET) < 32 || env.JWT_SECRET.startsWith('replace-with-')) throw new Error('JWT_SECRET must be a random secret of at least 32 bytes')
  for (const name of ['WECHAT_APP_ID', 'WECHAT_APP_SECRET', 'OSS_REGION', 'OSS_BUCKET', 'OSS_ACCESS_KEY_ID', 'OSS_ACCESS_KEY_SECRET']) {
    const value = env[name]
    if (!value || value.startsWith('replace-with-')) throw new Error(`${name} is required`)
  }
  let endpoint: URL
  try { endpoint = new URL(env.OSS_ENDPOINT ?? '') } catch { throw new Error('OSS_ENDPOINT must be an HTTPS bucket host') }
  if (endpoint.protocol !== 'https:' || !endpoint.hostname.startsWith(`${env.OSS_BUCKET}.`) || endpoint.pathname !== '/' || endpoint.username || endpoint.password) {
    throw new Error('OSS_ENDPOINT must be an HTTPS bucket host')
  }
  if (env.WECHAT_PAY_MCH_ID) loadWechatPayConfig(env)
}

export interface WechatPayConfig {
  appId: string
  mchId: string
  merchantSerial: string
  merchantPrivateKey: string
  apiV3Key: string
  wechatPublicKeyId: string
  wechatPublicKey: string
  paymentNotifyUrl: string
  refundNotifyUrl: string
}

export function loadWechatPayConfig(env: NodeJS.ProcessEnv): WechatPayConfig {
  const required = {
    appId: env.WECHAT_APP_ID,
    mchId: env.WECHAT_PAY_MCH_ID,
    merchantSerial: env.WECHAT_PAY_MERCHANT_SERIAL,
    merchantPrivateKey: env.WECHAT_PAY_MERCHANT_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    apiV3Key: env.WECHAT_PAY_API_V3_KEY,
    wechatPublicKeyId: env.WECHAT_PAY_PUBLIC_KEY_ID,
    wechatPublicKey: env.WECHAT_PAY_PUBLIC_KEY?.replace(/\\n/g, '\n'),
    paymentNotifyUrl: env.WECHAT_PAY_NOTIFY_URL,
    refundNotifyUrl: env.WECHAT_PAY_REFUND_NOTIFY_URL
  }
  for (const [name, value] of Object.entries(required)) {
    if (!value) throw new Error(`WeChat Pay config missing: ${name}`)
  }
  if (Buffer.byteLength(required.apiV3Key ?? '') !== 32) throw new Error('WeChat Pay API v3 key must be 32 bytes')
  return required as WechatPayConfig
}
