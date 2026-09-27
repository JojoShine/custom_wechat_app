import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import { ApiExceptionFilter } from './common/http/api-exception.filter.js'
import { HealthController } from './health/health.controller.js'
import { AuthModule } from './modules/auth/auth.module.js'
import { UsersModule } from './modules/users/users.module.js'
import { FilesModule } from './modules/files/files.module.js'
import { TelemetryModule } from './modules/telemetry/telemetry.module.js'
import { APP_LOGGER, appLogger } from './common/logging/logger.js'
import { RequestLogger } from './common/logging/request-logger.js'
import { PaymentsModule } from './modules/payments/payments.module.js'
import { DemoPaymentsModule } from './modules/demo-payments/demo-payments.module.js'

@Module({
  imports: [AuthModule, UsersModule, FilesModule, TelemetryModule, ...(process.env.WECHAT_PAY_MCH_ID ? [PaymentsModule] : []), ...(process.env.DEMO_PAYMENTS_ENABLED === 'true' ? [DemoPaymentsModule] : [])],
  controllers: [HealthController],
  providers: [{ provide: APP_LOGGER, useValue: appLogger }, RequestLogger, { provide: APP_FILTER, useClass: ApiExceptionFilter }]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void { consumer.apply(RequestLogger).forRoutes('*') }
}
