# WebView 票据与位置接入

本模板让小程序打开**服务端登记的网页**。小程序只向网页传一次性 ticket 和公开的 `appId`；网页向本仓库 API 兑换专用 JWT，再读取有限的用户资料。位置由用户在“网页应用”页选择是否携带，通过 URL 参数传递，不写入服务端。

## 登记网页应用

在 API 环境变量中设置 `WEBVIEW_APPS_JSON`，变量位置和密钥边界见[配置指南](configuration.md)。每个应用包含唯一 `appId`、展示名 `name`、完整入口 `entryUrl` 和该入口的精确网页来源 `origin`。小程序只展示此列表，不能指定任意 URL。

```env
WEBVIEW_APPS_JSON=[{"appId":"demo","name":"示例网页","entryUrl":"http://127.0.0.1:3100/webview/demo","origin":"http://127.0.0.1:3100"}]
```

HTTP 只允许本地 loopback 地址。正式环境改用 HTTPS 网页地址，例如 `https://web.example.com/`，并把 `origin` 设为 `https://web.example.com`。不同复制项目可登记自己的应用；`appId` 是公开标识，不是密钥。服务启动时会拒绝重复标识、来源不匹配和不安全的公网 HTTP 地址。缺少配置时，列表为空并显示配置提示。

## 网页接入流程

1. 用户从小程序首页的“网页应用”入口选择“打开网页”或“携带位置打开”。未登录时先完成微信登录，再从列表重新点选。定位拒绝、取消或失败时仍打开网页，且不附坐标。
2. 小程序凭原生登录态调用 `POST /webview/tickets`，请求体为 `{ "appId": "demo" }`。响应含登记的 `entryUrl`、高熵 `ticket` 和 `expiresIn: 60`。ticket 仅可兑换一次。
3. 小程序把 `appId`、`ticket` 放在入口 URL 的查询参数；定位成功时还加入 `latitude`、`longitude`、`coordinateSystem=gcj02`。原入口已有查询参数和片段会保留。坐标来自本次主动定位，但 URL 可被用户修改，网页不能将其当成可信身份、授权或支付依据。
4. 网页加载后**先读取并立即从地址栏移除 ticket**，再用 JSON 请求 `POST /webview/exchange`：

   ```json
   { "appId": "demo", "ticket": "从 URL 获取的一次性票据" }
   ```

   成功响应是 `{ "accessToken": "...", "expiresIn": 900 }`。JWT 标记 `token_use=webview` 和应用 audience，仅适用于显式允许 WebView 的接口。建议只放在页面内存；不要把 JWT 写回 URL 或长期存储。缺失、过期、已消费或跨应用的 ticket 都需要用户从小程序重新进入。
5. 网页用 `Authorization: Bearer <accessToken>` 请求 `GET /webview/me`，得到 `id`、`nickname`、`avatarUrl` 和 `phoneBound`。头像地址是私有 OSS 的短期签名地址。不会返回手机号、微信 openid 或小程序刷新令牌。JWT 15 分钟后失效，无网页刷新令牌；重新从小程序进入即可取得新票据。

`GET /webview/apps` 是公开的应用名称与标识列表。`POST /webview/tickets` 只接受小程序 JWT；`GET /webview/me` 只接受 WebView JWT。网页 JWT 不能调用原有 `/users/me`、文件或支付接口；未来业务接口如需开放给网页，必须显式接入 WebView Guard 并核对应用标识。

外部域名的网页请求 API 时，浏览器会走 CORS。服务端仅允许已登记的精确 `origin`；仍须使用 ticket/JWT 认证。网页应在加载外部脚本、图片等资源前移除 ticket，并设置 `Referrer-Policy: no-referrer`。不要在网页分析、错误上报或服务端日志中记录 ticket、JWT、完整 URL 或坐标。

## 本地 Docker 与开发者工具

使用现有 `compose.yaml` 的**同一个** PostgreSQL 数据库，不创建第二个库。先用 nvm Node 22.23.2 完成安装和 Prisma 生成，在 `apps/api` 中运行 `pnpm prisma migrate deploy`。`apps/api/.env` 中填写本地配置和上面的 `WEBVIEW_APPS_JSON`，保持真实微信/OSS 凭证只在本地环境文件中。

```bash
docker compose up -d db
docker build -f apps/api/Dockerfile -t wechat-template-api:webview .
docker run --rm -p 127.0.0.1:3100:3000 --env-file apps/api/.env \
  -e DATABASE_URL=postgresql://template:localdev@host.docker.internal:5433/template \
  wechat-template-api:webview
```

另一个终端检查 `http://127.0.0.1:3100/health`、`http://127.0.0.1:3100/webview/apps` 和 `http://127.0.0.1:3100/webview/demo`。在 `apps/miniapp/.env` 设置 `TARO_APP_API_BASE_URL=http://127.0.0.1:3100`，重新构建并在微信开发者工具导入 `apps/miniapp/dist`。仅对本地模拟器关闭域名校验，从首页打开“网页应用”，验证登录返回、无坐标打开、携带模拟坐标打开、票据兑换及资料展示。可在浏览器直接访问 `/webview/demo` 检查缺票据提示；该页面不会为手写 URL 签发票据。

本地模拟器结果不代表真机联通。真机与正式部署需要公网 HTTPS 网页、微信后台配置 **业务域名**，以及小程序 API 请求合法域名；外部网页还需能访问 NestJS API。上线前在真机检查位置授权、拒绝定位后仍可打开、网页首次加载和 JWT 到期后的重新进入。Taro WebView 的域名与平台限制见[官方组件文档](https://docs.taro.zone/docs/components/open/web-view)。
