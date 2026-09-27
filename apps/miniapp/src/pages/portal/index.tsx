import { Button, Text, View } from '@tarojs/components'
import { navigateProtected } from '../../core/navigation'
import { useShareAppMessage } from '@tarojs/taro'
import { portalShare } from '../../core/share/portal'
import { track } from '../../core/telemetry/runtime'

export default function Portal(): JSX.Element {
  useShareAppMessage(() => { track('event', 'portal.share', '/pages/portal/index', 'success'); return portalShare() })
  return <View style={{ padding: '32px' }}>
    <Text>门户页面</Text>
    <View style={{ marginTop: '24px' }}>
      <Button onClick={() => void navigateProtected('/pages/profile/index')}>个人资料</Button>
      <Button openType='share'>分享门户</Button>
    </View>
  </View>
}
