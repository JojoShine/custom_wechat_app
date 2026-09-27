import { useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Image, Input, Text, View } from '@tarojs/components'
import type { UserProfile } from '@template/contracts'
import { apiRequest, logout } from '../../core/api/client'
import { recoverProtectedError } from '../../core/navigation/recover'
import { selectAndUploadImage, uploadAvatar } from '../../core/files/runtime'

const profilePath = '/pages/profile/index'
const redirectTo = (url: string) => Taro.redirectTo({ url })

export default function Profile(): JSX.Element {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [nickname, setNickname] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    void apiRequest<UserProfile>({ url: '/users/me', method: 'GET' })
      .then((user) => { setProfile(user); setNickname(user.nickname ?? '') })
      .catch(async (error: unknown) => {
        if (!await recoverProtectedError(error, profilePath, redirectTo)) setMessage('资料加载失败，请重试')
      })
  }, [])

  async function save(): Promise<void> {
    try {
      const user = await apiRequest<UserProfile>({ url: '/users/me', method: 'PATCH', data: { nickname } })
      setProfile(user)
      setMessage('已保存')
    } catch (error) {
      if (!await recoverProtectedError(error, profilePath, redirectTo)) setMessage('保存失败，请重试')
    }
  }

  async function saveAvatar(upload: () => Promise<{ id: string } | null>): Promise<void> {
    try {
      const file = await upload()
      if (!file) return
      const user = await apiRequest<UserProfile>({ url: '/users/me', method: 'PATCH', data: { avatarFileId: file.id } })
      setProfile(user)
      setMessage('头像已保存')
    } catch (error) {
      if (!await recoverProtectedError(error, profilePath, redirectTo)) setMessage('头像上传失败，请重试')
    }
  }

  async function signOut(): Promise<void> {
    await logout()
    await Taro.redirectTo({ url: '/pages/portal/index' })
  }

  return <View style={{ padding: '32px' }}>
    <Text>个人资料</Text>
    {profile ? <View>
      {profile.avatarUrl ? <Image src={profile.avatarUrl} mode='aspectFill' style={{ width: '96px', height: '96px' }} /> : null}
      <Button openType='chooseAvatar' onChooseAvatar={(event) => void saveAvatar(() => uploadAvatar(event.detail.avatarUrl))}>选择微信头像</Button>
      <Button onClick={() => void saveAvatar(selectAndUploadImage)}>从相册选择头像</Button>
      <Input type='nickname' value={nickname} maxlength={80} placeholder='昵称' onInput={(event) => setNickname(event.detail.value)} />
      <Button onClick={() => void save()}>保存昵称</Button>
      <Button onClick={() => void signOut()}>退出登录</Button>
    </View> : <Text>加载中</Text>}
    {message ? <Text>{message}</Text> : null}
  </View>
}
