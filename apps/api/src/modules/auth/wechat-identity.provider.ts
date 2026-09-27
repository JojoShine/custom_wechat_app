import { Injectable, UnauthorizedException } from '@nestjs/common'

@Injectable()
export class WechatIdentityProvider {
  async exchangeCode(code: string): Promise<{ openId: string }> {
    const appId = process.env.WECHAT_APP_ID
    const secret = process.env.WECHAT_APP_SECRET
    if (!appId || !secret) throw new Error('WeChat login configuration is required')

    const url = new URL('https://api.weixin.qq.com/sns/jscode2session')
    url.search = new URLSearchParams({ appid: appId, secret, js_code: code, grant_type: 'authorization_code' }).toString()
    const response = await fetch(url)
    if (!response.ok) throw new UnauthorizedException('微信登录失败')
    const result = await response.json() as { openid?: string; errcode?: number }
    if (result.errcode || !result.openid) throw new UnauthorizedException('微信登录失败')
    return { openId: result.openid }
  }
}
