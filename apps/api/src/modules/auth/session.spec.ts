import { UnauthorizedException } from '@nestjs/common'
import { SessionService } from './session.service.js'

describe('refresh session lifecycle', () => {
  const records = new Map<string, { userId: string; expiresAt: Date; revokedAt: Date | null }>()
  const prisma = {
    refreshSession: {
      create: vi.fn(async ({ data }: { data: { userId: string; tokenHash: string; expiresAt: Date } }) => {
        records.set(data.tokenHash, { userId: data.userId, expiresAt: data.expiresAt, revokedAt: null })
      }),
      findUnique: vi.fn(async ({ where }: { where: { tokenHash: string } }) => records.get(where.tokenHash) ?? null),
      updateMany: vi.fn(async ({ where, data }: { where: { tokenHash: string }; data: { revokedAt: Date } }) => {
        const record = records.get(where.tokenHash)
        if (!record || record.revokedAt || record.expiresAt <= new Date()) return { count: 0 }
        record.revokedAt = data.revokedAt
        return { count: 1 }
      })
    }
  }
  const transaction = vi.fn(async (operation: (client: unknown) => Promise<unknown>) => operation(prisma))
  const db = { ...prisma, $transaction: transaction }

  beforeEach(() => {
    records.clear()
    vi.clearAllMocks()
    process.env.JWT_SECRET = 'test-secret-long-enough-for-hmac-signing'
  })

  it('rotates a refresh token and rejects reuse', async () => {
    const service = new SessionService(db as never)
    const initial = await service.issue('user-1')
    const replacement = await service.refresh(initial.refreshToken)
    expect(replacement.refreshToken).not.toBe(initial.refreshToken)
    await expect(service.refresh(initial.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('rejects expired and logged out sessions', async () => {
    const service = new SessionService(db as never)
    const expired = await service.issue('user-1')
    for (const record of records.values()) record.expiresAt = new Date(0)
    await expect(service.refresh(expired.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException)

    const active = await service.issue('user-1')
    await service.logout(active.refreshToken)
    await expect(service.refresh(active.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException)
  })
})
