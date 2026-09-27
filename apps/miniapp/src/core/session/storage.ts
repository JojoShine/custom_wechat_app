import Taro from '@tarojs/taro'
import type { SessionStorage, StoredSession } from './auth'

const KEY = 'template.session'

export const sessionStorage: SessionStorage = {
  async read(): Promise<StoredSession> {
    try {
      return (await Taro.getStorage({ key: KEY })).data as StoredSession
    } catch {
      return {}
    }
  },
  async write(session) {
    await Taro.setStorage({ key: KEY, data: session })
  },
  async clear() {
    await Taro.removeStorage({ key: KEY })
  }
}
