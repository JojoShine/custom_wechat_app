import 'reflect-metadata'
import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { PRISMA } from '../../common/database/prisma.provider.js'
import { AccessGuard } from '../auth/access.guard.js'
import { FilesService } from '../files/files.service.js'
import { WebviewController } from './webview.controller.js'
import { WEBVIEW_APPS } from './webview.config.js'
import { WebviewGuard } from './webview.guard.js'
import { WebviewTicketService } from './webview-ticket.service.js'

@Module({
  controllers: [WebviewController],
  providers: [
    AccessGuard, WebviewGuard,
    { provide: WEBVIEW_APPS, useValue: [] },
    { provide: PRISMA, useValue: {} },
    { provide: FilesService, useValue: {} },
    { provide: WebviewTicketService, useValue: {} }
  ]
})
class TestModule {}

it('serves a self-contained H5 demo from the API', async () => {
  const app = await NestFactory.create(TestModule, { logger: false })
  await app.listen(0)
  try {
    const response = await fetch(`${await app.getUrl()}/webview/demo`)
    const html = await response.text()
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(html).toContain('轻购实验室')
    expect(html).toContain('/webview/exchange')
    expect(html).toContain('/webview/me')
    expect(html).not.toMatch(/<script[^>]+src=/)
  } finally {
    await app.close()
  }
})
