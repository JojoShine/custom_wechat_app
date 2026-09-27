import { BadRequestException, Inject, Injectable, NotFoundException, OnModuleInit, ConflictException } from '@nestjs/common'
import type { PaymentLaunchParams, PaymentView, RefundView } from '@template/contracts'
import type { PrismaClient } from '../../generated/prisma/client.js'
import { PRISMA } from '../../common/database/prisma.provider.js'
import { PaymentService } from '../payments/payment.service.js'
import { RefundService } from '../payments/refund.service.js'
import { PaymentEvents, type BusinessPaymentEvent } from '../payments/payment-events.js'

const PRICE_FEN = 10
const PRODUCT_NAME = '支付联调商品'

export type DemoOrderView = { id: string; productName: string; priceFen: number; status: 'CREATED' | 'PAID'; paymentId: string | null }

@Injectable()
export class DemoPaymentsService implements OnModuleInit {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly payments: PaymentService,
    private readonly refunds: RefundService,
    private readonly events: PaymentEvents
  ) {}

  onModuleInit(): void {
    this.events.register('demo', (event) => this.applyPaymentEvent(event))
  }

  async createOrder(userId: string): Promise<{ order: DemoOrderView; payment: PaymentView; launch: PaymentLaunchParams }> {
    const order = await this.prisma.demoPaymentOrder.create({ data: { userId, productName: PRODUCT_NAME, priceFen: PRICE_FEN } })
    const { payment, launch } = await this.payments.createPrepay({
      businessType: 'demo', businessOrderId: order.id, userId, amountFen: order.priceFen,
      description: order.productName, idempotencyKey: `demo:${order.id}`
    })
    const saved = await this.prisma.demoPaymentOrder.update({ where: { id: order.id }, data: { paymentId: payment.id } })
    return { order: this.view(saved), payment, launch }
  }

  private view(order: { id: string; productName: string; priceFen: number; status: 'CREATED' | 'PAID'; paymentId: string | null }): DemoOrderView {
    return { id: order.id, productName: order.productName, priceFen: order.priceFen, status: order.status, paymentId: order.paymentId }
  }

  async getOrder(userId: string, orderId: string): Promise<DemoOrderView> {
    const order = await this.prisma.demoPaymentOrder.findUnique({ where: { id: orderId } })
    if (!order || order.userId !== userId) throw new NotFoundException('Demo order not found')
    return this.view(order)
  }

  async requestRefund(userId: string, orderId: string, requestId: string): Promise<RefundView> {
    if (!requestId || requestId.length > 100) throw new BadRequestException('Invalid refund request ID')
    const order = await this.prisma.demoPaymentOrder.findUnique({ where: { id: orderId } })
    if (!order || order.userId !== userId) throw new NotFoundException('Demo order not found')
    if (order.status !== 'PAID' || !order.paymentId) throw new ConflictException('Demo order is not paid')
    return this.refunds.requestRefund({
      paymentId: order.paymentId, businessRefundId: `demo:${order.id}:${requestId}`,
      amountFen: 1, reason: 'Demo refund'
    })
  }

  private async applyPaymentEvent(event: BusinessPaymentEvent): Promise<void> {
    if (event.kind !== 'PAYMENT' || event.status !== 'SUCCEEDED') return
    const order = await this.prisma.demoPaymentOrder.findUnique({ where: { id: event.businessOrderId } })
    if (!order || order.paymentId !== event.paymentId || order.priceFen !== event.amountFen) {
      throw new Error('Demo order payment event mismatch')
    }
    await this.prisma.demoPaymentOrder.updateMany({ where: { id: order.id, status: 'CREATED' }, data: { status: 'PAID' } })
  }
}
