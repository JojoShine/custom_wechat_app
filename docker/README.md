# Docker 文件与统一运行方式

```text
docker/
├── compose.yaml                     # 本机与 ECS 共用：迁移任务、API
├── build/
│   ├── Dockerfile                   # GitHub 构建；本地仅用于排查
│   └── Dockerfile.dockerignore
├── local/
│   ├── database.compose.yaml        # 本地 PostgreSQL 辅助配置
│   └── .env.local.example           # 本地容器运行参数示例
└── production/
    ├── .env.production.example      # 生产运行参数示例
    └── custom_wechat_app.nginx.conf # HTTPS server 内的代理片段
```

API 使用同一份 Compose、同一个 CI 发布的完整 SHA 标签，只切换环境文件。CI 默认发布 amd64/arm64 双架构镜像，Docker 自动选择本机架构。私有仓库先执行 `docker login`；本机与服务器都需要能访问 Docker Hub。

## 本机运行

以下命令在仓库根目录执行。首次复制配置，已有文件不覆盖：

```bash
cp -n docker/local/.env.local.example docker/local/.env.local
```

在 `docker/local/.env.local` 填写 CI 已发布的 `API_IMAGE`、JWT 和所需微信/OSS 等参数。`APP_ENV_FILE=docker/local/.env.local` 指向当前文件；`API_PORT=3100` 是宿主机端口，容器内固定为 3000。不要只修改宿主机调试使用的 `apps/api/.env`。

本地 PostgreSQL 是单独的开发依赖，生产已有数据库因此不需要启动它：

```bash
docker compose --project-directory . -f docker/local/database.compose.yaml up -d --wait db
```

此命令保留原 `custom_wechat_app` 项目下的 `db` 服务和 `template_pg_data` 数据卷。原来使用自定义项目名的环境继续传相同的 `-p`。不要执行 `down -v`。API 通过宿主机映射的 `host.docker.internal:5433` 访问此库；宿主机源码调试仍用 `localhost:5433`。没有新建第二个数据库。

拉取并运行应用：

```bash
docker compose --project-directory . --env-file docker/local/.env.local -f docker/compose.yaml pull &&
docker compose --project-directory . --env-file docker/local/.env.local -f docker/compose.yaml up -d --wait --wait-timeout 180
```

数据库准备完成后才运行应用。Compose 先执行迁移，成功后启动 API 并检查健康。访问 `http://127.0.0.1:3100/health`；端口冲突时修改环境文件的 `API_PORT`，小程序 API 地址同步调整。

```bash
docker compose --project-directory . --env-file docker/local/.env.local -f docker/compose.yaml ps -a
docker compose --project-directory . --env-file docker/local/.env.local -f docker/compose.yaml logs -f --tail=100 api
docker compose --project-directory . --env-file docker/local/.env.local -f docker/compose.yaml stop api
```

## ECS 运行

把同一份 `docker/compose.yaml` 复制到服务器应用目录，文件名保持 `compose.yaml`；同目录放实际的 `.env.production`。新项目参考 `production/.env.production.example`，已有文件保留真实值，并补充 `APP_ENV_FILE=.env.production`。保留原 `COMPOSE_PROJECT_NAME` 和 `API_PORT`，避免创建另一组容器或改变 Nginx 上游端口。

在服务器应用目录运行：

```bash
docker compose --project-directory . --env-file .env.production -f compose.yaml pull &&
docker compose --project-directory . --env-file .env.production -f compose.yaml up -d --wait --wait-timeout 180
```

无需上传源码或本地数据库配置。`DATABASE_URL` 指向服务器已有 PostgreSQL；宿主机数据库使用 `host.docker.internal` 和实际端口，并允许 Docker 网络连接。Nginx、升级前备份与正式回退流程见[部署指南](../docs/deployment.md)。旧的 `docker-compose.prod.yml` 不再使用，迁移到统一文件时保留项目名和配置，不能并行启动两套应用。

## 配置文件如何生效

- `--env-file` 提供 Compose 参数：镜像、项目名、端口、数据库地址等。
- 其中的 `APP_ENV_FILE` 再由 Compose 的 `env_file` 加载到 API 和迁移容器，提供微信、OSS、JWT 等运行参数。
- 文件路径相对于显式指定的 `--project-directory .`。本地为仓库根目录，服务器为应用目录。
- 终端已 export 的同名变量优先于 `--env-file`；若沿用旧操作，先清除旧的 `API_IMAGE`、`COMPOSE_PROJECT_NAME` 等变量，避免覆盖文件中的值。
- `.env.local`、`.env.production` 不提交、不打入镜像；更换服务器只调整配置，Compose 无需改动。

## 更新与回退

记录当前成功的 SHA 镜像地址。更新时修改所选环境文件中的 `API_IMAGE`，重新执行该环境的 pull 和 up。本地验证通过后 ECS 使用同一 SHA；日常未提交代码仍按[开发指南](../docs/development-guide.md)运行源码调试。

回退前确认旧代码兼容当前数据库，将环境文件的 `API_IMAGE` 改回之前的成功版本。本地执行：

```bash
docker compose --project-directory . --env-file docker/local/.env.local -f docker/compose.yaml pull api &&
docker compose --project-directory . --env-file docker/local/.env.local -f docker/compose.yaml up -d --no-deps --wait --wait-timeout 180 api
```

服务器使用同样的子命令，参数切换为 `--env-file .env.production -f compose.yaml`。回退仅替换 API，不执行旧迁移、不撤销数据库变化。数据恢复单独安排。

## 仅用于排查的本地构建

```bash
docker build -f docker/build/Dockerfile -t wechat-template-api:local-test .
```

临时将本地环境文件的 `API_IMAGE` 设置为 `wechat-template-api:local-test`，跳过 pull，使用本地 up 命令并添加 `--pull never`。排查后恢复 CI 镜像地址。构建上下文始终为仓库根目录，真实环境文件由 Dockerfile.dockerignore 排除。
