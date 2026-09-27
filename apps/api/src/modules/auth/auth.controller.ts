import { BadRequestException, Body, Controller, Post } from '@nestjs/common'
import type { AuthTokens } from '@template/contracts'
import { WechatAuthService } from './wechat-auth.service.js'

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: WechatAuthService) {}

  @Post('wechat')
  async wechat(@Body() body: { code?: string }): Promise<AuthTokens> {
    if (typeof body?.code !== 'string' || !body.code.trim()) throw new BadRequestException('code is required')
    return this.auth.login(body.code)
  }
}
