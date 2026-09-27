import { Button, Text, View } from '@tarojs/components'
import { navigateProtected } from '../../core/navigation'
import { useShareAppMessage } from '@tarojs/taro'
import { portalShare } from '../../core/share/portal'

export default function Portal(): JSX.Element {
  useShareAppMessage(portalShare)
  return <View style={{ padding: '32px' }}>
    <Text>门户页面</Text>
    <View style={{ marginTop: '24px' }}>
      <Button onClick={() => void navigateProtected('/pages/profile/index')}>个人资料</Button>
      <Button openType='share'>分享门户</Button>
    </View>
  </View>
}
