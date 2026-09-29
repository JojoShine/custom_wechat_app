# 生产环境 Docker 部署

仓库根目录的 `docker-compose.prod.yml` 只包含一次性 Prisma 迁移任务和 NestJS API，两者使用同一个镜像，并连接服务器宿主机上已有的 PostgreSQL。Compose 不创建数据库容器或数据卷。服务器无需安装 Node.js 或 pnpm。

## 构建与发布镜像

当前已发布的服务器镜像为 `jojoshine/custom-wechat-api:11cf27e`（linux/amd64）。后续版本在开发机仓库根目录构建，并使用新的不可变版本标签：

```bash
API_IMAGE=jojoshine/custom-wechat-api:<new-version>
docker build --platform linux/amd64 -f apps/api/Dockerfile -t "$API_IMAGE" .
docker push "$API_IMAGE"
```

镜像不包含 `.env` 文件。当前服务器为 x86_64，因此镜像使用 `linux/amd64`。构建前须登录镜像仓库。

## 服务器首次启动

将 `docker-compose.prod.yml` 和 `.env.production.example` 复制到服务器同一目录，后者改名为 `.env.production` 并填写真实配置：

```bash
cp .env.production.example .env.production
chmod 600 .env.production
```

`API_IMAGE` 必须是已推送的完整镜像名。`DATABASE_URL` 填写现有 PostgreSQL 的连接串，例如 `postgresql://app_user:URL_ENCODED_PASSWORD@host.docker.internal:5432/app_db`；密码中的特殊字符须按 URL 规则编码。容器里的 `localhost` 指容器自身，不能用来连接宿主机数据库。Compose 已把 `host.docker.internal` 映射到 Linux 宿主机网关；宿主机 PostgreSQL 还需监听该网关可达的地址，并允许 Docker 网桥来源连接。迁移会作用于连接串指定的数据库和 schema。

`JWT_SECRET` 使用独立的随机值。填写小程序、OSS 和支付参数；PEM 可按现有 API 配置格式写成一行并用字面量 `\n` 表示换行。`WEBVIEW_APPS_JSON` 需换成实际上线的 HTTPS 网页应用配置；`[]` 表示暂不开放网页应用。本机已准备的 `.env.production` 除 `DATABASE_URL` 外已填入现有配置，可安全传到服务器后补上数据库连接串。

若镜像仓库为私有仓库，先在服务器执行 `docker login -u jojoshine`，使用 Docker Hub 访问令牌登录，再执行下面的拉取命令。访问令牌只输入到 Docker 登录提示中，不写进 `.env.production`。

示例文件默认将 `WECHAT_PAY_MCH_ID` 留空；如使用已填入商户号的本机 `.env.production`，API 启动时会加载支付模块。开放支付入口前，先验证公网代理和两个通知地址。若先以空商户号启动，填入商户号后执行 `up -d --force-recreate api` 使配置生效。

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml pull
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

Compose 会先连接现有数据库执行迁移，成功后启动 API；若数据库不可达或迁移失败，API 不会启动。API 默认只监听宿主机 `127.0.0.1:3100`。更新镜像标签后重复 `pull` 和 `up -d`，迁移会在新镜像启动时执行。

## HTTPS 反向代理

现有 NestJS 路由没有 `/custom_wechat_app` 前缀。宿主机上的 HTTPS 反向代理必须把这个前缀去掉，再转发到 `127.0.0.1:3100`。例如 Nginx：

```nginx
location /custom_wechat_app/ {
    proxy_pass http://127.0.0.1:3100/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

启用支付前，确认 `https://tbtparent.me/custom_wechat_app/health` 返回 `{"status":"ok"}`，并确认两个公网回调分别转发至 API 的 `/payments/wechat/notify` 与 `/payments/wechat/refund-notify`。小程序生产构建的 `TARO_APP_API_BASE_URL` 应为 `https://tbtparent.me/custom_wechat_app`，该域名也需配置为微信小程序 request 合法域名。退款及支付通知共用现有 API 服务，不需要额外部署接收服务。
