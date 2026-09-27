import { BadGatewayException, Injectable } from '@nestjs/common'

@Injectable()
export class WechatPhoneProvider {
  fetcher: typeof fetch = fetch
  now: () => number = Date.now
  private token: { value: string; expiresAt: number } | null = null

  async exchangeCode(code: string): Promise<{ countryCode: string; phoneNumber: string }> {
    const appId = process.env.WECHAT_APP_ID
    const secret = process.env.WECHAT_APP_SECRET
    if (!appId || !secret) throw new Error('WeChat phone configuration is required')
    if (!this.token || this.token.expiresAt <= this.now()) {
      const url = new URL('https://api.weixin.qq.com/cgi-bin/token')
      url.search = new URLSearchParams({ grant_type: 'client_credential', appid: appId, secret }).toString()
      const response = await this.fetcher(url)
      if (!response.ok) throw new BadGatewayException('WeChat phone exchange failed')
      const result = await response.json() as { access_token?: string; expires_in?: number; errcode?: number }
      if (result.errcode || !result.access_token || !result.expires_in) throw new BadGatewayException('WeChat phone exchange failed')
      this.token = { value: result.access_token, expiresAt: this.now() + Math.max(0, result.expires_in - 60) * 1000 }
    }
    const url = new URL('https://api.weixin.qq.com/wxa/business/getuserphonenumber')
    url.searchParams.set('access_token', this.token.value)
    const response = await this.fetcher(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) })
    if (!response.ok) throw new BadGatewayException('WeChat phone exchange failed')
    const result = await response.json() as { errcode?: number; phone_info?: { countryCode?: string; purePhoneNumber?: string } }
    if (result.errcode || !result.phone_info?.countryCode || !result.phone_info.purePhoneNumber) throw new BadGatewayException('WeChat phone exchange failed')
    return { countryCode: result.phone_info.countryCode, phoneNumber: result.phone_info.purePhoneNumber }
  }
}
