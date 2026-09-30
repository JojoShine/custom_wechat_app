# 应用开发指南：从后端到前端

本文供团队复制项目使用，命令默认在仓库根目录执行。新增业务沿着“数据库 → API → 共享契约 → 小程序页面”实现；下面以业务资源为路径示例，不预设商品、购物车或订单模型。平台与业务职责见[架构说明](architecture.md)。

## 1. 复制、命名与本地配置

从模板创建独立仓库，不复制 `.env`、本地数据库或构建产物。修改根 `package.json` 的项目名、`apps/miniapp/config/index.ts` 的 `projectName`、`apps/miniapp/src/app.config.ts` 的导航栏文案，以及门户和分享标题。`@template/api`、`@template/miniapp`、`@template/contracts` 是工作区包名，可先保留；如改名，需同步改所有 import、脚本、Dockerfile 和锁文件。

```bash
cp apps/api/.env.example apps/api/.env
cp apps/miniapp/.env.example apps/miniapp/.env
cp apps/miniapp/project.config.example.json apps/miniapp/project.config.json
pnpm install --frozen-lockfile
docker compose up -d db
```

在本地 `apps/miniapp/project.config.json` 填新场景的 AppID，让 `apps/api/.env` 的 `WECHAT_APP_ID` 与其一致；示例中的 `touristappid` 只用于占位。`apps/miniapp/.env` 的 `TARO_APP_API_BASE_URL` 指向开发者工具可访问的 API。支付未接入时保持 `WECHAT_PAY_MCH_ID` 为空。完整变量、公开配置和域名要求见[配置指南](configuration.md)。不要提交这三个本地文件。

## 2. 启动 API 与管理数据库

先用 nvm 选择 Node.js 22.23.2 和 pnpm 8.9.2。保留 `compose.yaml` 提供的单个本地 PostgreSQL；测试也使用已迁移的现有本地库，不为复制演练建第二个库。

```bash
pnpm --filter @template/contracts build
cd apps/api
pnpm prisma migrate deploy
pnpm prisma generate
pnpm build
node --env-file=.env dist/main.js
```

后五行在 `apps/api` 中运行。确认 `http://localhost:3000/health` 返回 `{"status":"ok"}`，实际端口取决于 `PORT`。Prisma 配置 `apps/api/prisma7.config.ts` 读取该目录的 `.env`。生产只用 `migrate deploy` 应用已提交迁移，不用 `db push` 覆盖历史。

新增业务表时编辑 `apps/api/prisma/schema.prisma`，在开发库运行 `cd apps/api && pnpm prisma migrate dev --name <业务变更名>`，提交新迁移，再运行 `pnpm prisma generate`。已执行的迁移不修改、不删除；部署时由生产 Compose 的 `migrate` 服务先运行迁移，成功后再启动 API。

## 3. 开发 NestJS 业务模块

在 `apps/api/src/modules/business/<功能名>/` 建模块、控制器和服务，并在 `apps/api/src/app.module.ts` 的 `imports` 登记模块。沿用当前项目的 `*.module.ts`、`*.controller.ts`、`*.service.ts` 命名方式。服务通过 `apps/api/src/common/database/prisma.provider.ts` 的 `PRISMA` 注入客户端；需认证的路由沿用 `modules/auth/access.guard.ts`，不从客户端传来的用户 ID 直接判断身份。

业务模块保存自己的资源、定价、可购买规则和履约状态。若需要收款，参考 `apps/api/src/modules/demo-payments/demo-payments.service.ts`：先在服务端确定金额和业务订单，再调用 `PaymentService.createPrepay`；用 `PaymentEvents.register` 处理已核对的支付事件。业务决定退款条件和本次金额，再调用 `RefundService.requestRefund`。平台模块不保存业务商品信息；详见[支付接入](payment-integration.md)。

为新增 API 写覆盖成功、无权限和关键业务拒绝条件的测试。数据库约束写入迁移并在已有测试库验证。不要让生产请求依赖演示业务开关。

## 4. 定义前后端共享契约

在 `packages/contracts/src/business/` 为业务请求和响应定义类型，并从 `packages/contracts/src/index.ts` 导出。仅放客户端需要的公开字段，不导出 Prisma 模型、微信 openid、手机号原文、商户凭证或服务端内部状态。两端通过 `@template/contracts` 导入，并先运行 `pnpm --filter @template/contracts build` 更新输出。

例如业务服务返回资源 `id`、`title`、`status`，小程序按这个契约显示；授权和价格校验仍由 API 完成。接口字段变更时同步契约、API 测试和页面使用处，再运行类型检查。

## 5. 开发 Taro 页面与组件

在 `apps/miniapp/src/pages/business/<页面名>/` 建页面；可复用的业务界面放 `apps/miniapp/src/components/business/`。新页面路径加入 `apps/miniapp/src/core/navigation/routes.ts` 的 `enabledPages`；若登录后需回到该页，同时加入 `apps/miniapp/src/core/navigation/guard.ts` 的允许路径。页面通过 `apps/miniapp/src/core/api/client.ts` 的 `apiRequest` 调 API，不自行存储服务端密钥或拼接带身份信息的外部 URL。

门户在 `apps/miniapp/src/pages/portal/`，复制项目按场景改造布局和入口；分享标题与目标在 `apps/miniapp/src/core/share/portal.ts` 调整。资料页可沿用登录、头像和手机号能力，原生位置、扫码、媒体、剪贴板及网络能力从 `apps/miniapp/src/core/native/` 按需使用。未使用位置时移除 `app.config.ts` 对位置的权限声明；使用时改成真实场景用途并配置微信隐私声明。详见[原生能力](native-capabilities.md)。

```bash
pnpm --filter @template/miniapp build:weapp
```

将 `apps/miniapp` 导入微信开发者工具，构建产物在 `apps/miniapp/dist`。模拟器可以连接本机 API；真机需要可访问的 HTTPS API 和微信合法域名。WebView 网页必须先在服务端白名单登记，见[WebView 接入](webview-integration.md)。

## 6. 检查与交付

在已有且完成迁移的本地数据库上明确设置 `TEST_DATABASE_URL`，再从根目录运行：

```bash
TEST_DATABASE_URL=postgresql://template:localdev@localhost:5433/template pnpm test
pnpm typecheck
pnpm build
pnpm test:container
```

`pnpm test` 未设置 `TEST_DATABASE_URL` 时会失败，避免数据库测试被静默跳过。`test:container` 构建 API 镜像并检查 `/health`；需要 Docker。按实际场景再验证微信登录、OSS、WebView、支付与退款，不把模拟器或受控测试当作真实服务联通证据。提交前检查 `git status`，不得包含 `.env`、真实 AppID 的本地项目配置、密钥、构建产物和数据库数据。

生产镜像、Compose、迁移与可选 CI 发布见[部署指南](deployment.md)。
