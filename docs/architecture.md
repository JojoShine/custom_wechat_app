# 架构与扩展边界

本模板供团队内部复制。每个复制项目独立配置小程序、API、PostgreSQL、OSS 和微信商户；没有租户切换层。当前验证目标是微信小程序，Taro 的其他目标端需在新增场景时单独适配。

## 分层

| 层 | 路径 | 职责 |
| --- | --- | --- |
| 小程序界面 | `apps/miniapp/src/pages`、`components` | 展示、交互、页面状态和场景导航 |
| 小程序通用能力 | `apps/miniapp/src/core` | 登录态 API 客户端、原生能力、上传、支付调用、WebView、分享 |
| 共享契约 | `packages/contracts/src` | 两端可见的请求/响应类型；不放密钥或数据库内部对象 |
| API 平台模块 | `apps/api/src/modules/auth`、`users`、`files`、`payments`、`webview`、`telemetry` | 身份、资料、存储、支付、网页票据和日志埋点 |
| 业务模块 | `apps/api/src/modules/business` | 复制项目新增的商品、价格、业务订单、退款决策、履约等规则 |
| 持久化 | `apps/api/prisma/schema.prisma`、`migrations` | 单一 Prisma schema 和追加式迁移历史 |

四个空业务目录已随 Git 保留：`apps/api/src/modules/business/`、`packages/contracts/src/business/`、`apps/miniapp/src/pages/business/`、`apps/miniapp/src/components/business/`。它们只标出放置位置；新增文件后可删除各自的 `.gitkeep`。Prisma 模型写入现有 schema，不另建不会被读取的占位目录。

## 一条业务请求的路径

小程序页面经 `apps/miniapp/src/core/api/client.ts` 发请求，登录态由 `core/session` 管理；API 的业务控制器调用业务服务，业务服务使用 Prisma 存取自己的模型。跨端返回数据在 `packages/contracts` 定义。页面路径在 `apps/miniapp/src/core/navigation/routes.ts` 登记；需登录的回跳目标同时加入 `guard.ts` 的允许集合。

微信支付是平台能力。业务服务先确定可买性、价格和业务订单，再调用平台预支付；微信通知与主动查单更新平台支付状态，`PaymentEvents` 传递可信结果，业务处理器幂等地推进履约。退款由业务决定条件和金额，平台执行、累计控制并追踪结果。详见[支付接入](payment-integration.md)。

WebView 网页只能通过已登记应用的一次性 ticket 换取专用短时 JWT；该 JWT 不能调用普通小程序接口。位置仅在用户主动选择后作为 URL 参数传递，不是可信授权数据。详见[WebView 接入](webview-integration.md)。

`demo-payments` 和像素门户用于联调与展示，不是通用业务模型。复制项目可以关闭演示开关并改造门户；若要删除已部署过的演示表，须新增迁移，不能改写已执行的迁移。
