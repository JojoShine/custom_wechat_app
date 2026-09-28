import { SignJWT, jwtVerify } from 'jose'
import { randomUUID } from 'node:crypto'
import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../generated/prisma/client.js'
import { PRISMA } from '../../common/database/prisma.provider.js'
import { AccessGuard } from '../auth/access.guard.js'
import { SessionService } from '../auth/session.service.js'
import { UsersController } from '../users/users.controller.js'
import { FilesService } from '../files/files.service.js'
import { WechatPhoneProvider } from '../users/wechat-phone.provider.js'
import { WebviewController } from './webview.controller.js'
import { WebviewGuard } from './webview.guard.js'
import { WEBVIEW_APPS } from './webview.module.js'
import { WebviewTicketService } from './webview-ticket.service.js'
import { webviewCorsOptions } from './webview-cors.js'

const secret = 'webview-test-secret-long-enough-for-hmac'
const key = new TextEncoder().encode(secret)

describe('WebView JWT isolation', () => {
  beforeEach(() => { process.env.JWT_SECRET = secret })

  it('rejects a WebView JWT at the native access guard', async () => {
    const token = await new SignJWT({ token_use: 'webview' }).setProtectedHeader({ alg: 'HS256' }).setSubject('user-1').setAudience('demo').setExpirationTime('15m').sign(key)
    const request = { headers: { authorization: `Bearer ${token}` } }
    await expect(new AccessGuard().canActivate({ switchToHttp: () => ({ getRequest: () => request }) } as never)).rejects.toThrow()
  })

  it('marks freshly issued native JWTs with the miniapp purpose', async () => {
    const prisma = { refreshSession: { create: async () => ({}) } }
    const { accessToken } = await new SessionService(prisma as never).issue('user-1')
    const { payload } = await jwtVerify(accessToken, key)
    expect(payload.token_use).toBe('miniapp')
  })
})

describe.skipIf(!process.env.TEST_DATABASE_URL)('WebView HTTP flow', () => {
  const apps = [{ appId: 'demo', name: '示例网页', entryUrl: 'https://demo.example.com/view', origin: 'https://demo.example.com' }]
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL! }) })
  const tickets = new WebviewTicketService(prisma, apps)

  @Module({
    controllers: [WebviewController, UsersController],
    providers: [
      AccessGuard, WebviewGuard,
      { provide: PRISMA, useValue: prisma },
      { provide: WEBVIEW_APPS, useValue: apps },
      { provide: WebviewTicketService, useValue: tickets },
      { provide: FilesService, useValue: { readUrl: async () => ({ url: 'https://oss.example.com/signed' }) } },
      { provide: WechatPhoneProvider, useValue: {} }
    ]
  })
  class TestModule {}

  it('issues one ticket and exchanges it for a limited profile', async () => {
    process.env.JWT_SECRET = secret
    const user = await prisma.user.create({ data: { wechatOpenId: `webview-http-${randomUUID()}`, nickname: '小明' } })
    const app = await NestFactory.create(TestModule, { logger: false })
    app.enableCors(webviewCorsOptions(apps))
    await app.listen(0)
    try {
      const base = await app.getUrl()
      const post = (body: unknown, token?: string) => ({ method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) })
      const native = await new SignJWT({ token_use: 'miniapp' }).setProtectedHeader({ alg: 'HS256' }).setSubject(user.id).setExpirationTime('15m').sign(key)
      const listed = await fetch(`${base}/webview/apps`)
      expect(await listed.json()).toEqual([{ appId: 'demo', name: '示例网页' }])
      expect((await fetch(`${base}/webview/tickets`, post({ appId: 'demo' }))).status).toBe(401)
      expect((await fetch(`${base}/webview/tickets`, post({ appId: 'missing' }, native))).status).toBe(400)
      const issued = await fetch(`${base}/webview/tickets`, post({ appId: 'demo' }, native))
      expect(issued.status).toBe(201)
      const { ticket, entryUrl } = await issued.json() as { ticket: string; entryUrl: string }
      expect(entryUrl).toBe('https://demo.example.com/view')
      const exchanged = await fetch(`${base}/webview/exchange`, post({ appId: 'demo', ticket }))
      expect(exchanged.status).toBe(200)
      const { accessToken } = await exchanged.json() as { accessToken: string }
      expect((await fetch(`${base}/webview/exchange`, post({ appId: 'demo', ticket }))).status).toBe(401)
      const profile = await fetch(`${base}/webview/me`, { headers: { Authorization: `Bearer ${accessToken}` } })
      expect(await profile.json()).toEqual({ id: user.id, nickname: '小明', avatarUrl: null, phoneBound: false })
      expect((await fetch(`${base}/users/me`, { headers: { Authorization: `Bearer ${accessToken}` } })).status).toBe(401)
      expect((await fetch(`${base}/webview/me`, { headers: { Authorization: `Bearer ${native}` } })).status).toBe(401)

      const foreign = await new SignJWT({ token_use: 'webview' }).setProtectedHeader({ alg: 'HS256' }).setSubject(user.id).setAudience('unregistered').setExpirationTime('15m').sign(key)
      expect((await fetch(`${base}/webview/me`, { headers: { Authorization: `Bearer ${foreign}` } })).status).toBe(401)
      const expired = await new SignJWT({ token_use: 'webview' }).setProtectedHeader({ alg: 'HS256' }).setSubject(user.id).setAudience('demo').setExpirationTime(-1).sign(key)
      expect((await fetch(`${base}/webview/me`, { headers: { Authorization: `Bearer ${expired}` } })).status).toBe(401)

      const allowed = await fetch(`${base}/webview/exchange`, { method: 'OPTIONS', headers: { Origin: 'https://demo.example.com', 'Access-Control-Request-Method': 'POST' } })
      expect(allowed.headers.get('access-control-allow-origin')).toBe('https://demo.example.com')
      const disallowed = await fetch(`${base}/webview/exchange`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example.com', 'Access-Control-Request-Method': 'POST' } })
      expect(disallowed.headers.get('access-control-allow-origin')).toBeNull()
    } finally {
      await app.close()
      await prisma.user.delete({ where: { id: user.id } })
      await prisma.$disconnect()
    }
  })
})
