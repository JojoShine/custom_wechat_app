import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { PrismaClient } from '../../generated/prisma/client.js'
import { RefundService } from './refund.service.js'

describe.skipIf(!process.env.TEST_DATABASE_URL)('verified refund notifications', () => {
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
  async function fixture() {
    const user = await prisma.user.create({ data: { wechatOpenId: `openid-${randomUUID()}` } })
    userIds.push(user.id)
    const payment = await prisma.payment.create({ data: {
      businessType: 'demo', businessOrderId: randomUUID(), idempotencyKey: randomUUID(), userId: user.id,
      amountFen: 10, description: 'Demo', outTradeNo: `P${randomUUID().replace(/-/g, '').slice(0, 30)}`,
      wechatTransactionId: `tx-${randomUUID()}`, expiresAt: new Date(Date.now() + 60000), status: 'SUCCEEDED'
    } })
    const refund = await prisma.refund.create({ data: {
      paymentId: payment.id, businessRefundId: randomUUID(), amountFen: 6, reason: 'Demo',
      outRefundNo: `R${randomUUID().replace(/-/g, '').slice(0, 30)}`, status: 'PROCESSING'
    } })
    return { payment, refund }
  }
  const gateway = { queryPayment: async () => { throw new Error('unused') }, createRefund: async () => { throw new Error('unused') },
    queryRefund: async (outRefundNo: string) => {
      const refund = await prisma.refund.findUniqueOrThrow({ where: { outRefundNo }, include: { payment: true } })
      return { outTradeNo: refund.payment.outTradeNo, outRefundNo, refundId: `wx-${refund.id}`,
        status: 'PROCESSING', amountFen: refund.amountFen, totalFen: refund.payment.amountFen,
        createTime: '2026-09-27T11:59:00+08:00' }
    } }
  function notice(payment: Awaited<ReturnType<typeof fixture>>['payment'], refund: Awaited<ReturnType<typeof fixture>>['refund'], status = 'SUCCESS') {
    return { eventType: `REFUND.${status}`, data: {
      mchid: 'mch-1', transaction_id: payment.wechatTransactionId,
      out_trade_no: payment.outTradeNo, out_refund_no: refund.outRefundNo,
      refund_id: `wx-${refund.id}`, refund_status: status,
      success_time: '2026-09-27T12:00:00+08:00', amount: { total: 10, refund: 6 }
    } }
  }

  test('rejects mismatched merchant, order, amount and status', async () => {
    const { payment, refund } = await fixture()
    const service = new RefundService(prisma, gateway, { appId: 'wx-app', mchId: 'mch-1' })
    for (const data of [{ mchid: 'other' }, { out_trade_no: 'other' }, { amount: { total: 10, refund: 7 } }, { refund_status: 'CLOSED' }]) {
      await expect(service.applyVerifiedRefund({ ...notice(payment, refund), data: { ...notice(payment, refund).data, ...data } })).rejects.toThrow()
    }
    expect((await prisma.refund.findUniqueOrThrow({ where: { id: refund.id } })).status).toBe('PROCESSING')
  })

  test('applies duplicate success once and preserves terminal status against stale abnormal', async () => {
    const { payment, refund } = await fixture()
    const service = new RefundService(prisma, gateway, { appId: 'wx-app', mchId: 'mch-1' })
    await Promise.all([service.applyVerifiedRefund(notice(payment, refund)), service.applyVerifiedRefund(notice(payment, refund))])
    await service.applyVerifiedRefund(notice(payment, refund, 'ABNORMAL'))
    const stored = await prisma.refund.findUniqueOrThrow({ where: { id: refund.id } })
    expect(stored.status).toBe('SUCCEEDED')
    expect(stored.acceptedAt?.toISOString()).toBe('2026-09-27T03:59:00.000Z')
    expect(stored.succeededAt?.toISOString()).toBe('2026-09-27T04:00:00.000Z')
    expect(await prisma.paymentEvent.count({ where: { refundId: refund.id, status: 'SUCCEEDED' } })).toBe(1)
  })

  test('keeps ABNORMAL reserved and records CLOSED as released', async () => {
    const { payment, refund } = await fixture()
    const service = new RefundService(prisma, gateway, { appId: 'wx-app', mchId: 'mch-1' })
    await service.applyVerifiedRefund(notice(payment, refund, 'ABNORMAL'))
    expect((await prisma.refund.findUniqueOrThrow({ where: { id: refund.id } })).status).toBe('ABNORMAL')
    await service.applyVerifiedRefund(notice(payment, refund, 'CLOSED'))
    expect((await prisma.refund.findUniqueOrThrow({ where: { id: refund.id } })).status).toBe('CLOSED')
    expect(await prisma.paymentEvent.count({ where: { refundId: refund.id } })).toBe(2)
  })
})
