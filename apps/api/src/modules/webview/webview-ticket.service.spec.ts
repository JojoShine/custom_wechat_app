import { createHash, randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../generated/prisma/client.js'
import { WebviewTicketService } from './webview-ticket.service.js'

describe.skipIf(!process.env.TEST_DATABASE_URL)('WebviewTicketService', () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL! }) })
  const apps = [
    { appId: 'demo', name: '示例', entryUrl: 'https://demo.example.com', origin: 'https://demo.example.com' },
    { appId: 'other', name: '其他', entryUrl: 'https://other.example.com', origin: 'https://other.example.com' }
  ]
  const service = new WebviewTicketService(prisma, apps)
  let userId: string

  beforeAll(async () => { userId = (await prisma.user.create({ data: { wechatOpenId: `webview-service-${randomUUID()}` } })).id })
  afterAll(async () => {
    if (userId) await prisma.user.delete({ where: { id: userId } })
    await prisma.$disconnect()
  })

  it('issues a 60-second ticket and stores only its hash', async () => {
    const before = Date.now()
    const result = await service.issue(userId, 'demo')
    const row = await prisma.webviewTicket.findUnique({ where: { tokenHash: createHash('sha256').update(result.ticket).digest('hex') } })
    expect(result.entryUrl).toBe('https://demo.example.com')
    expect(result.expiresIn).toBe(60)
    expect(result.ticket.length).toBeGreaterThan(30)
    expect(row?.userId).toBe(userId)
    expect(row?.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 60_000)
    expect(row?.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 60_000)
  })

  it('rejects an unknown app', async () => {
    await expect(service.issue(userId, 'missing')).rejects.toThrow()
  })

  it('does not consume a ticket when the app differs', async () => {
    const { ticket } = await service.issue(userId, 'demo')
    await expect(service.consume('other', ticket)).rejects.toThrow()
    await expect(service.consume('demo', ticket)).resolves.toBe(userId)
  })

  it('rejects an expired ticket', async () => {
    const { ticket } = await service.issue(userId, 'demo')
    await prisma.webviewTicket.update({ where: { tokenHash: createHash('sha256').update(ticket).digest('hex') }, data: { expiresAt: new Date(Date.now() - 1_000) } })
    await expect(service.consume('demo', ticket)).rejects.toThrow()
  })

  it('allows exactly one of two concurrent redemptions', async () => {
    const { ticket } = await service.issue(userId, 'demo')
    const results = await Promise.allSettled([service.consume('demo', ticket), service.consume('demo', ticket)])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
  })

  it('cleans up expired and consumed tickets on issue', async () => {
    const expired = await service.issue(userId, 'demo')
    const consumed = await service.issue(userId, 'demo')
    const hash = (ticket: string) => createHash('sha256').update(ticket).digest('hex')
    await prisma.webviewTicket.update({ where: { tokenHash: hash(expired.ticket) }, data: { expiresAt: new Date(Date.now() - 1_000) } })
    await service.consume('demo', consumed.ticket)
    await service.issue(userId, 'demo')
    expect(await prisma.webviewTicket.findUnique({ where: { tokenHash: hash(expired.ticket) } })).toBeNull()
    expect(await prisma.webviewTicket.findUnique({ where: { tokenHash: hash(consumed.ticket) } })).toBeNull()
  })
})
