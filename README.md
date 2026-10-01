# 微信小程序全栈模板

供团队按场景复制的单实例项目。仓库包含 Taro React 微信小程序、NestJS API、Prisma/PostgreSQL，以及微信登录、用户资料、私有 OSS、WebView、原生能力、支付、退款和对账。业务项目负责自己的商品、定价、业务订单、退款规则和履约；模板不提供多租户。

## 技术栈

以下版本来自仓库当前声明，实际依赖解析以 `pnpm-lock.yaml` 为准。

| 层级 | 技术 | 用途 |
| --- | --- | --- |
| 运行与工作区 | Node.js 22.23.2（nvm）、pnpm 8.9.2 Workspaces | 管理前后端 Monorepo、共享包和构建命令 |
| 开发语言 | TypeScript 5.4.5 | 前后端代码和共享类型契约 |
| 小程序 | Taro 4.2.1、React 18.3.1、Webpack 5 | 当前构建微信小程序；其他端后续按需适配 |
| 后端 | NestJS 12.1.0、Express 适配器 | 模块化 API 与通用平台能力 |
| 数据访问 | Prisma 7.10.0、PostgreSQL、pg 驱动 | 数据模型、数据库访问与版本化 schema 迁移；本地及 CI 使用 PostgreSQL 16 |
| 身份认证 | 微信登录、JWT、jose 6.1.0 | 小程序会话与 WebView 应用隔离认证 |
| 对象存储 | 阿里云 OSS、ali-oss 6.23.0 | 私有文件上传与短期签名读取 |
| 支付 | 微信支付 API v3（普通直连） | 下单支付、部分退款、通知验证和对账 |
| 日志 | Winston 3.17.0 | 服务端分类日志与错误记录 |
| 测试 | Vitest 4.1.2、Jest 29.7.0、Node.js Test Runner | 后端、小程序和共享契约测试 |
| 容器与入口 | Docker、Docker Compose v2、Nginx | 本地联调、生产 API 运行与 HTTPS 反向代理 |
| 构建交付 | GitHub Actions、Docker Hub | 自动验证、构建和发布 双架构 SHA 版本镜像；本机与 ECS 拉取同一版本运行 |

## 复用与迁移范围

已具备团队复制新场景、替换业务模块和按环境部署到其他服务器的基础：前后端同仓管理、配置示例、共享契约、Prisma 迁移文件、Docker 构建及部署文件、开发与运维文档均已提供。

复制时至少完成项目名称与门户替换、小程序 AppID 和业务配置调整、数据库与 OSS 准备、CI 镜像仓库配置，以及域名和微信后台设置。真实密钥、现有数据库数据与本地构建产物不随模板复制。具体步骤见[开发指南](docs/development-guide.md)和[部署指南](docs/deployment.md)。

现有业务迁往新服务器时，还需要独立安排数据库备份/恢复、文件存储访问、配置迁移和域名切换。Prisma 的 schema 迁移不会自动搬运已有业务数据，也不会随镜像回退撤销。

### 当前验证边界

- Docker 目录调整后的 Compose 配置、路径及 Nginx 片段已进行本地检查；本地数据库项目与数据卷配置保持一致。
- 此前本机基础镜像下载失败已定位为认证请求未走代理，临时指定代理后最小构建通过；缓存测试镜像缺少迁移工具，新版 CI 镜像的完整“迁移 → API 健康”启动仍需验证，不能据此承诺所有环境均可稳定迁移。
- 内置 WebView 示例页仍使用 `/webview/...` 根路径请求；挂在 `/custom_wechat_app/` 等子路径时，需要适配网页 API 地址，详见[部署指南](docs/deployment.md#nginx-接入)。
- 每个新场景的微信登录、OSS、支付退款和真机域名仍需单独联调。当前不启用自动 CD。

## 仓库结构

| 路径 | 用途 |
| --- | --- |
| `apps/miniapp` | 小程序页面、组件和可复用客户端能力 |
| `apps/api` | API、平台能力、Prisma schema 与迁移 |
| `packages/contracts` | 前后端共享的公开数据契约 |
| `docker` | 镜像构建、本地 API/数据库联调、生产部署与 Nginx 配置 |
| `docs` | 开发、配置、专项接入与部署指南 |

首页和“轻购实验室”名称是可替换的示例门户。团队复制仓库后，按业务场景调整界面及业务模块；已封装的平台能力可继续使用。

## 快速开始

使用 nvm 选择 Node.js 22.23.2，并启用 pnpm 8.9.2。以下命令在仓库根目录执行：

```bash
pnpm install --frozen-lockfile
cp -n apps/api/.env.example apps/api/.env
cp -n apps/miniapp/.env.example apps/miniapp/.env
cp -n apps/miniapp/project.config.example.json apps/miniapp/project.config.json
docker compose --project-directory . -f docker/local/database.compose.yaml up -d --wait db
```

在 `apps/api/.env` 填写当前小程序的 AppID、AppSecret、JWT 密钥和所需服务配置；在 `apps/miniapp/project.config.json` 填写**同一个 AppID**，并在 `apps/miniapp/.env` 配置 API 地址。真实密钥只放服务端环境，三个本地配置文件均不提交。继续按[开发指南](docs/development-guide.md)执行 Prisma 迁移、构建和微信开发者工具导入。

需要直接用容器运行 API 和数据库时，按 [Docker 本地运行说明](docker/README.md)拉取 GitHub Actions 发布的指定 SHA 镜像并启动 Compose。本机与 ECS 使用同一版本，环境文件、数据库连接和端口分别配置；日常源码调试继续使用本地开发服务。

## 文档

- [架构与业务边界](docs/architecture.md)
- [从后端到前端的应用开发指南](docs/development-guide.md)
- [环境变量与微信/OSS 配置](docs/configuration.md)
- [支付、退款和对账接入](docs/payment-integration.md)
- [微信支付直连与服务商集成说明](docs/payment-modes.md)
- [原生能力目录](docs/native-capabilities.md)
- [WebView 接入](docs/webview-integration.md)
- [Docker 文件目录与本地用法](docker/README.md)
- [Docker、CI 与生产部署](docs/deployment.md)

构建与自动测试只验证仓库行为。微信登录、手机号、OSS、WebView 域名及真实支付需要在各场景的环境中单独联调。
