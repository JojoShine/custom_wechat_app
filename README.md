# 微信小程序全栈模板

供团队按场景复制的单实例项目。仓库包含 Taro React 微信小程序、NestJS API、Prisma/PostgreSQL，以及微信登录、用户资料、私有 OSS、WebView、原生能力、支付、退款和对账。业务项目负责自己的商品、定价、业务订单、退款规则和履约；模板不提供多租户。

## 仓库结构

| 路径 | 用途 |
| --- | --- |
| `apps/miniapp` | 小程序页面、组件和可复用客户端能力 |
| `apps/api` | API、平台能力、Prisma schema 与迁移 |
| `packages/contracts` | 前后端共享的公开数据契约 |
| `docs` | 开发、配置、专项接入与部署指南 |

首页和“轻购实验室”名称是可替换的示例门户。团队复制仓库后，按业务场景调整界面及业务模块；已封装的平台能力可继续使用。

## 快速开始

使用 nvm 选择 Node.js 22.23.2，并启用 pnpm 8.9.2。以下命令在仓库根目录执行：

```bash
pnpm install --frozen-lockfile
docker compose up -d db
cp -n apps/api/.env.example apps/api/.env
cp -n apps/miniapp/.env.example apps/miniapp/.env
cp -n apps/miniapp/project.config.example.json apps/miniapp/project.config.json
```

在 `apps/api/.env` 填写当前小程序的 AppID、AppSecret、JWT 密钥和所需服务配置；在 `apps/miniapp/project.config.json` 填写**同一个 AppID**，并在 `apps/miniapp/.env` 配置 API 地址。真实密钥只放服务端环境，三个本地配置文件均不提交。继续按[开发指南](docs/development-guide.md)执行 Prisma 迁移、构建和微信开发者工具导入。

## 文档

- [架构与业务边界](docs/architecture.md)
- [从后端到前端的应用开发指南](docs/development-guide.md)
- [环境变量与微信/OSS 配置](docs/configuration.md)
- [支付、退款和对账接入](docs/payment-integration.md)
- [原生能力目录](docs/native-capabilities.md)
- [WebView 接入](docs/webview-integration.md)
- [Docker、CI 与生产部署](docs/deployment.md)

构建与自动测试只验证仓库行为。微信登录、手机号、OSS、WebView 域名及真实支付需要在各场景的环境中单独联调。
