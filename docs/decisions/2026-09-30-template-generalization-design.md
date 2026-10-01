# 通用小程序模板整理设计

> 2026-10-01 更新：本文中可选 GitHub 远程部署和通用镜像仓库的设计已被后续决定替代。正式镜像统一由 GitHub Actions 构建并推送 Docker Hub；当前由管理员在 ECS 直接拉取镜像并用 Compose 部署，自动 CD 暂不实施；Compose 和环境配置由各服务器管理，操作以 [部署指南](../deployment.md) 为准。

## 目标与边界

本仓库供团队按业务场景复制成独立项目。复制者应能沿着一份开发指南，从配置环境、扩展 NestJS 和 Prisma，到定义共享契约、开发 Taro 页面，再到测试与部署，完成一个新业务的接入。仓库保留已经实现的微信登录、原生能力、OSS、WebView、支付、退款和对账能力；业务自行负责商品元数据、定价、业务订单、退款决策与履约。模板不引入多租户或新的业务框架。

本次只整理文档、项目示例配置、与模板交付直接相关的脚本和空目录。现有页面视觉、服务端业务行为、数据库迁移历史和支付协议不在改动范围。工作树中已有的未提交页面修改与 IDE 文件属于现有工作，不随本次清理覆盖或提交。

## 方案选择

采用“保留能力、清理项目专属内容”的方式。极简方案会让每个复制项目重新搭建测试和部署链路；原样保留方案则会继续传播个人镜像仓库、域名和过时的阶段记录。因此模板保留通用验证和部署能力，但镜像发布与远程部署必须由复制项目显式配置，不能在默认状态向原项目的仓库或服务器发布。

## 文档结构

根 `README.md` 只说明模板用途、仓库结构、快速启动和文档索引。模板主文档如下：

| 文档 | 内容 |
| --- | --- |
| `docs/development-guide.md` | 复制项目、配置环境、从后端到前端开发一个业务功能、运行与验收的主线指南。每个步骤给出真实路径、命令、接入边界和完成判据。 |
| `docs/architecture.md` | monorepo 分层、平台能力与业务责任、请求和事件流、扩展目录说明。 |
| `docs/configuration.md` | API、小程序、生产 Compose 的变量清单；哪些值会进入客户端；微信与 OSS 的域名和权限检查。 |
| `docs/payment-integration.md` | 业务定价和下单、平台预支付、可信支付事件、部分退款、通知、对账及演示模块的去留。 |
| `docs/native-capabilities.md` | 已封装能力、对应源码、权限和真机条件；不承诺全部微信 API 已实现。 |
| `docs/webview-integration.md` | 白名单、ticket 交换、WebView JWT、可选坐标与最小 H5 示例。 |
| `docs/deployment.md` | 镜像构建、数据库迁移、Compose、反向代理、健康检查、可选 CI 发布和部署。 |

现有 `docs/template-copy-guide.md`、`docs/template-environments.md`、`docs/production-deployment.md`、`docs/ci-cd.md` 和 `docs/deployment-runbook.md` 的仍有效内容并入上述文档后删除。`docs/native-capability-catalog.md` 改名并核对实际入口。`docs/superpowers/` 下旧阶段设计和实施计划从模板主目录移除；历史可由 Git 查阅。本设计文档作为当前模板边界记录留在 `docs/decisions/`，不归入旧阶段目录。所有相对链接在清理后必须仍能打开，不能保留阶段编号、个人部署状态、固定测试数量或已过期的联调结论。

## 开发指南的具体路径

主线以新增一个业务功能为例，不在模板里实现示例业务。指南按以下顺序说明：

1. 复制仓库，替换小程序名称、AppID、页面分享文案、API 地址和各环境配置。`apps/miniapp/project.config.json` 是开发者本地项目配置；仓库提供无真实 AppID 的示例文件供复制，避免新项目继承“轻购实验室”的 AppID。
2. 启动本地 PostgreSQL，安装依赖，生成 Prisma 客户端并运行现有迁移。新增业务模型时编辑 `apps/api/prisma/schema.prisma`，创建新的迁移，不改写既有迁移；生产部署用 `migrate deploy`。
3. 在 `apps/api/src/modules/business/` 下建立业务 NestJS 模块，并在 `app.module.ts` 注册。业务模块持有定价、业务订单和履约规则；需要支付时调用现有平台服务并订阅可信事件。
4. 在 `packages/contracts/src/business/` 定义该业务的前后端契约，并从 `packages/contracts/src/index.ts` 导出；禁止把仅服务端使用的密钥和数据库模型当作客户端契约。
5. 在 `apps/miniapp/src/pages/business/` 建页面，必要时在 `apps/miniapp/src/components/business/` 放业务组件；使用现有 API 客户端、会话、导航和原生能力，并登记页面路径及登录保护。门户页面按新场景替换或改造。
6. 运行相关测试、类型检查、整仓构建、容器健康检查；微信登录、OSS、WebView 和支付依实际配置分别做真机或外部链路联调。

以上四个业务扩展目录通过 `.gitkeep` 保留在 Git 中。它们只标出扩展位置，不附加空模块、空组件或业务抽象。Prisma 继续使用当前单一 schema 和迁移目录，不增加不会被 Prisma 读取的占位目录。

## 脚本与自动化

保留 `docker/local/database.compose.yaml` 本地数据库、Prisma 迁移命令、`scripts/require-test-database.mjs`、`scripts/check-workspace.mjs`、`apps/api/scripts/reconcile-date.mjs`、API Dockerfile、生产 Compose 与必要的部署脚本。按新文档调整 `check-workspace` 的文档断言，保持现有校验目标。独立的 `apps/api/scripts/check-user-unique.mjs` 和 `test:db` 属于早期单项验证：先确认常规测试或迁移约束覆盖，再决定删除；若删除，补上必要的常规测试断言，不降低数据库约束验证。

GitHub Actions 默认运行测试、类型检查和构建。镜像发布、远程部署保留为可选流程：镜像仓库、平台架构、服务器地址和目录从复制项目的变量或 Secrets 取得；未配置时不发布、不部署。修正发布任务引用的 Dockerfile 路径为 `docker/build/Dockerfile`。生产环境示例中的镜像、回调域名与端口均使用可填写示例，不携带现有个人部署值；Compose 继续依赖已有 PostgreSQL，不另建生产数据库容器。部署脚本必须继续执行拉取、迁移、启动与健康检查，且不得把密钥写进镜像。

## 验证与验收

- 文档链接、文件路径、命令和环境变量与实际仓库一致；从 README 能找到开发、配置、支付、原生能力、WebView 和部署指南。
- 四个业务扩展目录进入 Git，复制仓库后存在；指南中没有提到不存在的目录或接口。
- 默认 CI 不会向个人 Docker Hub、ACR 或服务器发布。配置可选发布后，构建上下文与 Dockerfile 路径正确。
- 使用现有本地 PostgreSQL 测试库执行测试与迁移，随后运行 `pnpm typecheck`、`pnpm build`；必要时使用统一 Compose 拉取 CI 镜像并验证 API 健康。
- `git diff` 只包含本次模板整理相关文件，不包含密钥、现有页面视觉改动、构建产物或历史迁移改写。
