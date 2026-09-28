import { useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Text, View } from '@tarojs/components'
import type { WebviewAppSummary, WebviewTicketResult } from '@template/contracts'
import { apiRequest } from '../../core/api/client'
import { LOGIN_PATH, WEBVIEW_APPS_PATH, WEBVIEW_PAGE_PATH } from '../../core/navigation/routes'
import { locationCapability } from '../../core/native/runtime'
import { sessionStorage } from '../../core/session/storage'
import { createWebviewLauncher } from '../../core/webview/launch'
import { setPendingWebview } from '../../core/webview/pending'
import './index.css'

const launcher = createWebviewLauncher({
  issueTicket: (appId) => apiRequest<WebviewTicketResult>({ url: '/webview/tickets', method: 'POST', data: { appId } }),
  getCurrentLocation: () => locationCapability.getCurrentLocation()
})

export default function WebviewApps(): JSX.Element {
  const [apps, setApps] = useState<WebviewAppSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')

  async function loadApps(): Promise<void> {
    setLoading(true)
    setError('')
    try {
      setApps(await apiRequest<WebviewAppSummary[]>({ url: '/webview/apps' }))
    } catch {
      setError('网页应用列表加载失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadApps() }, [])

  async function open(appId: string, withLocation: boolean): Promise<void> {
    const session = await sessionStorage.read()
    if (!session.accessToken) {
      await Taro.navigateTo({ url: `${LOGIN_PATH}?returnTo=${encodeURIComponent(WEBVIEW_APPS_PATH)}` })
      return
    }
    setBusyId(appId)
    setError('')
    try {
      const url = await launcher.open(appId, withLocation)
      setPendingWebview(appId, url)
      await Taro.navigateTo({ url: `${WEBVIEW_PAGE_PATH}?appId=${encodeURIComponent(appId)}` })
    } catch (cause) {
      if (cause instanceof Error && cause.message === 'AUTH_REQUIRED') {
        await Taro.navigateTo({ url: `${LOGIN_PATH}?returnTo=${encodeURIComponent(WEBVIEW_APPS_PATH)}` })
      } else {
        setError('打开网页失败，请重试')
      }
    } finally {
      setBusyId('')
    }
  }

  return <View className='webapps-page'>
    <View className='webapps-hero'>
      <Text className='webapps-kicker'>QINGGOU / WEB ACCESS</Text>
      <Text className='webapps-title'>网页应用</Text>
      <Text className='webapps-subtitle'>从小程序安全进入已登记的网页</Text>
    </View>
    <View className='webapps-note'>
      <Text>每次打开都会领取一次性票据。选择“携带位置”时，当前坐标会交给目标网页；定位失败仍可进入。</Text>
    </View>
    {loading ? <Text className='webapps-state'>正在加载网页应用…</Text> : null}
    {!loading && apps.length === 0 && !error ? <View className='webapps-empty'>
      <Text className='webapps-empty-icon'>▦</Text>
      <Text>还没有登记网页应用</Text>
      <Text className='webapps-empty-sub'>复制模板后在服务端配置 WEBVIEW_APPS_JSON</Text>
    </View> : null}
    {apps.map((app, index) => <View className='webapps-card' key={app.appId}>
      <Text className='webapps-card-index'>WEB / {String(index + 1).padStart(2, '0')}</Text>
      <Text className='webapps-card-name'>{app.name}</Text>
      <View className='webapps-actions'>
        <Button className='webapps-button webapps-primary' loading={busyId === app.appId} disabled={!!busyId} onClick={() => void open(app.appId, false)}>打开网页 <Text>→</Text></Button>
        <Button className='webapps-button' disabled={!!busyId} onClick={() => void open(app.appId, true)}>携带位置打开</Button>
      </View>
    </View>)}
    {error ? <View className='webapps-error'><Text>{error}</Text><Button className='webapps-retry' onClick={() => void loadApps()}>重新加载</Button></View> : null}
  </View>
}
