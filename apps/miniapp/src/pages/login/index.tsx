import { useState } from 'react'
import Taro, { useRouter } from '@tarojs/taro'
import { Button, Text, View } from '@tarojs/components'
import { loginWithWeChat } from '../../core/api/client'
import { safeReturnTarget } from '../../core/navigation/guard'
import { track } from '../../core/telemetry/runtime'

export default function Login(): JSX.Element {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function login(): Promise<void> {
    setBusy(true)
    setError('')
    try {
      await loginWithWeChat()
      track('event', 'auth.login', '/pages/login/index', 'success')
      await Taro.redirectTo({ url: safeReturnTarget(router.params.returnTo) })
    } catch {
      track('event', 'auth.login', '/pages/login/index', 'failure')
      setError('登录失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  return <View style={{ padding: '32px' }}>
    <Text>登录后可查看个人资料</Text>
    <Button loading={busy} disabled={busy} onClick={() => void login()}>微信登录</Button>
    {error ? <Text>{error}</Text> : null}
  </View>
}
