import 'reflect-metadata'
import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { SignJWT } from 'jose'
import { AccessGuard } from '../auth/access.guard.js'
import { FilesController } from './files.controller.js'
import { FilesService } from './files.service.js'

const authorize = vi.fn(async () => ({ uploadId: 'file-1', url: 'https://private.example.com', fields: {}, expiresAt: new Date().toISOString() }))
const confirm = vi.fn(async () => ({ id: 'file-1', contentType: 'image/jpeg', size: 123 }))
const readUrl = vi.fn(async () => ({ url: 'https://private.example.com/signed', expiresAt: new Date().toISOString() }))

@Module({
  controllers: [FilesController],
  providers: [AccessGuard, { provide: FilesService, useValue: { authorize, confirm, readUrl } }]
})
class TestModule {}

it('requires login for file routes and passes the signed-in user to service', async () => {
  process.env.JWT_SECRET = 'test-secret-long-enough-for-hmac-signing'
  const app = await NestFactory.create(TestModule, { logger: false })
  await app.listen(0)
  try {
    const base = await app.getUrl()
    const denied = await fetch(`${base}/files/uploads`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contentType: 'image/jpeg', size: 123 }) })
    expect(denied.status).toBe(401)
    expect(authorize).not.toHaveBeenCalled()

    const token = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject('user-1').setExpirationTime('15m').sign(new TextEncoder().encode(process.env.JWT_SECRET))
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    const accepted = await fetch(`${base}/files/uploads`, { method: 'POST', headers, body: JSON.stringify({ contentType: 'image/jpeg', size: 123 }) })
    expect(accepted.status).toBe(201)
    expect(authorize).toHaveBeenCalledWith('user-1', { contentType: 'image/jpeg', size: 123 })
    const confirmed = await fetch(`${base}/files/uploads/file-1/confirm`, { method: 'POST', headers })
    expect(confirmed.status).toBe(200)
    expect(confirm).toHaveBeenCalledWith('user-1', 'file-1')
    const read = await fetch(`${base}/files/file-1/read-url`, { headers })
    expect(read.status).toBe(200)
    expect(readUrl).toHaveBeenCalledWith('user-1', 'file-1')
  } finally {
    await app.close()
  }
})
