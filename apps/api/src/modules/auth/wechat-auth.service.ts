import { Inject, Injectable } from '@nestjs/common'
import type { AuthTokens } from '@template/contracts'
import type { PrismaClient } from '../../generated/prisma/client.js'
import { PRISMA } from '../../common/database/prisma.provider.js'
import { SessionService } from './session.service.js'
import { WechatIdentityProvider } from './wechat-identity.provider.js'

@Injectable()
export class WechatAuthService {
  constructor(
    private readonly identity: WechatIdentityProvider,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly sessions: SessionService
  ) {}

  async login(code: string): Promise<AuthTokens> {
    const { openId } = await this.identity.exchangeCode(code)
    const user = await this.prisma.user.upsert({
      where: { wechatOpenId: openId },
      create: { wechatOpenId: openId },
      update: {}
    })
    return this.sessions.issue(user.id)
  }
}
