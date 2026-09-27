import { useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Input, Text, View } from '@tarojs/components'
import type { UserProfile } from '@template/contracts'
import { apiRequest, logout } from '../../core/api/client'

export default function Profile(): JSX.Element {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [nickname, setNickname] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    void apiRequest<UserProfile>({ url: '/users/me', method: 'GET' })
      .then((user) => { setProfile(user); setNickname(user.nickname ?? '') })
      .catch((error: unknown) => {
        if (error instanceof Error && error.message === 'AUTH_REQUIRED') {
          void Taro.redirectTo({ url: '/pages/login/index?returnTo=%2Fpages%2Fprofile%2Findex' })
        } else {
          setMessage('资料加载失败，请重试')
        }
      })
  }, [])

  async function save(): Promise<void> {
    try {
      const user = await apiRequest<UserProfile>({ url: '/users/me', method: 'PATCH', data: { nickname } })
      setProfile(user)
      setMessage('已保存')
    } catch {
      setMessage('保存失败，请重试')
    }
  }

  async function signOut(): Promise<void> {
    await logout()
    await Taro.redirectTo({ url: '/pages/portal/index' })
  }

  return <View style={{ padding: '32px' }}>
    <Text>个人资料</Text>
    {profile ? <View>
      <Input value={nickname} maxlength={80} placeholder='昵称' onInput={(event) => setNickname(event.detail.value)} />
      <Button onClick={() => void save()}>保存昵称</Button>
      <Button onClick={() => void signOut()}>退出登录</Button>
    </View> : <Text>加载中</Text>}
    {message ? <Text>{message}</Text> : null}
  </View>
}
