import { Button, Text, View } from '@tarojs/components'
import Taro, { useShareAppMessage } from '@tarojs/taro'
import { navigateProtected } from '../../core/navigation'
import { CAPABILITIES_PATH, DEMO_PAYMENT_PATH, PORTAL_PATH, PROFILE_PATH, WEBVIEW_APPS_PATH } from '../../core/navigation/routes'
import { portalShare } from '../../core/share/portal'
import { track } from '../../core/telemetry/runtime'
import './index.css'

const paymentEnabled = process.env.TARO_APP_DEMO_PAYMENTS_ENABLED === 'true'

export default function Portal(): JSX.Element {
  const statusBarHeight = Taro.getWindowInfo().statusBarHeight

  useShareAppMessage(() => {
    track('event', 'portal.share', PORTAL_PATH, 'success')
    return portalShare()
  })

  const openProfile = () => void navigateProtected(PROFILE_PATH)

  return <View className='portal' style={{ paddingTop: `${statusBarHeight}px` }}>
    <View className='portal-content'>
      <View className='portal-header'>
        <Text className='portal-brand-star'>★</Text>
        <Text className='portal-brand-name'>轻购实验室</Text>
        <View className='portal-header-avatar portal-icon portal-icon-avatar' onClick={openProfile} />
      </View>

      <View className='portal-hero'>
        <Text className='portal-hero-title'>从这里开始</Text>
        <Text className='portal-hero-subtitle'>可复用的小程序能力</Text>
        <View className='portal-accent-line' />
      </View>

      <Button className='portal-login-card' onClick={openProfile}>
        <View className='portal-login-avatar portal-icon portal-icon-avatar' />
        <View className='portal-login-copy'>
          <Text className='portal-login-title'>微信登录</Text>
          <Text className='portal-login-subtitle'>账号与资料</Text>
        </View>
        <Text className='portal-arrow portal-login-arrow'>›</Text>
      </Button>

      <Button className='portal-center-card' style={{ background: '#d7f1e7' }} onClick={() => void Taro.navigateTo({ url: WEBVIEW_APPS_PATH })}>
        <View className='portal-center-copy'>
          <Text className='portal-center-kicker'>WEB / ACCESS</Text>
          <Text className='portal-center-title'>网页应用</Text>
          <Text className='portal-center-subtitle'>票据登录 · 位置传递</Text>
        </View>
        <Text className='portal-center-arrow'>→</Text>
      </Button>

      <View className='portal-grid'>
        <Button className='portal-capability' onClick={openProfile}>
          <View className='portal-icon portal-icon-image' />
          <Text className='portal-capability-name'>图片上传</Text>
          <Text className='portal-arrow'>›</Text>
        </Button>
        <Button className='portal-capability' onClick={openProfile}>
          <View className='portal-icon portal-icon-phone' />
          <Text className='portal-capability-name'>手机号授权</Text>
          <Text className='portal-arrow'>›</Text>
        </Button>
        <Button className='portal-capability' openType='share'>
          <View className='portal-icon portal-icon-share' />
          <Text className='portal-capability-name'>分享好友</Text>
          <Text className='portal-arrow'>›</Text>
        </Button>
        <Button className={`portal-capability${paymentEnabled ? '' : ' portal-capability-disabled'}`} onClick={paymentEnabled ? () => void navigateProtected(DEMO_PAYMENT_PATH) : undefined}>
          <View className='portal-icon portal-icon-wallet' />
          <Text className='portal-capability-name'>支付与退款</Text>
          {paymentEnabled ? <Text className='portal-arrow'>›</Text> : <Text className='portal-pending'>待开通</Text>}
        </Button>
      </View>

      <Button className='portal-center-card' onClick={() => void Taro.navigateTo({ url: CAPABILITIES_PATH })}>
        <View className='portal-center-copy'>
          <Text className='portal-center-kicker'>EXPLORE / 01</Text>
          <Text className='portal-center-title'>能力中心</Text>
          <Text className='portal-center-subtitle'>位置 · 扫码 · 媒体 · 设备</Text>
        </View>
        <Text className='portal-center-arrow'>→</Text>
      </Button>

      <View className='portal-footer-scene'>
        <Text>按场景替换门户，能力即插即用</Text>
        <View className='portal-accent-line' />
      </View>
    </View>

    <View className='portal-tabbar'>
      <View className='portal-tab portal-tab-active'>
        <View className='portal-tab-icon portal-icon portal-icon-home' />
        <Text>首页</Text>
      </View>
      <View className='portal-tab' onClick={openProfile}>
        <View className='portal-tab-icon portal-icon portal-icon-avatar' />
        <Text>我的</Text>
      </View>
    </View>
  </View>
}
