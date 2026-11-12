# 后端接口、异常与安全规范

本文是二次开发的基线，描述当前实现与新增接口的要求，不代表已完成生产安全审计。入口为 `apps/api/src/main.ts`，模块登记在 `app.module.ts`；公开数据类型在 `packages/contracts/src`。

## 接口约定

- 当前没有统一 `/api` 或版本前缀。部署代理前缀与客户端 API 根地址必须匹配。
- 普通接口收发 JSON；成功直接返回契约对象或数组，不额外包装为 `{ data }`。`GET /webview/demo` 返回 HTML，微信通知成功返回微信所需的确认对象。
- GET、PATCH 默认成功状态为 200；POST 默认 201，显式标记 `@HttpCode(200)` 的接口返回 200。客户端接受整个 2xx 范围，不假设所有成功都是 200。
- 普通受保护接口使用 `Authorization: Bearer <accessToken>`。身份取自 `AccessGuard` 写入的 `request.userId`，资源 ID 不代表访问权限。
- TypeScript 类型不提供运行时校验。目前没有全局 ValidationPipe；新增接口必须在控制器或服务中检查输入类型、长度、范围、枚举和允许字段，禁止将请求体直接展开到数据库写入。
- 新增列表接口必须限制分页大小并定义稳定排序；当前没有全局分页格式。新增金额沿用整数分，时间采用明确时区的 ISO 8601 字符串。新增契约时同步测试与调用端。

### 当前路由索引

请求/响应的详细字段以对应控制器、共享契约及 HTTP 测试为准。

| 方法与路径 | 身份/用途 |
| --- | --- |
| GET `/health` | 公开；进程健康，不证明数据库或外部服务可用 |
| POST `/auth/wechat` | 公开；请求 `{ code }`，返回登录令牌 |
| POST `/auth/refresh` | 请求 `{ refreshToken }`；轮换刷新令牌，200 |
| POST `/auth/logout` | 请求 `{ refreshToken }`；撤销刷新会话 |
| GET / PATCH `/users/me` | 小程序令牌；读取/修改本人资料 |
| POST `/users/me/phone` | 小程序令牌；请求微信手机号授权 `{ code }` |
| POST `/files/uploads` | 小程序令牌；请求 `{ contentType, size }` 获取上传授权 |
| POST `/files/uploads/:id/confirm` | 小程序令牌；验证上传，200 |
| GET `/files/:id/read-url` | 小程序令牌；本人文件短期签名地址 |
| GET `/payments/:id` | 小程序令牌；本人支付记录 |
| GET `/payments/:id/refunds/:refundId` | 小程序令牌；本人且属于该支付的退款 |
| POST `/payments/wechat/notify`、`/payments/wechat/refund-notify` | 微信签名认证；原始请求体，200 |
| GET `/webview/apps`、`/webview/demo` | 公开应用目录/示例 HTML |
| POST `/webview/tickets` | 小程序令牌；请求 `{ appId }` |
| POST `/webview/exchange` | 一次性凭据；请求 `{ appId, ticket }`，200 |
| GET `/webview/me` | WebView 专用令牌，由 `WebviewGuard` 校验 |
| POST `/telemetry/events` | 小程序令牌；严格白名单埋点 |
| POST / GET `/demo/payments/orders[/:id]` | 小程序令牌；创建/查询演示订单（POST 不带 ID） |
| POST `/demo/payments/orders/:id/refunds` | 小程序令牌；请求 `{ requestId }` |

支付路由仅在配置商户号后加载；演示业务由 `DEMO_PAYMENTS_ENABLED` 控制。生产默认关闭演示业务。支付与 WebView 的详细流程见[支付接入](payment-integration.md)和 [WebView 接入](webview-integration.md)。

### 本地调用

以下在 API 已启动后执行；令牌使用微信登录结果，不把真实令牌写入版本库。

```bash
curl -i http://localhost:3000/health
curl -i http://localhost:3000/users/me
# 第二个请求应返回 401 与 JSON 错误体
```

## 异常规范

全局 `ApiExceptionFilter` 已通过 `APP_FILTER` 注册。错误保留 HTTP 状态，响应为 `{ "code": "...", "message": "..." }`：

| HTTP 状态 | 当前 code | 当前 message |
| --- | --- | --- |
| 404 | `NOT_FOUND` | 固定 `Not Found` |
| 500（包括普通 Error） | `INTERNAL_ERROR` | 固定 `Internal Server Error` |
| 其他 HttpException 状态 | `REQUEST_ERROR` | 异常的 message |

- 参数错误用 `BadRequestException`（400），认证失败用 `UnauthorizedException`（401），无操作权限用 `ForbiddenException`（403），资源不可见用 `NotFoundException`（404），状态冲突用 `ConflictException`（409）。新增代码遵循此规则，不通过 200 返回失败标记。
- 当前没有细分业务错误码；客户端依据 HTTP 状态处理，不解析英文 message 判断业务分支。自定义 HttpException 响应对象中的额外字段不会被过滤器透传。
- 只有 404 和 500 的 message 会被统一覆盖。其他状态（包括 502/503）必须使用固定、安全的公开消息，禁止传入第三方错误原文、SQL、凭证或堆栈。
- 不捕获异常后返回伪成功。仅在能恢复、清理或映射为安全领域错误时捕获；支付通知失败必须保留失败状态以便重试。
- 当前请求日志和错误日志共享服务端生成的 requestId，但响应未暴露该 ID。日志只记录路由模板、方法、状态、耗时和错误码；不要追加完整请求、响应、查询串或原始异常。

新增接口验收至少覆盖成功、畸形输入、缺少/失效令牌、跨用户访问和业务拒绝；修改过滤器时需验证状态码、JSON 格式及敏感信息不泄漏。

## 安全规范与落地边界

### 已有机制及扩展要求

- `AccessGuard` 限制 HS256 和小程序 token_use；WebView 使用独立用途和应用 audience。新增私有接口显式挂载正确 Guard（当前不是全局默认鉴权），并在数据查询/修改时同时约束资源 ID 与本人身份。
- 访问令牌有效期 15 分钟，刷新令牌 30 天，数据库保存刷新令牌哈希并在刷新时原子撤销旧值。退出只撤销刷新会话，已签发的访问令牌仍可使用至过期；需要立即封禁时必须另行实现撤销机制。
- 文件通过私有 OSS、上传意图、确认与所有者检查授权。不能凭客户端文件 ID 或上传完成通知直接认定文件可信。
- 支付价格由服务端决定，通知按原始请求体验签并核对支付信息；保留幂等处理和事务约束。前端支付成功回调不能作为履约依据。
- WebView 入口使用应用白名单与一次性 ticket；CORS 仅是浏览器来源控制，不能替代鉴权。
- 只返回明确选择的公开字段。手机号、openid、令牌、签名链接和密钥不得进入通用日志或埋点。新增日志沿用 `safeRequestRecord` / `safeErrorRecord`。

### 复制项目必须完成的配置

- 为每个环境独立生成高熵 JWT 密钥（例如 `openssl rand -hex 32`），替换所有示例凭证。启动前会校验数据库 URL、端口、JWT 长度与占位值、微信和 OSS 必填项、OSS HTTPS Bucket 地址，以及启用支付时的支付参数；这属于格式校验，不测试外部凭证是否真实有效。健康接口成功也不能作为外部服务联通证据。
- 生产使用 HTTPS；数据库不向公网开放，OSS RAM 与数据库账号使用所需的最小权限。实际环境文件、私钥、备份和带凭证日志不提交 Git。
- 全局限流已由 `RateLimitMiddleware` 启用：普通路由每来源 IP 每分钟 120 次；微信登录、刷新、WebView 票据签发/兑换和上传授权各每 IP 每分钟 10 次。超限返回 429、`RATE_LIMITED` 和 `Retry-After` 秒数。状态保存在单个 API 进程内；多实例部署必须在网关增加共享限流，不能依赖此进程内计数达成全局额度。
- 生产在可信单层 Nginx 代理后设置 `TRUST_PROXY=1`，应用仅信任紧邻代理转发的客户端地址。必须保持 API 端口只在回环地址监听；直接对公网开放 API 时设为 `0`，否则请求者可伪造来源 IP 绕过限流。
- 按业务配置请求体大小、外部调用超时、日志访问权限与保留期限，并验证备份恢复；上传限制不能替代 API 请求体限制。
- 升级依赖时检查锁文件及安全公告并跑测试。新增外部 URL 功能必须限制协议和目标，禁止把用户输入直接作为服务端请求地址。

### 合并前验证

从仓库根目录按[开发指南](development-guide.md)运行测试、类型检查和构建。安全相关变更增加对应模块测试：缺失/过期/错误用途令牌、他人资源 ID、重复票据或通知、恶意字段及日志脱敏。数据库测试只使用可清理的本地测试数据，不能指向生产库；外部服务的真实联调单独执行，不以 mock 测试替代。
