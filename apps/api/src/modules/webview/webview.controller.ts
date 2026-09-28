import { BadRequestException, Body, Controller, Get, Header, HttpCode, Inject, NotFoundException, Post, Req, UseGuards } from '@nestjs/common'
import { SignJWT } from 'jose'
import type { WebviewAppSummary, WebviewExchangeResult, WebviewProfile, WebviewTicketResult } from '@template/contracts'
import type { PrismaClient } from '../../generated/prisma/client.js'
import { PRISMA } from '../../common/database/prisma.provider.js'
import { AccessGuard, type AuthenticatedRequest } from '../auth/access.guard.js'
import { FilesService } from '../files/files.service.js'
import { WEBVIEW_APPS, type WebviewAppConfig } from './webview.config.js'
import { WebviewGuard, type WebviewRequest } from './webview.guard.js'
import { WebviewTicketService } from './webview-ticket.service.js'
import { demoPage } from './demo-page.js'

const WEBVIEW_TOKEN_SECONDS = 15 * 60

@Controller('webview')
export class WebviewController {
  constructor(
    private readonly tickets: WebviewTicketService,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly files: FilesService,
    @Inject(WEBVIEW_APPS) private readonly apps: readonly WebviewAppConfig[]
  ) {}

  @Get('apps')
  appsList(): WebviewAppSummary[] {
    return this.apps.map(({ appId, name }) => ({ appId, name }))
  }

  @Get('demo')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  demo(): string {
    return demoPage
  }

  @Post('tickets')
  @UseGuards(AccessGuard)
  async issue(@Req() request: AuthenticatedRequest, @Body() body: { appId?: string }): Promise<WebviewTicketResult> {
    if (typeof body?.appId !== 'string') throw new BadRequestException('Invalid WebView appId')
    return this.tickets.issue(request.userId, body.appId)
  }

  @Post('exchange')
  @HttpCode(200)
  async exchange(@Body() body: { appId?: string; ticket?: string }): Promise<WebviewExchangeResult> {
    if (typeof body?.appId !== 'string' || typeof body?.ticket !== 'string') throw new BadRequestException('Invalid WebView ticket')
    const userId = await this.tickets.consume(body.appId, body.ticket)
    if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required')
    const accessToken = await new SignJWT({ token_use: 'webview' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setAudience(body.appId)
      .setIssuedAt()
      .setExpirationTime(`${WEBVIEW_TOKEN_SECONDS}s`)
      .sign(new TextEncoder().encode(process.env.JWT_SECRET))
    return { accessToken, expiresIn: WEBVIEW_TOKEN_SECONDS }
  }

  @Get('me')
  @UseGuards(WebviewGuard)
  async me(@Req() request: WebviewRequest): Promise<WebviewProfile> {
    const user = await this.prisma.user.findUnique({ where: { id: request.userId }, select: { id: true, nickname: true, avatarFileId: true, phoneNumber: true } })
    if (!user) throw new NotFoundException('User not found')
    const avatarUrl = user.avatarFileId ? (await this.files.readUrl(user.id, user.avatarFileId)).url : null
    return { id: user.id, nickname: user.nickname, avatarUrl, phoneBound: !!user.phoneNumber }
  }
}
