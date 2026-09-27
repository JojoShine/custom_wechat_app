# 微信小程序全栈模板

团队内部复制改造的单实例模板仓库。当前已实现第一阶段：Taro React 小程序、NestJS API、Prisma/PostgreSQL、微信登录、业务会话、个人资料和可替换的门户骨架。OSS、原生能力封装、日志上报与完整支付流程将在后续阶段实现，当前仓库不能作为支付能力已完备的模板交付。

## 本地启动

需要 Node.js 22、pnpm 8.9.2、Docker 和微信开发者工具。

1. `pnpm install --frozen-lockfile`
2. `docker compose up -d db`
3. 复制 `apps/api/.env.example` 为 `apps/api/.env`，填入测试小程序的 `WECHAT_APP_ID`、`WECHAT_APP_SECRET` 和随机生成的 `JWT_SECRET`。本地数据库地址已与 Compose 对齐。
4. `cd apps/api && pnpm prisma migrate deploy && pnpm prisma generate && pnpm build && node dist/main.js`
5. 复制 `apps/miniapp/.env.example` 为 `apps/miniapp/.env`，将 `TARO_APP_API_BASE_URL` 改为当前开发环境可访问的 API HTTPS 地址。
6. `pnpm --filter @template/miniapp build:weapp`，在微信开发者工具中导入 `apps/miniapp`，构建产物位于 `apps/miniapp/dist`。

真机需要微信后台配置合法请求域名，不能使用 `localhost`。微信凭证仅配置在 API 端；小程序只接收本项目的访问令牌与刷新令牌。开发环境中间件使用 `compose.yaml` 的本地账号。

## 检查与打包

- `pnpm test`、`pnpm typecheck`、`pnpm build`：仓库检查。
- `pnpm test:container`：构建 API 镜像并启动临时容器，检查 `/health`。
- `docker build -f apps/api/Dockerfile -t wechat-template-api .`：构建 API 生产镜像。

部署前在与目标 PostgreSQL 可连接的环境执行 `cd apps/api && pnpm prisma migrate deploy`。镜像只运行 API，不在每次启动时自动迁移数据库。生产环境通过容器环境变量注入 `DATABASE_URL`、`JWT_SECRET`、`WECHAT_APP_ID` 和 `WECHAT_APP_SECRET`；不要提交真实密钥。

真实微信登录联调需要测试小程序 AppID、密钥、有效的 `wx.login` code 与配置完成的请求域名。未提供这些平台凭证时，自动测试通过替身 provider 验证登录流程，真实平台链路仍需联调。

## 复制新场景

复制仓库后，更改小程序名称和门户页面，再接入业务自己的数据与页面。业务管理商品元数据、业务订单、价格与履约；通用订单/支付能力留待后续阶段实现。本模板不包含多租户、购物车和优惠券。
