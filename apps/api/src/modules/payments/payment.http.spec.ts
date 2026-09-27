import 'reflect-metadata'
import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { SignJWT } from 'jose'
import { AccessGuard } from '../auth/access.guard.js'
import { PaymentController } from './payment.controller.js'
import { PaymentService } from './payment.service.js'

const payment = { id: 'payment-1', businessType: 'demo', businessOrderId: 'order-1', amountFen: 10, status: 'PENDING', createdAt: '2026-09-27T00:00:00.000Z' }
const getPayment = vi.fn(async (userId: string, id: string) => userId === 'user-1' && id === payment.id ? payment : null)

@Module({ controllers: [PaymentController], providers: [AccessGuard, { provide: PaymentService, useValue: { getPayment } }] })
class TestModule {}

it('requires a session and passes only the authenticated user to the payment query', async () => {
  process.env.JWT_SECRET = 'test-secret-long-enough-for-hmac-signing'
  const app = await NestFactory.create(TestModule, { logger: false })
  await app.listen(0)
  try {
    const base = await app.getUrl()
    expect((await fetch(`${base}/payments/payment-1`)).status).toBe(401)
    const token = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject('user-1').setExpirationTime('15m').sign(new TextEncoder().encode(process.env.JWT_SECRET))
    const response = await fetch(`${base}/payments/payment-1`, { headers: { Authorization: `Bearer ${token}` } })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(payment)
    expect(getPayment).toHaveBeenCalledWith('user-1', 'payment-1')
  } finally { await app.close() }
})
