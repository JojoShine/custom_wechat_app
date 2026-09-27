import { Inject, Injectable, type NestMiddleware } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type { Logger } from 'winston'
import { APP_LOGGER } from './logger.js'

type RequestMeta = { method?: string; requestId?: string; route?: { path?: string } }

export function safeRequestRecord(request: RequestMeta, status: number, durationMs: number) {
  return { category: 'request', requestId: request.requestId, method: request.method ?? 'UNKNOWN', path: request.route?.path ?? '/unmatched', status, durationMs }
}

@Injectable()
export class RequestLogger implements NestMiddleware {
  constructor(@Inject(APP_LOGGER) private readonly logger: Logger) {}

  use(request: RequestMeta, response: { statusCode: number; on(event: string, listener: () => void): void }, next: () => void): void {
    request.requestId = randomUUID()
    const started = Date.now()
    response.on('finish', () => this.logger.info(safeRequestRecord(request, response.statusCode, Date.now() - started)))
    next()
  }
}
