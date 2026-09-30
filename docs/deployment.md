# GitHub 构建与服务器部署

正式链路为：代码合入 `master` → GitHub Actions 验证并构建 API 镜像 → 推送 Docker Hub → 各服务器执行自己的 CD 脚本拉取指定版本、迁移数据库、更新容器并检查健康。

本地 Docker 构建仅用于开发和测试。服务器无需访问 GitHub、拉取源码或安装 Node.js；服务器只需能够拉取 Docker Hub 镜像，并访问自己的 PostgreSQL 和所需外部服务。当前 CD 是人工选择版本后在服务器执行的部署流程，不会在镜像发布后自动更新所有服务器。

## 1. GitHub 配置正式构建

在 Docker Hub 创建镜像仓库，然后在 GitHub 仓库的 Settings → Secrets and variables → Actions 配置：

| 名称 | 类型 | 示例及用途 |
| --- | --- | --- |
| `API_IMAGE_REPOSITORY` | Repository Variable | `team/custom-wechat-api`，Docker Hub 用户名或组织名/仓库名，不含 `docker.io`。 |
| `API_IMAGE_USERNAME` | Repository Variable | 有推送权限的 Docker Hub 登录用户名。 |
| `API_IMAGE_TOKEN` | Repository Secret | Docker Hub 的推送令牌。 |
| `API_IMAGE_PLATFORM` | Repository Variable，可选 | 默认 `linux/amd64`；ARM 服务器填 `linux/arm64`；两种架构都需要时填 `linux/amd64,linux/arm64`。 |

`.github/workflows/ci.yml` 对 pull request 和 `master` push 运行迁移、测试、类型检查及应用构建。`master` push 验证通过后，使用 `apps/api/Dockerfile` 构建并推送 `docker.io/<API_IMAGE_REPOSITORY>:<完整提交SHA>`。已包含多架构构建所需的 QEMU 初始化。

复制模板尚未设置 `API_IMAGE_REPOSITORY` 时，只验证、不发布。正式使用前必须完成上述配置，并在 Actions 确认 `publish-api` 成功。服务器部署使用该次发布的完整 SHA，不使用 `latest`。同一版本在不同服务器使用同一个镜像标签；运行参数留在各服务器。

Docker Hub 仓库可见性独立配置。私有镜像要求服务器部署账号先登录 Docker Hub；公开镜像可匿名拉取。GitHub 中无需保存 ECS SSH 密钥、服务器数据库密码或运行时环境文件。本仓库不再提供 GitHub SSH 部署工作流。

## 2. 每台服务器首次准备

安装 Docker Engine 和 Docker Compose 插件（支持 `up --wait`），准备已有 PostgreSQL 的连接信息。选定部署目录，例如 `/opt/server/custom_wechat_app`。从开发机将以下三份模板传到服务器一次，之后由服务器管理员维护：

```text
/opt/server/custom_wechat_app/
├── deploy-production.sh     # 来自 scripts/deploy-production.sh
├── docker-compose.prod.yml
└── .env.production          # 来自 .env.production.example，填写本机配置
```

可以用 SFTP、运维面板或从开发机执行 `scp` 传输这些文件；服务器不需要访问 GitHub。已有部署不要用示例覆盖真实 `.env.production`。后续代码发布通常只替换镜像版本；脚本或 Compose 有变更时单独审阅并同步到各服务器。

在服务器执行：

```bash
cd /opt/server/custom_wechat_app
chmod 700 deploy-production.sh
chmod 600 .env.production
```

按[配置指南](configuration.md)填写本机 `COMPOSE_PROJECT_NAME`、`API_PORT`、`DATABASE_URL`、JWT、微信、OSS 和 WebView 配置。`API_IMAGE` 必须保留一行，首次可填写已发布的完整镜像地址，后续由脚本更新。已有部署继续使用原 Compose 项目名，避免创建另一组容器。

PostgreSQL 在宿主机时，连接串使用 `host.docker.internal`，不要使用容器自身的 `localhost`；数据库需监听 Docker 网桥可达地址并允许相应连接。数据库密码的特殊字符需 URL 编码。Compose 仅运行迁移任务和 API，不创建生产数据库。

私有 Docker Hub 镜像在服务器以实际执行部署的账号运行 `docker login --username YOUR_DOCKERHUB_USERNAME`，按提示输入具有拉取权限的令牌。公开仓库不需要这一步。

## 3. 发布一次版本

1. 开发者提交代码，等待 GitHub Actions 的 `verify` 和 `publish-api` 成功，在 Docker Hub 确认完整 SHA 标签存在。
2. 记录目标服务器当前 `.env.production` 中的 `API_IMAGE`，并按团队流程备份数据库。
3. 登录目标服务器，用新镜像地址执行部署脚本。下面先输入实际发布地址，再执行，不能把示例占位值当作版本：

```bash
cd /opt/server/custom_wechat_app
read -r -p '已发布的完整镜像地址（docker.io/用户/仓库:SHA）: ' release_image
bash ./deploy-production.sh "$release_image" /opt/server/custom_wechat_app
```

脚本依次检查本机文件、拉取镜像、更新 `.env.production` 的 `API_IMAGE`，再执行 Compose `up -d --wait`。迁移服务先执行 `prisma migrate deploy`，成功后 API 才进入启动步骤，最后等待容器健康检查。部署失败时命令返回非零；不能仅看到 `.env.production` 已更新就认定部署成功。首次启动迁移失败时 API 不启动；升级过程中不要假定脚本会自动回滚旧容器或数据库。

完成后检查：

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail=100 migrate api
```

再检查本机和公网 `/health`，以及本次发布涉及的业务接口。API 容器内端口固定为 `3000`，宿主机仅绑定 `127.0.0.1:${API_PORT}`；反向代理负责 HTTPS。代理在宿主机时转发到该回环端口；代理在容器中时需配置可通信网络与服务地址。公网前缀、微信支付/退款通知 URL、小程序 API 根地址必须一致。

同一部署目录一次只执行一个部署进程。这个脚本没有并发锁或集群滚动更新功能。

## 4. 部署到不同服务器

每台服务器独立安装上述三个文件，使用各自的配置和 Docker Hub 拉取授权。无需为每台机器复制 GitHub 构建工作流，也无需重复构建相同版本。

| 目标 | 服务器本地配置 | 部署操作 |
| --- | --- | --- |
| 测试服务器 | 测试库、测试微信/OSS 配置、测试域名 | 先执行脚本部署 SHA，完成联调。 |
| 生产服务器 A | A 的数据库、域名、端口和密钥 | 验证后执行脚本部署同一 SHA。 |
| 独立场景服务器 B | B 自己的运行配置；若代码不同则使用 B 项目 CI 的镜像 | 在 B 的目录执行其部署脚本。 |

同一台服务器运行多个独立项目时，使用不同部署目录、`COMPOSE_PROJECT_NAME` 和 `API_PORT`，并确认数据库隔离方式。已有部署的项目名不要随意更改。

若多台机器是同一业务的 API 副本、共享数据库和负载均衡，不能把本节的独立服务器操作直接当作零停机发布：需要另外安排一次性迁移、兼容性检查、流量摘除和逐台更新。当前脚本提供的是单个 Compose 项目的部署。

## 5. 失败和版本回退

拉取失败先检查标签、Docker Hub 连通性和当前部署账号的登录状态；拉取成功后才会改写 `API_IMAGE`。迁移失败查看 `migrate` 日志并处理数据库问题；API 不健康查看 `api` 日志、运行参数和数据库可达性。

需要回退时，确认数据库仍兼容旧代码，再用相同脚本传入之前记录的完整镜像地址。脚本不会反向撤销 Prisma 迁移，也不自动恢复数据库。修复后可用同一版本重新执行脚本。

## 6. 本地构建仅供测试

本地使用 `compose.yaml` 启动开发数据库，使用 nvm Node.js 和 `pnpm test:container` 验证 API 镜像。也可手动运行：

```bash
docker build -f apps/api/Dockerfile -t wechat-template-api:local-test .
```

本地产物不进入正式发布流程。正式镜像始终由 GitHub Actions 构建并推送 Docker Hub。初始化迁移、容器检查和 `apps/api/scripts/reconcile-date.mjs` 对账入口继续保留。
