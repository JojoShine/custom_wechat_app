import { Module } from '@nestjs/common'
import { prismaProvider } from '../../common/database/prisma.provider.js'
import { PaymentsModule } from '../payments/payments.module.js'
import { DemoPaymentsController } from './demo-payments.controller.js'
import { DemoPaymentsService } from './demo-payments.service.js'

@Module({
  imports: [PaymentsModule],
  controllers: [DemoPaymentsController],
  providers: [prismaProvider, DemoPaymentsService]
})
export class DemoPaymentsModule {}
