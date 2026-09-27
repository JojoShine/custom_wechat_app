import { BadRequestException, Controller, Get, Inject, NotFoundException, Patch, Body, Req, UseGuards } from '@nestjs/common'
import type { UserProfile } from '@template/contracts'
import type { PrismaClient } from '../../generated/prisma/client.js'
import { PRISMA } from '../../common/database/prisma.provider.js'
import { AccessGuard, type AuthenticatedRequest } from '../auth/access.guard.js'

@Controller('users')
@UseGuards(AccessGuard)
export class UsersController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  @Get('me')
  async me(@Req() request: AuthenticatedRequest): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({ where: { id: request.userId }, select: { id: true, nickname: true } })
    if (!user) throw new NotFoundException('User not found')
    return user
  }

  @Patch('me')
  async updateMe(@Req() request: AuthenticatedRequest, @Body() body: { nickname?: string }): Promise<UserProfile> {
    if (typeof body?.nickname !== 'string' || body.nickname.length > 80) throw new BadRequestException('Invalid nickname')
    return this.prisma.user.update({
      where: { id: request.userId },
      data: { nickname: body.nickname },
      select: { id: true, nickname: true }
    })
  }
}
