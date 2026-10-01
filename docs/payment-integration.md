# 支付、退款与对账接入

模板封装普通直连商户的微信支付 API v3、小程序调起参数、支付通知验签、主动查单、部分退款、退款通知与对账。业务模块仍负责商品元数据、服务端价格、业务订单、可购买与可退规则和履约。平台没有购物车、优惠券或多租户模型。

直连与服务商的区别、参数准备及后续代码调整范围，见[微信支付模式集成说明](payment-modes.md)。当前仅支持直连，服务商模式尚未实现。

## 启用前配置

在 API 环境配置 `WECHAT_PAY_MCH_ID`、`WECHAT_PAY_MERCHANT_SERIAL`、`WECHAT_PAY_MERCHANT_PRIVATE_KEY`、`WECHAT_PAY_API_V3_KEY`、`WECHAT_PAY_PUBLIC_KEY_ID`、`WECHAT_PAY_PUBLIC_KEY`，并让支付、退款通知 URL 指向本 API 的 `/payments/wechat/notify` 和 `/payments/wechat/refund-notify`。两条地址都必须是微信可访问的 HTTPS 地址。商户号留空时，`AppModule` 不加载支付模块；启用时须配齐全部参数。参见[配置指南](configuration.md)。

私钥、API v3 密钥与 OSS 凭证只在服务端环境中提供。通知由现有 NestJS 服务接收，不需要单独建通知服务。服务端用原始请求体验签、解密通知，再核对商户、订单和金额。小程序支付弹窗的返回只表示交互结束，不能据此确认已收款。

## 业务接入顺序

1. 在 `apps/api/src/modules/business/<功能名>/` 保存业务订单，并校验登录用户、可购买规则及**服务端价格**。金额使用整数分，不能接受客户端自报价格。
2. 调用 `PaymentService.createPrepay({ businessType, businessOrderId, userId, amountFen, description, idempotencyKey })`。同一业务订单的重试使用稳定幂等键；将返回的 `payment.id` 关联到业务订单，并把 `launch` 返回小程序。
3. 小程序将 `launch` 交给 `Taro.requestPayment`。弹窗返回、取消或网络中断后，保存 `payment.id` 并查询登录态 `GET /payments/:id`；`apps/miniapp/src/core/payments/payment.ts` 的演示流程展示了短时轮询。仍待定时允许稍后刷新，后端通知和补查会继续推进状态。
4. 业务模块导入 `PaymentsModule`，初始化时以唯一的 `businessType` 调用 `PaymentEvents.register(businessType, handler)`。仅在匹配订单、金额和支付 ID 的 `PAYMENT/SUCCEEDED` 事件后更新业务订单和履约。事件可能重投，处理器必须幂等；参考 `apps/api/src/modules/demo-payments/demo-payments.service.ts`。
5. 业务判断可退条件及本次金额，再调用 `RefundService.requestRefund({ paymentId, businessRefundId, amountFen, reason })`。同一退款请求使用稳定 `businessRefundId`；平台控制累计可退金额。登录用户可通过 `GET /payments/:paymentId/refunds/:refundId` 查看结果，业务按可信退款事件处理自己的状态。

平台允许多次部分退款，但最多 50 次申请，申请间隔至少 1 分钟。`PROCESSING` 只表示受理；`ABNORMAL` 保留退款预留额、写 Winston 告警并持续查单，团队在微信商户平台人工处理。模板不采集银行卡资料。支付和退款待定状态由后台补查，业务无需自己调用微信查单。

## 对账与人工重跑

API 在北京时间 10 点后自动核对前一日微信 `ALL` 交易账单；账单下载、解析或身份核对失败会留下失败运行记录。退款账单行不代表退款最终成功，最终状态仍取通知或主动查单。差异记录在 `reconciliation_runs` 与 `reconciliation_differences`，同时进入 Winston 的 `reconciliation` 分类日志。

在已配置支付参数的运行环境，可用 `pnpm --filter @template/api reconcile -- YYYY-MM-DD` 重跑前三个月内、早于当天的日期；重跑保留独立历史。排查时先看运行的 `status`、`difference_count` 和 `started_at`，再按运行 ID 查差异。该命令调用 `apps/api/scripts/reconcile-date.mjs`，清理模板时必须保留。

## 演示业务

`DEMO_PAYMENTS_ENABLED=true` 开放服务端演示路由；小程序构建时设置 `TARO_APP_DEMO_PAYMENTS_ENABLED=true` 才包含演示页和入口。演示业务的固定价格为 **10 分**，每次退款 **1 分**，均由服务端决定。接口为 `POST /demo/payments/orders`、`GET /demo/payments/orders/:id` 和 `POST /demo/payments/orders/:id/refunds`；退款请求只提交稳定的 `requestId`。

复制项目可保持两端演示开关为 `false`。若首次部署前决定删除演示代码，需同步清理 `apps/api/src/modules/demo-payments`、`apps/miniapp/src/pages/demo-payment`、演示入口、路由、构建开关、共享演示契约和 Prisma 模型引用。已经部署过的项目应新增迁移删除演示表，不得改写历史迁移。删除前先保留一条可用于真实商户低额联调的业务路径。

自动测试使用受控微信响应，只证明本仓库逻辑。上线前用真实商户与小程序依次核对预支付、支付弹窗、服务端支付状态、退款、两类通知和次日账单；真机与公网域名设置见[部署指南](deployment.md)。
