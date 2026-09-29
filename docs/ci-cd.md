# GitHub 检查、ACR 构建与生产部署

`master` 提交后，GitHub Actions 运行数据库迁移、测试、类型检查和构建。ACR 绑定同一个 GitHub 仓库，直接构建 API 镜像并存入杭州镜像仓库。两项检查独立运行；只在 GitHub CI 和 ACR 构建都成功后，手动选择 ACR 中的具体镜像版本部署。这样无需由 GitHub 向杭州上传数百 MB 镜像层。

## ACR 个人版构建规则

在杭州个人版实例的私有仓库 `counttech/custom-wechat-api` 中绑定 GitHub 代码源 `JojoShine/custom_wechat_app`，并设置：

| 设置 | 值 |
| --- | --- |
| 构建类型 | Branch |
| 分支 | `master` |
| 构建上下文目录 | `/`（仓库根目录） |
| Dockerfile 文件名 | `Dockerfile` |
| 代码变更自动构建 | 开启 |
| 不使用缓存 | 关闭 |
| 镜像版本 | 选择包含 Commit ID 的版本，避免只发布可变的 `latest` |

仓库根目录的 `Dockerfile` 指向 `apps/api/Dockerfile`，以便 ACR 用完整 monorepo 作为构建上下文。首次绑定后，如果现有 `master` 提交没有自动触发构建，在仓库的“构建”页点击“立即构建”。构建成功后在“镜像版本”页复制**实际生成的标签**，部署时使用它。ACR 个人版单次构建有 30 分钟时限；失败时先查看构建日志。

## GitHub 部署配置

在仓库 **Settings → Secrets and variables → Actions** 设置以下变量与密钥。可放在仓库级，也可放在 `production` Environment 中：

| 类型 | 名称 | 值 |
| --- | --- | --- |
| Variable | `ACR_VPC_IMAGE` | `crpi-gvnc7ueixd6x4qdx-vpc.cn-hangzhou.personal.cr.aliyuncs.com/counttech/custom-wechat-api` |
| Variable | `DEPLOY_HOST` | ECS SSH 地址 |
| Variable | `DEPLOY_USER` | 可运行 Docker Compose 的 SSH 用户 |
| Variable | `DEPLOY_DIR` | ECS 中存放 `docker-compose.prod.yml` 与 `.env.production` 的绝对目录 |
| Secret | `DEPLOY_SSH_PRIVATE_KEY` | 专用部署 SSH 私钥 |
| Secret | `DEPLOY_KNOWN_HOSTS` | 已核对的 ECS SSH host key 条目 |

ECS 需预先用 ACR VPC 域名 `docker login`，并在部署目录放好 `.env.production`；应用密钥、商户私钥和数据库密码只保存在 ECS，不进入 GitHub 或镜像。数据库与端口要求见[生产环境 Docker 部署](production-deployment.md)。

## 发布流程

1. 推送 `master`，在 GitHub **Actions → CI** 确认检查通过，在 ACR “构建”与“镜像版本”页确认镜像构建成功。
2. 在 GitHub **Actions → Deploy API → Run workflow** 输入 ACR 镜像版本页显示的精确标签。工作流复制 Compose 文件，通过 VPC 拉取镜像，执行 Prisma 迁移，再等待 API 健康检查通过。
3. 访问 `https://tbtparent.me/custom_wechat_app/health`。回滚时重新部署之前已验证的镜像标签。

GitHub CI 不会向 ACR 推送镜像。ACR 自动构建与 CI 独立触发，因此 CI 失败的提交也可能生成镜像；部署前必须检查两边结果。
