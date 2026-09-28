import { useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Image, Input, Text, View } from '@tarojs/components'
import type { UserProfile } from '@template/contracts'
import { apiRequest, logout } from '../../core/api/client'
import { recoverProtectedError } from '../../core/navigation/recover'
import { selectAndUploadImage, uploadAvatar } from '../../core/files/runtime'
import { bindPhoneFromEvent } from '../../core/phone/bind'
import { track } from '../../core/telemetry/runtime'
import { PORTAL_PATH, PROFILE_PATH } from '../../core/navigation/routes'
import './index.css'

const profilePath = PROFILE_PATH
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
      track('event', 'profile.save', profilePath, 'success')
    } catch (error) {
      if (!await recoverProtectedError(error, profilePath, redirectTo)) setMessage('保存失败，请重试')
      track('event', 'profile.save', profilePath, 'failure')
    }
  }

  async function saveAvatar(upload: () => Promise<{ id: string } | null>): Promise<void> {
    try {
      const file = await upload()
      if (!file) return
      const user = await apiRequest<UserProfile>({ url: '/users/me', method: 'PATCH', data: { avatarFileId: file.id } })
      setProfile(user)
      setMessage('头像已保存')
      track('event', 'profile.avatar', profilePath, 'success')
    } catch (error) {
      if (!await recoverProtectedError(error, profilePath, redirectTo)) setMessage('头像上传失败，请重试')
      track('event', 'profile.avatar', profilePath, 'failure')
    }
  }

  async function signOut(): Promise<void> {
    await logout()
    await Taro.redirectTo({ url: PORTAL_PATH })
  }

  async function bindPhone(code?: string): Promise<void> {
    if (!code) { setMessage('未授权手机号'); track('event', 'profile.phone', profilePath, 'cancelled'); return }
    try {
      const user = await bindPhoneFromEvent({ code }, apiRequest)
      if (user) { setProfile(user); setMessage('手机号已绑定'); track('event', 'profile.phone', profilePath, 'success') }
    } catch (error) {
      if (!await recoverProtectedError(error, profilePath, redirectTo)) setMessage('手机号绑定失败，请重试')
      track('event', 'profile.phone', profilePath, 'failure')
    }
  }

  return <View className='profile'>
    <Text className='profile-title'>个人资料</Text>
    {profile ? <View className='profile-panel'>
      {profile.avatarUrl ? <Image className='profile-avatar' src={profile.avatarUrl} mode='aspectFill' /> : null}
      <Button className='profile-action' openType='chooseAvatar' onChooseAvatar={(event) => void saveAvatar(() => uploadAvatar(event.detail.avatarUrl))}>选择微信头像</Button>
      <Button className='profile-action' onClick={() => void saveAvatar(selectAndUploadImage)}>从相册选择头像</Button>
      <Input className='profile-input' type='nickname' value={nickname} maxlength={80} placeholder='昵称' onInput={(event) => setNickname(event.detail.value)} />
      <Button className='profile-action profile-action-primary' onClick={() => void save()}>保存昵称</Button>
      <Text className='profile-phone'>{profile.maskedPhone ?? '尚未绑定手机号'}</Text>
      <Button className='profile-action' openType='getPhoneNumber' onGetPhoneNumber={(event) => void bindPhone(event.detail.code)}>{profile.phoneBound ? '更换手机号' : '绑定手机号'}</Button>
      <Button className='profile-action profile-action-quiet' onClick={() => void signOut()}>退出登录</Button>
    </View> : <Text>加载中</Text>}
    {message ? <Text className='profile-message'>{message}</Text> : null}
  </View>
}
