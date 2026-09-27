import 'reflect-metadata'
import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { describe, expect, test, vi } from 'vitest'
import { NotificationController } from './notification.controller.js'
import { PaymentService, WECHAT_PAY_GATEWAY } from './payment.service.js'
import { WechatPaySecurityError } from './wechat-pay.gateway.js'
import { RefundService } from './refund.service.js'

const verifyNotification = vi.fn((headers: Record<string, string>, raw: Buffer) => {
  if (headers['wechatpay-signature'] !== 'trusted') throw new WechatPaySecurityError('invalid signature')
  return { eventType: JSON.parse(raw.toString('utf8')).event_type as string, data: { raw: raw.toString('utf8') } }
})
const applyVerifiedPayment = vi.fn(async () => {})
const applyVerifiedRefund = vi.fn(async () => {})

@Module({
  controllers: [NotificationController],
  providers: [
    { provide: WECHAT_PAY_GATEWAY, useValue: { verifyNotification } },
    { provide: PaymentService, useValue: { applyVerifiedPayment } },
    { provide: RefundService, useValue: { applyVerifiedRefund } }
  ]
})
class TestModule {}

describe('WeChat payment notification HTTP', () => {
  test('passes original bytes to verification before applying a trusted notification', async () => {
    const app = await NestFactory.create(TestModule, { logger: false, rawBody: true })
    await app.listen(0)
    try {
      const base = await app.getUrl()
      const raw = '{ "event_type" : "TRANSACTION.SUCCESS" }'
      const denied = await fetch(`${base}/payments/wechat/notify`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'wechatpay-signature': 'invalid' }, body: raw
      })
      expect(denied.status).toBe(401)
      expect(applyVerifiedPayment).not.toHaveBeenCalled()
      const accepted = await fetch(`${base}/payments/wechat/notify`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'wechatpay-signature': 'trusted' }, body: raw
      })
      expect(accepted.status).toBe(200)
      expect(await accepted.json()).toEqual({ code: 'SUCCESS', message: '成功' })
      expect(verifyNotification).toHaveBeenLastCalledWith(expect.any(Object), Buffer.from(raw))
      expect(applyVerifiedPayment).toHaveBeenCalledOnce()
    } finally { await app.close() }
  })

  test('requires a trusted signature for the refund callback too', async () => {
    const app = await NestFactory.create(TestModule, { logger: false, rawBody: true })
    await app.listen(0)
    try {
      const base = await app.getUrl()
      const raw = '{ "event_type" : "REFUND.SUCCESS" }'
      const denied = await fetch(`${base}/payments/wechat/refund-notify`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'wechatpay-signature': 'invalid' }, body: raw
      })
      expect(denied.status).toBe(401)
      expect(applyVerifiedRefund).not.toHaveBeenCalled()
      const accepted = await fetch(`${base}/payments/wechat/refund-notify`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'wechatpay-signature': 'trusted' }, body: raw
      })
      expect(accepted.status).toBe(200)
      expect(applyVerifiedRefund).toHaveBeenCalledWith({ eventType: 'REFUND.SUCCESS', data: { raw } })
    } finally { await app.close() }
  })
})
