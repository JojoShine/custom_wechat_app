import { createHash } from 'node:crypto'
import { BadRequestException, Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import type { PrismaClient } from '../../generated/prisma/client.js'
import { PRISMA } from '../../common/database/prisma.provider.js'
import { appLogger } from '../../common/logging/logger.js'
import { WECHAT_PAY_GATEWAY, WECHAT_PAY_CONFIG } from './payment.service.js'
import { WechatPayRejectedError } from './wechat-pay.gateway.js'
import { TradeBillParser, type BillRow } from './trade-bill.parser.js'

export type ReconciliationSummary = {
  runId: string | null
  date: string
  status: 'SUCCEEDED' | 'SKIPPED'
  paymentRows: number
  refundRows: number
  differenceCount: number
}
type Difference = { kind: string; reference: string; localAmountFen?: number; wechatAmountFen?: number; detail?: string }

@Injectable()
export class ReconciliationService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>
  private readonly parser = new TradeBillParser()

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(WECHAT_PAY_GATEWAY) private readonly gateway: { getTradeBill(date: string): Promise<Buffer> },
    @Inject(WECHAT_PAY_CONFIG) private readonly config: { appId: string; mchId: string }
  ) {}

  onModuleInit(): void {
    this.tick()
    this.timer = setInterval(() => this.tick(), 60 * 60_000)
    this.timer.unref()
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer)
  }

  private tick(): void {
    void this.runYesterdayIfDue().catch(() => appLogger.error({ category: 'reconciliation', code: 'AUTO_RUN_FAILED' }))
  }

  private async runYesterdayIfDue(): Promise<void> {
    const chinaNow = new Date(Date.now() + 8 * 3600_000)
    if (chinaNow.getUTCHours() < 10) return
    const date = new Date(chinaNow.getTime() - 86400_000).toISOString().slice(0, 10)
    const latest = await this.prisma.reconciliationRun.findFirst({
      where: { billDate: new Date(`${date}T00:00:00.000Z`), status: 'SUCCEEDED' }
    })
    if (!latest) await this.run(date)
  }

  private validateDate(date: string): { start: Date; end: Date } {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) !== date) {
      throw new BadRequestException('Invalid bill date')
    }
    const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)
    const [year, month, day] = today.split('-').map(Number)
    const earliest = new Date(Date.UTC(year, month - 4, day)).toISOString().slice(0, 10)
    if (date >= today || date < earliest) throw new BadRequestException('Bill date is outside the last three months')
    const start = new Date(`${date}T00:00:00+08:00`)
    return { start, end: new Date(start.getTime() + 86400_000) }
  }

  async run(date: string): Promise<ReconciliationSummary> {
    const { start, end } = this.validateDate(date)
    let runId: string | null = null
    try {
      return await this.prisma.$transaction(async (lockTx) => {
        const [{ locked }] = await lockTx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(hashtext(${date}), 7007) AS locked`
        if (!locked) return { runId: null, date, status: 'SKIPPED' as const, paymentRows: 0, refundRows: 0, differenceCount: 0 }
        const run = await this.prisma.reconciliationRun.create({ data: { billDate: new Date(`${date}T00:00:00.000Z`) } })
        runId = run.id
        let raw: Buffer | null = null
        try { raw = await this.gateway.getTradeBill(date) }
        catch (error) {
          if (!(error instanceof WechatPayRejectedError && error.code === 'NO_STATEMENT_EXIST')) throw error
        }
        const rows = raw ? this.parser.parse(raw) : []
        if (rows.some((row) => row.appId !== this.config.appId || row.mchId !== this.config.mchId || row.tradeTime.slice(0, 10) !== date)) {
          throw new Error('Bill identity or date mismatch')
        }
        const differences = await this.compare(rows, start, end)
        await this.prisma.$transaction(async (writeTx) => {
          if (differences.length) await writeTx.reconciliationDifference.createMany({ data: differences.map((difference) => ({ runId: run.id, ...difference })) })
          await writeTx.reconciliationRun.update({ where: { id: run.id }, data: {
            status: 'SUCCEEDED', billHash: raw ? createHash('sha256').update(raw).digest('hex') : null,
            paymentRows: rows.filter((row) => row.kind === 'PAYMENT').length,
            refundRows: rows.filter((row) => row.kind === 'REFUND').length,
            differenceCount: differences.length, completedAt: new Date()
          } })
        })
        if (differences.length) appLogger.warn({ category: 'reconciliation', code: 'DIFFERENCES', date, runId: run.id, count: differences.length })
        return { runId: run.id, date, status: 'SUCCEEDED' as const,
          paymentRows: rows.filter((row) => row.kind === 'PAYMENT').length,
          refundRows: rows.filter((row) => row.kind === 'REFUND').length, differenceCount: differences.length }
      }, { timeout: 180_000 })
    } catch (error) {
      if (runId) await this.prisma.reconciliationRun.update({ where: { id: runId }, data: {
        status: 'FAILED', errorCode: error instanceof WechatPayRejectedError ? error.code : 'RECONCILIATION_FAILED', completedAt: new Date()
      } })
      appLogger.error({ category: 'reconciliation', code: 'FAILED', date, runId })
      throw error
    }
  }

  private async compare(rows: BillRow[], start: Date, end: Date): Promise<Difference[]> {
    const paymentRows = rows.filter((row) => row.kind === 'PAYMENT')
    const refundRows = rows.filter((row) => row.kind === 'REFUND')
    const payments = await this.prisma.payment.findMany({ where: { OR: [
      { paidAt: { gte: start, lt: end } },
      { outTradeNo: { in: rows.map((row) => row.outTradeNo) } }
    ] } })
    const refunds = await this.prisma.refund.findMany({ where: { OR: [
      { acceptedAt: { gte: start, lt: end } },
      { outRefundNo: { in: refundRows.map((row) => row.outRefundNo!) } }
    ] }, include: { payment: true } })
    const byTradeNo = new Map(payments.map((payment) => [payment.outTradeNo, payment]))
    const byRefundNo = new Map(refunds.map((refund) => [refund.outRefundNo, refund]))
    const differences: Difference[] = []
    for (const row of paymentRows) {
      const local = byTradeNo.get(row.outTradeNo)
      if (!local) differences.push({ kind: 'WECHAT_ONLY', reference: row.outTradeNo, wechatAmountFen: row.amountFen })
      else if (local.amountFen !== row.amountFen) differences.push({ kind: 'AMOUNT_MISMATCH', reference: row.outTradeNo, localAmountFen: local.amountFen, wechatAmountFen: row.amountFen })
      else if (local.status !== 'SUCCEEDED') differences.push({ kind: 'STATUS_MISMATCH', reference: row.outTradeNo, detail: local.status })
    }
    for (const row of refundRows) {
      const local = byRefundNo.get(row.outRefundNo!)
      if (!local) differences.push({ kind: 'WECHAT_ONLY', reference: row.outRefundNo!, wechatAmountFen: row.amountFen })
      else if (local.payment.outTradeNo !== row.outTradeNo || local.amountFen !== row.amountFen) {
        differences.push({ kind: 'AMOUNT_MISMATCH', reference: row.outRefundNo!, localAmountFen: local.amountFen, wechatAmountFen: row.amountFen })
      } else if (!local.acceptedAt) differences.push({ kind: 'STATUS_MISMATCH', reference: row.outRefundNo!, detail: 'Refund not accepted locally' })
    }
    const paymentSet = new Set(paymentRows.map((row) => row.outTradeNo))
    const refundSet = new Set(refundRows.map((row) => row.outRefundNo))
    for (const local of payments) {
      if (local.paidAt && local.paidAt >= start && local.paidAt < end && local.status === 'SUCCEEDED' && !paymentSet.has(local.outTradeNo)) {
        differences.push({ kind: 'LOCAL_ONLY', reference: local.outTradeNo, localAmountFen: local.amountFen })
      }
    }
    for (const local of refunds) {
      if (local.acceptedAt && local.acceptedAt >= start && local.acceptedAt < end && !refundSet.has(local.outRefundNo)) {
        differences.push({ kind: 'LOCAL_ONLY', reference: local.outRefundNo, localAmountFen: local.amountFen })
      }
    }
    return differences
  }
}
