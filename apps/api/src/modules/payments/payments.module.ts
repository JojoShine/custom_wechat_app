import { Module } from '@nestjs/common'
import { loadWechatPayConfig, type WechatPayConfig } from '../../common/config/app-config.js'
import { prismaProvider } from '../../common/database/prisma.provider.js'
import { PaymentController } from './payment.controller.js'
import { PaymentService, WECHAT_PAY_CONFIG, WECHAT_PAY_GATEWAY } from './payment.service.js'
import { WechatPayGateway } from './wechat-pay.gateway.js'
import { NotificationController } from './notification.controller.js'
import { PaymentEvents } from './payment-events.js'
import { RefundService } from './refund.service.js'
import { PaymentRecovery } from './payment-recovery.js'
import { ReconciliationService } from './reconciliation.service.js'

@Module({
  controllers: [PaymentController, NotificationController],
  providers: [
    prismaProvider,
    PaymentService,
    PaymentEvents,
    RefundService,
    PaymentRecovery,
    ReconciliationService,
    { provide: WECHAT_PAY_CONFIG, useFactory: () => loadWechatPayConfig(process.env) },
    { provide: WECHAT_PAY_GATEWAY, useFactory: (config: WechatPayConfig) => new WechatPayGateway(config), inject: [WECHAT_PAY_CONFIG] }
  ],
  exports: [PaymentService, RefundService, PaymentEvents, WECHAT_PAY_GATEWAY, WECHAT_PAY_CONFIG]
})
export class PaymentsModule {}
