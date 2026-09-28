import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../generated/prisma/client.js'

describe.skipIf(!process.env.TEST_DATABASE_URL)('WebviewTicket persistence', () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL! }) })

  afterAll(async () => { await prisma.$disconnect() })

  it('stores unique ticket hashes and deletes tickets with their user', async () => {
    const user = await prisma.user.create({ data: { wechatOpenId: `webview-${randomUUID()}` } })
    const hash = randomUUID().replace(/-/g, '')
    try {
      await prisma.webviewTicket.create({ data: { userId: user.id, appId: 'demo', tokenHash: hash, expiresAt: new Date(Date.now() + 60_000) } })
      await expect(prisma.webviewTicket.create({ data: { userId: user.id, appId: 'demo', tokenHash: hash, expiresAt: new Date(Date.now() + 60_000) } })).rejects.toThrow()
      expect(await prisma.webviewTicket.findUnique({ where: { tokenHash: hash } })).toMatchObject({ userId: user.id, appId: 'demo', consumedAt: null })
    } finally {
      await prisma.user.delete({ where: { id: user.id } })
    }
    expect(await prisma.webviewTicket.findUnique({ where: { tokenHash: hash } })).toBeNull()
  })
})
