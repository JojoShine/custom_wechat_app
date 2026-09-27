import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Inject } from '@nestjs/common'
import type { Logger } from 'winston'
import { APP_LOGGER, safeErrorRecord } from '../logging/logger.js'

type HttpResponse = { status(code: number): HttpResponse; json(body: unknown): void }

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(@Inject(APP_LOGGER) private readonly logger: Logger) {}
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<HttpResponse>()
    const status = exception instanceof HttpException ? exception.getStatus() : 500
    const code = status === 404 ? 'NOT_FOUND' : status === 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR'
    const message = status === 404 ? 'Not Found' : status === 500 ? 'Internal Server Error' :
      exception instanceof HttpException ? exception.message : 'Request failed'

    this.logger.error(safeErrorRecord(host.switchToHttp().getRequest(), status, code))
    response.status(status).json({ code, message })
  }
}
