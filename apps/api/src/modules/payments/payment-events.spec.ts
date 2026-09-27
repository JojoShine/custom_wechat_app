import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { PrismaClient } from '../../generated/prisma/client.js'
import { PaymentEvents } from './payment-events.js'

describe.skipIf(!process.env.TEST_DATABASE_URL)('payment business events', () => {
  let prisma: PrismaClient
  const userIds: string[] = []
  beforeAll(() => { prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL! }) }) })
  afterAll(async () => {
    await prisma.paymentEvent.deleteMany({ where: { payment: { userId: { in: userIds } } } })
    await prisma.payment.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.user.deleteMany({ where: { id: { in: userIds } } })
    await prisma.$disconnect()
  })

  async function event() {
    const user = await prisma.user.create({ data: { wechatOpenId: `openid-${randomUUID()}` } })
    userIds.push(user.id)
    const payment = await prisma.payment.create({ data: {
      businessType: `test-${randomUUID()}`, businessOrderId: randomUUID(), idempotencyKey: randomUUID(), userId: user.id,
      amountFen: 10, description: 'Demo', outTradeNo: `P${randomUUID().replace(/-/g, '').slice(0, 30)}`,
      expiresAt: new Date(Date.now() + 60000), status: 'SUCCEEDED'
    } })
    return prisma.paymentEvent.create({ data: {
      eventKey: randomUUID(), paymentId: payment.id, businessType: payment.businessType, businessOrderId: payment.businessOrderId,
      kind: 'PAYMENT', status: 'SUCCEEDED', amountFen: 10
    } })
  }

  test('retries a failed consumer and marks delivery only after business work succeeds', async () => {
    const pending = await event()
    const events = new PaymentEvents(prisma)
    let calls = 0
    let businessUpdates = 0
    events.register(pending.businessType, async () => {
      calls++
      if (calls === 1) throw new Error('temporary failure')
      businessUpdates++
    })
    expect(await events.dispatchPending()).toBe(0)
    expect((await prisma.paymentEvent.findUniqueOrThrow({ where: { id: pending.id } })).deliveredAt).toBeNull()
    await prisma.paymentEvent.update({ where: { id: pending.id }, data: { nextAttemptAt: new Date(0) } })
    expect(await events.dispatchPending()).toBe(1)
    expect(businessUpdates).toBe(1)
    expect((await prisma.paymentEvent.findUniqueOrThrow({ where: { id: pending.id } })).deliveredAt).not.toBeNull()
  })

  test('keeps an event pending when its business module has no consumer', async () => {
    const pending = await event()
    const events = new PaymentEvents(prisma)
    expect(await events.dispatchPending()).toBe(0)
    expect((await prisma.paymentEvent.findUniqueOrThrow({ where: { id: pending.id } })).deliveredAt).toBeNull()
  })
})
