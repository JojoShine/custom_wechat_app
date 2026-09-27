import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common'

type HttpResponse = { status(code: number): HttpResponse; json(body: unknown): void }

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<HttpResponse>()
    const status = exception instanceof HttpException ? exception.getStatus() : 500
    const code = status === 404 ? 'NOT_FOUND' : status === 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR'
    const message = status === 404 ? 'Not Found' : status === 500 ? 'Internal Server Error' :
      exception instanceof HttpException ? exception.message : 'Request failed'

    response.status(status).json({ code, message })
  }
}
