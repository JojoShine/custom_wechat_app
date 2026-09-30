# Docker、CI 与生产部署

生产环境运行 `docker-compose.prod.yml` 中的一次性 Prisma 迁移任务和 NestJS API。两者使用同一镜像，并连接服务器上已有的 PostgreSQL；Compose 不创建生产数据库。服务器无需安装 Node.js 或 pnpm。镜像可由本地、GitHub Actions 或团队自己的构建平台生成；发布到哪个仓库由复制项目配置。

## 构建镜像

从仓库根目录构建，Dockerfile 位于 `apps/api/Dockerfile`：

```bash
docker build --platform linux/amd64 -f apps/api/Dockerfile -t example/custom-wechat-api:local .
```

把 `linux/amd64` 改为服务器实际架构。镜像不包含 `.env`。构建后可运行 `pnpm test:container` 检查容器内 `/health`；该检查使用本地 Docker。

## 服务器首次配置

将 `docker-compose.prod.yml` 与 `.env.production.example` 放在服务器同一目录，把示例复制为 `.env.production` 并设为仅部署账号可读。填写完整 `API_IMAGE`、`DATABASE_URL`、JWT、小程序、OSS、WebView，以及实际启用支付时的商户配置；变量逐项解释见[配置指南](configuration.md)。不要把真实值提交仓库或放进镜像。

数据库在宿主机时，连接串可使用 `host.docker.internal`，例如 `postgresql://app_user:URL_ENCODED_PASSWORD@host.docker.internal:5432/app_db`。密码特殊字符需 URL 编码。容器内 `localhost` 指容器自己；宿主机 PostgreSQL 必须监听 Docker 网桥可达地址，并允许该来源连接。迁移作用于 `DATABASE_URL` 指定的数据库。

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml pull
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --wait
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

Compose 的 `migrate` 服务先执行 `prisma migrate deploy`；迁移失败时 API 不启动。API 容器监听 `3000`，宿主机仅绑定 `127.0.0.1:${API_PORT}`。公网 HTTPS 由反向代理提供；若代理在宿主机，可将目标设为 `http://127.0.0.1:<API_PORT>/`。若代理也在 Docker 中，应让它与 API 处于可通信网络并按 Compose 服务名转发。代理使用路径前缀时，须决定是否去掉前缀，并让小程序 `TARO_APP_API_BASE_URL`、微信通知 URL 与实际路由一致。上线前检查公网 `/health` 和支付、退款通知路由的转发。

更新镜像时替换 `.env.production` 的 `API_IMAGE`，再次运行 `pull` 和 `up -d --wait`。数据库迁移不会自动回滚；回退镜像前检查新迁移与旧代码的兼容性。镜像仓库若为私有，服务器须先完成该仓库的 `docker login` 或等效授权。

## GitHub Actions：默认验证、按项目发布

`.github/workflows/ci.yml` 在 pull request 和 `master` push 上运行 PostgreSQL 迁移、测试、类型检查及构建。**未配置 `API_IMAGE_REPOSITORY` 时，`publish-api` 不运行。** 若复制项目决定启用镜像发布，在 GitHub Actions 的 Variables 与 Secrets 中填写：

| 名称 | 类型 | 用途 |
| --- | --- | --- |
| `API_IMAGE_REPOSITORY` | Variable | 不含 registry 的命名空间/仓库，如 `team/custom-wechat-api`；设置后 `master` push 才发布。 |
| `API_IMAGE_REGISTRY` | Variable | registry 主机，默认 `docker.io`；使用 ACR 等仓库时填其主机名。 |
| `API_IMAGE_PLATFORM` | Variable | 构建目标架构，默认 `linux/amd64`，与服务器一致。 |
| `API_IMAGE_USERNAME` | Variable | registry 登录用户名。 |
| `API_IMAGE_TOKEN` | Secret | 具备推送权限的 registry 令牌。 |

发布 job 使用 `apps/api/Dockerfile`，以完整 Git 提交 SHA 标记镜像。镜像公开与否由仓库平台设置决定；公开镜像应视为可被他人下载和检查。验证通过但没有配置发布变量时，复制项目仍可本地构建并手动上传镜像。

`.github/workflows/deploy.yml` 是手动触发，输入已成功发布的完整 40 位提交 SHA。它沿用上述镜像 registry/repository 变量，并另需 `DEPLOY_HOST`、`DEPLOY_USER`、`DEPLOY_DIR` Variables，以及 `DEPLOY_SSH_PRIVATE_KEY`、`DEPLOY_KNOWN_HOSTS` Secrets。工作流上传 Compose，调用保留的 `scripts/deploy-production.sh` 更新服务器 `.env.production` 的 `API_IMAGE`、拉取镜像、运行迁移并等待健康检查。服务器应已能拉取该镜像，且 `.env.production` 已由团队在服务器安全配置；工作流不传输运行时密钥。

首次启用自动部署前，先手动验证服务器上的 `docker compose ... config`、镜像拉取、数据库连接、迁移和 `/health`。生产机的 SSH、反向代理与证书属于复制项目自己的配置，不要直接继承其他项目的地址。
