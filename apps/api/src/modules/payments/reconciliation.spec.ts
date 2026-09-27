import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { PrismaClient } from '../../generated/prisma/client.js'
import { ReconciliationService } from './reconciliation.service.js'
import { WechatPayRejectedError, WechatPaySecurityError } from './wechat-pay.gateway.js'

const header = '交易时间,公众账号ID,商户号,特约商户号,设备号,微信订单号,商户订单号,用户标识,交易类型,交易状态,付款银行,货币种类,应结订单金额,代金券金额,微信退款单号,商户退款单号,退款金额,充值券退款金额,退款类型,退款状态,商品名称,商户数据包,手续费,费率,订单金额,申请退款金额,费率备注'
function row(date: string, outTradeNo: string, amount: string, outRefundNo?: string) {
  const values = [date + ' 12:00:00', 'wx-app', 'mch-1', '0', '', 'wx-id', outTradeNo, 'openid', 'JSAPI', outRefundNo ? 'REFUND' : 'SUCCESS',
    'OTHERS', 'CNY', outRefundNo ? '0.00' : amount, '0.00', outRefundNo ? 'wx-refund' : '0', outRefundNo ?? '0',
    outRefundNo ? amount : '0.00', '0.00', '', outRefundNo ? 'PROCESSING' : '', 'Demo', '', '0.00', '0.60%',
    outRefundNo ? '0.00' : amount, outRefundNo ? amount : '0.00', '']
  return values.map((value) => `\`${value}`).join(',')
}
const bill = (...rows: string[]) => Buffer.from(`${header}\n${rows.join('\n')}\n总交易单数,应结订单总金额,退款总金额,充值券退款总金额,手续费总金额,订单总金额,申请退款总金额\n\`${rows.length},\`0.10,\`0.06,\`0.00,\`0.00,\`0.10,\`0.06\n`)
const date = new Date(Date.now() + 8 * 3600_000 - 86400_000).toISOString().slice(0, 10)
const day = new Date(`${date}T12:00:00+08:00`)

describe.skipIf(!process.env.TEST_DATABASE_URL)('ReconciliationService', () => {
  let prisma: PrismaClient
  const userIds: string[] = []
  const runIds: string[] = []
  beforeAll(() => { prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL! }) }) })
  afterAll(async () => {
    await prisma.reconciliationDifference.deleteMany({ where: { runId: { in: runIds } } })
    await prisma.reconciliationRun.deleteMany({ where: { id: { in: runIds } } })
    await prisma.refund.deleteMany({ where: { payment: { userId: { in: userIds } } } })
    await prisma.payment.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.user.deleteMany({ where: { id: { in: userIds } } })
    await prisma.$disconnect()
  })
  async function payment(amountFen = 10) {
    const user = await prisma.user.create({ data: { wechatOpenId: `openid-${randomUUID()}` } })
    userIds.push(user.id)
    return prisma.payment.create({ data: {
      businessType: 'demo', businessOrderId: randomUUID(), idempotencyKey: randomUUID(), userId: user.id,
      amountFen, description: 'Demo', outTradeNo: `P${randomUUID().replace(/-/g, '').slice(0, 30)}`,
      expiresAt: day, status: 'SUCCEEDED', paidAt: day
    } })
  }
  const gateway = (raw: Buffer) => ({ getTradeBill: vi.fn(async () => raw) })
  const make = (raw: Buffer) => new ReconciliationService(prisma, gateway(raw), { appId: 'wx-app', mchId: 'mch-1' })

  test('stores WeChat-only, local-only and amount differences, preserving rerun history', async () => {
    const match = await payment()
    const missing = await payment()
    const wrongAmount = await payment()
    const raw = bill(row(date, match.outTradeNo, '0.10'), row(date, wrongAmount.outTradeNo, '0.09'), row(date, 'P-unknown', '0.10'))
    const service = make(raw)
    const first = await service.run(date)
    const second = await service.run(date)
    runIds.push(first.runId!, second.runId!)
    expect(first.status).toBe('SUCCEEDED')
    expect(first.differenceCount).toBeGreaterThanOrEqual(3)
    expect(first.runId).not.toBe(second.runId)
    const differences = await prisma.reconciliationDifference.findMany({ where: { runId: first.runId! } })
    expect(differences.map((item) => item.kind)).toEqual(expect.arrayContaining(['WECHAT_ONLY', 'LOCAL_ONLY', 'AMOUNT_MISMATCH']))
    expect(differences.some((item) => item.reference === missing.outTradeNo)).toBe(true)
  })

  test('treats refund bill row as acceptance, not final refund success', async () => {
    const paid = await payment()
    const refund = await prisma.refund.create({ data: {
      paymentId: paid.id, businessRefundId: randomUUID(), amountFen: 6, reason: 'Demo',
      outRefundNo: `R${randomUUID().replace(/-/g, '').slice(0, 30)}`, status: 'PROCESSING', acceptedAt: day
    } })
    const result = await make(bill(row(date, paid.outTradeNo, '0.10'), row(date, paid.outTradeNo, '0.06', refund.outRefundNo))).run(date)
    runIds.push(result.runId!)
    expect(result.refundRows).toBe(1)
    expect((await prisma.refund.findUniqueOrThrow({ where: { id: refund.id } })).status).toBe('PROCESSING')
    expect((await prisma.reconciliationDifference.findMany({ where: { runId: result.runId!, reference: refund.outRefundNo } }))).toHaveLength(0)
  })

  test('explicit no-statement with local payment records a difference', async () => {
    const paid = await payment()
    const fake = gateway(Buffer.alloc(0))
    fake.getTradeBill.mockRejectedValueOnce(new WechatPayRejectedError(400, 'NO_STATEMENT_EXIST'))
    const result = await new ReconciliationService(prisma, fake, { appId: 'wx-app', mchId: 'mch-1' }).run(date)
    runIds.push(result.runId!)
    expect(result.status).toBe('SUCCEEDED')
    expect((await prisma.reconciliationDifference.findMany({ where: { runId: result.runId!, reference: paid.outTradeNo } }))[0]?.kind).toBe('LOCAL_ONLY')
  })

  test('hash or parser failure persists FAILED run without differences', async () => {
    const fake = gateway(Buffer.alloc(0))
    fake.getTradeBill.mockRejectedValueOnce(new WechatPaySecurityError('hash mismatch'))
    await expect(new ReconciliationService(prisma, fake, { appId: 'wx-app', mchId: 'mch-1' }).run(date)).rejects.toThrow()
    await expect(make(Buffer.from(`${header}\n${row(date, 'P1', '0.001')}`)).run(date)).rejects.toThrow()
    const failures = await prisma.reconciliationRun.findMany({ where: { billDate: new Date(`${date}T00:00:00.000Z`), status: 'FAILED' }, orderBy: { startedAt: 'desc' }, take: 2 })
    runIds.push(...failures.map((item) => item.id))
    expect(failures).toHaveLength(2)
    expect(await prisma.reconciliationDifference.count({ where: { runId: { in: failures.map((item) => item.id) } } })).toBe(0)
  })

  test('date-level lease skips a concurrent run', async () => {
    let release!: () => void
    const blocked = new Promise<void>((resolve) => { release = resolve })
    let entered!: () => void
    const started = new Promise<void>((resolve) => { entered = resolve })
    const fake = { getTradeBill: vi.fn(async () => { entered(); await blocked; return bill() }) }
    const service = new ReconciliationService(prisma, fake, { appId: 'wx-app', mchId: 'mch-1' })
    const first = service.run(date)
    await started
    const second = await service.run(date)
    expect(second.status).toBe('SKIPPED')
    release()
    const completed = await first
    runIds.push(completed.runId!)
  })
})
