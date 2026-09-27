import { UsersController } from './users.controller.js'

it('does not overwrite phone when exchange fails; returns only a mask after success', async () => {
  const user = { id: 'user-1', nickname: null, avatarFileId: null, phoneCountryCode: '86', phoneNumber: '13900139000' }
  const prisma = { user: { update: vi.fn(async ({ data }: { data: object }) => ({ ...user, ...data })) } }
  const phone = { exchangeCode: vi.fn().mockRejectedValueOnce(new Error('WeChat failure')).mockResolvedValueOnce({ countryCode: '86', phoneNumber: '13800138000' }) }
  const controller = new UsersController(prisma as never, { readUrl: vi.fn() } as never, phone as never)
  await expect(controller.bindPhone({ userId: 'user-1' } as never, {})).rejects.toThrow()
  expect(phone.exchangeCode).not.toHaveBeenCalled()
  await expect(controller.bindPhone({ userId: 'user-1' } as never, { code: 'bad' })).rejects.toThrow()
  expect(prisma.user.update).not.toHaveBeenCalled()
  const result = await controller.bindPhone({ userId: 'user-1' } as never, { code: 'good' })
  expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'user-1' } }))
  expect(result).toMatchObject({ phoneBound: true, maskedPhone: '138****8000' })
  expect(JSON.stringify(result)).not.toContain('13800138000')
})
