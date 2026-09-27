import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../app.module.js'

describe('GET /health', () => {
  it('returns a ready response', async () => {
    const app = await NestFactory.create(AppModule, { logger: false })
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
    const app = await NestFactory.create(AppModule, { logger: false })
    await app.listen(0)

    try {
      const response = await fetch(`${await app.getUrl()}/missing`)
      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({ code: 'NOT_FOUND', message: 'Not Found' })
    } finally {
      await app.close()
    }
  })
})
