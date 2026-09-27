import { createLogger, format, transports } from 'winston'

export const APP_LOGGER = 'APP_LOGGER'
export const appLogger = createLogger({
  level: 'info',
  format: format.json(),
  transports: [new transports.Console({ stderrLevels: ['error'] })]
})

type RequestMeta = { method?: string; route?: { path?: string } }

export function safeErrorRecord(request: RequestMeta, status: number, code: string) {
  return { category: 'error', method: request.method ?? 'UNKNOWN', path: request.route?.path ?? '/unmatched', status, code }
}
