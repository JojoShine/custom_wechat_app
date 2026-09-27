import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { AccessGuard } from '../auth/access.guard.js'
import { APP_LOGGER, appLogger } from '../../common/logging/logger.js'
import { TelemetryController } from './telemetry.controller.js'

@Module({ imports: [AuthModule], controllers: [TelemetryController], providers: [AccessGuard, { provide: APP_LOGGER, useValue: appLogger }] })
export class TelemetryModule {}
