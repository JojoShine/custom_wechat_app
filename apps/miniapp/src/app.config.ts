import { enabledPages } from './core/navigation/routes'

export default defineAppConfig({
  pages: enabledPages(process.env.TARO_APP_DEMO_PAYMENTS_ENABLED === 'true'),
  requiredPrivateInfos: ['getLocation', 'chooseLocation'],
  permission: {
    'scope.userLocation': {
      desc: '仅在您主动操作时获取位置，用于展示坐标和选择地图位置'
    }
  },
  window: {
    navigationBarTitleText: '轻购实验室',
    navigationBarBackgroundColor: '#f8f5e9',
    navigationBarTextStyle: 'black'
  }
})
