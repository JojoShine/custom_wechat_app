import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { PrismaClient } from '../../generated/prisma/client.js'
import { PaymentRecovery } from './payment-recovery.js'
import type { PaymentService } from './payment.service.js'
import type { RefundService } from './refund.service.js'
import type { PaymentEvents } from './payment-events.js'

describe.skipIf(!process.env.TEST_DATABASE_URL)('PaymentRecovery', () => {
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
  async function payment(status: 'PENDING' | 'SUCCEEDED', expiresAt: Date) {
    const user = await prisma.user.create({ data: { wechatOpenId: `openid-${randomUUID()}` } })
    userIds.push(user.id)
    return prisma.payment.create({ data: {
      businessType: 'demo', businessOrderId: randomUUID(), idempotencyKey: randomUUID(), userId: user.id,
      amountFen: 10, description: 'Demo', outTradeNo: `P${randomUUID().replace(/-/g, '').slice(0, 30)}`,
      expiresAt, status
    } })
  }
  function services() {
    const payments = { refreshPayment: vi.fn(async (_id: string) => ({ status: 'SUCCEEDED' })), closeExpired: vi.fn(async (_id: string) => {}) }
    const refunds = { refreshRefund: vi.fn(async (_id: string) => ({ status: 'SUCCEEDED' })) }
    const events = { dispatchPending: vi.fn(async () => 1) }
    return { payments, refunds, events, recovery: new PaymentRecovery(prisma, payments as unknown as PaymentService,
      refunds as unknown as RefundService, events as unknown as PaymentEvents) }
  }

  test('scans pending payment, closes expired payment, queries processing refund and redelivers events', async () => {
    const now = new Date()
    const pending = await payment('PENDING', new Date(now.getTime() + 60000))
    const expired = await payment('PENDING', new Date(now.getTime() - 60000))
    const paid = await payment('SUCCEEDED', new Date(now.getTime() + 60000))
    const refund = await prisma.refund.create({ data: {
      paymentId: paid.id, businessRefundId: randomUUID(), amountFen: 1, reason: 'Demo',
      outRefundNo: `R${randomUUID().replace(/-/g, '').slice(0, 30)}`, status: 'PROCESSING',
      createdAt: new Date(now.getTime() - 120000)
    } })
    const { recovery, payments, refunds, events } = services()
    const result = await recovery.runOnce(now)
    expect(result.payments).toBeGreaterThanOrEqual(2)
    expect(result.refunds).toBeGreaterThanOrEqual(1)
    expect(result.events).toBe(1)
    expect(payments.refreshPayment).toHaveBeenCalledWith(pending.id)
    expect(payments.closeExpired).toHaveBeenCalledWith(expired.id)
    expect(refunds.refreshRefund).toHaveBeenCalledWith(refund.id)
    expect(events.dispatchPending).toHaveBeenCalledOnce()
  })

  test('logs transient failures and retries the same item on the next run', async () => {
    const now = new Date()
    const pending = await payment('PENDING', new Date(now.getTime() + 180000))
    const { recovery, payments } = services()
    payments.refreshPayment.mockRejectedValueOnce(new Error('temporary network failure'))
    await recovery.runOnce(now)
    await recovery.runOnce(new Date(now.getTime() + 61000))
    expect(payments.refreshPayment.mock.calls.filter(([id]) => id === pending.id)).toHaveLength(2)
  })

  test('allows only one instance to hold the recovery lease', async () => {
    const now = new Date()
    await payment('PENDING', new Date(now.getTime() + 180000))
    const { recovery, payments } = services()
    let entered!: () => void
    const started = new Promise<void>((resolve) => { entered = resolve })
    let release!: () => void
    const blocked = new Promise<void>((resolve) => { release = resolve })
    payments.refreshPayment.mockImplementation(async () => { entered(); await blocked; return { status: 'SUCCEEDED' } })
    const first = recovery.runOnce(now)
    await started
    const second = await recovery.runOnce(now)
    expect(second).toEqual({ payments: 0, refunds: 0, events: 0 })
    release()
    await first
  })
})
