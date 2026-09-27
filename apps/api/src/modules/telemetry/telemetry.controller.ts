import { BadRequestException, Body, Controller, Inject, Post, Req, UseGuards } from '@nestjs/common'
import type { Logger } from 'winston'
import type { TelemetryEvent } from '@template/contracts'
import { APP_LOGGER } from '../../common/logging/logger.js'
import { AccessGuard, type AuthenticatedRequest } from '../auth/access.guard.js'

const eventPages: Record<string, string> = {
  'auth.login': '/pages/login/index',
  'profile.save': '/pages/profile/index',
  'profile.avatar': '/pages/profile/index',
  'profile.phone': '/pages/profile/index',
  'portal.share': '/pages/portal/index'
}

@Controller('telemetry')
@UseGuards(AccessGuard)
export class TelemetryController {
  constructor(@Inject(APP_LOGGER) private readonly logger: Logger) {}

  @Post('events')
  record(@Req() request: AuthenticatedRequest, @Body() body: Record<string, unknown>): { accepted: true } {
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).sort().join(',') !== 'kind,name,occurredAt,page,result' ||
      !['event', 'error'].includes(String(body.kind)) ||
      typeof body.name !== 'string' || !/^[a-z][a-z0-9_.-]{0,63}$/.test(body.name) ||
      !Object.hasOwn(eventPages, body.name) || body.page !== eventPages[body.name] ||
      !['success', 'failure', 'cancelled'].includes(String(body.result)) ||
      typeof body.occurredAt !== 'string' || body.occurredAt.length > 30 ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(body.occurredAt) || Number.isNaN(Date.parse(body.occurredAt)) ||
      Buffer.byteLength(JSON.stringify(body), 'utf8') > 512) {
      throw new BadRequestException('Invalid telemetry event')
    }
    const event = body as unknown as TelemetryEvent
    this.logger.info({ category: 'event', userId: request.userId, kind: event.kind, name: event.name, page: event.page, result: event.result, occurredAt: event.occurredAt })
    return { accepted: true }
  }
}
