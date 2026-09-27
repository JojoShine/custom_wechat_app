import { Controller, Headers, HttpCode, Inject, Post, Req, UnauthorizedException } from '@nestjs/common'
import { PaymentService, WECHAT_PAY_GATEWAY } from './payment.service.js'
import { WechatPaySecurityError, type WechatPayGateway } from './wechat-pay.gateway.js'

@Controller('payments/wechat')
export class NotificationController {
  constructor(
    @Inject(WECHAT_PAY_GATEWAY) private readonly gateway: WechatPayGateway,
    private readonly payments: PaymentService
  ) {}

  @Post('notify')
  @HttpCode(200)
  async payment(@Headers() headers: Record<string, string>, @Req() request: { rawBody?: Buffer }): Promise<{ code: string; message: string }> {
    if (!request.rawBody) throw new UnauthorizedException('Missing raw notification body')
    let notification
    try {
      notification = this.gateway.verifyNotification(headers, request.rawBody)
    } catch (error) {
      if (error instanceof WechatPaySecurityError) throw new UnauthorizedException('Untrusted WeChat Pay notification')
      throw error
    }
    await this.payments.applyVerifiedPayment(notification)
    return { code: 'SUCCESS', message: '成功' }
  }
}
