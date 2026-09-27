import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common'
import type { PaymentView } from '@template/contracts'
import { AccessGuard, type AuthenticatedRequest } from '../auth/access.guard.js'
import { PaymentService } from './payment.service.js'

@Controller('payments')
@UseGuards(AccessGuard)
export class PaymentController {
  constructor(private readonly payments: PaymentService) {}

  @Get(':id')
  getPayment(@Req() request: AuthenticatedRequest, @Param('id') id: string): Promise<PaymentView> {
    return this.payments.getPayment(request.userId, id)
  }
}
