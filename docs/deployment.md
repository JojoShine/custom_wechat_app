# GitHub 构建镜像，本机与 ECS 拉取运行

当前采用：**合入 master → GitHub Actions 验证并构建 → 推送 Docker Hub → 本机拉取指定版本验证 → 管理员在 ECS 拉取同一版本并启动。**

CI 自动执行，部署由管理员操作。暂不启用自动 CD、服务器轮询、SMTP 告警或 Coolify。ECS 不需要访问 GitHub、拉取源码或安装 Node.js/Python；只需 Docker Engine、Compose v2，以及到镜像仓库、已有数据库和外部服务的网络连接。日常开发在本地运行源码；部署联调使用 CI 镜像，本地镜像构建仅作为排查手段。

## 1. 首次配置 GitHub 构建

在 GitHub 仓库 Settings → Secrets and variables → Actions 配置：

| 名称 | 类型 | 用途 |
| --- | --- | --- |
| `API_IMAGE_REPOSITORY` | Variable | Docker Hub 的 `用户名/仓库名`。 |
| `API_IMAGE_USERNAME` | Variable | 有推送权限的 Docker Hub 用户名。 |
| `API_IMAGE_TOKEN` | Secret | Docker Hub 推送令牌。 |
| `API_IMAGE_PLATFORM` | Variable，可选 | 默认 `linux/amd64,linux/arm64`，兼容 x86 ECS 与 Apple Silicon Mac。已有变量若只填 amd64，需删除该变量或改为上述双架构值。 |

PR 和 master push 自动检查；master push 检查通过后推送 `docker.io/用户名/仓库名:完整提交SHA`。每次部署使用明确的 SHA 版本，便于追溯和回退。未配置仓库名的模板副本只检查、不发布。

工作流只发布明确的 SHA 版本，不再维护自动 CD 使用的 `production` 标记。构建完成后，由管理员决定何时在 ECS 部署。

## 2. ECS 首次准备

从开发机通过 SFTP 或 scp 将两个文件放到应用目录，例如：

```text
/opt/server/custom_wechat_app/
├── compose.yaml
└── .env.production
```

使用`docker/compose.yaml`；新项目从 `docker/production/.env.production.example` 创建环境文件，按[配置指南](configuration.md)填写。已有服务器继续使用自己的真实配置，不用示例覆盖；补充 `APP_ENV_FILE=.env.production`，并保持原项目名和端口。该 Compose 与本机完全相同，运行时仅切换环境文件。

重点确认：

- `API_IMAGE`：本次需要部署的完整 SHA 镜像地址。
- `COMPOSE_PROJECT_NAME`：已有部署保持原名称，避免创建另一组容器。
- `API_PORT`：宿主机可用端口；容器内固定为 3000，Nginx 转发到配置的宿主机端口。
- `DATABASE_URL`：已有 PostgreSQL 的连接地址。数据库在宿主机时使用 `host.docker.internal`，不能用容器的 `localhost`；同时配置数据库监听和访问权限。
- 微信、支付、OSS、JWT 等业务配置：保留在服务器环境文件中，不放入镜像或源码。

```bash
cd /opt/server/custom_wechat_app
chmod 600 .env.production
```

公开镜像可直接拉取；私有镜像先以实际操作账号运行 `docker login --username 你的DockerHub用户名`，按提示输入令牌。

当前只需要上述两个文件。自研自动 CD 脚本、定时器安装工具、邮件配置示例和部署压缩包已移除。

### Nginx 接入

仓库提供 [custom_wechat_app.nginx.conf](../docker/production/custom_wechat_app.nginx.conf)，它是放入现有 HTTPS `server {}` 中的 location 片段。复制到 Nginx 可读取的目录，然后在对应域名（例如 `tbtparent.me`）的现有 server 内加入：

```nginx
include /etc/nginx/snippets/custom_wechat_app.nginx.conf;
```

不要直接放进默认在 `http {}` 层加载的 `conf.d/*.conf`，也不要重复保留已有的同名 location。域名、443 监听及 TLS 证书继续由原 server 配置管理。

片段将 `/custom_wechat_app/` 转发到 `127.0.0.1:3100` 并去掉此前缀，例如 `/custom_wechat_app/health` 转为 API 的 `/health`。`proxy_pass` 最后的 `/` 必须保留。端口与服务器实际 `API_PORT` 一致；现有 ECS 若仍为 3101，则将片段中的 3100 改为 3101，不能只按示例猜测。

此上游地址适用于宿主机 Nginx 或共享宿主机网络的 Nginx。若 Nginx 在独立 Docker bridge 网络中，`127.0.0.1` 指向 Nginx 容器自身：需先让 Nginx 和 API 接入共同网络，再将上游改为可解析的 API 服务别名及容器端口 3000。仅添加 host-gateway 无法访问当前只绑定宿主机回环地址的端口。

在 Nginx 实际运行环境中执行 `nginx -t`，通过后再执行 `nginx -s reload`。宿主机或 Nginx 容器内执行方式取决于已有安装，不需要重启 API。验证地址为 `https://你的域名/custom_wechat_app/health`；支付和退款通知同样使用此前缀。

WebView 网页调用 API 的 URL 也需包含此前缀。当前内置示例页使用 `/webview/exchange`、`/webview/me` 根路径请求，正式挂在子路径时还需适配网页请求地址；本片段不会接管域名的根路径。现有访问日志格式应避免记录 ticket、令牌和坐标等查询参数。

## 3. 每次发布怎么做

1. 等待 GitHub Actions 构建成功，确认 Docker Hub 上对应 SHA 标签已存在。
2. 记录当前正常运行的镜像版本，并备份本次会修改的配置；涉及数据库变更时按团队流程备份数据库。
3. 修改服务器 `.env.production` 的 `API_IMAGE` 为新版本，在应用目录执行：

```bash
docker compose --project-directory . --env-file .env.production -f compose.yaml pull &&
docker compose --project-directory . --env-file .env.production -f compose.yaml run --rm --no-deps migrate &&
docker compose --project-directory . --env-file .env.production -f compose.yaml up -d --no-deps --wait --wait-timeout 120 api
```

三个步骤依次为拉取镜像、执行 Prisma 迁移、更新 API 并等待健康检查。`&&` 保证前一步失败就停止；迁移失败不会继续替换 API。API 更新使用 `--no-deps`，避免再次运行迁移服务。Compose 不创建生产数据库。

完成后查看状态和日志：

```bash
docker compose --project-directory . --env-file .env.production -f compose.yaml ps
docker compose --project-directory . --env-file .env.production -f compose.yaml logs --tail=100 api
```

再验证公网健康接口，以及本次涉及的登录、支付等业务流程。健康检查通过后再将新版本记为成功版本。单机 Compose 更新可能有短暂停机。

## 4. 失败与回退

拉取失败先检查版本、网络和登录状态；迁移失败查看终端输出并检查数据库；API 不健康时查看上述容器日志。`.env.production` 已改成新版本不代表部署成功。

需要回退时，先确认旧代码兼容当前数据库和运行配置，再将 `API_IMAGE` 改回之前记录的成功版本，执行：

```bash
docker compose --project-directory . --env-file .env.production -f compose.yaml pull api &&
docker compose --project-directory . --env-file .env.production -f compose.yaml up -d --no-deps --wait --wait-timeout 120 api
```

回退不重新执行旧版本迁移。**切回镜像不会撤销数据库变更**；如配置发生变化，也需核对并恢复兼容配置。删除字段、不可逆数据转换等变更单独制定恢复方案。

## 5. 日志与发布记录

当前使用终端迁移输出、Compose 容器日志和应用已有的 Winston 日志进行排查，不依赖自研 CD 的日志目录或邮件功能。

建议每次发布简单记录：时间、服务器/应用、旧版本、新版本、迁移结果、健康检查结果，以及是否回退。不要在记录中粘贴环境文件、密码或令牌。需要持续观察 API 时：

```bash
docker compose --project-directory . --env-file .env.production -f compose.yaml logs -f --tail=100 api
```

容器重建后不要依赖旧容器日志仍然存在；重要发布输出在更新前后自行保存，长期业务日志按服务器现有策略持久化与轮转。

## 6. 多服务器与本地测试

每台独立服务器维护自己的环境文件和 Compose；同一版本复用同一镜像，无需重复构建。同一服务器的不同项目使用不同目录、Compose 项目名和端口。

多个副本共享数据库时，另行协调迁移与流量切换，不能把本流程当作集群滚动发布。现阶段只处理单机 Compose 部署。

本地镜像联调使用 [本地 Compose](../docker/README.md)拉取 GitHub Actions 的指定 SHA 产物，持续运行 API、迁移任务和现有数据库；验证通过后 ECS 拉取同一 SHA。不同架构的镜像摘要不同，但属于同一提交的双架构版本。环境文件和密钥分别提供，不能将本地环境文件直接用于生产。

## 7. 后续 CD 建议（暂不实施）

当人工发布频率、多人协作或多服务器管理确实成为负担时，再评估自动 CD：

| 需求 | 可考虑的方案 |
| --- | --- |
| 希望统一管理应用、查看发布记录和执行镜像回退 | 评估 Coolify 等成熟部署平台。 |
| 团队已有 Jenkins 或云效 | 复用现成流水线，调用标准的镜像拉取、迁移与部署步骤。 |
| 少量重复动作确实需要自动化 | 先封装现有命令，不继续维护一套自研发布平台。 |

镜像仓库负责保存版本，部署工具负责更新应用；只换成 ACR 不等于已经具备 CD。无论选什么工具，数据库兼容性、运行配置与备份仍需单独管理。

此前自动化方案已取消并移除对应实现，仅保留简短的[决策记录](decisions/2026-10-01-automatic-delivery.md)。当前以本页的直接部署流程为准。
