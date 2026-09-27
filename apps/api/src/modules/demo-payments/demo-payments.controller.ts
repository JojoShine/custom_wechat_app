import { BadRequestException, Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common'
import { AccessGuard, type AuthenticatedRequest } from '../auth/access.guard.js'
import { DemoPaymentsService } from './demo-payments.service.js'

@Controller('demo/payments/orders')
@UseGuards(AccessGuard)
export class DemoPaymentsController {
  constructor(private readonly demo: DemoPaymentsService) {}

  @Post()
  createOrder(@Req() request: AuthenticatedRequest, @Body() body?: Record<string, unknown>) {
    if (body && Object.keys(body).length) throw new BadRequestException('Demo order does not accept client pricing or metadata')
    return this.demo.createOrder(request.userId)
  }

  @Get(':id')
  getOrder(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.demo.getOrder(request.userId, id)
  }

  @Post(':id/refunds')
  requestRefund(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body?: { requestId?: string; amountFen?: number }) {
    if (!body || Object.keys(body).some((key) => key !== 'requestId') || typeof body.requestId !== 'string') {
      throw new BadRequestException('Only a refund request ID is accepted')
    }
    return this.demo.requestRefund(request.userId, id, body.requestId)
  }
}
