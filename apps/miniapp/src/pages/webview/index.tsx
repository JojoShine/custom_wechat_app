import { useState } from 'react'
import Taro, { useRouter } from '@tarojs/taro'
import { Button, Text, View, WebView } from '@tarojs/components'
import { WEBVIEW_APPS_PATH } from '../../core/navigation/routes'
import { takePendingWebview } from '../../core/webview/pending'
import '../webview-apps/index.css'

export default function WebviewPage(): JSX.Element {
  const router = useRouter()
  const [src] = useState(() => takePendingWebview(router.params.appId ?? ''))
  const [loadFailed, setLoadFailed] = useState(false)

  if (src && !loadFailed) return <WebView src={src} onError={() => setLoadFailed(true)} />

  return <View className='webapps-page'>
    <View className='webapps-empty'>
      <Text className='webapps-empty-icon'>▦</Text>
      <Text>{loadFailed ? '网页加载失败' : '网页入口已失效'}</Text>
      <Text className='webapps-empty-sub'>请从网页应用列表重新打开，领取新票据</Text>
      <Button className='webapps-button webapps-primary' onClick={() => void Taro.redirectTo({ url: WEBVIEW_APPS_PATH })}>返回网页应用</Button>
    </View>
  </View>
}
