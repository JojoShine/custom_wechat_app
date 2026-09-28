import { useEffect, useState } from 'react'
import { Button, Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import type { NativeOutcome } from '../../core/native/outcome'
import type { GeoPoint } from '../../core/native/location'
import type { SelectedMedia } from '../../core/native/media'
import type { NetworkSnapshot } from '../../core/native/device-network'
import { clipboardCapability, deviceNetworkCapability, locationCapability, mediaCapability, scanCapability } from '../../core/native/runtime'
import { WEBVIEW_APPS_PATH } from '../../core/navigation/routes'
import './index.css'

type Status = Exclude<NativeOutcome<never>['status'], 'ok'> | 'ok' | ''

const statusText: Record<Exclude<Status, ''>, string> = {
  ok: '操作成功', cancelled: '已取消，保留上次结果', denied: '未授权，请在系统设置中允许后重试',
  unavailable: '当前环境暂不支持此能力', failed: '操作失败，请稍后重试'
}

export default function Capabilities(): JSX.Element {
  const [location, setLocation] = useState<GeoPoint | null>(null)
  const [locationStatus, setLocationStatus] = useState<Status>('')
  const [scan, setScan] = useState<{ text: string; format: string } | null>(null)
  const [scanStatus, setScanStatus] = useState<Status>('')
  const [media, setMedia] = useState<SelectedMedia[]>([])
  const [mediaStatus, setMediaStatus] = useState<Status>('')
  const [clipboard, setClipboard] = useState<string | null>(null)
  const [clipboardStatus, setClipboardStatus] = useState<Status>('')
  const [writeText, setWriteText] = useState('轻购实验室')
  const [device, setDevice] = useState<ReturnType<typeof deviceNetworkCapability.getDeviceSnapshot> | null>(null)
  const [network, setNetwork] = useState<NetworkSnapshot | null>(null)
  const [networkStatus, setNetworkStatus] = useState<Status>('')

  useEffect(() => deviceNetworkCapability.observeNetwork(setNetwork), [])

  async function locate(pick: boolean): Promise<void> {
    const result = pick ? await locationCapability.chooseLocation() : await locationCapability.getCurrentLocation()
    setLocationStatus(result.status)
    if (result.status === 'ok') setLocation(result.value)
  }

  async function scanCode(): Promise<void> {
    const result = await scanCapability.scanCode()
    setScanStatus(result.status)
    if (result.status === 'ok') setScan(result.value)
  }

  async function chooseMedia(): Promise<void> {
    const result = await mediaCapability.chooseMedia()
    setMediaStatus(result.status)
    if (result.status === 'ok') setMedia(result.value)
  }

  async function readClipboard(): Promise<void> {
    const result = await clipboardCapability.readClipboard()
    setClipboardStatus(result.status)
    if (result.status === 'ok') setClipboard(result.value)
  }

  async function readNetwork(): Promise<void> {
    const result = await deviceNetworkCapability.getNetworkSnapshot()
    setNetworkStatus(result.status)
    if (result.status === 'ok') setNetwork(result.value)
  }

  return <View className='cap-page'>
    <View className='cap-header'>
      <Text className='cap-kicker'>QINGGOU / TOOLBOX</Text>
      <Text className='cap-title'>能力中心</Text>
      <Text className='cap-subtitle'>点按操作，探索小程序原生能力</Text>
    </View>

    <View className='cap-section'>
      <Text className='cap-heading'>01 / 位置与地图</Text>
      <Text className='cap-intro'>只在点击后获取位置。坐标仅在本页展示。</Text>
      <View className='cap-actions'>
        <Button className='cap-button cap-primary' onClick={() => void locate(false)}>获取当前坐标</Button>
        <Button className='cap-button' onClick={() => void locate(true)}>地图选点</Button>
        <Button className='cap-button' disabled={!location} onClick={() => { if (location) void locationCapability.openLocation(location).then((result) => setLocationStatus(result.status)) }}>打开位置</Button>
        {locationStatus === 'denied' ? <Button className='cap-button' onClick={() => void Taro.openSetting()}>打开权限设置</Button> : null}
      </View>
      {locationStatus ? <Text className='cap-status'>{statusText[locationStatus]}</Text> : null}
      {location ? <View className='cap-result'>
        <Text>GCJ-02 · 纬度 {location.latitude} · 经度 {location.longitude}</Text>
        {location.accuracyMeters !== undefined ? <Text>精度约 {location.accuracyMeters} 米</Text> : null}
        {location.name ? <Text>{location.name}</Text> : null}
        {location.address ? <Text>{location.address}</Text> : null}
      </View> : null}
    </View>

    <View className='cap-section'>
      <Text className='cap-heading'>02 / 扫码</Text>
      <Text className='cap-intro'>二维码与条码内容只显示为文字。</Text>
      <Button className='cap-button cap-primary' onClick={() => void scanCode()}>打开扫码</Button>
      {scanStatus ? <Text className='cap-status'>{statusText[scanStatus]}</Text> : null}
      {scan ? <View className='cap-result'><Text>{scan.format}</Text><Text selectable>{scan.text}</Text></View> : null}
    </View>

    <View className='cap-section'>
      <Text className='cap-heading'>03 / 本地媒体</Text>
      <Text className='cap-intro'>选择图片或视频，只做本地预览，不上传。</Text>
      <View className='cap-actions'>
        <Button className='cap-button cap-primary' onClick={() => void chooseMedia()}>选择媒体</Button>
        <Button className='cap-button' disabled={!media.length} onClick={() => void mediaCapability.previewMedia(media, 0).then((result) => setMediaStatus(result.status))}>预览所选</Button>
      </View>
      {mediaStatus ? <Text className='cap-status'>{statusText[mediaStatus]}</Text> : null}
      {media.length ? <View className='cap-result'><Text>{media[0].kind === 'image' ? '图片' : '视频'} · {media[0].sizeBytes ?? 0} 字节</Text></View> : null}
    </View>

    <View className='cap-section'>
      <Text className='cap-heading'>04 / 剪贴板</Text>
      <Input className='cap-input' value={writeText} onInput={(event) => setWriteText(event.detail.value)} placeholder='输入要写入的文字' />
      <View className='cap-actions'>
        <Button className='cap-button cap-primary' onClick={() => void clipboardCapability.writeClipboard(writeText).then((result) => setClipboardStatus(result.status))}>写入文字</Button>
        <Button className='cap-button' onClick={() => void readClipboard()}>读取文字</Button>
      </View>
      {clipboardStatus ? <Text className='cap-status'>{statusText[clipboardStatus]}</Text> : null}
      {clipboard !== null ? <View className='cap-result'><Text selectable>{clipboard || '（空剪贴板）'}</Text></View> : null}
    </View>

    <View className='cap-section'>
      <Text className='cap-heading'>05 / 设备与网络</Text>
      <View className='cap-actions'>
        <Button className='cap-button cap-primary' onClick={() => setDevice(deviceNetworkCapability.getDeviceSnapshot())}>查看设备摘要</Button>
        <Button className='cap-button' onClick={() => void readNetwork()}>检查网络</Button>
      </View>
      {networkStatus ? <Text className='cap-status'>{statusText[networkStatus]}</Text> : null}
      {device ? <View className='cap-result'><Text>{device.platform} · {device.windowWidth} × {device.windowHeight}</Text>{device.safeArea ? <Text>安全区域：上 {device.safeArea.top} / 下 {device.safeArea.bottom}</Text> : null}</View> : null}
      {network ? <View className='cap-result'><Text>{network.connected ? '已连接' : '未连接'} · {network.type}</Text></View> : null}
    </View>

    <View className='cap-section cap-webview-section'>
      <Text className='cap-heading'>06 / 网页应用</Text>
      <Text className='cap-intro'>一次性票据安全交换用户资料，也可选择把当前位置交给网页。</Text>
      <Button className='cap-button cap-primary' onClick={() => void Taro.navigateTo({ url: WEBVIEW_APPS_PATH })}>进入网页应用 →</Button>
    </View>
  </View>
}
