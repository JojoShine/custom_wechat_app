# 微信小程序原生能力目录

本目录按功能域说明“轻购实验室”模板的接入状态。首版只验证微信小程序；Taro 在其他端的支持范围须按目标平台重新核对。接口清单以 [Taro 4.x API 目录](https://docs.taro.zone/docs/apis/)和微信公众平台当前配置为准。

| 功能域 | 代表能力 | 当前状态 | 场景接入要点 |
| --- | --- | --- | --- |
| 应用与导航 | 页面路由、启动参数、前后台生命周期 | 已内置 | 在 `core/navigation/routes.ts` 登记业务页；按需处理场景值与回跳。 |
| 登录和用户授权 | 微信登录、资料、头像、手机号 | 已内置 | `core/session`、资料页和 API 用户模块；手机号须具备微信权限。 |
| 支付 | 预支付、支付确认、部分退款、对账 | 已内置；平台或资质受限 | 需要微信商户号、公钥、回调域名；业务管理商品、定价和退款条件。 |
| 分享与消息 | 好友分享、订阅消息 | 分享已内置；订阅按场景接入 | 分享在门户；订阅需消息模板和服务端发送流程，见 [订阅接口](https://docs.taro.zone/docs/apis/open-api/subscribe-message/requestSubscribeMessage)。 |
| 位置与地图 | 一次定位、选点、打开位置；持续或后台定位 | 前三项本批新增；持续定位按场景接入 | `core/native/location.ts`；用途声明和用户主动授权必需。见 [位置 API](https://docs.taro.zone/docs/apis/location/getLocation)。 |
| 扫码 | 二维码、条码 | 本批新增 | `core/native/scan.ts`；返回内容仅作为文本，业务若要打开链接须单独校验。见 [扫码 API](https://docs.taro.zone/docs/apis/device/scan/scanCode)。 |
| 图片、视频、音频 | 本地选择与预览、OSS 图片上传、录音和音视频播放 | 本地媒体本批新增；OSS 图片已内置；其余按场景接入 | `core/native/media.ts` 只选取和预览，不上传视频；图片持久化使用现有 `core/files`。见 [媒体 API](https://docs.taro.zone/docs/apis/media/video/chooseMedia)。 |
| 文件与存储 | 私有 OSS、文件管理、本地缓存 | OSS 已内置；文件管理按场景接入 | 业务确定保留期限与访问规则；本地存储见 [存储 API](https://docs.taro.zone/docs/apis/storage/getStorageInfo)。 |
| 剪贴板 | 主动读写 | 本批新增 | `core/native/clipboard.ts`；内容只在当前页面显示，不记录在日志。见 [剪贴板 API](https://docs.taro.zone/docs/apis/device/clipboard/getClipboardData)。 |
| 网络与设备 | 网络状态、非唯一设备摘要 | 本批新增 | `core/native/device-network.ts`；监听离页注销，不输出设备唯一标识。见 [网络 API](https://docs.taro.zone/docs/apis/device/network/getNetworkType)。 |
| 传感器与硬件 | 蓝牙、NFC、相机、陀螺仪、运动数据 | 按场景接入；部分平台或硬件受限 | 按设备、权限和业务用途单独设计；见 [Taro 设备目录](https://docs.taro.zone/docs/apis/)。 |
| 系统交互 | 弹窗、震动、屏幕、日历、文件打开 | 按场景接入 | 按具体交互选择 API，不为模板预先索取权限。见 [Taro API 目录](https://docs.taro.zone/docs/apis/)。 |
| 行业和微信专用 | 客服、视频号、发票、车牌、卡包 | 平台或资质受限；按场景接入 | 先确认微信平台开放条件，再为具体业务实现。见 [Taro 开放能力目录](https://docs.taro.zone/docs/apis/)。 |

## 第一批调用方式

页面可从 `apps/miniapp/src/core/native/runtime.ts` 导入 `locationCapability`、`scanCapability`、`mediaCapability`、`clipboardCapability` 或 `deviceNetworkCapability`。调用结果以 `status` 区分 `ok`、`cancelled`、`denied`、`unavailable` 和 `failed`；只有 `ok` 时读取 `value`。复制项目如需单测或替换平台调用，可直接使用各模块的 `create*Capability` 工厂。

`apps/miniapp/src/pages/capabilities` 是可删除的像素风演示页。位置、扫码、剪贴板、媒体路径和设备摘要只在当前页状态中保留；不发给 API，也不写入埋点。图片选择与现有 OSS 上传是两条独立流程。

## 复制与真机验收

1. 按场景改写 `app.config.ts` 的位置用途说明，在微信公众平台配置对应隐私声明；若场景不使用位置，应移除权限声明和相关演示入口。不要复制模板文字作为无关业务的权限理由。
2. 在开发者工具检查能力中心路由、剪贴板、网络状态及模拟位置；模拟器的权限和硬件结果不能代替真机。
3. 真机逐项验收定位精度、拒绝或撤销授权、地图选点与取消、打开位置、相机扫码、相册和视频权限、本地预览，以及页面离开后的网络监听清理。
4. 无权限、无硬件或平台不支持时确认页面给出明确状态；不在页面启动时静默索取位置或剪贴板内容。
