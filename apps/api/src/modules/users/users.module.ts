import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { AccessGuard } from '../auth/access.guard.js'
import { UsersController } from './users.controller.js'

@Module({ imports: [AuthModule], controllers: [UsersController], providers: [AccessGuard] })
export class UsersModule {}
