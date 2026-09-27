import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { PrismaClient } from '../../generated/prisma/client.js'
import { AppModule } from '../../app.module.js'
import { PaymentService } from '../payments/payment.service.js'
import { RefundService } from '../payments/refund.service.js'
import { PaymentEvents, type BusinessPaymentEvent } from '../payments/payment-events.js'
import { DemoPaymentsModule } from './demo-payments.module.js'
import { DemoPaymentsService } from './demo-payments.service.js'

test('demoRoutesDisabledByDefault', () => {
  expect(process.env.DEMO_PAYMENTS_ENABLED).not.toBe('true')
  expect(Reflect.getMetadata('imports', AppModule)).not.toContain(DemoPaymentsModule)
})

describe.skipIf(!process.env.TEST_DATABASE_URL)('demo payment business', () => {
  let prisma: PrismaClient
  const userIds: string[] = []
  beforeAll(() => { prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL! }) }) })
  afterAll(async () => {
    await prisma.demoPaymentOrder.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.user.deleteMany({ where: { id: { in: userIds } } })
    await prisma.$disconnect()
  })
  async function user() {
    const result = await prisma.user.create({ data: { wechatOpenId: `openid-${randomUUID()}` } })
    userIds.push(result.id)
    return result
  }
  function service() {
    let handler!: (event: BusinessPaymentEvent) => Promise<void>
    const payments = { createPrepay: vi.fn(async (input: { businessOrderId: string; amountFen: number }) => ({
      payment: { id: randomUUID(), businessType: 'demo', businessOrderId: input.businessOrderId, amountFen: input.amountFen,
        status: 'PENDING' as const, createdAt: new Date().toISOString() },
      launch: { timeStamp: '1', nonceStr: 'nonce', package: 'prepay_id=demo', signType: 'RSA' as const, paySign: 'sig' }
    })) }
    const refunds = { requestRefund: vi.fn(async (input: { paymentId: string; businessRefundId: string; amountFen: number }) => ({
      id: randomUUID(), paymentId: input.paymentId, amountFen: input.amountFen, status: 'PROCESSING' as const, createdAt: new Date().toISOString()
    })) }
    const events = { register: vi.fn((_type: string, callback: (event: BusinessPaymentEvent) => Promise<void>) => { handler = callback }) }
    const demo = new DemoPaymentsService(prisma, payments as unknown as PaymentService,
      refunds as unknown as RefundService, events as unknown as PaymentEvents)
    demo.onModuleInit()
    return { demo, payments, refunds, handler: () => handler }
  }

  test('creates fixed-price server-side order and only fulfils verified payment event once', async () => {
    const owner = await user()
    const { demo, payments, handler } = service()
    const created = await demo.createOrder(owner.id)
    expect(created.order.priceFen).toBe(10)
    expect(payments.createPrepay).toHaveBeenCalledWith(expect.objectContaining({ userId: owner.id, amountFen: 10, businessOrderId: created.order.id }))
    const event = { id: randomUUID(), paymentId: created.payment.id, refundId: null, businessType: 'demo',
      businessOrderId: created.order.id, kind: 'PAYMENT', status: 'SUCCEEDED', amountFen: 10 }
    await handler()(event)
    await handler()(event)
    expect((await prisma.demoPaymentOrder.findUniqueOrThrow({ where: { id: created.order.id } })).status).toBe('PAID')
    expect((await demo.getOrder(owner.id, created.order.id)).status).toBe('PAID')
  })

  test('rejects another user and chooses one-fen refunds in business service', async () => {
    const owner = await user()
    const stranger = await user()
    const { demo, refunds, handler } = service()
    const created = await demo.createOrder(owner.id)
    await expect(demo.getOrder(stranger.id, created.order.id)).rejects.toThrow()
    await expect(demo.requestRefund(owner.id, created.order.id, randomUUID())).rejects.toThrow()
    await handler()({ id: randomUUID(), paymentId: created.payment.id, refundId: null,
      businessType: 'demo', businessOrderId: created.order.id, kind: 'PAYMENT', status: 'SUCCEEDED', amountFen: 10 })
    const requestId = randomUUID()
    const refund = await demo.requestRefund(owner.id, created.order.id, requestId)
    expect(refund.amountFen).toBe(1)
    expect(refunds.requestRefund).toHaveBeenCalledWith({ paymentId: created.payment.id,
      businessRefundId: `demo:${created.order.id}:${requestId}`, amountFen: 1, reason: 'Demo refund' })
    await expect(demo.requestRefund(stranger.id, created.order.id, randomUUID())).rejects.toThrow()
  })
})
