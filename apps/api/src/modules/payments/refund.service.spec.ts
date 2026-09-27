import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { PrismaClient } from '../../generated/prisma/client.js'
import { RefundService } from './refund.service.js'
import { WechatPayRejectedError, WechatPayUnknownError, type WechatRefundResult } from './wechat-pay.gateway.js'

describe.skipIf(!process.env.TEST_DATABASE_URL)('RefundService', () => {
  let prisma: PrismaClient
  const userIds: string[] = []
  beforeAll(() => { prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL! }) }) })
  afterAll(async () => {
    await prisma.paymentEvent.deleteMany({ where: { payment: { userId: { in: userIds } } } })
    await prisma.refund.deleteMany({ where: { payment: { userId: { in: userIds } } } })
    await prisma.payment.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.user.deleteMany({ where: { id: { in: userIds } } })
    await prisma.$disconnect()
  })
  async function payment(status: 'PENDING' | 'SUCCEEDED' = 'SUCCEEDED') {
    const user = await prisma.user.create({ data: { wechatOpenId: `openid-${randomUUID()}` } })
    userIds.push(user.id)
    return prisma.payment.create({ data: {
      businessType: 'demo', businessOrderId: randomUUID(), idempotencyKey: randomUUID(), userId: user.id,
      amountFen: 10, description: 'Demo', outTradeNo: `P${randomUUID().replace(/-/g, '').slice(0, 30)}`,
      expiresAt: new Date(Date.now() + 60000), status, wechatTransactionId: status === 'SUCCEEDED' ? `tx-${randomUUID()}` : null
    } })
  }
  function gateway(p: Awaited<ReturnType<typeof payment>>) {
    return {
      queryPayment: vi.fn(async () => ({ outTradeNo: p.outTradeNo, transactionId: p.wechatTransactionId,
        tradeState: 'SUCCESS', amountFen: 10, currency: 'CNY', appId: 'wx-app', mchId: 'mch-1' })),
      createRefund: vi.fn(async (input: { outTradeNo: string; outRefundNo: string; amountFen: number; totalFen: number; reason: string }) => ({
        outTradeNo: input.outTradeNo, outRefundNo: input.outRefundNo, refundId: `wx-${input.outRefundNo}`,
        status: 'PROCESSING', amountFen: input.amountFen, totalFen: input.totalFen, createTime: '2026-09-27T12:00:00+08:00'
      })),
      queryRefund: vi.fn(async (outRefundNo: string): Promise<WechatRefundResult> => ({
        outTradeNo: p.outTradeNo, outRefundNo, refundId: `wx-${outRefundNo}`, status: 'PROCESSING', amountFen: 1, totalFen: 10,
        createTime: '2026-09-27T12:00:00+08:00'
      }))
    }
  }
  const config = { appId: 'wx-app', mchId: 'mch-1' }
  const input = (paymentId: string, amountFen = 1) => ({ paymentId, businessRefundId: randomUUID(), amountFen, reason: 'Requested by demo business' })

  test('rejects unpaid payment, invalid amount and over-refunding', async () => {
    const pending = await payment('PENDING')
    const paid = await payment()
    const service = new RefundService(prisma, gateway(paid), config)
    await expect(service.requestRefund(input(pending.id))).rejects.toThrow()
    await expect(service.requestRefund(input(paid.id, 0))).rejects.toThrow()
    await expect(service.requestRefund(input(paid.id, 11))).rejects.toThrow()
  })

  test('reserves cumulative amount under concurrent requests and supports idempotency', async () => {
    const paid = await payment()
    const fake = gateway(paid)
    const service = new RefundService(prisma, fake, config)
    const requests = [input(paid.id, 6), input(paid.id, 6)]
    const settled = await Promise.allSettled(requests.map((item) => service.requestRefund(item)))
    expect(settled.filter((item) => item.status === 'fulfilled')).toHaveLength(1)
    const accepted = settled.find((item) => item.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof service.requestRefund>>>
    const same = requests.find((item) => item.businessRefundId === (settled[0].status === 'fulfilled' ? requests[0] : requests[1]).businessRefundId)!
    expect((await service.requestRefund(same)).id).toBe(accepted.value.id)
    expect(fake.createRefund).toHaveBeenCalledTimes(1)
    expect(await prisma.refund.count({ where: { paymentId: paid.id } })).toBe(1)
  })

  test('reusesRefundNumberAfterUnknownResult', async () => {
    const paid = await payment()
    const fake = gateway(paid)
    fake.createRefund.mockRejectedValueOnce(new WechatPayUnknownError('timeout'))
    const service = new RefundService(prisma, fake, config)
    const request = input(paid.id)
    const first = await service.requestRefund(request)
    expect(first.status).toBe('UNKNOWN')
    const stored = await prisma.refund.findUniqueOrThrow({ where: { businessRefundId: request.businessRefundId } })
    const again = await service.requestRefund(request)
    expect(again.id).toBe(first.id)
    expect((await prisma.refund.findUniqueOrThrow({ where: { id: first.id } })).outRefundNo).toBe(stored.outRefundNo)
    expect(fake.queryRefund).toHaveBeenCalledWith(stored.outRefundNo)
    expect(fake.createRefund).toHaveBeenCalledTimes(1)
  })

  test('records WeChat acceptance time when an uncertain refund later succeeds', async () => {
    const paid = await payment()
    const fake = gateway(paid)
    fake.createRefund.mockRejectedValueOnce(new WechatPayUnknownError('timeout'))
    const service = new RefundService(prisma, fake, config)
    const first = await service.requestRefund(input(paid.id))
    fake.queryRefund.mockResolvedValueOnce({ outTradeNo: paid.outTradeNo,
      outRefundNo: (await prisma.refund.findUniqueOrThrow({ where: { id: first.id } })).outRefundNo,
      refundId: 'wx-refund', status: 'SUCCESS', amountFen: 1, totalFen: 10,
      createTime: '2026-09-26T23:59:30+08:00', successTime: '2026-09-27T00:01:00+08:00' })
    await service.refreshRefund(first.id)
    const stored = await prisma.refund.findUniqueOrThrow({ where: { id: first.id } })
    expect(stored.acceptedAt?.toISOString()).toBe('2026-09-26T15:59:30.000Z')
    expect(stored.succeededAt?.toISOString()).toBe('2026-09-26T16:01:00.000Z')
  })

  test('keeps ambiguous refund amount reserved and accepts a later success notice', async () => {
    const paid = await payment()
    const fake = gateway(paid)
    fake.createRefund.mockRejectedValueOnce(new WechatPayUnknownError('signed 500'))
    const service = new RefundService(prisma, fake, config)
    const first = await service.requestRefund(input(paid.id, 10))
    expect(first.status).toBe('UNKNOWN')
    await prisma.refund.update({ where: { id: first.id }, data: { createdAt: new Date(Date.now() - 120_000) } })
    await expect(service.requestRefund(input(paid.id, 1))).rejects.toThrow()
    const stored = await prisma.refund.findUniqueOrThrow({ where: { id: first.id } })
    fake.queryRefund.mockResolvedValueOnce({ outTradeNo: paid.outTradeNo, outRefundNo: stored.outRefundNo,
      refundId: 'wx-refund-late', status: 'SUCCESS', amountFen: stored.amountFen, totalFen: paid.amountFen,
      createTime: '2026-09-27T11:59:00+08:00', successTime: '2026-09-27T12:00:00+08:00' })
    await service.applyVerifiedRefund({ eventType: 'REFUND.SUCCESS', data: {
      mchid: 'mch-1', transaction_id: paid.wechatTransactionId, out_trade_no: paid.outTradeNo,
      out_refund_no: stored.outRefundNo, refund_id: 'wx-refund-late', refund_status: 'SUCCESS',
      success_time: '2026-09-27T12:00:00+08:00', amount: { total: paid.amountFen, refund: stored.amountFen }
    } })
    expect((await prisma.refund.findUniqueOrThrow({ where: { id: first.id } })).status).toBe('SUCCEEDED')
  })

  test('retries the same merchant refund number after a signed not-found query', async () => {
    const paid = await payment()
    const fake = gateway(paid)
    fake.createRefund.mockRejectedValueOnce(new WechatPayUnknownError('timeout'))
    const service = new RefundService(prisma, fake, config)
    const request = input(paid.id)
    const first = await service.requestRefund(request)
    fake.queryRefund.mockRejectedValueOnce(new WechatPayRejectedError(404, 'RESOURCE_NOT_EXISTS'))
    expect((await service.requestRefund(request)).status).toBe('PROCESSING')
    expect(fake.createRefund).toHaveBeenCalledTimes(2)
    expect(fake.createRefund.mock.calls[1]?.[0].outRefundNo).toBe(fake.createRefund.mock.calls[0]?.[0].outRefundNo)
    expect((await prisma.refund.findUniqueOrThrow({ where: { id: first.id } })).status).toBe('PROCESSING')
  })

  test('enforces one-minute interval and releases reservation after CLOSED', async () => {
    const paid = await payment()
    const service = new RefundService(prisma, gateway(paid), config)
    const first = await service.requestRefund(input(paid.id, 8))
    await expect(service.requestRefund(input(paid.id, 3))).rejects.toThrow()
    await prisma.refund.update({ where: { id: first.id }, data: { createdAt: new Date(Date.now() - 120_000), status: 'CLOSED' } })
    expect((await service.requestRefund(input(paid.id, 10))).status).toBe('PROCESSING')
  })

  test('limits attempts to 50 even when prior refunds closed', async () => {
    const paid = await payment()
    const service = new RefundService(prisma, gateway(paid), config)
    await prisma.refund.createMany({ data: Array.from({ length: 50 }, (_, index) => ({
      paymentId: paid.id, businessRefundId: randomUUID(), amountFen: 1, reason: 'test',
      outRefundNo: `R${randomUUID().replace(/-/g, '').slice(0, 30)}`,
      status: 'CLOSED' as const, createdAt: new Date(Date.now() - 120_000 - index * 60_000)
    })) })
    await expect(service.requestRefund(input(paid.id))).rejects.toThrow()
  })
})
