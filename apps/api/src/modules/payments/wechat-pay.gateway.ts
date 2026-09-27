import { createHash, randomBytes } from 'node:crypto'
import type { WechatPayConfig } from '../../common/config/app-config.js'
import { buildRequestMessage, decryptResource, signMessage, verifySignedMessage, type EncryptedResource } from './wechat-pay.crypto.js'

const BASE_URL = 'https://api.mch.weixin.qq.com'
type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

export interface WechatPaymentResult {
  outTradeNo: string
  transactionId: string | null
  tradeState: string
  amountFen: number
  currency: string
  appId: string
  mchId: string
  successTime?: string
}

export interface WechatRefundResult {
  outTradeNo: string
  outRefundNo: string
  refundId: string | null
  status: string
  amountFen: number
  totalFen: number
  createTime?: string
  successTime?: string
}

export function wechatTime(value: unknown): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new WechatPayUnknownError('Missing or invalid WeChat Pay time')
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new WechatPayUnknownError('Invalid WeChat Pay time')
  return date
}

export type VerifiedNotification = { eventType: string; data: Record<string, unknown> }

export class WechatPaySecurityError extends Error {}
export class WechatPayUnknownError extends Error {}
export class WechatPayRejectedError extends Error {
  constructor(readonly status: number, readonly code: string) { super(`WeChat Pay rejected request: ${code}`) }
}

export class WechatPayGateway {
  constructor(private readonly config: WechatPayConfig, private readonly fetcher: Fetcher = fetch) {}

  private authorization(method: string, path: string, body: string): string {
    const timestamp = Math.floor(Date.now() / 1000)
    const nonce = randomBytes(16).toString('hex')
    const signature = signMessage(this.config.merchantPrivateKey, buildRequestMessage(method, path, timestamp, nonce, body))
    return `WECHATPAY2-SHA256-RSA2048 mchid="${this.config.mchId}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${this.config.merchantSerial}",signature="${signature}"`
  }

  private async signedRequest<T>(method: string, path: string, payload?: object): Promise<T> {
    const body = payload === undefined ? '' : JSON.stringify(payload)
    let response: Response
    try {
      response = await this.fetcher(`${BASE_URL}${path}`, {
        method,
        headers: { Authorization: this.authorization(method, path, body), Accept: 'application/json', 'Content-Type': 'application/json', 'Wechatpay-Serial': this.config.wechatPublicKeyId },
        ...(body ? { body } : {}),
        signal: AbortSignal.timeout(10000)
      })
    } catch {
      throw new WechatPayUnknownError('WeChat Pay request outcome unknown')
    }
    const rawBody = await response.text()
    const serial = response.headers.get('wechatpay-serial')
    const signature = response.headers.get('wechatpay-signature')
    const timestamp = response.headers.get('wechatpay-timestamp')
    const nonce = response.headers.get('wechatpay-nonce')
    if (serial !== this.config.wechatPublicKeyId || !verifySignedMessage(this.config.wechatPublicKey, timestamp ?? '', nonce ?? '', rawBody, signature ?? '')) {
      throw new WechatPaySecurityError('Untrusted WeChat Pay response')
    }
    if (!response.ok) {
      let code = 'UNKNOWN'
      try { code = (JSON.parse(rawBody) as { code?: string }).code ?? code } catch { /* signed non-JSON error */ }
      if (response.status >= 500 || response.status === 429 || code === 'SYSTEM_ERROR' || code === 'FREQUENCY_LIMITED') {
        throw new WechatPayUnknownError(`WeChat Pay request outcome unknown: ${code}`)
      }
      throw new WechatPayRejectedError(response.status, code)
    }
    if (!rawBody) return undefined as T
    try { return JSON.parse(rawBody) as T } catch { throw new WechatPayUnknownError('Malformed WeChat Pay response') }
  }

  async createPrepay(input: { outTradeNo: string; openId: string; amountFen: number; description: string }): Promise<{ prepayId: string }> {
    const result = await this.signedRequest<{ prepay_id: string }>('POST', '/v3/pay/transactions/jsapi', {
      appid: this.config.appId, mchid: this.config.mchId, description: input.description,
      out_trade_no: input.outTradeNo, notify_url: this.config.paymentNotifyUrl,
      amount: { total: input.amountFen, currency: 'CNY' }, payer: { openid: input.openId }
    })
    if (!result?.prepay_id) throw new WechatPayUnknownError('Missing prepay ID')
    return { prepayId: result.prepay_id }
  }

  async queryPayment(outTradeNo: string): Promise<WechatPaymentResult> {
    const value = await this.signedRequest<Record<string, unknown>>('GET', `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}?mchid=${encodeURIComponent(this.config.mchId)}`)
    const amount = value.amount as { total?: number; currency?: string } | undefined
    const total = amount?.total
    if (typeof total !== 'number' || !Number.isInteger(total) || total <= 0) throw new WechatPayUnknownError('Invalid WeChat Pay payment amount')
    if (value.trade_state === 'SUCCESS') wechatTime(value.success_time)
    return {
      outTradeNo: String(value.out_trade_no ?? ''), transactionId: value.transaction_id ? String(value.transaction_id) : null,
      tradeState: String(value.trade_state ?? ''), amountFen: total, currency: String(amount?.currency ?? ''),
      appId: String(value.appid ?? ''), mchId: String(value.mchid ?? ''),
      ...(value.success_time ? { successTime: String(value.success_time) } : {})
    }
  }

  async closePayment(outTradeNo: string): Promise<void> {
    await this.signedRequest<void>('POST', `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}/close`, { mchid: this.config.mchId })
  }

  async createRefund(input: { outTradeNo: string; outRefundNo: string; amountFen: number; totalFen: number; reason: string }): Promise<WechatRefundResult> {
    const value = await this.signedRequest<Record<string, unknown>>('POST', '/v3/refund/domestic/refunds', {
      out_trade_no: input.outTradeNo, out_refund_no: input.outRefundNo, reason: input.reason,
      notify_url: this.config.refundNotifyUrl, amount: { refund: input.amountFen, total: input.totalFen, currency: 'CNY' }
    })
    return this.refundResult(value)
  }

  async queryRefund(outRefundNo: string): Promise<WechatRefundResult> {
    return this.refundResult(await this.signedRequest<Record<string, unknown>>('GET', `/v3/refund/domestic/refunds/${encodeURIComponent(outRefundNo)}`))
  }

  private refundResult(value: Record<string, unknown>): WechatRefundResult {
    const amount = value.amount as { refund?: number; total?: number } | undefined
    const refundFen = amount?.refund
    const totalFen = amount?.total
    if (typeof refundFen !== 'number' || !Number.isInteger(refundFen) || refundFen <= 0 ||
      typeof totalFen !== 'number' || !Number.isInteger(totalFen) || totalFen < refundFen) {
      throw new WechatPayUnknownError('Invalid WeChat Pay refund amount')
    }
    wechatTime(value.create_time)
    if (value.status === 'SUCCESS') wechatTime(value.success_time)
    return {
      outTradeNo: String(value.out_trade_no ?? ''), outRefundNo: String(value.out_refund_no ?? ''),
      refundId: value.refund_id ? String(value.refund_id) : null, status: String(value.status ?? ''),
      amountFen: refundFen, totalFen,
      ...(value.create_time ? { createTime: String(value.create_time) } : {}),
      ...(value.success_time ? { successTime: String(value.success_time) } : {})
    }
  }

  verifyNotification(headers: Record<string, string>, rawBody: Buffer): VerifiedNotification {
    const normalized = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]))
    if (normalized['wechatpay-serial'] !== this.config.wechatPublicKeyId ||
      !verifySignedMessage(this.config.wechatPublicKey, normalized['wechatpay-timestamp'] ?? '', normalized['wechatpay-nonce'] ?? '', rawBody.toString('utf8'), normalized['wechatpay-signature'] ?? '')) {
      throw new WechatPaySecurityError('Untrusted WeChat Pay notification')
    }
    let notification: { event_type?: string; resource?: EncryptedResource }
    try { notification = JSON.parse(rawBody.toString('utf8')) } catch { throw new WechatPaySecurityError('Malformed WeChat Pay notification') }
    if (!notification.resource || !notification.event_type) throw new WechatPaySecurityError('Missing WeChat Pay notification resource')
    let data: Record<string, unknown>
    try { data = JSON.parse(decryptResource(this.config.apiV3Key, notification.resource)) } catch { throw new WechatPaySecurityError('Invalid WeChat Pay notification resource') }
    return { eventType: notification.event_type, data }
  }

  async getTradeBill(date: string): Promise<Buffer> {
    const meta = await this.signedRequest<{ download_url: string; hash_type: string; hash_value: string }>('GET', `/v3/bill/tradebill?bill_date=${encodeURIComponent(date)}&bill_type=ALL`)
    const url = new URL(meta.download_url)
    if (url.protocol !== 'https:' || url.hostname !== 'api.mch.weixin.qq.com' || !url.pathname.startsWith('/v3/bill/downloadurl')) {
      throw new WechatPaySecurityError('Untrusted WeChat Pay bill URL')
    }
    if (meta.hash_type !== 'SHA1' && meta.hash_type !== 'SHA256') throw new WechatPaySecurityError('Unsupported WeChat Pay bill hash')
    let response: Response
    try {
      const path = `${url.pathname}${url.search}`
      response = await this.fetcher(url.toString(), { method: 'GET', headers: { Authorization: this.authorization('GET', path, ''), Accept: '*/*', 'Wechatpay-Serial': this.config.wechatPublicKeyId }, signal: AbortSignal.timeout(10000) })
    } catch { throw new WechatPayUnknownError('WeChat Pay bill download outcome unknown') }
    if (!response.ok) throw new WechatPayUnknownError('WeChat Pay bill download failed')
    const bytes = Buffer.from(await response.arrayBuffer())
    const actual = createHash(meta.hash_type.toLowerCase()).update(bytes).digest('hex')
    if (actual.toLowerCase() !== meta.hash_value.toLowerCase()) throw new WechatPaySecurityError('WeChat Pay bill hash mismatch')
    return bytes
  }
}
