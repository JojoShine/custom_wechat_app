import 'reflect-metadata'
import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { SignJWT } from 'jose'
import { AccessGuard } from '../auth/access.guard.js'
import { DemoPaymentsController } from './demo-payments.controller.js'
import { DemoPaymentsService } from './demo-payments.service.js'

const createOrder = vi.fn(async (userId: string) => ({ order: { id: 'order-1', priceFen: 10, status: 'CREATED' }, userId }))
const requestRefund = vi.fn(async () => ({ id: 'refund-1', amountFen: 1 }))

@Module({ controllers: [DemoPaymentsController], providers: [AccessGuard,
  { provide: DemoPaymentsService, useValue: { createOrder, getOrder: async () => null, requestRefund } }
] })
class TestModule {}

it('requires login and rejects client-selected prices and refund amounts', async () => {
  process.env.JWT_SECRET = 'test-secret-long-enough-for-hmac-signing'
  const app = await NestFactory.create(TestModule, { logger: false })
  await app.listen(0)
  try {
    const base = await app.getUrl()
    expect((await fetch(`${base}/demo/payments/orders`, { method: 'POST' })).status).toBe(401)
    const token = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject('owner').setExpirationTime('15m').sign(new TextEncoder().encode(process.env.JWT_SECRET))
    const headers = { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }
    expect((await fetch(`${base}/demo/payments/orders`, { method: 'POST', headers, body: JSON.stringify({ amountFen: 1 }) })).status).toBe(400)
    expect(createOrder).not.toHaveBeenCalled()
    const accepted = await fetch(`${base}/demo/payments/orders`, { method: 'POST', headers, body: '{}' })
    expect(accepted.status).toBe(201)
    expect(createOrder).toHaveBeenCalledWith('owner')
    expect((await fetch(`${base}/demo/payments/orders/order-1/refunds`, { method: 'POST', headers,
      body: JSON.stringify({ requestId: 'once', amountFen: 5 }) })).status).toBe(400)
    expect(requestRefund).not.toHaveBeenCalled()
  } finally { await app.close() }
})
