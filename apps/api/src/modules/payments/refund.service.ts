import { randomBytes, randomUUID } from 'node:crypto'
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import type { RefundView } from '@template/contracts'
import type { Payment, PrismaClient, Refund, RefundStatus } from '../../generated/prisma/client.js'
import { PRISMA } from '../../common/database/prisma.provider.js'
import { appLogger } from '../../common/logging/logger.js'
import { WECHAT_PAY_GATEWAY, WECHAT_PAY_CONFIG } from './payment.service.js'
import { WechatPayRejectedError, WechatPayUnknownError, type VerifiedNotification, type WechatPaymentResult, type WechatRefundResult } from './wechat-pay.gateway.js'

type RefundGateway = {
  queryPayment(outTradeNo: string): Promise<WechatPaymentResult>
  createRefund(input: { outTradeNo: string; outRefundNo: string; amountFen: number; totalFen: number; reason: string }): Promise<WechatRefundResult>
  queryRefund(outRefundNo: string): Promise<WechatRefundResult>
}
type RefundInput = { paymentId: string; businessRefundId: string; amountFen: number; reason: string }

@Injectable()
export class RefundService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(WECHAT_PAY_GATEWAY) private readonly gateway: RefundGateway,
    @Inject(WECHAT_PAY_CONFIG) private readonly config: { appId: string; mchId: string }
  ) {}

  private view(refund: Refund): RefundView {
    return { id: refund.id, paymentId: refund.paymentId, amountFen: refund.amountFen, status: refund.status, createdAt: refund.createdAt.toISOString() }
  }

  private verifyPayment(result: WechatPaymentResult, payment: Payment): void {
    if (result.outTradeNo !== payment.outTradeNo || result.transactionId !== payment.wechatTransactionId ||
      result.appId !== this.config.appId || result.mchId !== this.config.mchId ||
      result.amountFen !== payment.amountFen || result.currency !== 'CNY' || !['SUCCESS', 'REFUND'].includes(result.tradeState)) {
      throw new ConflictException('Original payment is not confirmed by WeChat Pay')
    }
  }

  private verifyRefund(result: WechatRefundResult, refund: Refund, payment: Payment): void {
    if (result.outTradeNo !== payment.outTradeNo || result.outRefundNo !== refund.outRefundNo ||
      result.amountFen !== refund.amountFen || result.totalFen !== payment.amountFen ||
      (refund.wechatRefundId && result.refundId !== refund.wechatRefundId)) {
      throw new BadRequestException('Refund identity or amount mismatch')
    }
  }

  private async setStatus(refund: Refund, status: RefundStatus, refundId: string | null): Promise<Refund> {
    const current = await this.prisma.$transaction(async (tx) => {
      const latest = await tx.refund.findUniqueOrThrow({ where: { id: refund.id }, include: { payment: true } })
      if (latest.wechatRefundId && refundId && latest.wechatRefundId !== refundId) throw new ConflictException('Refund identity changed')
      if (['SUCCEEDED', 'CLOSED'].includes(latest.status) && latest.status !== status) return latest
      if (latest.status === status && (!refundId || latest.wechatRefundId === refundId)) return latest
      const changed = await tx.refund.updateMany({ where: { id: latest.id, status: latest.status }, data: {
        status, wechatRefundId: refundId ?? latest.wechatRefundId,
        lastQueriedAt: new Date(),
        ...(status === 'PROCESSING' ? { acceptedAt: new Date() } : {}),
        ...(status === 'SUCCEEDED' ? { succeededAt: new Date() } : {})
      } })
      if (!changed.count) return tx.refund.findUniqueOrThrow({ where: { id: latest.id } })
      await tx.paymentEvent.create({ data: {
        eventKey: `refund:${refund.id}:${status}:${randomUUID()}`,
        paymentId: latest.paymentId, refundId: refund.id,
        businessType: latest.payment.businessType, businessOrderId: latest.payment.businessOrderId,
        kind: 'REFUND', status, amountFen: latest.amountFen
      } })
      return tx.refund.findUniqueOrThrow({ where: { id: latest.id } })
    })
    if (current.status === 'ABNORMAL') appLogger.error({ category: 'refund', code: 'ABNORMAL', refundId: current.id })
    return current
  }

  async requestRefund(input: RefundInput): Promise<RefundView> {
    if (!input.businessRefundId || !input.reason || !Number.isInteger(input.amountFen) || input.amountFen <= 0) {
      throw new BadRequestException('Invalid refund request')
    }
    const prior = await this.prisma.refund.findUnique({ where: { businessRefundId: input.businessRefundId } })
    if (prior) {
      if (prior.paymentId !== input.paymentId || prior.amountFen !== input.amountFen) throw new ConflictException('Refund request changed')
      return prior.status === 'UNKNOWN' || prior.status === 'REQUESTING' ? this.refreshRefund(prior.id) : this.view(prior)
    }
    const payment = await this.prisma.payment.findUnique({ where: { id: input.paymentId } })
    if (!payment) throw new NotFoundException('Payment not found')
    if (payment.status !== 'SUCCEEDED') throw new ConflictException('Payment is not confirmed')
    this.verifyPayment(await this.gateway.queryPayment(payment.outTradeNo), payment)

    const reservation = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${input.paymentId}), 12)`
      const existing = await tx.refund.findUnique({ where: { businessRefundId: input.businessRefundId } })
      if (existing) return { refund: existing, created: false }
      const refunds = await tx.refund.findMany({ where: { paymentId: input.paymentId }, orderBy: { createdAt: 'desc' } })
      if (refunds.length >= 50) throw new ConflictException('Refund attempt limit reached')
      if (refunds[0] && Date.now() - refunds[0].createdAt.getTime() < 60_000) throw new ConflictException('Refund requests must be at least one minute apart')
      const reserved = refunds.filter((item) => item.status !== 'CLOSED').reduce((sum, item) => sum + item.amountFen, 0)
      if (reserved + input.amountFen > payment.amountFen) throw new ConflictException('Refund amount exceeds payment')
      const refund = await tx.refund.create({ data: {
        paymentId: payment.id, businessRefundId: input.businessRefundId, amountFen: input.amountFen,
        reason: input.reason, outRefundNo: `R${randomBytes(15).toString('hex')}`
      } })
      return { refund, created: true }
    })
    const { refund } = reservation
    if (refund.businessRefundId !== input.businessRefundId || refund.amountFen !== input.amountFen || refund.paymentId !== input.paymentId) {
      throw new ConflictException('Refund request changed')
    }
    if (!reservation.created) return refund.status === 'UNKNOWN' ? this.refreshRefund(refund.id) : this.view(refund)
    return this.submitRefund(refund, payment)
  }

  private async submitRefund(refund: Refund, payment: Payment): Promise<RefundView> {
    try {
      const result = await this.gateway.createRefund({ outTradeNo: payment.outTradeNo, outRefundNo: refund.outRefundNo,
        amountFen: refund.amountFen, totalFen: payment.amountFen, reason: refund.reason })
      this.verifyRefund(result, refund, payment)
      return this.view(await this.setStatus(refund, this.mapStatus(result.status), result.refundId))
    } catch (error) {
      if (error instanceof WechatPayRejectedError) {
        // A definite rejection still needs an auditable local outcome; CLOSED releases its reservation.
        await this.setStatus(refund, 'CLOSED', null)
        throw error
      }
      if (!(error instanceof WechatPayUnknownError)) throw error
      return this.view(await this.setStatus(refund, 'UNKNOWN', null))
    }
  }

  async getRefund(userId: string, refundId: string): Promise<RefundView> {
    const refund = await this.prisma.refund.findUnique({ where: { id: refundId }, include: { payment: true } })
    if (!refund || refund.payment.userId !== userId) throw new NotFoundException('Refund not found')
    return this.view(refund)
  }

  private mapStatus(status: string): RefundStatus {
    if (status === 'PROCESSING' || status === 'SUCCESS' || status === 'CLOSED' || status === 'ABNORMAL') {
      return status === 'SUCCESS' ? 'SUCCEEDED' : status
    }
    throw new WechatPayUnknownError('Unknown WeChat Pay refund status')
  }

  async refreshRefund(refundId: string): Promise<RefundView> {
    const refund = await this.prisma.refund.findUnique({ where: { id: refundId }, include: { payment: true } })
    if (!refund) throw new NotFoundException('Refund not found')
    if (refund.status === 'SUCCEEDED' || refund.status === 'CLOSED') return this.view(refund)
    try {
      const result = await this.gateway.queryRefund(refund.outRefundNo)
      this.verifyRefund(result, refund, refund.payment)
      return this.view(await this.setStatus(refund, this.mapStatus(result.status), result.refundId))
    } catch (error) {
      if (error instanceof WechatPayRejectedError && error.status === 404 && ['REQUESTING', 'UNKNOWN'].includes(refund.status)) {
        return this.submitRefund(refund, refund.payment)
      }
      if (error instanceof WechatPayRejectedError && error.status === 404) return this.view(refund)
      throw error
    }
  }

  async applyVerifiedRefund(notification: VerifiedNotification): Promise<void> {
    const data = notification.data
    const outRefundNo = data.out_refund_no
    const amount = data.amount as { refund?: number; total?: number } | undefined
    if (typeof outRefundNo !== 'string' || !['REFUND.SUCCESS', 'REFUND.CLOSED', 'REFUND.ABNORMAL'].includes(notification.eventType)) {
      throw new BadRequestException('Invalid refund notification')
    }
    const refund = await this.prisma.refund.findUnique({ where: { outRefundNo }, include: { payment: true } })
    if (!refund || data.mchid !== this.config.mchId || data.out_trade_no !== refund.payment.outTradeNo ||
      data.transaction_id !== refund.payment.wechatTransactionId || amount?.total !== refund.payment.amountFen ||
      amount.refund !== refund.amountFen || typeof data.refund_id !== 'string' || !data.refund_id) {
      throw new BadRequestException('Refund notification does not match local refund')
    }
    const status = notification.eventType.slice('REFUND.'.length)
    if (data.refund_status !== status) throw new BadRequestException('Refund notification status mismatch')
    await this.setStatus(refund, this.mapStatus(status), data.refund_id)
  }
}
