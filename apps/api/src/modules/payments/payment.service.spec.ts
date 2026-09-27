import { generateKeyPairSync, randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { PrismaClient } from '../../generated/prisma/client.js'
import { WechatPayUnknownError, type WechatPaymentResult } from './wechat-pay.gateway.js'
import { PaymentService } from './payment.service.js'

const key = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
const config = { appId: 'wx-app', mchId: 'mch-1', merchantPrivateKey: key }

describe.skipIf(!process.env.TEST_DATABASE_URL)('PaymentService', () => {
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

  async function user() {
    const created = await prisma.user.create({ data: { wechatOpenId: `openid-${randomUUID()}` } })
    userIds.push(created.id)
    return created
  }

  function gateway() {
    return {
      createPrepay: vi.fn(async (_input: { outTradeNo: string; openId: string; amountFen: number; description: string }) => ({ prepayId: 'prepay-test' })),
      queryPayment: vi.fn(async (outTradeNo: string): Promise<WechatPaymentResult> => ({ outTradeNo, transactionId: null, tradeState: 'NOTPAY', amountFen: 10, currency: 'CNY', appId: 'wx-app', mchId: 'mch-1' })),
      closePayment: vi.fn(async () => undefined)
    }
  }

  function input(userId: string) {
    return { businessType: 'demo', businessOrderId: randomUUID(), userId, amountFen: 10, description: 'Demo purchase', idempotencyKey: randomUUID() }
  }

  test('creates one payment and returns signed miniapp launch parameters', async () => {
    const owner = await user()
    const fake = gateway()
    const result = await new PaymentService(prisma, fake, config).createPrepay(input(owner.id))
    expect(result.payment).toMatchObject({ amountFen: 10, status: 'PENDING' })
    expect(result.launch.package).toBe('prepay_id=prepay-test')
    expect(await prisma.payment.count({ where: { id: result.payment.id } })).toBe(1)
  })

  test('concurrent duplicate requests use one payment attempt', async () => {
    const owner = await user()
    const fake = gateway()
    const service = new PaymentService(prisma, fake, config)
    const request = input(owner.id)
    const results = await Promise.all([service.createPrepay(request), service.createPrepay(request)])
    expect(results[0].payment.id).toBe(results[1].payment.id)
    expect(fake.createPrepay).toHaveBeenCalledTimes(1)
    expect(await prisma.payment.count({ where: { businessType: 'demo', businessOrderId: request.businessOrderId } })).toBe(1)
  })

  test('rejectsChangedAmountForSameBusinessOrder', async () => {
    const owner = await user()
    const service = new PaymentService(prisma, gateway(), config)
    const request = input(owner.id)
    await service.createPrepay(request)
    await expect(service.createPrepay({ ...request, amountFen: 11 })).rejects.toThrow()
  })

  test('retries an unknown prepay outcome with the original merchant number', async () => {
    const owner = await user()
    const fake = gateway()
    fake.createPrepay.mockRejectedValueOnce(new WechatPayUnknownError('network'))
    const service = new PaymentService(prisma, fake, config)
    const request = input(owner.id)
    await expect(service.createPrepay(request)).rejects.toThrow()
    const uncertain = await prisma.payment.findFirstOrThrow({ where: { businessOrderId: request.businessOrderId } })
    expect(uncertain.status).toBe('UNKNOWN')
    await service.createPrepay(request)
    expect(fake.createPrepay.mock.calls[0]?.[0].outTradeNo).toBe(uncertain.outTradeNo)
    expect(fake.createPrepay.mock.calls[1]?.[0].outTradeNo).toBe(uncertain.outTradeNo)
  })

  test('commits the merchant payment number before calling WeChat', async () => {
    const owner = await user()
    const fake = gateway()
    const service = new PaymentService(prisma, fake, config)
    const request = input(owner.id)
    let visible = false
    fake.createPrepay.mockImplementationOnce(async ({ outTradeNo }) => {
      visible = !!await prisma.payment.findUnique({ where: { outTradeNo } })
      throw new WechatPayUnknownError('interrupted after remote acceptance')
    })
    await expect(service.createPrepay(request)).rejects.toThrow()
    expect(visible).toBe(true)
    const stored = await prisma.payment.findFirstOrThrow({ where: { businessOrderId: request.businessOrderId } })
    expect(stored.status).toBe('UNKNOWN')
    await service.createPrepay(request)
    expect(fake.createPrepay.mock.calls[1]?.[0].outTradeNo).toBe(stored.outTradeNo)
  })

  test('only the owner can query a payment and a paid order cannot prepay again', async () => {
    const owner = await user()
    const stranger = await user()
    const service = new PaymentService(prisma, gateway(), config)
    const request = input(owner.id)
    const { payment } = await service.createPrepay(request)
    await expect(service.getPayment(stranger.id, payment.id)).rejects.toThrow()
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'SUCCEEDED' } })
    await expect(service.createPrepay(request)).rejects.toThrow()
  })

  test('owner status query actively confirms payment when callback is delayed', async () => {
    const owner = await user()
    const stranger = await user()
    const fake = gateway()
    const service = new PaymentService(prisma, fake, config)
    const created = await service.createPrepay(input(owner.id))
    fake.queryPayment.mockResolvedValue({ outTradeNo: (await prisma.payment.findUniqueOrThrow({ where: { id: created.payment.id } })).outTradeNo,
      transactionId: `wx-${created.payment.id}`, tradeState: 'SUCCESS', amountFen: 10, currency: 'CNY', appId: 'wx-app', mchId: 'mch-1', successTime: '2026-09-27T12:00:00+08:00' })
    await expect(service.getPayment(stranger.id, created.payment.id)).rejects.toThrow()
    expect(fake.queryPayment).not.toHaveBeenCalled()
    expect((await service.getPayment(owner.id, created.payment.id)).status).toBe('SUCCEEDED')
    expect(fake.queryPayment).toHaveBeenCalledTimes(1)
  })
})
