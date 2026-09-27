import { BadRequestException, Body, Controller, Post } from '@nestjs/common'
import type { AuthTokens } from '@template/contracts'
import { WechatAuthService } from './wechat-auth.service.js'
import { SessionService } from './session.service.js'

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: WechatAuthService, private readonly sessions: SessionService) {}

  @Post('wechat')
  async wechat(@Body() body: { code?: string }): Promise<AuthTokens> {
    if (typeof body?.code !== 'string' || !body.code.trim()) throw new BadRequestException('code is required')
    return this.auth.login(body.code)
  }

  @Post('refresh')
  async refresh(@Body() body: { refreshToken?: string }): Promise<AuthTokens> {
    return this.sessions.refresh(body?.refreshToken ?? '')
  }

  @Post('logout')
  async logout(@Body() body: { refreshToken?: string }): Promise<{ ok: true }> {
    await this.sessions.logout(body?.refreshToken ?? '')
    return { ok: true }
  }
}
