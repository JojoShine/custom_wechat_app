import { Injectable, type NestMiddleware } from '@nestjs/common'

const WINDOW_MS = 60_000
const MAX_CLIENTS = 100_000
const sensitive = new Set(['POST /auth/wechat', 'POST /auth/refresh', 'POST /webview/exchange', 'POST /webview/tickets', 'POST /files/uploads'])

export function createRateLimiter(now: () => number = Date.now) {
  const attempts = new Map<string, { count: number; expiresAt: number }>()
  return (client: string, method: string, path: string): number | null => {
    const time = now()
    const route = `${method.toUpperCase()} ${(path.replace(/\/$/, '') || '/').toLowerCase()}`
    const group = sensitive.has(route) ? route : 'general'
    const key = `${client}\0${group}`
    let entry = attempts.get(key)
    if (entry && entry.expiresAt <= time) { attempts.delete(key); entry = undefined }
    if (!entry) {
      if (attempts.size >= MAX_CLIENTS) {
        for (const [existingKey, value] of attempts) if (value.expiresAt <= time) attempts.delete(existingKey)
        if (attempts.size >= MAX_CLIENTS) return 60
      }
      attempts.set(key, { count: 1, expiresAt: time + WINDOW_MS })
      return null
    }
    if (++entry.count > (group === 'general' ? 120 : 10)) return Math.max(1, Math.ceil((entry.expiresAt - time) / 1000))
    return null
  }
}

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly limit = createRateLimiter()

  use(request: { ip?: string; method: string; originalUrl: string }, response: { status(code: number): { json(body: unknown): void }; setHeader(name: string, value: string): void }, next: () => void): void {
    const retryAfter = this.limit(request.ip ?? 'unknown', request.method, request.originalUrl.split('?')[0])
    if (retryAfter === null) return next()
    response.setHeader('Retry-After', String(retryAfter))
    response.status(429).json({ code: 'RATE_LIMITED', message: 'Too many requests' })
  }
}
