import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { jwtVerify } from 'jose'
import { WEBVIEW_APPS, type WebviewAppConfig } from './webview.config.js'

export interface WebviewRequest {
  headers: { authorization?: string }
  userId: string
  webviewAppId: string
}

@Injectable()
export class WebviewGuard implements CanActivate {
  constructor(@Inject(WEBVIEW_APPS) private readonly apps: readonly WebviewAppConfig[]) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<WebviewRequest>()
    const token = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1]
    if (!token || !process.env.JWT_SECRET) throw new UnauthorizedException('WebView token required')
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET), { algorithms: ['HS256'] })
      if (!payload.sub || payload.token_use !== 'webview' || typeof payload.aud !== 'string' || !this.apps.some((app) => app.appId === payload.aud)) {
        throw new Error('Invalid WebView token')
      }
      request.userId = payload.sub
      request.webviewAppId = payload.aud
      return true
    } catch {
      throw new UnauthorizedException('Invalid WebView token')
    }
  }
}
