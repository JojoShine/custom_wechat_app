import { createCipheriv, createHash, generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, test, vi } from 'vitest'
import { WechatPayGateway, WechatPayUnknownError } from './wechat-pay.gateway.js'

const merchant = generateKeyPairSync('rsa', { modulusLength: 2048 })
const wechat = generateKeyPairSync('rsa', { modulusLength: 2048 })
const config = {
  appId: 'wx-app', mchId: 'mch-1', merchantSerial: 'merchant-serial',
  merchantPrivateKey: merchant.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  apiV3Key: '0123456789abcdef0123456789abcdef',
  wechatPublicKeyId: 'PUB_KEY_ID_123', wechatPublicKey: wechat.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  paymentNotifyUrl: 'https://merchant.example/payments/wechat/notify',
  refundNotifyUrl: 'https://merchant.example/payments/wechat/refund-notify'
}

function signedResponse(body: string, options?: { serial?: string; omitSignature?: boolean; status?: number }): Response {
  const signature = sign('RSA-SHA256', Buffer.from(`1700000000\nresponse-nonce\n${body}\n`), wechat.privateKey).toString('base64')
  return new Response(options?.status === 204 ? null : body, { status: options?.status ?? 200, headers: {
    'wechatpay-timestamp': '1700000000', 'wechatpay-nonce': 'response-nonce',
    'wechatpay-serial': options?.serial ?? config.wechatPublicKeyId,
    ...(options?.omitSignature ? {} : { 'wechatpay-signature': signature })
  } })
}

describe('verified WeChat Pay gateway', () => {
  test('creates a JSAPI prepay request and returns only verified prepay ID', async () => {
    const fetcher = vi.fn(async () => signedResponse('{"prepay_id":"prepay-1"}'))
    const gateway = new WechatPayGateway(config, fetcher)
    await expect(gateway.createPrepay({ outTradeNo: 'pay-1', openId: 'openid-1', amountFen: 10, description: 'Test' }))
      .resolves.toEqual({ prepayId: 'prepay-1' })
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.mch.weixin.qq.com/v3/pay/transactions/jsapi')
    expect(JSON.parse(String(init.body))).toMatchObject({ appid: 'wx-app', mchid: 'mch-1', out_trade_no: 'pay-1', amount: { total: 10, currency: 'CNY' }, payer: { openid: 'openid-1' } })
    expect((init.headers as Record<string, string>).Authorization).toContain('WECHATPAY2-SHA256-RSA2048')
    expect((init.headers as Record<string, string>)['Wechatpay-Serial']).toBe(config.wechatPublicKeyId)
  })

  test('rejectsUnsignedOrWrongKeyResponse', async () => {
    const unsigned = new WechatPayGateway(config, vi.fn(async () => signedResponse('{"prepay_id":"p"}', { omitSignature: true })))
    await expect(unsigned.createPrepay({ outTradeNo: 'a', openId: 'o', amountFen: 1, description: 'A' })).rejects.toThrow()
    const wrongKey = new WechatPayGateway(config, vi.fn(async () => signedResponse('{"prepay_id":"p"}', { serial: 'PUB_KEY_ID_OTHER' })))
    await expect(wrongKey.createPrepay({ outTradeNo: 'a', openId: 'o', amountFen: 1, description: 'A' })).rejects.toThrow()
  })

  test('treats signed retryable refund errors as an unknown outcome', async () => {
    for (const [status, code] of [[500, 'SYSTEM_ERROR'], [429, 'FREQUENCY_LIMITED']] as const) {
      const gateway = new WechatPayGateway(config, vi.fn(async () => signedResponse(JSON.stringify({ code }), { status })))
      await expect(gateway.createRefund({ outTradeNo: 'pay-1', outRefundNo: 'refund-1', amountFen: 1, totalFen: 10, reason: 'test' }))
        .rejects.toBeInstanceOf(WechatPayUnknownError)
    }
  })

  test('rejects a bill whose downloaded bytes do not match the signed hash', async () => {
    const billUrl = 'https://api.mch.weixin.qq.com/v3/bill/downloadurl?token=test'
    const metadata = JSON.stringify({ download_url: billUrl, hash_type: 'SHA1', hash_value: createHash('sha1').update('expected').digest('hex') })
    const fetcher = vi.fn(async (url: string) => url.includes('tradebill') ? signedResponse(metadata) : new Response('changed'))
    const gateway = new WechatPayGateway(config, fetcher)
    await expect(gateway.getTradeBill('2026-09-26')).rejects.toThrow(/hash/i)
  })

  test('queries payment and refund by merchant numbers and closes an unpaid payment', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes('/close')) return signedResponse('', { status: 204 })
      if (url.includes('/out-trade-no/')) return signedResponse(JSON.stringify({ appid: 'wx-app', mchid: 'mch-1', out_trade_no: 'pay-1', transaction_id: 'wx-tx-1', trade_state: 'SUCCESS', success_time: '2026-09-27T12:00:00+08:00', amount: { total: 10, currency: 'CNY' } }))
      return signedResponse(JSON.stringify({ out_trade_no: 'pay-1', out_refund_no: 'refund-1', refund_id: 'wx-refund-1', status: 'PROCESSING', create_time: '2026-09-27T12:00:00+08:00', amount: { refund: 1, total: 10 } }))
    })
    const gateway = new WechatPayGateway(config, fetcher)
    await expect(gateway.queryPayment('pay-1')).resolves.toMatchObject({ outTradeNo: 'pay-1', transactionId: 'wx-tx-1', amountFen: 10, tradeState: 'SUCCESS', successTime: '2026-09-27T12:00:00+08:00' })
    await expect(gateway.queryRefund('refund-1')).resolves.toMatchObject({ outRefundNo: 'refund-1', amountFen: 1, status: 'PROCESSING', createTime: '2026-09-27T12:00:00+08:00' })
    await expect(gateway.closePayment('pay-1')).resolves.toBeUndefined()
  })

  test('creates a refund using the original total and separate refund amount', async () => {
    const fetcher = vi.fn(async () => signedResponse(JSON.stringify({ out_trade_no: 'pay-1', out_refund_no: 'refund-1', refund_id: 'wx-refund-1', status: 'PROCESSING', create_time: '2026-09-27T12:00:00+08:00', amount: { refund: 1, total: 10 } })))
    const gateway = new WechatPayGateway(config, fetcher)
    await expect(gateway.createRefund({ outTradeNo: 'pay-1', outRefundNo: 'refund-1', amountFen: 1, totalFen: 10, reason: 'test' }))
      .resolves.toMatchObject({ outTradeNo: 'pay-1', outRefundNo: 'refund-1', amountFen: 1, totalFen: 10 })
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toMatchObject({ amount: { refund: 1, total: 10, currency: 'CNY' }, notify_url: config.refundNotifyUrl })
  })

  test('rejects a signed payment result with missing amount rather than treating NaN as money', async () => {
    const gateway = new WechatPayGateway(config, vi.fn(async () => signedResponse(JSON.stringify({ appid: 'wx-app', mchid: 'mch-1', out_trade_no: 'pay-1', trade_state: 'SUCCESS' }))))
    await expect(gateway.queryPayment('pay-1')).rejects.toThrow(/amount/i)
  })

  test('rejects a signed refund result whose amount is incomplete', async () => {
    const gateway = new WechatPayGateway(config, vi.fn(async () => signedResponse(JSON.stringify({ out_trade_no: 'pay-1', out_refund_no: 'refund-1', status: 'PROCESSING', amount: { total: 10 } }))))
    await expect(gateway.queryRefund('refund-1')).rejects.toThrow(/amount/i)
  })

  test('downloads a valid bill and rejects an untrusted download host', async () => {
    const bytes = Buffer.from('bill,bytes\n')
    const metadata = JSON.stringify({ download_url: 'https://api.mch.weixin.qq.com/v3/bill/downloadurl?token=test', hash_type: 'SHA1', hash_value: createHash('sha1').update(bytes).digest('hex') })
    const fetcher = vi.fn(async (url: string) => url.includes('tradebill') ? signedResponse(metadata) : new Response(bytes))
    await expect(new WechatPayGateway(config, fetcher).getTradeBill('2026-09-26')).resolves.toEqual(bytes)
    const badMeta = JSON.stringify({ download_url: 'https://evil.example/v3/bill/downloadurl', hash_type: 'SHA1', hash_value: createHash('sha1').update(bytes).digest('hex') })
    await expect(new WechatPayGateway(config, vi.fn(async () => signedResponse(badMeta))).getTradeBill('2026-09-26')).rejects.toThrow(/url/i)
  })

  test('verifies and decrypts a payment notification before exposing its content', () => {
    const nonce = '0123456789ab'
    const cipher = createCipheriv('aes-256-gcm', Buffer.from(config.apiV3Key), Buffer.from(nonce))
    cipher.setAAD(Buffer.from(''))
    const encrypted = Buffer.concat([cipher.update('{"out_trade_no":"pay-1"}'), cipher.final(), cipher.getAuthTag()]).toString('base64')
    const raw = JSON.stringify({ event_type: 'TRANSACTION.SUCCESS', resource: { algorithm: 'AEAD_AES_256_GCM', nonce, associated_data: '', ciphertext: encrypted } })
    const signature = sign('RSA-SHA256', Buffer.from(`1700000000\nnotice-nonce\n${raw}\n`), wechat.privateKey).toString('base64')
    const headers = { 'wechatpay-serial': config.wechatPublicKeyId, 'wechatpay-timestamp': '1700000000', 'wechatpay-nonce': 'notice-nonce', 'wechatpay-signature': signature }
    const gateway = new WechatPayGateway(config)
    expect(gateway.verifyNotification(headers, Buffer.from(raw))).toEqual({ eventType: 'TRANSACTION.SUCCESS', data: { out_trade_no: 'pay-1' } })
    expect(() => gateway.verifyNotification(headers, Buffer.from(`${raw} `))).toThrow()
  })
})
