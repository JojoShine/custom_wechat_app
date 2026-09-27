import { Module } from '@nestjs/common'
import { loadWechatPayConfig, type WechatPayConfig } from '../../common/config/app-config.js'
import { prismaProvider } from '../../common/database/prisma.provider.js'
import { PaymentController } from './payment.controller.js'
import { PaymentService, WECHAT_PAY_CONFIG, WECHAT_PAY_GATEWAY } from './payment.service.js'
import { WechatPayGateway } from './wechat-pay.gateway.js'

@Module({
  controllers: [PaymentController],
  providers: [
    prismaProvider,
    PaymentService,
    { provide: WECHAT_PAY_CONFIG, useFactory: () => loadWechatPayConfig(process.env) },
    { provide: WECHAT_PAY_GATEWAY, useFactory: (config: WechatPayConfig) => new WechatPayGateway(config), inject: [WECHAT_PAY_CONFIG] }
  ],
  exports: [PaymentService, WECHAT_PAY_GATEWAY, WECHAT_PAY_CONFIG]
})
export class PaymentsModule {}
