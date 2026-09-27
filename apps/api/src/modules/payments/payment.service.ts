import { randomBytes } from 'node:crypto'
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import type { PaymentLaunchParams, PaymentView } from '@template/contracts'
import type { PrismaClient } from '../../generated/prisma/client.js'
import type { Payment } from '../../generated/prisma/client.js'
import { PRISMA } from '../../common/database/prisma.provider.js'
import type { WechatPayConfig } from '../../common/config/app-config.js'
import { createMiniappPayParams } from './wechat-pay.crypto.js'
import { WechatPayRejectedError, WechatPayUnknownError, type WechatPaymentResult } from './wechat-pay.gateway.js'

export const WECHAT_PAY_GATEWAY = Symbol('WECHAT_PAY_GATEWAY')
export const WECHAT_PAY_CONFIG = Symbol('WECHAT_PAY_CONFIG')

type PaymentGateway = {
  createPrepay(input: { outTradeNo: string; openId: string; amountFen: number; description: string }): Promise<{ prepayId: string }>
  queryPayment(outTradeNo: string): Promise<WechatPaymentResult>
  closePayment(outTradeNo: string): Promise<void>
}

type PrepayInput = {
  businessType: string
  businessOrderId: string
  userId: string
  amountFen: number
  description: string
  idempotencyKey: string
}

@Injectable()
export class PaymentService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(WECHAT_PAY_GATEWAY) private readonly gateway: PaymentGateway,
    @Inject(WECHAT_PAY_CONFIG) private readonly config: Pick<WechatPayConfig, 'appId' | 'mchId' | 'merchantPrivateKey'>
  ) {}

  private view(payment: Payment): PaymentView {
    return {
      id: payment.id, businessType: payment.businessType, businessOrderId: payment.businessOrderId,
      amountFen: payment.amountFen, status: payment.status, createdAt: payment.createdAt.toISOString()
    }
  }

  private launch(prepayId: string): PaymentLaunchParams {
    return createMiniappPayParams(this.config.appId, prepayId, this.config.merchantPrivateKey)
  }

  async createPrepay(input: PrepayInput): Promise<{ payment: PaymentView; launch: PaymentLaunchParams }> {
    if (!Number.isInteger(input.amountFen) || input.amountFen <= 0 || !input.businessType || !input.businessOrderId || !input.description || !input.idempotencyKey) {
      throw new BadRequestException('Invalid payment intent')
    }
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${input.businessType}), hashtext(${input.businessOrderId}))`
      const user = await tx.user.findUnique({ where: { id: input.userId } })
      if (!user) throw new NotFoundException('User not found')

      const latest = await tx.payment.findFirst({
        where: { businessType: input.businessType, businessOrderId: input.businessOrderId }, orderBy: { attemptNo: 'desc' }
      })
      if (latest && (latest.userId !== input.userId || latest.amountFen !== input.amountFen)) {
        throw new ConflictException('Payment intent changed')
      }
      if (latest?.status === 'SUCCEEDED') throw new ConflictException('Business order already paid')
      if (latest?.status === 'FAILED') throw new ConflictException('Payment attempt failed')
      if (latest?.status === 'PENDING' && latest.prepayId) {
        return { payment: latest, prepayId: latest.prepayId, error: null }
      }

      let payment = latest
      if (!payment || payment.status === 'CLOSED') {
        payment = await tx.payment.create({
          data: {
            businessType: input.businessType, businessOrderId: input.businessOrderId,
            attemptNo: latest ? latest.attemptNo + 1 : 1, idempotencyKey: input.idempotencyKey,
            userId: input.userId, amountFen: input.amountFen, description: input.description,
            outTradeNo: `P${randomBytes(15).toString('hex')}`,
            expiresAt: new Date(Date.now() + 30 * 60_000)
          }
        })
      } else {
        const queried = await this.queryResult(payment)
        if (queried?.tradeState === 'SUCCESS') {
          payment = await tx.payment.update({ where: { id: payment.id }, data: { status: 'SUCCEEDED', wechatTransactionId: queried.transactionId, paidAt: new Date(), lastQueriedAt: new Date() } })
          return { payment, prepayId: null, error: new ConflictException('Business order already paid') }
        }
      }

      try {
        const { prepayId } = await this.gateway.createPrepay({ outTradeNo: payment.outTradeNo, openId: user.wechatOpenId, amountFen: payment.amountFen, description: payment.description })
        payment = await tx.payment.update({ where: { id: payment.id }, data: { status: 'PENDING', prepayId, prepayExpiresAt: payment.expiresAt } })
        return { payment, prepayId, error: null }
      } catch (error) {
        const status = error instanceof WechatPayRejectedError ? 'FAILED' : 'UNKNOWN'
        payment = await tx.payment.update({ where: { id: payment.id }, data: { status } })
        return { payment, prepayId: null, error: error instanceof Error ? error : new WechatPayUnknownError('Prepay outcome unknown') }
      }
    }, { timeout: 20_000 })
    if (result.error) throw result.error
    if (!result.prepayId) throw new WechatPayUnknownError('Missing prepay ID')
    return { payment: this.view(result.payment), launch: this.launch(result.prepayId) }
  }

  private async queryResult(payment: Payment): Promise<WechatPaymentResult | null> {
    try {
      const queried = await this.gateway.queryPayment(payment.outTradeNo)
      if (queried.outTradeNo !== payment.outTradeNo || queried.appId !== this.config.appId || queried.mchId !== this.config.mchId ||
        queried.amountFen !== payment.amountFen || queried.currency !== 'CNY') {
        throw new WechatPayUnknownError('WeChat Pay payment identity mismatch')
      }
      return queried
    } catch (error) {
      if (error instanceof WechatPayRejectedError && error.status === 404) return null
      throw error
    }
  }

  async getPayment(userId: string, paymentId: string): Promise<PaymentView> {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } })
    if (!payment || payment.userId !== userId) throw new NotFoundException('Payment not found')
    return this.view(payment)
  }

  async refreshPayment(paymentId: string): Promise<PaymentView> {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } })
    if (!payment) throw new NotFoundException('Payment not found')
    if (payment.status === 'SUCCEEDED' || payment.status === 'CLOSED') return this.view(payment)
    const result = await this.queryResult(payment)
    if (!result) return this.view(payment)
    const status = result.tradeState === 'SUCCESS' ? 'SUCCEEDED'
      : result.tradeState === 'CLOSED' || result.tradeState === 'REVOKED' ? 'CLOSED'
        : result.tradeState === 'PAYERROR' ? 'FAILED' : 'PENDING'
    const updated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status, wechatTransactionId: result.transactionId, lastQueriedAt: new Date(), ...(status === 'SUCCEEDED' ? { paidAt: new Date() } : {}) }
    })
    return this.view(updated)
  }

  async closeExpired(paymentId: string): Promise<void> {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } })
    if (!payment || payment.expiresAt > new Date() || ['SUCCEEDED', 'CLOSED', 'FAILED'].includes(payment.status)) return
    const latest = await this.refreshPayment(paymentId)
    if (latest.status === 'SUCCEEDED' || latest.status === 'CLOSED') return
    await this.gateway.closePayment(payment.outTradeNo)
    await this.prisma.payment.updateMany({ where: { id: paymentId, status: { in: ['CREATING', 'PENDING', 'UNKNOWN'] } }, data: { status: 'CLOSED' } })
  }
}
