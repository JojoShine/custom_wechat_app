import 'reflect-metadata'
import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { SignJWT } from 'jose'
import { AccessGuard } from '../auth/access.guard.js'
import { APP_LOGGER } from '../../common/logging/logger.js'
import { TelemetryController } from './telemetry.controller.js'

const info = vi.fn()
@Module({ controllers: [TelemetryController], providers: [AccessGuard, { provide: APP_LOGGER, useValue: { info } }] })
class TestModule {}

it('requires login before accepting telemetry', async () => {
  process.env.JWT_SECRET = 'test-secret-long-enough-for-hmac-signing'
  const app = await NestFactory.create(TestModule, { logger: false, abortOnError: false })
  await app.listen(0)
  try {
    const url = `${await app.getUrl()}/telemetry/events`
    const event = { kind: 'event', name: 'profile.save', page: '/pages/profile/index', result: 'success', occurredAt: '2026-09-27T00:00:00.000Z' }
    const denied = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(event) })
    expect(denied.status).toBe(401)
    expect(info).not.toHaveBeenCalled()
    const token = await new SignJWT({ token_use: 'miniapp' }).setProtectedHeader({ alg: 'HS256' }).setSubject('user-1').setExpirationTime('15m').sign(new TextEncoder().encode(process.env.JWT_SECRET))
    const accepted = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(event) })
    expect(accepted.status).toBe(201)
    expect(info).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1' }))
  } finally { await app.close() }
})
