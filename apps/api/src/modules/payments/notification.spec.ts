import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { PrismaClient } from '../../generated/prisma/client.js'
import { PaymentService } from './payment.service.js'

describe.skipIf(!process.env.TEST_DATABASE_URL)('verified payment notifications', () => {
  let prisma: PrismaClient
  const userIds: string[] = []
  const config = { appId: 'wx-app', mchId: 'mch-1', merchantPrivateKey: 'unused' }
  const gateway = { createPrepay: async () => ({ prepayId: 'p' }), queryPayment: async () => { throw new Error('unexpected query') }, closePayment: async () => {} }

  beforeAll(() => { prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL! }) }) })
  afterAll(async () => {
    await prisma.paymentEvent.deleteMany({ where: { payment: { userId: { in: userIds } } } })
    await prisma.payment.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.user.deleteMany({ where: { id: { in: userIds } } })
    await prisma.$disconnect()
  })

  async function pendingPayment() {
    const user = await prisma.user.create({ data: { wechatOpenId: `openid-${randomUUID()}` } })
    userIds.push(user.id)
    return prisma.payment.create({ data: {
      businessType: 'demo', businessOrderId: randomUUID(), idempotencyKey: randomUUID(), userId: user.id,
      amountFen: 10, description: 'Demo', outTradeNo: `P${randomUUID().replace(/-/g, '').slice(0, 30)}`,
      expiresAt: new Date(Date.now() + 60000), status: 'PENDING'
    } })
  }

  function notice(payment: Awaited<ReturnType<typeof pendingPayment>>, changes: Record<string, unknown> = {}) {
    return { eventType: 'TRANSACTION.SUCCESS', data: {
      appid: 'wx-app', mchid: 'mch-1', out_trade_no: payment.outTradeNo,
      transaction_id: `tx-${payment.id}`, trade_state: 'SUCCESS',
      amount: { total: 10, currency: 'CNY' }, ...changes
    } }
  }

  test('accepts a trusted success once and writes one durable business event', async () => {
    const payment = await pendingPayment()
    const service = new PaymentService(prisma, gateway, config)
    await Promise.all([service.applyVerifiedPayment(notice(payment)), service.applyVerifiedPayment(notice(payment))])
    const stored = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })
    expect(stored).toMatchObject({ status: 'SUCCEEDED', wechatTransactionId: `tx-${payment.id}` })
    expect(await prisma.paymentEvent.count({ where: { paymentId: payment.id, status: 'SUCCEEDED' } })).toBe(1)
  })

  test('rejects wrong merchant, amount or order identity without changing payment', async () => {
    const payment = await pendingPayment()
    const service = new PaymentService(prisma, gateway, config)
    for (const changes of [{ mchid: 'other' }, { amount: { total: 11, currency: 'CNY' } }, { out_trade_no: 'other' }]) {
      await expect(service.applyVerifiedPayment(notice(payment, changes))).rejects.toThrow()
    }
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe('PENDING')
    expect(await prisma.paymentEvent.count({ where: { paymentId: payment.id } })).toBe(0)
  })

  test('does not regress a confirmed payment when a delayed pending query arrives', async () => {
    const payment = await pendingPayment()
    const service = new PaymentService(prisma, {
      ...gateway,
      queryPayment: async () => ({ outTradeNo: payment.outTradeNo, transactionId: null, tradeState: 'NOTPAY', amountFen: 10, currency: 'CNY', appId: 'wx-app', mchId: 'mch-1' })
    }, config)
    await service.applyVerifiedPayment(notice(payment))
    expect((await service.refreshPayment(payment.id)).status).toBe('SUCCEEDED')
    expect(await prisma.paymentEvent.count({ where: { paymentId: payment.id } })).toBe(1)
  })

  test('rejects a different transaction ID after confirmation', async () => {
    const payment = await pendingPayment()
    const service = new PaymentService(prisma, gateway, config)
    await service.applyVerifiedPayment(notice(payment))
    await expect(service.applyVerifiedPayment(notice(payment, { transaction_id: 'other' }))).rejects.toThrow()
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).wechatTransactionId).toBe(`tx-${payment.id}`)
  })
})
