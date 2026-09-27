import { BadRequestException, Controller, Get, Inject, NotFoundException, Patch, Post, Body, Req, UseGuards } from '@nestjs/common'
import type { UserProfile } from '@template/contracts'
import type { PrismaClient } from '../../generated/prisma/client.js'
import { PRISMA } from '../../common/database/prisma.provider.js'
import { AccessGuard, type AuthenticatedRequest } from '../auth/access.guard.js'
import { FilesService } from '../files/files.service.js'
import { WechatPhoneProvider } from './wechat-phone.provider.js'

@Controller('users')
@UseGuards(AccessGuard)
export class UsersController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient, private readonly files: FilesService, private readonly phone: WechatPhoneProvider) {}

  private async profile(user: { id: string; nickname: string | null; avatarFileId: string | null; phoneNumber: string | null }): Promise<UserProfile> {
    const avatarUrl = user.avatarFileId ? (await this.files.readUrl(user.id, user.avatarFileId)).url : null
    const { phoneNumber, ...publicUser } = user
    return { ...publicUser, avatarUrl, phoneBound: !!phoneNumber, maskedPhone: phoneNumber ? `${phoneNumber.slice(0, 3)}****${phoneNumber.slice(-4)}` : null }
  }

  @Get('me')
  async me(@Req() request: AuthenticatedRequest): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({ where: { id: request.userId }, select: { id: true, nickname: true, avatarFileId: true, phoneNumber: true } })
    if (!user) throw new NotFoundException('User not found')
    return this.profile(user)
  }

  @Patch('me')
  async updateMe(@Req() request: AuthenticatedRequest, @Body() body: { nickname?: string; avatarFileId?: string }): Promise<UserProfile> {
    if (!body || (body.nickname === undefined && body.avatarFileId === undefined)) throw new BadRequestException('Empty profile update')
    if (body.nickname !== undefined && (typeof body.nickname !== 'string' || body.nickname.length > 80)) throw new BadRequestException('Invalid nickname')
    if (body.avatarFileId !== undefined) {
      if (typeof body.avatarFileId !== 'string') throw new BadRequestException('Invalid avatar')
      const file = await this.prisma.uploadIntent.findUnique({ where: { id: body.avatarFileId } })
      if (!file || file.userId !== request.userId || file.status !== 'READY') throw new BadRequestException('Invalid avatar')
    }
    const user = await this.prisma.user.update({
      where: { id: request.userId },
      data: { nickname: body.nickname, avatarFileId: body.avatarFileId },
      select: { id: true, nickname: true, avatarFileId: true, phoneNumber: true }
    })
    return this.profile(user)
  }

  @Post('me/phone')
  async bindPhone(@Req() request: AuthenticatedRequest, @Body() body: { code?: string }): Promise<UserProfile> {
    if (typeof body?.code !== 'string' || !body.code.trim()) throw new BadRequestException('Invalid phone code')
    const value = await this.phone.exchangeCode(body.code)
    const user = await this.prisma.user.update({
      where: { id: request.userId },
      data: { phoneCountryCode: value.countryCode, phoneNumber: value.phoneNumber },
      select: { id: true, nickname: true, avatarFileId: true, phoneNumber: true }
    })
    return this.profile(user)
  }
}
