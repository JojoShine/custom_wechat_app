import { createHash, randomBytes } from 'node:crypto'
import { BadRequestException, UnauthorizedException } from '@nestjs/common'
import type { WebviewTicketResult } from '@template/contracts'
import type { PrismaClient } from '../../generated/prisma/client.js'
import type { WebviewAppConfig } from './webview.config.js'

const TICKET_SECONDS = 60
const hash = (ticket: string) => createHash('sha256').update(ticket).digest('hex')

export class WebviewTicketService {
  constructor(private readonly prisma: PrismaClient, private readonly apps: readonly WebviewAppConfig[]) {}

  async issue(userId: string, appId: string): Promise<WebviewTicketResult> {
    const app = this.apps.find((value) => value.appId === appId)
    if (!app) throw new BadRequestException('Unknown WebView app')
    const now = new Date()
    await this.prisma.webviewTicket.deleteMany({ where: { OR: [{ expiresAt: { lte: now } }, { consumedAt: { not: null } }] } })
    const ticket = randomBytes(32).toString('base64url')
    await this.prisma.webviewTicket.create({
      data: { userId, appId, tokenHash: hash(ticket), expiresAt: new Date(now.getTime() + TICKET_SECONDS * 1_000) }
    })
    return { entryUrl: app.entryUrl, ticket, expiresIn: TICKET_SECONDS }
  }

  async consume(appId: string, ticket: string): Promise<string> {
    const invalid = () => new UnauthorizedException('Invalid WebView ticket')
    if (!this.apps.some((app) => app.appId === appId) || !ticket) throw invalid()
    const tokenHash = hash(ticket)
    const row = await this.prisma.webviewTicket.findUnique({ where: { tokenHash } })
    if (!row || row.appId !== appId || row.consumedAt || row.expiresAt <= new Date()) throw invalid()
    const consumed = await this.prisma.webviewTicket.updateMany({
      where: { tokenHash, appId, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() }
    })
    if (consumed.count !== 1) throw invalid()
    return row.userId
  }
}
