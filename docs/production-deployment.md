# 生产环境 Docker 部署

仓库根目录的 `docker-compose.prod.yml` 包含 PostgreSQL、一次性 Prisma 迁移任务和 NestJS API。API 与迁移任务使用同一个镜像；数据库数据保存在 `postgres_data` 卷。服务器无需安装 Node.js 或 pnpm。

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

`API_IMAGE` 必须是已推送的完整镜像名。`POSTGRES_PASSWORD` 建议用 `openssl rand -hex 24` 生成，只使用 URL 安全字符，因为 Compose 会用它拼接 `DATABASE_URL`。`JWT_SECRET` 另行生成，不要复用数据库密码。填写小程序、OSS 和支付参数；PEM 可按现有 API 配置格式写成一行并用字面量 `\n` 表示换行。`WEBVIEW_APPS_JSON` 需换成实际上线的 HTTPS 网页应用配置；`[]` 表示暂不开放网页应用。

若镜像仓库为私有仓库，先在服务器执行 `docker login -u jojoshine`，使用 Docker Hub 访问令牌登录，再执行下面的拉取命令。访问令牌只输入到 Docker 登录提示中，不写进 `.env.production`。

示例文件默认将 `WECHAT_PAY_MCH_ID` 留空；如使用已填入商户号的本机 `.env.production`，API 启动时会加载支付模块。开放支付入口前，先验证公网代理和两个通知地址。若先以空商户号启动，填入商户号后执行 `up -d --force-recreate api` 使配置生效。

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml pull
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

Compose 会等待数据库健康、迁移成功后启动 API。数据库不对宿主机开放端口；API 默认只监听宿主机 `127.0.0.1:3100`。不要删除 `postgres_data` 卷，否则会丢失生产数据。更新镜像标签后重复 `pull` 和 `up -d`，迁移会在新镜像启动时执行。

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
