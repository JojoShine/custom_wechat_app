import { UnauthorizedException } from '@nestjs/common'
import { UsersController } from './users.controller.js'
import { AccessGuard } from '../auth/access.guard.js'

describe('my profile', () => {
  it('rejects missing access token', async () => {
    const guard = new AccessGuard()
    await expect(guard.canActivate({ switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }) } as never))
      .rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('reads and changes only the signed-in user', async () => {
    const users = new Map([['user-1', { id: 'user-1', nickname: null, avatarFileId: null }], ['user-2', { id: 'user-2', nickname: null, avatarFileId: null }]])
    const prisma = { user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => users.get(where.id)),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { nickname: string } }) => {
        const user = users.get(where.id)!
        user.nickname = data.nickname as never
        return user
      })
    } }
    const controller = new UsersController(prisma as never, { readUrl: vi.fn() } as never)
    expect(await controller.me({ userId: 'user-1' } as never)).toEqual({ id: 'user-1', nickname: null, avatarFileId: null, avatarUrl: null })
    expect(await controller.updateMe({ userId: 'user-1' } as never, { nickname: '小明' })).toEqual({ id: 'user-1', nickname: '小明', avatarFileId: null, avatarUrl: null })
    expect(users.get('user-2')?.nickname).toBeNull()
  })
})
