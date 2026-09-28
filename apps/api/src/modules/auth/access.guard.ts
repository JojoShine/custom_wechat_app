import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { jwtVerify } from 'jose'

export interface AuthenticatedRequest {
  headers: { authorization?: string }
  userId: string
}

@Injectable()
export class AccessGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const token = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1]
    if (!token || !process.env.JWT_SECRET) throw new UnauthorizedException('Access token required')
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET), { algorithms: ['HS256'] })
      if (!payload.sub || payload.token_use !== 'miniapp' || payload.aud) throw new Error('Invalid native token')
      request.userId = payload.sub
      return true
    } catch {
      throw new UnauthorizedException('Invalid access token')
    }
  }
}
