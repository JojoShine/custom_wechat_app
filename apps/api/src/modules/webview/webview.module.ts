import { Module } from '@nestjs/common'
import type { PrismaClient } from '../../generated/prisma/client.js'
import { PRISMA } from '../../common/database/prisma.provider.js'
import { AuthModule } from '../auth/auth.module.js'
import { AccessGuard } from '../auth/access.guard.js'
import { FilesModule } from '../files/files.module.js'
import { WebviewController } from './webview.controller.js'
import { WEBVIEW_APPS, loadWebviewApps, type WebviewAppConfig } from './webview.config.js'
import { WebviewGuard } from './webview.guard.js'
import { WebviewTicketService } from './webview-ticket.service.js'

export { WEBVIEW_APPS } from './webview.config.js'

@Module({
  imports: [AuthModule, FilesModule],
  controllers: [WebviewController],
  providers: [
    AccessGuard, WebviewGuard,
    { provide: WEBVIEW_APPS, useFactory: () => loadWebviewApps(process.env) },
    { provide: WebviewTicketService, useFactory: (prisma: PrismaClient, apps: WebviewAppConfig[]) => new WebviewTicketService(prisma, apps), inject: [PRISMA, WEBVIEW_APPS] }
  ]
})
export class WebviewModule {}
