import { enabledPages } from './core/navigation/routes'

export default defineAppConfig({
  pages: enabledPages(process.env.TARO_APP_DEMO_PAYMENTS_ENABLED === 'true'),
  window: {
    navigationBarTitleText: '小程序模板'
  }
})
