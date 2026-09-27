import Taro from '@tarojs/taro'
import { sessionStorage } from '../session/storage'
import { createNavigationGuard } from './guard'

export const { navigateProtected } = createNavigationGuard({
  readSession: () => sessionStorage.read(),
  navigateTo: (url) => Taro.navigateTo({ url })
})
