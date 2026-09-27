import { createHash, randomBytes } from 'node:crypto'
import { Inject, Injectable } from '@nestjs/common'
import { SignJWT } from 'jose'
import type { AuthTokens } from '@template/contracts'
import type { PrismaClient } from '../../generated/prisma/client.js'
import { PRISMA } from '../../common/database/prisma.provider.js'

export const ACCESS_TOKEN_SECONDS = 15 * 60
const REFRESH_TOKEN_DAYS = 30

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

@Injectable()
export class SessionService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async issue(userId: string): Promise<AuthTokens> {
    const secret = process.env.JWT_SECRET
    if (!secret) throw new Error('JWT_SECRET is required')
    const accessToken = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(`${ACCESS_TOKEN_SECONDS}s`)
      .sign(new TextEncoder().encode(secret))
    const refreshToken = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000)
    await this.prisma.refreshSession.create({ data: { userId, tokenHash: hashToken(refreshToken), expiresAt } })
    return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_SECONDS }
  }
}
