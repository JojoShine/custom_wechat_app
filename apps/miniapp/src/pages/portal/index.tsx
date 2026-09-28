import { Button, Text, View } from '@tarojs/components'
import { navigateProtected } from '../../core/navigation'
import { useShareAppMessage } from '@tarojs/taro'
import { portalShare } from '../../core/share/portal'
import { track } from '../../core/telemetry/runtime'
import { DEMO_PAYMENT_PATH, PORTAL_PATH, PROFILE_PATH } from '../../core/navigation/routes'

export default function Portal(): JSX.Element {
  useShareAppMessage(() => { track('event', 'portal.share', PORTAL_PATH, 'success'); return portalShare() })
  return <View style={{ padding: '32px' }}>
    <Text>门户页面</Text>
    <View style={{ marginTop: '24px' }}>
      <Button onClick={() => void navigateProtected(PROFILE_PATH)}>个人资料</Button>
      {process.env.TARO_APP_DEMO_PAYMENTS_ENABLED === 'true' ? <Button onClick={() => void navigateProtected(DEMO_PAYMENT_PATH)}>支付联调演示</Button> : null}
      <Button openType='share'>分享门户</Button>
    </View>
  </View>
}
