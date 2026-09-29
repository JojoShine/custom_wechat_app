# GitHub Actions 与 ACR 发布

`master` 的提交先运行迁移、测试、类型检查和构建。配置 ACR 后，检查通过会从仓库根目录构建 `apps/api/Dockerfile` 的 `linux/amd64` 镜像，并用完整 Git commit SHA 推送到 ACR。生产部署由 GitHub Actions 的 **Deploy API** 手动触发：它把当前 Compose 文件复制到 ECS，拉取指定 SHA 的镜像，再执行 Prisma 迁移与 API 健康检查。业务密钥只保存在 ECS 的 `.env.production` 中。

## GitHub 配置

仓库 **Settings → Secrets and variables → Actions** 中设置：

| 类型 | 名称 | 值 |
| --- | --- | --- |
| Variable | `ACR_PUBLIC_REGISTRY` | ACR 公网域名，不含 `/命名空间/仓库名` |
| Variable | `ACR_PUBLIC_IMAGE` | ACR 公网完整仓库地址，不含版本号 |
| Secret | `ACR_USERNAME` | ACR Registry 登录名 |
| Secret | `ACR_PASSWORD` | ACR Registry 登录密码 |

`ACR_PUBLIC_IMAGE` 为空时，CI 仍运行，但跳过镜像发布。上述值配置完成后，推送 `master` 会自动发布镜像。不要把 `.env.production`、商户私钥、OSS 密钥或数据库密码放进 GitHub Secrets；镜像构建不需要这些运行时值。

在 **Settings → Environments** 创建 `production` 环境。部署所需的变量和密钥可放在该环境中：

| 类型 | 名称 | 值 |
| --- | --- | --- |
| Variable | `ACR_VPC_IMAGE` | ACR VPC 完整仓库地址，不含版本号 |
| Variable | `DEPLOY_HOST` | ECS SSH 主机名或 IP |
| Variable | `DEPLOY_USER` | 可运行 Docker Compose 的 SSH 用户 |
| Variable | `DEPLOY_DIR` | ECS 上存放 `docker-compose.prod.yml` 与 `.env.production` 的绝对目录 |
| Secret | `DEPLOY_SSH_PRIVATE_KEY` | 专用于部署的 SSH 私钥 |
| Secret | `DEPLOY_KNOWN_HOSTS` | 已核对指纹的 ECS SSH host key 条目 |

部署工作流只用 SSH 密钥，不接收登录密码。ECS 需要预先用 ACR VPC 域名 `docker login`，并在 `DEPLOY_DIR` 放好 `.env.production`。第一次部署前填写现有宿主机 PostgreSQL 的 `DATABASE_URL`；详细要求见[生产环境 Docker 部署](production-deployment.md)。

## 发布流程

1. 将代码推送到 `master`。在 GitHub **Actions → CI** 等待 `verify` 与 `publish` 成功，记下该提交的完整 40 位 SHA。
2. 在 **Actions → Deploy API → Run workflow** 输入该 SHA。工作流会从 ACR VPC 地址拉取同版本镜像，更新 ECS 上 `.env.production` 的 `API_IMAGE`，然后运行 `docker compose up -d --wait`。
3. 检查 `https://tbtparent.me/custom_wechat_app/health` 和服务日志。要回到旧版本，可再次手动部署旧 SHA。

本仓库是 monorepo，Docker 构建上下文必须为仓库根目录，Dockerfile 路径为 `apps/api/Dockerfile`。ACR 绑定 GitHub 可以单独自动构建镜像，但当前流水线用 GitHub Actions 先运行项目检查，再发布镜像；ACR 负责存储和分发。
