import { Module } from '@nestjs/common'
import { prismaProvider } from '../../common/database/prisma.provider.js'
import { AuthController } from './auth.controller.js'
import { SessionService } from './session.service.js'
import { WechatAuthService } from './wechat-auth.service.js'
import { WechatIdentityProvider } from './wechat-identity.provider.js'

@Module({
  controllers: [AuthController],
  providers: [prismaProvider, SessionService, WechatAuthService, WechatIdentityProvider],
  exports: [prismaProvider, SessionService]
})
export class AuthModule {}
