import { Module } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import { ApiExceptionFilter } from './common/http/api-exception.filter.js'
import { HealthController } from './health/health.controller.js'
import { AuthModule } from './modules/auth/auth.module.js'
import { UsersModule } from './modules/users/users.module.js'
import { FilesModule } from './modules/files/files.module.js'

@Module({
  imports: [AuthModule, UsersModule, FilesModule],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }]
})
export class AppModule {}
