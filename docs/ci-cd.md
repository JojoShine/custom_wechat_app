# GitHub CI、Docker Hub 镜像与生产部署

`master` 提交后，GitHub Actions 先运行 Prisma 迁移检查、测试、类型检查和应用构建。全部通过后，同一个 `CI` 工作流为 `linux/amd64` 构建 API 镜像，推送到公开的 Docker Hub 仓库 `jojoshine/custom-wechat-api`，标签为完整 Git 提交 SHA。拉取公开镜像的 ECS 不需要 Docker Hub 登录。首次发布和 ECS 拉取尚待验证；切换前保留当前 ACR 镜像运行。

## 首次配置

1. 在 Docker Hub 将 `jojoshine/custom-wechat-api` 仓库设为 **Public**。公开 GitHub 源码不会自动改变 Docker Hub 仓库的可见性。
2. 在 GitHub 仓库 **Settings → Secrets and variables → Actions** 中添加 `DOCKERHUB_TOKEN`（有推送权限的 Docker Hub Access Token）。用户名 `jojoshine` 已写在工作流中；不要把 Token 放进代码、镜像或聊天消息。
3. 保留现有的 `DEPLOY_HOST`、`DEPLOY_USER`、`DEPLOY_DIR` 变量及 `DEPLOY_SSH_PRIVATE_KEY`、`DEPLOY_KNOWN_HOSTS` Secret。部署工作流不再使用 `ACR_VPC_IMAGE`。
4. ECS 的 `/opt/server/custom_wechat_app/.env.production` 继续保存数据库、JWT、微信、OSS 等运行时密钥；镜像不包含这些值。首次切换时，部署工作流会将其中的 `API_IMAGE` 更新为 Docker Hub 镜像地址。

## 发布流程

1. 推送 `master`；在 GitHub **Actions → CI** 确认 `verify` 和 `publish-api` 都成功。Pull request 只运行 `verify`，不会推送镜像。
2. 首次发布后，在 Docker Hub 确认该完整提交 SHA 对应的镜像可公开访问，并从 ECS 拉取一次，检查速度和结果。
3. 在 GitHub **Actions → Deploy API → Run workflow** 将 `image_tag` 填为该提交的完整 SHA。工作流上传 Compose 文件，令 ECS 拉取 `jojoshine/custom-wechat-api:<SHA>`，运行 Prisma 迁移，启动 API 并等待健康检查。
4. 检查公网 `/custom_wechat_app/health`，再验证本次修改涉及的业务接口。回滚时重新部署上一个已验证的镜像标签；数据库迁移不会自动回滚。

API 镜像的运行条件、数据库与端口要求见[生产环境 Docker 部署](production-deployment.md)。
