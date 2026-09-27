import { Module } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import { ApiExceptionFilter } from './common/http/api-exception.filter.js'
import { HealthController } from './health/health.controller.js'

@Module({
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }]
})
export class AppModule {}
