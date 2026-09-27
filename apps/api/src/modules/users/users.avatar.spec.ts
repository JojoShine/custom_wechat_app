import { BadRequestException } from '@nestjs/common'
import { UsersController } from './users.controller.js'

it('accepts only a READY avatar owned by the signed-in user', async () => {
  const user = { id: 'user-1', nickname: 'Name', avatarFileId: null as string | null, phoneNumber: null }
  const prisma = { user: { findUnique: vi.fn(async () => user), update: vi.fn(async ({ data }: { data: { avatarFileId: string } }) => ({ ...user, ...data })) }, uploadIntent: { findUnique: vi.fn(async () => ({ id: 'file-1', userId: 'other', status: 'READY' })) } }
  const files = { readUrl: vi.fn(async () => ({ url: 'https://signed.example/avatar', expiresAt: 'soon' })) }
  const controller = new UsersController(prisma as never, files as never, {} as never)
  await expect(controller.updateMe({ userId: 'user-1' } as never, { avatarFileId: 'file-1' })).rejects.toBeInstanceOf(BadRequestException)
  expect(prisma.user.update).not.toHaveBeenCalled()
  prisma.uploadIntent.findUnique.mockResolvedValueOnce({ id: 'file-1', userId: 'user-1', status: 'PENDING' })
  await expect(controller.updateMe({ userId: 'user-1' } as never, { avatarFileId: 'file-1' })).rejects.toBeInstanceOf(BadRequestException)
  expect(prisma.user.update).not.toHaveBeenCalled()
  prisma.uploadIntent.findUnique.mockResolvedValueOnce({ id: 'file-1', userId: 'user-1', status: 'READY' })
  await expect(controller.updateMe({ userId: 'user-1' } as never, { avatarFileId: 'file-1' })).resolves.toMatchObject({ avatarFileId: 'file-1', avatarUrl: 'https://signed.example/avatar' })
})
