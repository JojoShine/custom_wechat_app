export default defineAppConfig({
  pages: ['pages/portal/index', 'pages/login/index', 'pages/profile/index', ...(process.env.TARO_APP_DEMO_PAYMENTS_ENABLED === 'true' ? ['pages/demo-payment/index'] : [])],
  window: {
    navigationBarTitleText: '小程序模板'
  }
})
