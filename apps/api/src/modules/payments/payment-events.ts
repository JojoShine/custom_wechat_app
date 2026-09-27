import { Inject, Injectable } from '@nestjs/common'
import type { PrismaClient } from '../../generated/prisma/client.js'
import { PRISMA } from '../../common/database/prisma.provider.js'
import { appLogger } from '../../common/logging/logger.js'

export type BusinessPaymentEvent = {
  id: string
  paymentId: string
  refundId: string | null
  businessType: string
  businessOrderId: string
  kind: string
  status: string
  amountFen: number
}

type Handler = (event: BusinessPaymentEvent) => Promise<void>

@Injectable()
export class PaymentEvents {
  private readonly handlers = new Map<string, Handler>()

  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  register(businessType: string, handler: Handler): void {
    if (this.handlers.has(businessType)) throw new Error(`Payment event handler already registered: ${businessType}`)
    this.handlers.set(businessType, handler)
  }

  async dispatchPending(): Promise<number> {
    const now = new Date()
    const events = await this.prisma.paymentEvent.findMany({
      where: { deliveredAt: null, nextAttemptAt: { lte: now } }, orderBy: { createdAt: 'asc' }, take: 50
    })
    let delivered = 0
    for (const event of events) {
      const claimed = await this.prisma.paymentEvent.updateMany({
        where: { id: event.id, deliveredAt: null, nextAttemptAt: { lte: now } },
        data: { attempts: { increment: 1 }, nextAttemptAt: new Date(Date.now() + 60_000) }
      })
      if (!claimed.count) continue
      const handler = this.handlers.get(event.businessType)
      if (!handler) {
        appLogger.warn({ category: 'payment_event', code: 'HANDLER_MISSING', businessType: event.businessType, eventId: event.id })
        continue
      }
      try {
        await handler({
          id: event.id, paymentId: event.paymentId, refundId: event.refundId,
          businessType: event.businessType, businessOrderId: event.businessOrderId,
          kind: event.kind, status: event.status, amountFen: event.amountFen
        })
        await this.prisma.paymentEvent.update({ where: { id: event.id }, data: { deliveredAt: new Date() } })
        delivered++
      } catch {
        appLogger.error({ category: 'payment_event', code: 'DELIVERY_FAILED', eventId: event.id })
      }
    }
    return delivered
  }
}
