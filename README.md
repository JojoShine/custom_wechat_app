# 微信小程序全栈模板

团队内部复制改造的单实例模板仓库。包含 Taro React 小程序、NestJS API、Prisma/PostgreSQL、微信登录与业务会话、个人资料、私有 OSS 图片、微信头像与手机号授权、门户分享、Winston 分类日志及基础埋点。第三阶段加入了微信支付、部分退款、后台恢复、交易账单对账和可关闭的演示业务。

## 本地启动

需要 Node.js 22、pnpm 8.9.2、Docker 和微信开发者工具。

1. `pnpm install --frozen-lockfile`
2. `docker compose up -d db`
3. 复制 `apps/api/.env.example` 为 `apps/api/.env`，填入测试小程序的 `WECHAT_APP_ID`、`WECHAT_APP_SECRET`、随机生成的 `JWT_SECRET` 和 OSS 配置。本地数据库地址已与 Compose 对齐。需要支付联调时再配置 `WECHAT_PAY_*`。
4. `pnpm --filter @template/contracts build`，再执行 `cd apps/api && pnpm prisma migrate deploy && pnpm prisma generate && pnpm build && node --env-file=.env dist/main.js`。
5. 复制 `apps/miniapp/.env.example` 为 `apps/miniapp/.env`，将 `TARO_APP_API_BASE_URL` 改为当前开发环境可访问的 API HTTPS 地址。演示支付时把两端的演示开关都设为 `true`。
6. `pnpm --filter @template/miniapp build:weapp`，在微信开发者工具中导入 `apps/miniapp`，构建产物位于 `apps/miniapp/dist`。

真机不能使用 `localhost`。微信、OSS 的 AccessKey 只配置在 API 端；小程序只接收本项目的访问令牌、刷新令牌以及有时限的上传授权和读取地址。开发环境中间件使用 `compose.yaml` 的本地账号。

## 私有图片联调

1. 创建**私有 Bucket**，`OSS_REGION`、`OSS_BUCKET` 和 HTTPS `OSS_ENDPOINT` 必须指向同一存储空间。上传对象沿用私有权限，不要设置公开读取的对象 ACL。
   当前模板使用禁止覆盖的表单授权，Bucket 需关闭版本控制；OSS 在开启或暂停版本控制时会忽略该禁止覆盖字段。
2. 给 API 使用的 RAM 身份授权该 Bucket 的 `users/*` 对象前缀：`oss:PutObject` 用于表单上传，`oss:GetObject` 用于 HEAD 元数据核对和签名读取。按实际地域、Bucket 和前缀收紧 Resource；不要使用全局读写权限。PostObject 和 HeadObject 的权限分别见[阿里云 PostObject 文档](https://help.aliyun.com/en/oss/developer-reference/postobject)及[HeadObject 文档](https://help.aliyun.com/en/oss/developer-reference/head-object)。
3. 在微信公众平台登记 API 的 HTTPS **request 合法域名**，以及 OSS Bucket 域名的 **uploadFile 上传域名**和 **downloadFile 下载域名**；头像通过 OSS 签名地址加载，还需检查微信图片资源域名要求。参见[阿里云小程序接入说明](https://help.aliyun.com/zh/oss/user-guide/wechat-applet-uploads-files-directly-to-oss)。
4. 真机登录后，在个人资料页选择 JPEG、PNG 或 WebP 图片（不超过 10 MiB）。小程序向 API 申请限时 V4 表单、直传 OSS，随后请求 API 用 HEAD 核对类型和大小并确认文件。资料保存时只提交文件 ID。再次打开资料页应返回短期签名读取地址；其他用户不应取得该地址。

上传授权有效期为 10 分钟，读取地址有效期为 5 分钟。失败后重试会申请新的授权。OSS 凭证缺失时 API 拒绝签发授权。小程序界面不包含 AccessKey。

## 微信手机号与分享联调

手机号能力需要可用的微信小程序 AppID/Secret、相应的微信平台权限和真实用户的主动授权。用户点击资料页的绑定按钮后，小程序只向 API 发送一次性 `code`；API 与微信换取号码并保存，资料接口只返回是否绑定与掩码。用户拒绝或微信接口失败时，原号码保持不变。具体开通条件以微信公众平台当前要求为准。

门户页面可通过页面菜单和“分享门户”按钮分享。分享标题与目标路径统一配置，目标固定为门户页，不附带令牌、手机号或 OSS 签名地址。

## 日志与埋点

API 的 Winston JSON 日志写入标准输出与错误输出，包含 `request`、`event`、`error`、`payment_event`、`refund`、`payment_recovery` 和 `reconciliation` 分类。请求日志只记录方法、路由模板、状态和耗时；异常日志只记录稳定错误码；埋点仅允许 `kind/name/page/result/occurredAt` 五项受控字段。日志不记录请求正文、Authorization、查询串、手机号或签名。小程序埋点失败不影响用户操作，最多在内存中重试一次。

## 微信支付接入

本阶段使用**普通直连商户**、微信支付 API v3、微信支付公钥验签、小程序支付和人民币整数分。支付模块管理预支付、支付确认、退款执行与结果、后台补查和对账；业务模块管理商品、业务订单、定价、可购买与退款规则以及履约。没有购物车、优惠券或多租户。

服务端配置 `WECHAT_PAY_MCH_ID`、商户 API 证书序列号 `WECHAT_PAY_MERCHANT_SERIAL`、商户私钥 `WECHAT_PAY_MERCHANT_PRIVATE_KEY`、32 字节 `WECHAT_PAY_API_V3_KEY`、微信支付公钥 ID `WECHAT_PAY_PUBLIC_KEY_ID` 和公钥 `WECHAT_PAY_PUBLIC_KEY`。环境变量中的 PEM 换行可写成 `\\n`。支付回调地址 `WECHAT_PAY_NOTIFY_URL` 指向 `/payments/wechat/notify`，退款回调地址 `WECHAT_PAY_REFUND_NOTIFY_URL` 指向 `/payments/wechat/refund-notify`；均需微信可访问的 HTTPS 地址。服务端在原始请求体验签后解密通知，并核对商户、订单和金额。不要把任何商户密钥写入小程序构建变量或仓库。

业务服务以确认的金额调用 `PaymentService.createPrepay({ businessType, businessOrderId, userId, amountFen, description, idempotencyKey })`，把返回的 `launch` 交给小程序的 `Taro.requestPayment`。小程序支付窗口的结果只是交互结果，应再调用登录态 `GET /payments/:id`，由服务端通知或主动查单确认 `SUCCEEDED`。支付成功事件由 `PaymentEvents.register(businessType, handler)` 交给业务模块处理；消费者应保证重复事件不重复履约。

业务服务决定是否退款和每次金额后，调用 `RefundService.requestRefund({ paymentId, businessRefundId, amountFen, reason })`。同一 `businessRefundId` 重试复用原商户退款号；平台累计预留额不得超过支付额，最多 50 次申请，申请间隔至少 1 分钟。退款受理后的 `PROCESSING` 不是成功；用户可通过 `GET /payments/:paymentId/refunds/:refundId` 查询最终状态。`ABNORMAL` 保留退款预留额并写 Winston 告警，团队在微信商户平台人工处理，后台继续查单。本模板不处理银行卡资料。

### 演示业务与真实联调

`DEMO_PAYMENTS_ENABLED=true` 开放 API 演示路由；小程序构建时设置 `TARO_APP_DEMO_PAYMENTS_ENABLED=true` 才包含演示页和门户入口。演示页创建固定 **10 分**业务订单，付款后可每次申请 **1 分**退款；价格和退款额均在服务端确定。演示开关默认关闭。API 路由为 `POST /demo/payments/orders`、`GET /demo/payments/orders/:id` 和 `POST /demo/payments/orders/:id/refunds`；最后一个接口仅接受 `{ "requestId": "每次退款的稳定幂等键" }`。

真实联调需要可用的小程序 AppID、普通直连商户测试凭证及微信支付公钥、微信可访问的 HTTPS 回调、合法的 API 请求域名和低额测试付款人。依次检查预支付、微信支付窗口、支付通知、服务端支付状态、1 分退款、退款通知或主动查单，再在次日对账。当前仓库没有注入这些凭证，**真实微信支付、退款与次日账单尚未执行**；自动测试使用受控微信响应，不代表真实商户联调通过。

### 对账与恢复

API 启动后每分钟补查待定或到期支付、待定退款并重投业务事件；每天北京时间 10 点后自动核对前一天的微信 `ALL` 交易账单。退款账单行只代表申请受理，最终状态仍由退款通知或查单确定。微信明确返回 `NO_STATEMENT_EXIST` 时，如本地有预期交易会写入差异；下载、哈希或解析失败会留下 `FAILED` 运行记录供重试。

部署环境完成 API 构建后，可执行 `pnpm --filter @template/api reconcile -- YYYY-MM-DD` 重跑前三个月内、早于当天的日期。每次重跑保留独立历史。在 PostgreSQL 查询 `reconciliation_runs` 的 `bill_date`、`status`、`difference_count` 和 `started_at`，再用其 `id` 查询 `reconciliation_differences.run_id`；查看最新成功运行的差异。对账失败及差异也会写入 Winston 日志。本阶段没有公开管理接口。

## 检查与打包

- `pnpm test`、`pnpm typecheck`、`pnpm build`：仓库检查。
- `pnpm test:container`：构建 API 镜像并启动临时容器，检查 `/health`。
- `docker build -f apps/api/Dockerfile -t wechat-template-api .`：构建 API 生产镜像。

部署前在与目标 PostgreSQL 可连接的环境执行 `cd apps/api && pnpm prisma migrate deploy`。镜像只运行 API，不在每次启动时自动迁移数据库。生产环境通过容器环境变量注入 `DATABASE_URL`、`JWT_SECRET`、`WECHAT_APP_ID`、`WECHAT_APP_SECRET`、`OSS_*` 及启用支付时所需的 `WECHAT_PAY_*`；不要提交真实密钥。

**真实联调状态：未执行。** 仓库没有测试平台的微信 AppID/Secret、手机号权限或 OSS 凭证，自动测试通过替身 provider 验证签名策略、授权边界和交换流程；编译、数据库迁移与容器健康检查属于本地验证。上线前需在真实微信和 OSS 测试环境复核登录、上传、HEAD、私有读取、手机号授权和分享。

## 复制新场景

团队内部复制、替换门户、登记新页面及接入业务支付事件的完整步骤见[内部复制与业务接入指引](docs/template-copy-guide.md)。

复制仓库后，更改小程序名称和门户页面，再接入业务自己的数据与页面。业务管理商品元数据、业务订单、价格、退款决策与履约，复用平台支付、退款和对账能力。如无需演示模块，在首次部署前删除 `apps/api/src/modules/demo-payments`、`apps/miniapp/src/pages/demo-payment` 及演示入口/构建开关，并从 `AppModule`、Prisma schema、共享契约中移除对应项；已有数据库应使用新的迁移删除演示表，不要删除已执行的迁移历史。本模板不包含多租户、购物车和优惠券。
