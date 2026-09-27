import 'reflect-metadata'
import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AuthController } from './auth.controller.js'
import { SessionService } from './session.service.js'
import { WechatAuthService } from './wechat-auth.service.js'

@Module({
  controllers: [AuthController],
  providers: [
    { provide: WechatAuthService, useValue: { login: vi.fn() } },
    { provide: SessionService, useValue: { refresh: async () => ({ accessToken: 'new', refreshToken: 'next', expiresIn: 900 }) } }
  ]
})
class TestModule {}

it('returns 200 from the refresh HTTP endpoint', async () => {
  const app = await NestFactory.create(TestModule, { logger: false })
  await app.listen(0)
  try {
    const response = await fetch(`${await app.getUrl()}/auth/refresh`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: 'old' })
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ accessToken: 'new', refreshToken: 'next' })
  } finally {
    await app.close()
  }
})
