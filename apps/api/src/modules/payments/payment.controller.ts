import { Controller, Get, NotFoundException, Param, Req, UseGuards } from '@nestjs/common'
import type { PaymentView, RefundView } from '@template/contracts'
import { AccessGuard, type AuthenticatedRequest } from '../auth/access.guard.js'
import { PaymentService } from './payment.service.js'
import { RefundService } from './refund.service.js'

@Controller('payments')
@UseGuards(AccessGuard)
export class PaymentController {
  constructor(private readonly payments: PaymentService, private readonly refunds: RefundService) {}

  @Get(':id')
  getPayment(@Req() request: AuthenticatedRequest, @Param('id') id: string): Promise<PaymentView> {
    return this.payments.getPayment(request.userId, id)
  }

  @Get(':id/refunds/:refundId')
  async getRefund(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Param('refundId') refundId: string): Promise<RefundView> {
    const refund = await this.refunds.getRefund(request.userId, refundId)
    if (refund.paymentId !== id) throw new NotFoundException('Refund not found')
    return refund
  }
}
