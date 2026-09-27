import { BadRequestException } from '@nestjs/common'
import { AuthController } from './auth.controller.js'
import { WechatAuthService } from './wechat-auth.service.js'
import { SessionService } from './session.service.js'

describe('WeChat login', () => {
  const users = new Map<string, { id: string; wechatOpenId: string }>()
  const sessions: Array<{ userId: string; tokenHash: string; expiresAt: Date }> = []
  const exchangeCode = vi.fn()
  const prisma = {
    user: {
      upsert: vi.fn(async ({ where, create }: { where: { wechatOpenId: string }; create: { wechatOpenId: string } }) => {
        let user = users.get(where.wechatOpenId)
        if (!user) {
          user = { id: `user-${users.size + 1}`, wechatOpenId: create.wechatOpenId }
          users.set(user.wechatOpenId, user)
        }
        return user
      })
    },
    refreshSession: { create: vi.fn(async ({ data }: { data: { userId: string; tokenHash: string; expiresAt: Date } }) => {
      sessions.push(data)
    }) }
  }

  beforeEach(() => {
    users.clear()
    sessions.length = 0
    vi.clearAllMocks()
    process.env.JWT_SECRET = 'test-secret-long-enough-for-hmac-signing'
  })

  function controller() {
    const service = new WechatAuthService({ exchangeCode } as never, prisma as never, new SessionService(prisma as never))
    return new AuthController(service, new SessionService(prisma as never))
  }

  it('rejects an empty code with 400', async () => {
    await expect(controller().wechat({ code: '' })).rejects.toBeInstanceOf(BadRequestException)
    expect(exchangeCode).not.toHaveBeenCalled()
  })

  it('does not create a user when code exchange fails', async () => {
    exchangeCode.mockRejectedValueOnce(new Error('WeChat rejected code'))
    await expect(controller().wechat({ code: 'expired' })).rejects.toThrow()
    expect(prisma.user.upsert).not.toHaveBeenCalled()
  })

  it('creates a user and issues tokens for first login', async () => {
    exchangeCode.mockResolvedValueOnce({ openId: 'wx-open-id' })
    const tokens = await controller().wechat({ code: 'one-time-code' })
    expect(tokens).toMatchObject({ expiresIn: 900 })
    expect(tokens.accessToken).toEqual(expect.any(String))
    expect(tokens.refreshToken).toEqual(expect.any(String))
    expect(users.size).toBe(1)
    expect(sessions).toHaveLength(1)
    expect(sessions[0].tokenHash).not.toBe(tokens.refreshToken)
  })

  it('reuses the same user for a repeated WeChat identity', async () => {
    exchangeCode.mockResolvedValue({ openId: 'wx-open-id' })
    await controller().wechat({ code: 'first' })
    await controller().wechat({ code: 'second' })
    expect(users.size).toBe(1)
    expect(sessions).toHaveLength(2)
    expect(sessions[0].userId).toBe(sessions[1].userId)
  })
})
