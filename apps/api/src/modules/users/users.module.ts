import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { AccessGuard } from '../auth/access.guard.js'
import { UsersController } from './users.controller.js'
import { FilesModule } from '../files/files.module.js'
import { WechatPhoneProvider } from './wechat-phone.provider.js'

@Module({ imports: [AuthModule, FilesModule], controllers: [UsersController], providers: [AccessGuard, WechatPhoneProvider] })
export class UsersModule {}
