export function loadConfig(env: NodeJS.ProcessEnv): { databaseUrl: string } {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required')
  }

  return { databaseUrl: env.DATABASE_URL }
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
