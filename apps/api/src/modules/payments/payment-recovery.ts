import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import type { PrismaClient } from '../../generated/prisma/client.js'
import { PRISMA } from '../../common/database/prisma.provider.js'
import { appLogger } from '../../common/logging/logger.js'
import { PaymentService } from './payment.service.js'
import { RefundService } from './refund.service.js'
import { PaymentEvents } from './payment-events.js'

@Injectable()
export class PaymentRecovery implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly payments: PaymentService,
    private readonly refunds: RefundService,
    private readonly events: PaymentEvents
  ) {}

  onModuleInit(): void {
    this.tick()
    this.timer = setInterval(() => this.tick(), 60_000)
    this.timer.unref()
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer)
  }

  private tick(): void {
    void this.runOnce(new Date()).catch(() => {
      appLogger.error({ category: 'payment_recovery', code: 'SCAN_FAILED' })
    })
  }

  async runOnce(now: Date): Promise<{ payments: number; refunds: number; events: number }> {
    return this.prisma.$transaction(async (tx) => {
      const [{ locked }] = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(8291, 2026) AS locked`
      if (!locked) return { payments: 0, refunds: 0, events: 0 }
      const queryBefore = new Date(now.getTime() - 60_000)
      const candidates = await this.prisma.payment.findMany({
        where: { status: { in: ['CREATING', 'PENDING', 'UNKNOWN'] },
          OR: [{ expiresAt: { lte: now } }, { lastQueriedAt: null }, { lastQueriedAt: { lte: queryBefore } }] },
        orderBy: [{ lastQueriedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }], take: 20
      })
      for (const payment of candidates) {
        try {
          await this.prisma.payment.update({ where: { id: payment.id }, data: { lastQueriedAt: now } })
          if (payment.expiresAt <= now) await this.payments.closeExpired(payment.id)
          else await this.payments.refreshPayment(payment.id)
        } catch {
          appLogger.warn({ category: 'payment_recovery', code: 'PAYMENT_RETRY', paymentId: payment.id })
        }
      }

      const refundCandidates = await this.prisma.refund.findMany({
        where: { status: { in: ['REQUESTING', 'PROCESSING', 'UNKNOWN', 'ABNORMAL'] },
          OR: [{ lastQueriedAt: { lte: queryBefore } }, { lastQueriedAt: null, createdAt: { lte: queryBefore } }] },
        orderBy: [{ lastQueriedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }], take: 20
      })
      for (const refund of refundCandidates) {
        try {
          await this.prisma.refund.update({ where: { id: refund.id }, data: { lastQueriedAt: now } })
          await this.refunds.refreshRefund(refund.id)
        }
        catch { appLogger.warn({ category: 'payment_recovery', code: 'REFUND_RETRY', refundId: refund.id }) }
      }
      let events = 0
      try { events = await this.events.dispatchPending() }
      catch { appLogger.warn({ category: 'payment_recovery', code: 'EVENT_RETRY' }) }
      return { payments: candidates.length, refunds: refundCandidates.length, events }
    }, { timeout: 180_000 })
  }
}
