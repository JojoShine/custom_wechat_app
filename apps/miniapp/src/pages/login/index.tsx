import { useState } from 'react'
import Taro, { useRouter } from '@tarojs/taro'
import { Button, Text, View } from '@tarojs/components'
import { loginWithWeChat } from '../../core/api/client'
import { safeReturnTarget } from '../../core/navigation/guard'
import { track } from '../../core/telemetry/runtime'
import { LOGIN_PATH } from '../../core/navigation/routes'
import './index.css'

export default function Login(): JSX.Element {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function login(): Promise<void> {
    setBusy(true)
    setError('')
    try {
      await loginWithWeChat()
      track('event', 'auth.login', LOGIN_PATH, 'success')
      await Taro.redirectTo({ url: safeReturnTarget(router.params.returnTo) })
    } catch {
      track('event', 'auth.login', LOGIN_PATH, 'failure')
      setError('登录失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  return <View className='login-page'>
    <View className='login-brand'>
      <Text className='login-brand-star'>★</Text>
      <Text className='login-brand-name'>轻购实验室</Text>
      <Text className='login-brand-index'>PLAYER 01</Text>
    </View>

    <View className='login-hero'>
      <Text className='login-hero-tag'>WELCOME / 01</Text>
      <View className='login-hero-caption'>
        <Text>下一站，开始探索</Text>
        <Text className='login-hero-sparkle'>✦</Text>
      </View>
    </View>

    <View className='login-panel'>
      <Text className='login-kicker'>ACCOUNT ACCESS</Text>
      <Text className='login-title'>欢迎回来</Text>
      <Text className='login-description'>使用微信账号进入，继续查看你的个人资料。</Text>
      <View className='login-divider' />
      <Button className='login-action' loading={busy} disabled={busy} onClick={() => void login()}>
        <Text>{busy ? '正在登录…' : '微信登录'}</Text>
        {!busy ? <Text className='login-action-arrow'>→</Text> : null}
      </Button>
      {error ? <Text className='login-error'>{error}</Text> : null}
      <Text className='login-hint'>点击后将使用微信身份建立登录会话</Text>
    </View>

    <View className='login-footer'>
      <Text>✦</Text>
      <Text>轻松开始 · 尽情探索</Text>
      <Text>✦</Text>
    </View>
  </View>
}
