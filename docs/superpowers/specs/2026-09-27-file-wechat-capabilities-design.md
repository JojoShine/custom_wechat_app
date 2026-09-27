# 文件与微信能力设计

日期：2026-09-27

本设计细化[全栈模板总体设计](2026-09-27-wechat-miniapp-template-design.md)的第二阶段。它延续内部复制模板、单实例、微信首版、Taro React + NestJS + Prisma 的既定边界。用户确定 OSS 对象默认私有，读取时由服务端签发短期访问地址。本阶段包含文件、用户主动授权的微信能力、日志与埋点三个可独立验收的模块；不实现支付或业务文件用途。

## 方案选择

文件上传采用 OSS POST V4 表单策略：小程序通过 `Taro.uploadFile` 直接上传，API 负责生成策略、保存意图并在确认时核验对象。相比 API 中转文件，它避免服务端承载文件流；相比将临时通用 OSS 凭证交给小程序，它能将授权限定到单个随机对象键、类型和大小。首版由服务端持有最小权限 RAM 凭证并签名，保留将服务端凭证来源替换为 STS 的边界；密钥从不返回小程序。

微信资料采用用户主动输入昵称和 `chooseAvatar`，头像通过同一文件流程上传。手机号使用原生按钮的 `getPhoneNumber` 一次性 code，API 通过微信服务端接口换取号码。分享直接使用 Taro 页面 Hook 和分享按钮。避免包装无需后端协作的 Taro 调用。

## 文件生命周期

`POST /files/uploads` 需要有效业务会话，输入 `contentType`、`size`，首版只允许 `image/jpeg`、`image/png`、`image/webp`，大小为 1 字节至 10 MiB。API 生成不可由客户端指定的 `users/{userId}/{randomId}.{ext}` 对象键，保存 `UploadIntent`：所有者、键、预期类型与大小、10 分钟到期时间、`PENDING` 状态。返回 `uploadId`、OSS HTTPS 地址、V4 表单字段和到期时间。策略必须限定 Bucket、**完整对象键**、内容类型、大小范围、成功状态和 10 分钟有效期；不能只限制宽泛前缀。

小程序选择一张图片，先检查本地大小，再申请授权，使用 `Taro.uploadFile` 提交 `file` 与表单字段。用户可以在失败后主动重试；重试重新申请上传授权并使用新对象键，避免旧策略过期或对象覆盖。API `POST /files/uploads/{id}/confirm` 验证所有者、未过期意图和 OSS `HEAD` 元数据，确认对象存在且实际大小与类型匹配，再把记录原子地设为 `READY`。未确认的对象不被业务引用。重复确认返回同一结果；错误或过期的意图不得转为 `READY`。业务通过文件 ID 引用，不直接保存 OSS URL。

`GET /files/{id}/read-url` 仅对文件所有者提供 5 分钟签名 GET 地址。Bucket 必须保持私有；服务端不接受客户端对象键作为读取参数。头像更新要求一个属于当前用户的 `READY` 图片文件 ID。无真实 OSS 凭证时用可替换的 OSS provider 验证授权策略、上传确认、失败与重试；有测试凭证时再做真实直传、HEAD 和私有读取联调。

## 微信授权与资料

登录继续只依赖 `wx.login`。资料页提供昵称输入和头像选择，均由用户操作触发；选择头像后走通用文件流程，保存时提交昵称和头像文件 ID。用户可以拒绝或取消头像选择，原资料不变。

资料页提供 `openType="getPhoneNumber"` 按钮。只有回调带有效一次性 code 时才调用 `POST /users/me/phone`；拒绝或取消不触发 API。API 使用服务端获取并缓存的微信 access token 调用手机号接口，验证成功响应后绑定当前用户。`User` 保存规范化国家区号与号码，但 `GET /users/me` 仅返回是否已绑定及掩码号码；手机号不用于登录，也不写入日志。获取失败保留原号码并返回可重试错误。

门户开启微信分享，默认分享标题和安全的门户路径由模板配置；不能把访问令牌、手机号或个人文件签名 URL 放入分享路径。新业务可替换分享文案与安全路径。

## 日志与埋点

API 使用 Winston 输出 JSON 行到标准输出和标准错误，按请求、应用事件、错误三个类别标识。HTTP 请求记录方法、路由模板、状态码、耗时和请求 ID；不记录请求体、完整查询串、Authorization、Cookie、微信 code、手机号或 OSS 签名字段。异常日志记录稳定错误码与请求 ID，隐藏令牌和敏感参数。Docker 继续收集标准流，不引入 ELK、Grafana、日志数据库或查询后台。

小程序在登录后使用 `POST /telemetry/events` 上报单条受控结构：`kind`（event/error）、`name`、`page`、`result`、`occurredAt`；限制字段长度与整个请求体大小，不接收自由文本属性、原始异常对象或堆栈。接口要求业务会话，只关联内部用户 ID；登录前的服务端错误由 API 自身记录。上报失败不得阻断登录、上传或资料操作；客户端最多在内存中重试一次，不离线持久化事件。API 将通过校验的事件写入 Winston 应用事件类别，且不记录手机号与会话值。

## 契约、配置与验收

`packages/contracts` 增加文件授权、文件结果、资料扩展及埋点传输类型。API 增加 Prisma 迁移、OSS provider、文件与手机号路由、日志模块；小程序增加上传流程、资料/手机号入口和分享示例。环境示例仅列变量名或占位值：OSS Bucket、Region、外网 HTTPS 域名、服务端 RAM 凭证及微信已有配置；不提交真实密钥。

验收覆盖：未经认证不能申请或读取文件；大小/类型/键范围不可绕过；上传不存在、元数据不符、授权过期、重复确认、上传失败与重试；手机号拒绝、微信换号失败和成功绑定；分享路径不含敏感值；日志与埋点不泄露敏感字段。`pnpm test`、`pnpm typecheck`、`pnpm build` 和 API 容器检查均通过。外部服务的真实联调结果单独记录，不以模拟通过冒充真实验证。

## 参考

- [阿里云 OSS 微信小程序直传](https://help.aliyun.com/zh/oss/user-guide/wechat-applet-uploads-files-directly-to-oss)
- [阿里云 OSS POST V4 策略](https://help.aliyun.com/zh/oss/developer-reference/signature-version-4-recommend)
- [Taro `uploadFile`](https://docs.taro.zone/docs/apis/network/upload/uploadFile)
- [Taro 按钮开放能力](https://docs.taro.zone/docs/components/forms/button)
- [Taro 页面分享 Hook](https://docs.taro.zone/docs/apis/taro.hooks/useShareAppMessage)
