# 模板环境配置

本页对应 `apps/api/.env.example` 与 `apps/miniapp/.env.example`。复制到各自的 `.env` 后按测试或生产环境填写；实际值由部署环境注入，不提交仓库。小程序中的 `TARO_APP_*` 会进入客户端构建，只能放公开配置。

## API 服务端变量

| 变量 | 用途与填写条件 | 敏感性 |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL 连接串；本地示例指向 `compose.yaml` 的数据库，测试、生产使用各自独立库 | **密钥**，含数据库密码 |
| `PORT` | API 监听端口，示例为 `3000` | 非密钥 |
| `JWT_SECRET` | 业务会话签发密钥；每个部署环境使用随机值 | **密钥** |
| `WECHAT_APP_ID` | 当前小程序 AppID；与微信开发者工具选择的项目一致，登录及支付均使用 | 标识符 |
| `WECHAT_APP_SECRET` | 小程序身份接口所需 AppSecret | **密钥** |
| `OSS_REGION` | 私有 OSS Bucket 所在地域，如 `cn-hangzhou` | 非密钥 |
| `OSS_BUCKET` | 私有 Bucket 名称 | 非密钥 |
| `OSS_ENDPOINT` | 对应 Bucket 的 HTTPS 主机地址，须与 Bucket/地域匹配 | 非密钥 |
| `OSS_ACCESS_KEY_ID` | 授权该 Bucket `users/*` 前缀的 RAM 身份标识 | 敏感标识符，服务端保存 |
| `OSS_ACCESS_KEY_SECRET` | 对应 RAM 凭证，用于签发上传与短期读取地址 | **密钥** |
| `WECHAT_PAY_MCH_ID` | 普通直连商户号；填写后启用支付模块 | 标识符 |
| `WECHAT_PAY_MERCHANT_SERIAL` | 与商户私钥配套的商户 API 证书序列号 | 标识符 |
| `WECHAT_PAY_MERCHANT_PRIVATE_KEY` | 商户请求和小程序调起支付参数的签名私钥，PEM 换行可写 `\n` | **密钥** |
| `WECHAT_PAY_API_V3_KEY` | 32 字节 API v3 密钥，用于解密支付与退款通知 | **密钥** |
| `WECHAT_PAY_PUBLIC_KEY_ID` | 当前微信支付公钥 ID，用于校验微信响应及通知 | 公开标识符 |
| `WECHAT_PAY_PUBLIC_KEY` | 与公钥 ID 匹配的微信支付公钥，PEM 换行可写 `\n` | 公钥，服务端配置 |
| `WECHAT_PAY_NOTIFY_URL` | 微信支付通知的完整公网 HTTPS URL，路径为 `/payments/wechat/notify` | 非密钥 |
| `WECHAT_PAY_REFUND_NOTIFY_URL` | 微信退款通知的完整公网 HTTPS URL，路径为 `/payments/wechat/refund-notify` | 非密钥 |
| `DEMO_PAYMENTS_ENABLED` | `true` 才启用固定 10 分演示业务 API；默认 `false` | 非密钥 |

支付联调时须一次配齐 `WECHAT_PAY_*`，商户私钥、序列号、公钥 ID 与公钥应互相对应。未配置商户号时，`AppModule` 不加载支付模块。OSS 的 RAM 凭证由 API 使用；小程序只获得有时限的上传授权和读取地址。

## 小程序构建变量

| 变量 | 用途与填写条件 | 敏感性 |
| --- | --- | --- |
| `TARO_APP_API_BASE_URL` | 小程序访问 API 的根地址；真机使用微信可访问的 HTTPS 地址 | 公开配置 |
| `TARO_APP_DEMO_PAYMENTS_ENABLED` | `true` 才将演示页和入口纳入本次构建；默认 `false` | 公开配置 |

不要在 `apps/miniapp/.env` 中放 `DATABASE_URL`、`JWT_SECRET`、`WECHAT_APP_SECRET`、商户私钥、API v3 密钥或 OSS AccessKey。修改小程序构建变量后需要重新构建；它们不是运行时秘密配置。

## 域名、回调和权限

- 在微信小程序后台配置 API 主机为 **request 合法域名**；当前模板的头像直传使用 `Taro.uploadFile`，OSS Bucket 主机应配置为 **uploadFile 合法域名**。私有头像的短期签名读取地址使用 OSS 主机，需检查 **downloadFile/图片资源域名**配置。域名须与实际 `TARO_APP_API_BASE_URL`、`OSS_ENDPOINT` 一致。[阿里云小程序直传说明](https://help.aliyun.com/zh/oss/user-guide/wechat-applet-uploads-files-directly-to-oss)
- Bucket 保持私有；RAM 身份只需本模板使用的 `users/*` 前缀对象权限，上传表单使用 `PutObject`，确认与读取使用 `GetObject`。当前上传策略使用禁止覆盖，Bucket 版本控制需按 [README 私有图片联调](../README.md#私有图片联调) 的约束配置。
- 微信支付的两个通知 URL 必须是完整的公网 HTTPS 地址，不能用 `localhost` 或内网地址；分别指向本页列出的支付与退款路径。真实接收后由 API 验签、解密和核对交易信息。[微信支付回调注意事项](https://pay.wechatpay.cn/doc/v3/merchant/4012075420)
- 小程序展示的支付结果以登录态 API 查单为准，`Taro.requestPayment` 的前端返回不等于最终入账。[微信小程序支付开发指引](https://pay.wechatpay.cn/doc/v3/merchant/4012791911)

## 环境与验收边界

本地开发使用 `compose.yaml` 的 PostgreSQL；自动测试复用现有单个测试库，不为复制演练另建库。测试和生产环境分别配置小程序 AppID、API 服务、数据库、私有 Bucket、RAM 身份及普通直连商户参数，不共用密钥。

本地 `pnpm test`、`pnpm typecheck`、`pnpm build` 和 `pnpm test:container` 验证仓库行为、构建与容器健康；受控外部响应测试不能证明真实微信或 OSS 已联通。真实联调需另外验证微信登录、头像直传与短期读取、手机号授权、支付/退款通知和次日账单。第四阶段交付后会向项目负责人提供逐项参数清单，再按实际具备的配置安排联调。
