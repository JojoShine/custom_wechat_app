import Taro from '@tarojs/taro'
import { createSessionClient, type RequestOptions, type Response } from '../session/auth'
import { sessionStorage } from '../session/storage'

const baseUrl = process.env.TARO_APP_API_BASE_URL ?? 'http://localhost:3000'

const client = createSessionClient({
  storage: sessionStorage,
  async getCode() {
    const result = await Taro.login()
    return result.code
  },
  async request<T>(options: RequestOptions): Promise<Response<T>> {
    const result = await Taro.request<T>({
      url: `${baseUrl}${options.url}`,
      method: options.method,
      data: options.data,
      header: options.header
    })
    return { statusCode: result.statusCode, data: result.data }
  }
})

export const apiRequest = client.apiRequest
export const loginWithWeChat = client.loginWithWeChat
export const refreshSession = client.refreshSession
export const logout = client.logout
