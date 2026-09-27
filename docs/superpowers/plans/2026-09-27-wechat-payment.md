# 微信支付、退款与对账实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 monorepo 中交付普通直连商户的微信小程序支付、部分退款、结果恢复、每日对账，以及可开关的演示业务联调链路。

**Architecture:** 业务服务以服务端确认的金额调用通用支付服务；微信 API v3 适配器只负责签名、验签、解密与协议映射。支付和退款状态写入 PostgreSQL，并以事务内事件通知业务；后台查询补偿漏通知，对账任务保存独立运行记录和差异。

**Tech Stack:** NestJS 12、Prisma 7、PostgreSQL、Node.js 22.23.2、Vitest、Taro 4/React、Jest、Winston、Docker。

**Spec:** `docs/superpowers/specs/2026-09-27-wechat-payment-design.md`

## Global Constraints

- 只支持微信小程序、人民币、普通直连商户，采用 API v3 公钥验签模式。
- 商品、业务订单、定价、退款决策和履约属于业务模块；通用模块只处理收退款与对账。
- 演示业务默认关闭，固定低额测试商品由服务端定价，不接受客户端金额。
- 所有金额以整数“分”计算；微信调用超时视为结果未知，不视为失败。
- 退款支持多次部分退款，累计预留不得超过原支付金额；微信每单最多 50 次，连续申请至少间隔 1 分钟。
- 账单退款行表示退款受理，不表示最终退款成功；账单只能核对近三个月日期。
- 不把商户密钥、会话令牌、手机号、通知密文或银行卡资料写入日志。
- 所有本机 Node、pnpm 和 Prisma 命令先执行 `source "$HOME/.nvm/nvm.sh" && nvm use 22.23.2 >/dev/null`。
- 保留用户已有的未跟踪 `.idea/`，只提交本阶段文件。

## Review Focus

1. 微信返回 HTTP 成功但签名头缺失或公钥 ID 不匹配时必须拒绝，不得入账；Task 2 的 `rejectsUnsignedOrWrongKeyResponse` 覆盖。
2. 同一业务订单重复请求但金额变化时必须拒绝；Task 3 的 `rejectsChangedAmountForSameBusinessOrder` 覆盖。
3. 退款 API 请求超时后再次提交同一业务退款 ID 时必须复用原退款单号；Task 5 的 `reusesRefundNumberAfterUnknownResult` 覆盖。
4. 账单文件哈希正确但明细金额格式异常时整次任务失败，不能生成错误差异；Task 7 的 `rejectsMalformedFenConversion` 覆盖。
5. 演示业务开关关闭时购买和退款接口都不可用；Task 8 的 `demoRoutesDisabledByDefault` 覆盖。

---

## 文件结构

- `apps/api/prisma/schema.prisma` 与新迁移：支付、退款、事件、对账运行及差异；演示业务订单在 Task 8 的迁移添加。
- `apps/api/src/modules/payments/wechat-pay.crypto.ts`：API v3 请求、应答和通知的加解密与签名。
- `apps/api/src/modules/payments/wechat-pay.gateway.ts`：微信下单、查单、关单、退款、退款查询和账单 HTTP 适配。
- `apps/api/src/modules/payments/payment.service.ts`、`refund.service.ts`：本地生命周期及业务调用接口。
- `apps/api/src/modules/payments/payment.controller.ts`、`notification.controller.ts`：用户状态查询与无会话的微信回调。
- `apps/api/src/modules/payments/payment-events.ts`、`payment-recovery.ts`、`reconciliation.service.ts`：事件投递、主动查单、账单核对。
- `apps/api/src/modules/demo-payments/*`：可删除的演示商品、业务订单及事件消费者。
- `apps/miniapp/src/core/payments/*`、`apps/miniapp/src/pages/demo-payment/*`：小程序调起、状态查询和演示页面。
- `packages/contracts/src/payment.ts`：前后端传输类型；`README.md` 与环境示例：接入和联调说明。

### Task 1: 支付数据模型与共享契约

**Files:** Modify `apps/api/prisma/schema.prisma`, `packages/contracts/src/index.ts`; create `packages/contracts/src/payment.ts`, `apps/api/prisma/migrations/<timestamp>_add_payments/migration.sql`, `apps/api/src/modules/payments/payment-model.spec.ts`。

**Interfaces:** `PaymentStatus` 为 `CREATING | PENDING | SUCCEEDED | CLOSED | FAILED | UNKNOWN`，`RefundStatus` 为 `REQUESTING | PROCESSING | SUCCEEDED | CLOSED | ABNORMAL | UNKNOWN`。`PaymentView` 含 `id, businessType, businessOrderId, amountFen, status, createdAt`；`RefundView` 含 `id, paymentId, amountFen, status, createdAt`；`PaymentLaunchParams` 含 `timeStamp, nonceStr, package, signType, paySign`。数据库模型为 `Payment`（业务命名空间/订单/尝试号、用户、金额、商户及微信单号、状态）、`Refund`（支付、业务退款 ID、金额、商户及微信退款号、状态）、`PaymentEvent`、`ReconciliationRun`、`ReconciliationDifference`；业务退款 ID、商户单号、商户退款单号分别唯一。

- [ ] **Step 1: Write the failing test.** 在 `payment-model.spec.ts` 声明契约状态与 Prisma 枚举映射测试；断言整数分、唯一业务退款 ID 和重复商户单号约束。
- [ ] **Step 2: Verify failure.** `pnpm --filter @template/api test -- payment-model.spec.ts`；预期因模型/契约不存在而失败。
- [ ] **Step 3: Implement schema, migration and contracts.** 金额列用整数；索引覆盖 `userId`、业务单据、待恢复状态和对账日期；对账差异属于某次运行。使用 nvm Node 执行 `pnpm --filter @template/api prisma generate`。
- [ ] **Step 4: Verify.** 测试、`pnpm --filter @template/api typecheck`、`pnpm --filter @template/api prisma migrate deploy` 通过；检查新迁移可从空数据库应用。
- [ ] **Step 5: Commit.** `feat: add payment persistence and contracts`。

### Task 2: 微信 API v3 密码学与传输

**Files:** Create `apps/api/src/modules/payments/wechat-pay.crypto.ts`, `wechat-pay.gateway.ts`, `wechat-pay.crypto.spec.ts`, `wechat-pay.gateway.spec.ts`; modify `apps/api/src/common/config/app-config.ts`, `apps/api/.env.example`。

**Interfaces:** `WechatPayGateway` 提供 `createPrepay(input: { outTradeNo: string; openId: string; amountFen: number; description: string }): Promise<{ prepayId: string }>`, `queryPayment(outTradeNo: string): Promise<WechatPaymentResult>`, `closePayment(outTradeNo: string): Promise<void>`, `createRefund(input: { outTradeNo: string; outRefundNo: string; amountFen: number; totalFen: number; reason: string }): Promise<WechatRefundResult>`, `queryRefund(outRefundNo: string): Promise<WechatRefundResult>`, `getTradeBill(date: string): Promise<Buffer>`；`WechatPaymentResult` 包含商户/微信单号、金额、币种和交易状态，`WechatRefundResult` 包含商户/微信退款单号、金额和退款状态。返回已验证并映射的 DTO，不向服务层暴露未经验证的微信响应。`verifyNotification(headers: Record<string, string>, rawBody: Buffer): VerifiedNotification` 返回已核验和解密的通知。商户配置独立于现有数据库配置，仅实例化网关时要求完整支付凭证。

- [ ] **Step 1: Write failing crypto tests.** `wechat-pay.crypto.spec.ts` 使用固定 RSA 测试密钥断言请求签名串、小程序 `paySign`、通知原始体验签与 AES-256-GCM 解密；`rejectsUnsignedOrWrongKeyResponse` 断言缺签名或错误公钥 ID 被拒绝。
- [ ] **Step 2: Verify failure.** `pnpm --filter @template/api test -- wechat-pay.crypto.spec.ts wechat-pay.gateway.spec.ts`；预期缺实现失败。
- [ ] **Step 3: Implement crypto and HTTP gateway.** 使用 Node `crypto` 与 `fetch`；仅允许微信 API 主域名及它签发的账单下载地址；校验响应签名，账单文件按官方哈希验证；错误响应映射为确定失败或未知结果，网络超时为未知。
- [ ] **Step 4: Verify.** 两个测试文件与 API 类型检查通过；测试覆盖下单、退款、查询、关单、账单 URL，且日志无密钥。
- [ ] **Step 5: Commit.** `feat: add verified WeChat Pay gateway`。

### Task 3: 预支付与支付查询

**Files:** Create `apps/api/src/modules/payments/payment.service.ts`, `payment.controller.ts`, `payments.module.ts`, `payment.service.spec.ts`; modify `apps/api/src/app.module.ts`。

**Interfaces:** `PaymentService.createPrepay(input: { businessType: string; businessOrderId: string; userId: string; amountFen: number; description: string; idempotencyKey: string }): Promise<{ payment: PaymentView; launch: PaymentLaunchParams }>`；`getPayment(userId, paymentId): Promise<PaymentView>`；`refreshPayment(paymentId): Promise<PaymentView>`；`closeExpired(paymentId): Promise<void>`。仅业务服务可调用 `createPrepay`；公开控制器只提供登录用户查看自己支付单的 `GET /payments/:id`。

- [ ] **Step 1: Write failing service tests.** `payment.service.spec.ts` 覆盖正常下单、并发重复只建一个支付尝试、`rejectsChangedAmountForSameBusinessOrder`、微信响应未知复用原商户号、他人查询被拒、成功单不得重下。
- [ ] **Step 2: Verify failure.** `pnpm --filter @template/api test -- payment.service.spec.ts`；预期缺服务失败。
- [ ] **Step 3: Implement payment lifecycle.** 业务键与尝试号在数据库约束下仲裁；仅已查明关闭的旧尝试允许新尝试；从本地用户取 `openid`；固定币种 CNY；用网关生成预支付 ID 后服务端签发小程序参数。
- [ ] **Step 4: Verify.** 服务与 HTTP 测试及 API 类型检查通过，独立支付模块可导入 AppModule。
- [ ] **Step 5: Commit.** `feat: add idempotent payment initiation`。

### Task 4: 通知验收与业务状态事件

**Files:** Create `apps/api/src/modules/payments/notification.controller.ts`, `payment-events.ts`, `notification.spec.ts`, `payment-events.spec.ts`; modify `apps/api/src/main.ts`, `payments.module.ts`, `payment.service.ts`。

**Interfaces:** `PaymentService.applyVerifiedPayment(notification): Promise<void>` 与 `PaymentEvents.dispatchPending(): Promise<number>`；事件 payload 只包含业务键、支付 ID、状态与金额。`POST /payments/wechat/notify` 无客户端鉴权，但必须在解密前验签；Nest 启用原始请求体供验签。事件在状态事务中写入，业务处理成功后标记送达，失败重试。

- [ ] **Step 1: Write failing tests.** `notification.spec.ts` 验证无效签名、金额/商户号/单号不符、重复与乱序通知均不会错误入账；`payment-events.spec.ts` 验证业务处理失败后重试只产生一次业务状态变更。
- [ ] **Step 2: Verify failure.** `pnpm --filter @template/api test -- notification.spec.ts payment-events.spec.ts`；预期失败。
- [ ] **Step 3: Implement controller and outbox.** 回调响应遵循微信格式；状态更新、微信交易号唯一性和事件写入同一事务；事件消费者注册由业务模块提供，未注册时事件保留并告警。
- [ ] **Step 4: Verify.** 两个测试文件与 API 类型检查通过；真实原始请求体路径的 HTTP 测试通过。
- [ ] **Step 5: Commit.** `feat: verify payment notifications and deliver events`。

### Task 5: 多次部分退款

**Files:** Create `apps/api/src/modules/payments/refund.service.ts`, `refund.service.spec.ts`, `refund-notification.spec.ts`; modify `notification.controller.ts`, `payment.controller.ts`, `payments.module.ts`。

**Interfaces:** `RefundService.requestRefund(input: { paymentId: string; businessRefundId: string; amountFen: number; reason: string }): Promise<RefundView>`；`getRefund(userId, refundId): Promise<RefundView>`；`refreshRefund(refundId): Promise<RefundView>`；`applyVerifiedRefund(notification): Promise<void>`。公开控制器只供订单所属用户查询 `GET /payments/:paymentId/refunds/:refundId`，退款申请只由业务服务调用。

- [ ] **Step 1: Write failing tests.** 覆盖支付成功前拒退、并发累计额度、50 次限制、1 分钟间隔、相同业务退款 ID 幂等、`reusesRefundNumberAfterUnknownResult`、通知验签与金额核对、`CLOSED` 释放额度、`ABNORMAL` 保留额度并告警。
- [ ] **Step 2: Verify failure.** `pnpm --filter @template/api test -- refund.service.spec.ts refund-notification.spec.ts`；预期失败。
- [ ] **Step 3: Implement refund lifecycle.** 退款前经网关查明原交易成功；数据库事务锁住支付单并原子预留金额；申请受理进入 `PROCESSING`，未知结果用同一商户退款号查单；每次状态变化写事务事件。
- [ ] **Step 4: Verify.** 退款测试、HTTP 测试与 API 类型检查通过。
- [ ] **Step 5: Commit.** `feat: add partial refunds and refund notifications`。

### Task 6: 支付与退款恢复任务

**Files:** Create `apps/api/src/modules/payments/payment-recovery.ts`, `payment-recovery.spec.ts`; modify `payments.module.ts`, `payment.service.ts`, `refund.service.ts`。

**Interfaces:** `PaymentRecovery.runOnce(now: Date): Promise<{ payments: number; refunds: number; events: number }>`；扫描到期或待核实支付、处理中/异常/待核实退款与待投递事件。仅通过 Task 3/5 的 `refresh*` 和 `closeExpired` 推进状态。

- [ ] **Step 1: Write failing tests.** 覆盖迟到支付通知与主动查询竞态、支付未付款到期关单、微信查单暂时失败后下轮重试、退款 `PROCESSING` 继续查询、事件失败重投。
- [ ] **Step 2: Verify failure.** `pnpm --filter @template/api test -- payment-recovery.spec.ts`；预期失败。
- [ ] **Step 3: Implement bounded background scan.** 批量扫描、数据库租约避免多实例重复工作；任务错误记录 Winston 而不停止服务；启动和周期运行。
- [ ] **Step 4: Verify.** 恢复任务测试与 API 类型检查通过。
- [ ] **Step 5: Commit.** `feat: recover unsettled payments and refunds`。

### Task 7: 每日交易账单对账

**Files:** Create `apps/api/src/modules/payments/reconciliation.service.ts`, `trade-bill.parser.ts`, `reconciliation.spec.ts`, `trade-bill.parser.spec.ts`, `apps/api/scripts/reconcile-date.mjs`; modify `payments.module.ts`, `apps/api/package.json`。

**Interfaces:** `ReconciliationService.run(date: string): Promise<ReconciliationSummary>`，`TradeBillParser.parse(raw: Buffer): BillRow[]`；日期为北京时间 `YYYY-MM-DD`，仅接受前三个月内且早于当天的日期。自动任务每日 10 点后运行昨天的账单；命令 `pnpm --filter @template/api reconcile -- YYYY-MM-DD` 手工重跑。

- [ ] **Step 1: Write failing tests.** 账单样本覆盖微信有/本地无、本地有/微信无、金额差异、退款受理与退款最终状态分离、无账单但有本地交易、哈希错误、`rejectsMalformedFenConversion`、同日重跑保留历史、并发任务只有一个执行。
- [ ] **Step 2: Verify failure.** `pnpm --filter @template/api test -- reconciliation.spec.ts trade-bill.parser.spec.ts`；预期失败。
- [ ] **Step 3: Implement parser, reconciliation and CLI.** 只解析官方 `ALL` 明细，处理字段前反引号和元金额；先完整校验与解析再写运行结果；每次运行保存差异，失败保留失败记录并允许重跑；Winston 记录失败和未解决差异。
- [ ] **Step 4: Verify.** 测试、API 类型检查和 CLI 参数校验通过；自动任务使用日期级数据库锁。
- [ ] **Step 5: Commit.** `feat: reconcile WeChat trade bills daily`。

### Task 8: 独立演示业务模块

**Files:** Create `apps/api/src/modules/demo-payments/demo-payments.module.ts`, `demo-payments.controller.ts`, `demo-payments.service.ts`, `demo-payments.spec.ts`, 新 Prisma 迁移；modify `apps/api/prisma/schema.prisma`, `apps/api/src/app.module.ts`。

**Interfaces:** `POST /demo/payments/orders` 创建固定 10 分的演示业务订单并返回 Task 3 的支付调起参数；`GET /demo/payments/orders/:id` 查询所属用户的业务状态；`POST /demo/payments/orders/:id/refunds` 接收客户端生成的 `requestId` 幂等键，每次由服务端确定退款 1 分，允许多次直至退款额满。`DEMO_PAYMENTS_ENABLED` 缺省为 false，关闭时三类路由都不可用。

- [ ] **Step 1: Write failing tests.** `demo-payments.spec.ts` 覆盖 `demoRoutesDisabledByDefault`、客户端传入金额被忽略或拒绝、固定服务端价格、他人订单禁止访问、支付事件只履约一次、演示退款规则由服务端判断。
- [ ] **Step 2: Verify failure.** `pnpm --filter @template/api test -- demo-payments.spec.ts`；预期失败。
- [ ] **Step 3: Implement module and migration.** 演示订单只存其自身业务字段和支付关联；注册 Task 4 的事件消费者；不让通用模块依赖演示模型。
- [ ] **Step 4: Verify.** 演示模块测试、Prisma 生成与迁移、API 类型检查通过。
- [ ] **Step 5: Commit.** `feat: add opt-in payment demo business`。

### Task 9: 小程序支付调用与演示页面

**Files:** Create `apps/miniapp/src/core/payments/payment.ts`, `payment.test.ts`, `apps/miniapp/src/pages/demo-payment/index.tsx`; modify `apps/miniapp/src/app.config.ts`, `apps/miniapp/src/pages/portal/index.tsx`。

**Interfaces:** `createPaymentFlow({ request, requestPayment }): { purchaseDemo(): Promise<PaymentView>; refresh(paymentId: string): Promise<PaymentView>; requestDemoRefund(orderId: string, requestId: string): Promise<RefundView> }`；`requestPayment` 只接受服务端返回的 `PaymentLaunchParams`，退款请求只传幂等键，不传金额。页面只在演示开关开启的构建配置下展示入口，支付返回后查询 API 直到已确认状态或短暂待定提示。

- [ ] **Step 1: Write failing tests.** `payment.test.ts` 覆盖成功、用户取消、网络失败、服务端状态仍待定、退款处理中；断言前端回调不直接写成支付成功。
- [ ] **Step 2: Verify failure.** `pnpm --filter @template/miniapp test -- payment.test.ts`；预期失败。
- [ ] **Step 3: Implement flow and page.** 沿用现有 `apiRequest`、登录保护与 Taro API；展示业务订单、支付和退款的独立状态，避免在门户硬编码行业商品。
- [ ] **Step 4: Verify.** 小程序测试、类型检查和 `pnpm --filter @template/miniapp build` 通过。
- [ ] **Step 5: Commit.** `feat: add miniapp payment demo flow`。

### Task 10: 联调说明与全仓验证

**Files:** Modify `README.md`, `apps/api/.env.example`, `apps/miniapp/.env.example`; if required by build, modify `apps/api/Dockerfile` only for支付运行时必要依赖。

**Interfaces:** 文档给出业务模块调用接口、商户公钥模式配置、支付与退款回调地址、演示开关、按日期重跑、人工处理 `ABNORMAL`、账单差异查看及复制模板时移除演示模块的方法。

- [ ] **Step 1: Write verification checklist.** 在 README 写明自动化验证与真实微信联调分开；真实链路需商户凭证、公钥、微信可访问的 HTTPS 回调及低额测试付款人。
- [ ] **Step 2: Run full checks.** nvm Node 下执行 `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm test:container`，并在本地 PostgreSQL 上执行 Prisma 迁移；预期全部通过。
- [ ] **Step 3: Perform real integration if available.** 用测试凭证和回调跑支付、支付通知、部分退款、退款通知及次日对账；逐项记录实际结果。外部条件缺失时写清未验证项，不用模拟结果冒充真实联调。
- [ ] **Step 4: Commit.** `docs: complete payment integration guide`。
- [ ] **Step 5: Review.** 对照设计文档逐项审查差异及安全边界，确认工作区只包含本阶段改动，然后按用户既有偏好本地合并回 `master`。
