import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../app.module.js'

describe('GET /health', () => {
  beforeAll(() => { process.env.DATABASE_URL = 'postgresql://template:localdev@localhost:5433/template' })
  it('returns a ready response', async () => {
    const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false })
    await app.listen(0)

    try {
      const response = await fetch(`${await app.getUrl()}/health`)
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ status: 'ok' })
    } finally {
      await app.close()
    }
  })

  it('returns a stable error envelope for unknown routes', async () => {
    const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false })
    await app.listen(0)

    try {
      const response = await fetch(`${await app.getUrl()}/missing`)
      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({ code: 'NOT_FOUND', message: 'Not Found' })
    } finally {
      await app.close()
    }
  })

  it('returns 429 with retry guidance after repeated login attempts', async () => {
    const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false })
    await app.listen(0)
    try {
      const url = `${await app.getUrl()}/auth/wechat`
      for (let i = 0; i < 10; i++) {
        const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
        expect(response.status).toBe(400)
      }
      const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      expect(response.status).toBe(429)
      expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0)
      expect(await response.json()).toEqual({ code: 'RATE_LIMITED', message: 'Too many requests' })
    } finally {
      await app.close()
    }
  })
})
