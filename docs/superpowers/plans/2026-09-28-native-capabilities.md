# 小程序原生能力扩展 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为“轻购实验室”增加高频原生能力模块、像素风能力中心和覆盖微信能力域的接入目录。

**Architecture:** Taro 调用按位置、扫码、媒体、剪贴板、设备与网络分模块封装，以统一结果状态供业务代码调用。能力中心只演示调用与当前页面结果，门户只增加一个入口；不增加后端或数据库。

**Tech Stack:** Taro 4.2.1、React 18、TypeScript、Jest、微信小程序。

**Spec:** `docs/superpowers/specs/2026-09-28-native-capabilities-design.md`

## Global Constraints

- 首版只运行微信小程序；保留 Taro 对其他端的可能性，不承诺能力等价。
- Node 使用 nvm 的 22.23.2，pnpm 8.9.2；不新增数据库、服务端路由、第三方密钥或产品依赖。
- 坐标使用 GCJ-02；不持续定位，不默认保存或上报位置、扫码、剪贴板、媒体内容和设备标识。
- 操作由用户主动触发；“取消”“拒绝授权”“不可用”“失败”必须可区分。
- 只改动与新增能力直接相关的文件，保留当前登录、资料、OSS 和支付行为；保护现有未跟踪 `.idea/`。

## Review Focus

1. 非数字或越界坐标不能传给地图接口：Task 2 的无效坐标测试。
2. 用户取消地图选点不能清除已有成功结果：Task 2 的取消结果测试及 Task 7 的页面操作检查。
3. 扫出的 URL 或小程序路径只能显示为文本：Task 3 的 URL 结果测试及 Task 7 的页面操作检查。
4. 空剪贴板与中文文本不应被误判为调用失败：Task 5 的测试。
5. 网络监听离页后不能重复回调：Task 6 的订阅清理测试及 Task 7 的页面操作检查。

---

## File map

- `apps/miniapp/src/core/native/outcome.ts`：共享结果类型和错误归类。
- `apps/miniapp/src/core/native/location.ts`、`scan.ts`、`media.ts`、`clipboard.ts`、`device-network.ts`：可独立导入的能力模块；同目录 `*.test.ts` 验证行为。
- `apps/miniapp/src/core/native/runtime.ts`：把生产 Taro API 接入上述模块，页面只从这里导入。
- `apps/miniapp/src/pages/capabilities/index.tsx`、`index.css`：像素风能力中心与临时结果；不存储到 API。
- `apps/miniapp/src/core/navigation/routes.ts`、`apps/miniapp/src/app.config.ts`、`apps/miniapp/src/pages/portal/index.tsx`：登记页面、位置用途与首页入口。
- `docs/native-capability-catalog.md`、`docs/template-copy-guide.md`：全域能力目录、复制时权限和真机检查。

### Task 1: 统一结果状态

**Files:** Create `apps/miniapp/src/core/native/outcome.ts`, `outcome.test.ts`.

**Interfaces:** Produce `NativeOutcome<T> = { status: 'ok'; value: T } | { status: 'cancelled' | 'denied' | 'unavailable' | 'failed' }` and `classifyNativeError(error: unknown): Exclude<NativeOutcome<never>['status'], 'ok' | 'unavailable'>`.

- [ ] **Step 1: 写失败测试。** 断言微信 `cancel`、`auth deny`/`authorize no response` 分别归为 `cancelled`、`denied`，未知错误归为 `failed`；不得返回原始错误内容。
- [ ] **Step 2: 运行 `pnpm --filter @template/miniapp test -- --runTestsByPath src/core/native/outcome.test.ts`，确认 RED。**
- [ ] **Step 3: 实现上述类型与函数。** 仅检查明确的错误标记；模块自行在调用前判断 `unavailable`。
- [ ] **Step 4: 重跑目标测试与 `pnpm --filter @template/miniapp typecheck`，确认 GREEN。**
- [ ] **Step 5: 提交 `feat(miniapp): normalize native capability outcomes`。**

### Task 2: 一次定位与地图操作

**Files:** Create `apps/miniapp/src/core/native/location.ts`, `location.test.ts`; modify `apps/miniapp/src/app.config.ts`.

**Interfaces:** Consume `NativeOutcome<T>` and `classifyNativeError`. Produce `GeoPoint { latitude: number; longitude: number; coordinateSystem: 'gcj02'; accuracyMeters?: number; name?: string; address?: string }` and `createLocationCapability(deps: { getLocation: () => Promise<unknown>; chooseLocation: () => Promise<unknown>; openLocation: (point: GeoPoint) => Promise<unknown>; canIUse: (api: string) => boolean })` returning `getCurrentLocation(): Promise<NativeOutcome<GeoPoint>>`, `chooseLocation(): Promise<NativeOutcome<GeoPoint>>`, `openLocation(point: GeoPoint): Promise<NativeOutcome<void>>`. Runtime Taro calls are `getLocation({ type: 'gcj02' })`, `chooseLocation({})`, `openLocation({ latitude, longitude, name, address })`.

- [ ] **Step 1: 写失败测试。** 覆盖 GCJ-02 结果、选点经纬度转数值、选点取消、拒绝授权、超范围或非数字坐标不调用 `openLocation`。
- [ ] **Step 2: 运行目标 `location.test.ts`，确认 RED。**
- [ ] **Step 3: 实现模块并在 `app.config.ts` 声明 `requiredPrivateInfos: ['getLocation', 'chooseLocation']` 和 `permission['scope.userLocation'].desc = '仅在您主动操作时获取位置，用于展示坐标和选择地图位置'`。** 不添加后台定位权限。
- [ ] **Step 4: 运行目标测试、类型检查和微信构建，确认 GREEN 及生成配置。**
- [ ] **Step 5: 提交 `feat(miniapp): add one-shot location capability`。**

### Task 3: 安全扫码

**Files:** Create `apps/miniapp/src/core/native/scan.ts`, `scan.test.ts`.

**Interfaces:** Consume `NativeOutcome<T>`；produce `createScanCapability(deps: { scanCode: () => Promise<unknown>; canIUse: (api: string) => boolean })` returning `scanCode(): Promise<NativeOutcome<{ text: string; format: string }>>`。生产调用 `Taro.scanCode({ scanType: ['qrCode', 'barCode'] })`，只返回 `result` 和 `scanType`，不返回 `rawData`。

- [ ] **Step 1: 写失败测试。** QR、条码、用户取消、不可用、URL 或小程序路径原样作为文本返回；测试中没有导航调用。
- [ ] **Step 2: 运行目标 `scan.test.ts`，确认 RED。**
- [ ] **Step 3: 实现最小模块，不解析或执行扫描结果。**
- [ ] **Step 4: 运行目标测试与类型检查，确认 GREEN。**
- [ ] **Step 5: 提交 `feat(miniapp): add safe scan capability`。**

### Task 4: 本地媒体选择与预览

**Files:** Create `apps/miniapp/src/core/native/media.ts`, `media.test.ts`.

**Interfaces:** Consume `NativeOutcome<T>`；produce `SelectedMedia { kind: 'image' | 'video'; path: string; sizeBytes?: number }` and `createMediaCapability(deps: { chooseMedia: () => Promise<unknown>; previewMedia: (items: SelectedMedia[], index: number) => Promise<unknown>; canIUse: (api: string) => boolean })` returning `chooseMedia(): Promise<NativeOutcome<SelectedMedia[]>>`, `previewMedia(items: SelectedMedia[], index: number): Promise<NativeOutcome<void>>`。生产调用 `Taro.chooseMedia({ count: 1, mediaType: ['image', 'video'] })` 和 `Taro.previewMedia`；不调用 OSS。

- [ ] **Step 1: 写失败测试。** 图片/视频类型映射、空选择为取消、异常路径不预览、索引越界不预览、预览取消和失败可区分。
- [ ] **Step 2: 运行目标 `media.test.ts`，确认 RED。**
- [ ] **Step 3: 实现模块，临时路径只作为返回值和预览参数。**
- [ ] **Step 4: 运行目标测试与类型检查，确认 GREEN。**
- [ ] **Step 5: 提交 `feat(miniapp): add local media capability`。**

### Task 5: 剪贴板

**Files:** Create `apps/miniapp/src/core/native/clipboard.ts`, `clipboard.test.ts`.

**Interfaces:** Consume `NativeOutcome<T>`；produce `createClipboardCapability(deps: { read: () => Promise<{ data: string }>; write: (text: string) => Promise<unknown>; canIUse: (api: string) => boolean })` returning `readClipboard(): Promise<NativeOutcome<string>>` and `writeClipboard(text: string): Promise<NativeOutcome<void>>`。生产使用 `Taro.getClipboardData` 和 `Taro.setClipboardData`。

- [ ] **Step 1: 写失败测试。** 空字符串与中文均为成功结果；取消、拒绝、不可用、失败正确归类；代码检查写入值不进入遥测。
- [ ] **Step 2: 运行目标 `clipboard.test.ts`，确认 RED。**
- [ ] **Step 3: 实现仅由调用者主动触发的读写函数。**
- [ ] **Step 4: 运行目标测试与类型检查，确认 GREEN。**
- [ ] **Step 5: 提交 `feat(miniapp): add clipboard capability`。**

### Task 6: 设备摘要与网络状态

**Files:** Create `apps/miniapp/src/core/native/device-network.ts`, `device-network.test.ts`.

**Interfaces:** Produce `DeviceSnapshot { platform: string; windowWidth: number; windowHeight: number; safeArea?: { top: number; right: number; bottom: number; left: number } }`, `NetworkSnapshot { connected: boolean; type: string }` and `createDeviceNetworkCapability(deps: { getDeviceInfo: () => unknown; getWindowInfo: () => unknown; getNetworkType: () => Promise<unknown>; onNetworkStatusChange: (callback: (result: unknown) => void) => void; offNetworkStatusChange: (callback: (result: unknown) => void) => void })` returning `getDeviceSnapshot(): DeviceSnapshot`, `getNetworkSnapshot(): Promise<NativeOutcome<NetworkSnapshot>>`, `observeNetwork(callback: (snapshot: NetworkSnapshot) => void): () => void`。生产使用同名 Taro API。

- [ ] **Step 1: 写失败测试。** `none` 为断网、未知类型保留为 `unknown`、设备摘要无唯一标识、取消订阅只移除当前回调且后续不回调。
- [ ] **Step 2: 运行目标 `device-network.test.ts`，确认 RED。**
- [ ] **Step 3: 实现模块，回调注册与注销配对。**
- [ ] **Step 4: 运行目标测试与类型检查，确认 GREEN。**
- [ ] **Step 5: 提交 `feat(miniapp): add device and network capability`。**

### Task 7: 像素风能力中心与门户入口

**Files:** Create `apps/miniapp/src/core/native/runtime.ts`, `apps/miniapp/src/pages/capabilities/index.tsx`, `index.css`; modify `apps/miniapp/src/core/navigation/routes.ts`, `routes.test.ts`, `apps/miniapp/src/app.config.ts`, `apps/miniapp/src/pages/portal/index.tsx`, `index.css`.

**Interfaces:** Consume Tasks 2–6 的模块函数；produce `CAPABILITIES_PATH = '/pages/capabilities/index'`。能力中心当前页 state 保存最近一次成功结果，取消不清除旧结果；`useEffect` 注册网络监听并返回注销函数。

- [ ] **Step 1: 在 `routes.test.ts` 添加能力中心路径被 `enabledPages` 包含的失败测试，运行确认 RED。**
- [ ] **Step 2: 接入生产 Taro 调用、能力中心各分区、状态文案和首页精选入口。** 在原四宫格下方增加整行“能力中心”卡片，以普通导航打开，不要求登录；扫码内容以 `Text` 显示；剪贴板和位置结果不送入 `track`；沿用门户配色、像素边框及按钮阴影。
- [ ] **Step 3: 运行小程序测试、类型检查和微信构建，确认 GREEN，主包仍低于 2 MiB。**
- [ ] **Step 4: 在开发者工具操作每个分区；核对沉浸式门户、地图取消保留旧值、扫码纯文本显示、网络监听离页清理，以及不支持能力的状态提示。** 真机才能验证的弹窗记录在 Task 8 文档中。
- [ ] **Step 5: 提交 `feat(miniapp): add pixel capability center`。**

### Task 8: 能力目录、复制指引与最终验收

**Files:** Create `docs/native-capability-catalog.md`; modify `docs/template-copy-guide.md` and `README.md` 的能力说明。

**Interfaces:** Consume Tasks 1–7 的实际模块名与入口；目录逐域列出“已内置”“本批新增”“按场景接入”“平台或资质受限”和官方链接。

- [ ] **Step 1: 写完整功能域目录及第一批调用示例。** 明确位置隐私用途须按场景填写，视频仅本地预览，扫码内容不可自动执行，真机验收项目包括定位精度、授权、选点、相机扫码和媒体权限。
- [ ] **Step 2: 对照代码、Taro 4.2.1 类型与官方 API 清单核查目录状态和复制指引，不列未实现能力为已内置。**
- [ ] **Step 3: 在 nvm Node 22.23.2 下运行小程序全部测试、类型检查、微信构建及 `git diff --check`；在开发者工具核对最终页面。**
- [ ] **Step 4: 提交 `docs: catalog native miniapp capabilities`，检查工作树只保留用户已有的未跟踪文件。**

## Execution handoff

按用户此前的工作方式，在当前会话逐项实施；计划获审阅认可后使用 `superpowers:executing-plans`，完成任务后核对提交与本地 `master` 状态，不推送远程。
