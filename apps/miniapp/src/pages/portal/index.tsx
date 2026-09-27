import { Button, Text, View } from '@tarojs/components'
import { navigateProtected } from '../../core/navigation'

export default function Portal(): JSX.Element {
  return <View style={{ padding: '32px' }}>
    <Text>门户页面</Text>
    <View style={{ marginTop: '24px' }}>
      <Button onClick={() => void navigateProtected('/pages/profile/index')}>个人资料</Button>
    </View>
  </View>
}
