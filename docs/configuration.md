# 配置与外部服务

复制 `apps/api/.env.example`、`apps/miniapp/.env.example` 和 `.env.production.example` 后按环境填写。实际 `.env`、`.env.production` 与小程序 `project.config.json` 不提交。客户端 `TARO_APP_*` 会进入构建产物，只能存放公开配置；微信 AppSecret、商户私钥、API v3 密钥、JWT 密钥、OSS RAM 凭证和数据库密码仅由 API 使用。

## 小程序

| 配置 | 用途 |
| --- | --- |
| `apps/miniapp/project.config.json` 的 `appid` | 从 `project.config.example.json` 复制后填当前小程序 AppID；与 API 的 `WECHAT_APP_ID` 一致。 |
| `TARO_APP_API_BASE_URL` | API 根地址；模拟器可用本机地址，真机使用微信可访问的 HTTPS 地址。 |
| `TARO_APP_DEMO_PAYMENTS_ENABLED` | `true` 时把支付演示页和入口纳入本次构建，默认 `false`。 |

## API 运行环境

| 配置 | 用途与边界 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 连接串，含密码；本地示例对应 `compose.yaml`，生产指向自己的数据库。 |
| `PORT` | API 容器或本地进程监听端口，生产 Compose 使用容器内 `3000`。 |
| `JWT_SECRET` | 小程序会话签名密钥；每个环境独立生成。 |
| `WECHAT_APP_ID`、`WECHAT_APP_SECRET` | 微信登录与用户信息服务端调用；AppID 与开发者工具一致。 |
| `OSS_REGION`、`OSS_BUCKET`、`OSS_ENDPOINT` | 私有 Bucket 的地域、名称和 HTTPS 地址，三者须匹配。 |
| `OSS_ACCESS_KEY_ID`、`OSS_ACCESS_KEY_SECRET` | 服务端 RAM 凭证；只授予所需 Bucket 的 `users/*` 对象前缀权限。 |
| `WECHAT_PAY_MCH_ID` | 普通直连商户号；留空时支付模块不加载。启用时须配齐以下支付参数。 |
| `WECHAT_PAY_MERCHANT_SERIAL`、`WECHAT_PAY_MERCHANT_PRIVATE_KEY` | 商户 API 证书序列号和对应签名私钥。PEM 换行可用字面量 `\n`。 |
| `WECHAT_PAY_API_V3_KEY` | 32 字节 API v3 密钥，用于通知解密。 |
| `WECHAT_PAY_PUBLIC_KEY_ID`、`WECHAT_PAY_PUBLIC_KEY` | 微信支付公钥标识和匹配公钥，用于验签。 |
| `WECHAT_PAY_NOTIFY_URL`、`WECHAT_PAY_REFUND_NOTIFY_URL` | 微信可访问的公网 HTTPS 支付和退款通知地址。 |
| `DEMO_PAYMENTS_ENABLED` | `true` 时启用固定金额演示业务 API，默认 `false`。 |
| `WEBVIEW_APPS_JSON` | 网页应用白名单；每项包含 `appId`、`name`、`entryUrl`、`origin`，`[]` 表示不开放。 |

`TEST_DATABASE_URL` 是根目录测试命令的临时变量，指向已执行迁移的现有本地测试库；它不属于两份应用 `.env.example`。测试和生产使用不同密钥与数据库。真实凭证不写进镜像。

## 微信和 OSS 后台设置

- 在微信小程序后台配置 API 主机为 request 合法域名；OSS 直传主机为 uploadFile 合法域名；私有文件短期签名读取所用主机按 downloadFile 和图片资源域名要求核对。开发者工具关闭校验仅用于本地模拟，不代表真机配置完成。
- Bucket 保持私有。RAM 权限仅覆盖所需对象前缀，上传与短期读取由 API 授权；小程序不持有 AccessKey。当前禁止覆盖的上传策略要求按 OSS 版本控制设置核对，复制项目应实际验证上传与读取。
- 使用位置、头像、手机号等能力前，在微信后台填写当前场景的真实用途和所需隐私声明；不使用的能力可移除入口与权限声明。
- 支付和退款通知分别指向 API 的 `/payments/wechat/notify` 与 `/payments/wechat/refund-notify`，可共用 API 服务，无需另建通知服务。支付参数必须互相匹配，前端回调不作为入账依据。
- WebView 正式入口必须是已登记的 HTTPS 网页业务域名；网页来源与 `WEBVIEW_APPS_JSON` 的 `origin` 精确匹配。

## 生产 Compose

`.env.production.example` 还包含 `API_IMAGE`（完整镜像地址）与 `API_PORT`（宿主机回环端口）。生产 `docker-compose.prod.yml` 使用服务器已有的 PostgreSQL，不创建数据库容器；若数据库在宿主机，连接串主机可用 `host.docker.internal`，并确保 PostgreSQL 监听和访问规则允许 Docker 网桥连接。首次启动前先核对数据库连接，再由 Compose 的 `migrate` 服务应用迁移。

镜像仓库发布与部署的 GitHub 变量、Secrets 见[部署指南](deployment.md)。
