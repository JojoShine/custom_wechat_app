# 内部复制与业务接入指引

本仓库供团队按业务场景直接复制。每个复制品单独部署、单独使用 PostgreSQL 和外部服务配置；模板不提供多租户或通用商品、业务订单系统。复制时保留 `apps/miniapp`、`apps/api`、`packages/contracts` 的 monorepo 结构。

## 1. 复制并命名

1. 在团队代码平台从本仓库创建独立仓库，确认新仓库的远端地址和访问权限。不要复制本地 `.env`、构建产物或开发数据库数据。
2. 修改根目录 `package.json` 的项目名称、`apps/miniapp/config/index.ts` 的 `projectName`、`apps/miniapp/src/app.config.ts` 与页面配置中的展示文案，以及分享标题 `apps/miniapp/src/core/share/portal.ts`。在微信开发者工具中选择新场景的小程序 AppID，并将同一个值配置为 API 的 `WECHAT_APP_ID`；不要写入页面源码。
3. `@template/api`、`@template/miniapp`、`@template/contracts` 可暂时保留，它们是工作区内部包名。若要改名，需同步调整三个 `package.json`、两个应用源码及测试里对 `@template/contracts` 的 import、根目录和 `apps/api/scripts` 中的命令、`apps/api/Dockerfile`、`scripts/check-workspace.mjs` 以及本指引和 README。先运行 `rg -n '@template/' apps packages scripts README.md docs/template-copy-guide.md` 找齐引用，修改后用 pnpm 重新生成 `pnpm-lock.yaml` 并执行整仓检查；不要只改根目录的名称。

## 2. 本地运行与环境

先执行 `source "$HOME/.nvm/nvm.sh" && nvm use 22.23.2`，并使用仓库指定的 pnpm 8.9.2。环境变量分别填写在 `apps/api/.env` 和 `apps/miniapp/.env`；两者均由各自的 `.env.example` 复制，不提交实际值。以下命令默认在仓库根目录运行，明确写出“在 `apps/api`”的除外。各变量的作用见[模板环境配置](template-environments.md)。

暂不联调支付时保持 `WECHAT_PAY_MCH_ID` 为空，API 才不会加载支付模块；其余支付字段的占位值不能用于真实交易。准备联调时再一次配齐全部 `WECHAT_PAY_*`。

1. `pnpm install --frozen-lockfile`。
2. `docker compose up -d db`，启动本地 PostgreSQL。开发中间件使用本地 Docker；复制品应使用自己的数据库和卷。
3. `pnpm --filter @template/contracts build`，然后在 `apps/api` 执行 `pnpm prisma migrate deploy` 和 `pnpm prisma generate`。迁移在 API 部署前执行，不在每次容器启动时自动执行。
4. `pnpm --filter @template/api build`，在 `apps/api` 执行 `node --env-file=.env dist/main.js`；用 `/health` 检查 API。
5. `pnpm --filter @template/miniapp build:weapp`，将 `apps/miniapp` 导入微信开发者工具。真机访问的 `TARO_APP_API_BASE_URL` 必须是可访问的 HTTPS API 地址。

本地只有一个 PostgreSQL 测试数据库用于自动测试，不需要为复制演练另建数据库。真实微信、OSS 和支付能力必须在各自测试环境配置后另行联调；本地受控测试通过不代表外部链路已通过。

整仓测试需显式指定已完成迁移的数据库：先在 `apps/api` 用目标库的 `DATABASE_URL` 执行 `pnpm prisma migrate deploy`，再在仓库根目录运行 `TEST_DATABASE_URL=postgresql://template:localdev@localhost:5433/template_payment_dev pnpm test`（这里展示当前项目已有的本地测试库地址；复制品改为自己的单个本地测试库）。测试命令会先构建共享类型并重新生成 Prisma 客户端，避免复制后的旧产物影响测试。根目录 `pnpm test` 在未设置 `TEST_DATABASE_URL` 时会明确失败，避免数据库测试被静默跳过。验收输出应显示 API 100 项、小程序 26 项，且没有跳过数据库测试；新增测试后以实际总数为准。

## 3. 替换门户并增加业务页面

- 将 `apps/miniapp/src/pages/portal/index.tsx` 替换为场景门户；样式和业务入口由复制后的项目决定。个人资料页、分享入口和可选支付演示仅是能力示例，不是业务导航规范。
- 在 `apps/miniapp/src/core/navigation/routes.ts` 登记新页面路径，将其加入 `enabledPages`，并按是否需要登录决定是否加入 `apps/miniapp/src/core/navigation/guard.ts` 的允许路径。登录回跳只接受登记的受保护路径，未知路径回门户。
- 在 `apps/miniapp/src/core/share/portal.ts` 调整场景分享标题和目标页。资料页 `apps/miniapp/src/pages/profile/index.tsx` 展示昵称、头像直传、手机号授权和退出登录；可按业务界面重做，但继续调用 `core` 中的能力入口。
- 小程序调用 API 使用 `apps/miniapp/src/core/api/client.ts` 的 `apiRequest`。业务页面负责自己的状态和交互；平台 `core` 不保存业务商品或订单数据。

## 4. 新增业务模块并接入支付

在 `apps/api/src/modules` 下建立业务模块和 Prisma 模型，业务自己保存商品元数据、业务订单、定价、可购买规则、退款决策和履约状态。不要将这些字段或规则放进 `apps/api/src/modules/payments`。

接入流程以 `apps/api/src/modules/demo-payments/demo-payments.service.ts` 为最小示例：

1. 业务服务校验用户、业务订单和服务端价格，然后调用 `PaymentService.createPrepay({ businessType, businessOrderId, userId, amountFen, description, idempotencyKey })`。同一业务订单重试要使用稳定的标识；金额是整数分。将返回的 `payment.id` 与业务订单关联，把 `launch` 返回小程序调起 `Taro.requestPayment`。
2. 小程序支付窗口结束后，用登录态 `GET /payments/:id` 查询服务端状态。前端回调、取消或网络中断不能自行将业务订单记为已支付；保留 `payment.id` 供后续刷新。
3. 业务模块导入 `PaymentsModule`，在初始化时以唯一 `businessType` 注册 `PaymentEvents.register(businessType, handler)`。仅在收到匹配订单、金额和支付 ID 的 `PAYMENT/SUCCEEDED` 事件后推进业务订单或履约状态。事件会重投，处理函数须幂等；业务记录的状态更新应能安全重复执行。
4. 业务判断可退条件和本次金额，再调用 `RefundService.requestRefund({ paymentId, businessRefundId, amountFen, reason })`。同一退款请求使用稳定的 `businessRefundId`；平台负责累计额度、微信退款及后续状态。业务可用 `GET /payments/:paymentId/refunds/:refundId` 获取结果，并按可信退款事件更新自己的业务状态。

支付模块在配置微信支付商户参数后才由 `AppModule` 启用。业务模块依赖 `PaymentsModule` 时也需要完整商户参数。支付通知、后台补查和对账由平台运行；复制品必须让 API 服务持续运行，并为微信配置可访问的 HTTPS 回调地址。

## 5. 演示业务的去留

`DEMO_PAYMENTS_ENABLED` 与 `TARO_APP_DEMO_PAYMENTS_ENABLED` 默认均为 `false`。保留演示代码但关闭开关即可用于正式业务开发，不会在默认小程序构建中出现演示页。需要低额联调时，两端都设为 `true`，演示商品和退款金额由服务端固定。

如确定不再保留演示代码，在首次部署前可删除 `apps/api/src/modules/demo-payments`、`apps/miniapp/src/pages/demo-payment` 和仅服务演示的 `apps/miniapp/src/core/payments/payment.ts`，并从 `apps/api/src/app.module.ts`、`apps/miniapp/src/core/navigation/routes.ts`、`apps/miniapp/src/core/navigation/guard.ts`、`apps/miniapp/src/pages/portal/index.tsx`、`packages/contracts/src/payment.ts` 和 `apps/api/prisma/schema.prisma` 中移除对应引用。再搜索 `DEMO_PAYMENTS_ENABLED`、`DEMO_PAYMENT_PATH`、`DemoOrderView` 和 `demo-payments`，清除演示开关、测试及文档中的剩余引用；保留通用支付契约。已经部署过的复制品必须新增 Prisma 迁移来删除 `demo_payment_orders`，不要编辑或删除已执行的迁移历史。

## 6. 提交前检查

- 用上述 `TEST_DATABASE_URL` 运行 `pnpm test`，并确认 `pnpm typecheck`、`pnpm build` 均通过；需要验证 API 镜像时运行 `pnpm test:container`。
- 默认构建没有演示入口；仅在明确开启时执行 `TARO_APP_DEMO_PAYMENTS_ENABLED=true pnpm --filter @template/miniapp build:weapp`。
- 小程序合法域名、支付与退款回调、OSS 私有 Bucket 和 RAM 权限按[模板环境配置](template-environments.md)核对。真实凭证和真实支付流程尚需单独验收。
- `git status` 不应包含 `.env`、商户私钥、OSS AccessKey、数据库数据或小程序构建产物。
