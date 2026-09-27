# 微信小程序全栈模板

团队内部复制改造的单实例模板仓库。当前完成前两阶段：Taro React 小程序、NestJS API、Prisma/PostgreSQL、微信登录与业务会话、个人资料、私有 OSS 图片、微信头像与手机号授权、门户分享、Winston 分类日志及基础埋点。支付、退款和对账属于后续阶段，目前尚未实现。

## 本地启动

需要 Node.js 22、pnpm 8.9.2、Docker 和微信开发者工具。

1. `pnpm install --frozen-lockfile`
2. `docker compose up -d db`
3. 复制 `apps/api/.env.example` 为 `apps/api/.env`，填入测试小程序的 `WECHAT_APP_ID`、`WECHAT_APP_SECRET`、随机生成的 `JWT_SECRET` 和 OSS 配置。本地数据库地址已与 Compose 对齐。
4. `pnpm --filter @template/contracts build`，再执行 `cd apps/api && pnpm prisma migrate deploy && pnpm prisma generate && pnpm build && node --env-file=.env dist/main.js`。
5. 复制 `apps/miniapp/.env.example` 为 `apps/miniapp/.env`，将 `TARO_APP_API_BASE_URL` 改为当前开发环境可访问的 API HTTPS 地址。
6. `pnpm --filter @template/miniapp build:weapp`，在微信开发者工具中导入 `apps/miniapp`，构建产物位于 `apps/miniapp/dist`。

真机不能使用 `localhost`。微信、OSS 的 AccessKey 只配置在 API 端；小程序只接收本项目的访问令牌、刷新令牌以及有时限的上传授权和读取地址。开发环境中间件使用 `compose.yaml` 的本地账号。

## 私有图片联调

1. 创建**私有 Bucket**，`OSS_REGION`、`OSS_BUCKET` 和 HTTPS `OSS_ENDPOINT` 必须指向同一存储空间。上传对象沿用私有权限，不要设置公开读取的对象 ACL。
2. 给 API 使用的 RAM 身份授权该 Bucket 的 `users/*` 对象前缀：`oss:PutObject` 用于表单上传，`oss:GetObject` 用于 HEAD 元数据核对和签名读取。按实际地域、Bucket 和前缀收紧 Resource；不要使用全局读写权限。PostObject 和 HeadObject 的权限分别见[阿里云 PostObject 文档](https://help.aliyun.com/en/oss/developer-reference/postobject)及[HeadObject 文档](https://help.aliyun.com/en/oss/developer-reference/head-object)。
3. 在微信公众平台登记 API 的 HTTPS **request 合法域名**，以及 OSS Bucket 域名的 **uploadFile 上传域名**和 **downloadFile 下载域名**；头像通过 OSS 签名地址加载，还需检查微信图片资源域名要求。参见[阿里云小程序接入说明](https://help.aliyun.com/zh/oss/user-guide/wechat-applet-uploads-files-directly-to-oss)。
4. 真机登录后，在个人资料页选择 JPEG、PNG 或 WebP 图片（不超过 10 MiB）。小程序向 API 申请限时 V4 表单、直传 OSS，随后请求 API 用 HEAD 核对类型和大小并确认文件。资料保存时只提交文件 ID。再次打开资料页应返回短期签名读取地址；其他用户不应取得该地址。

上传授权有效期为 10 分钟，读取地址有效期为 5 分钟。失败后重试会申请新的授权。OSS 凭证缺失时 API 拒绝签发授权。小程序界面不包含 AccessKey。

## 微信手机号与分享联调

手机号能力需要可用的微信小程序 AppID/Secret、相应的微信平台权限和真实用户的主动授权。用户点击资料页的绑定按钮后，小程序只向 API 发送一次性 `code`；API 与微信换取号码并保存，资料接口只返回是否绑定与掩码。用户拒绝或微信接口失败时，原号码保持不变。具体开通条件以微信公众平台当前要求为准。

门户页面可通过页面菜单和“分享门户”按钮分享。分享标题与目标路径统一配置，目标固定为门户页，不附带令牌、手机号或 OSS 签名地址。

## 日志与埋点

API 的 Winston JSON 日志写入标准输出与错误输出，分类为 `request`、`event`、`error`。请求日志只记录方法、路由模板、状态和耗时；异常日志只记录稳定错误码；埋点仅允许 `kind/name/page/result/occurredAt` 五项受控字段。日志不记录请求正文、Authorization、查询串、手机号或签名。小程序埋点失败不影响用户操作，最多在内存中重试一次。

## 检查与打包

- `pnpm test`、`pnpm typecheck`、`pnpm build`：仓库检查。
- `pnpm test:container`：构建 API 镜像并启动临时容器，检查 `/health`。
- `docker build -f apps/api/Dockerfile -t wechat-template-api .`：构建 API 生产镜像。

部署前在与目标 PostgreSQL 可连接的环境执行 `cd apps/api && pnpm prisma migrate deploy`。镜像只运行 API，不在每次启动时自动迁移数据库。生产环境通过容器环境变量注入 `DATABASE_URL`、`JWT_SECRET`、`WECHAT_APP_ID`、`WECHAT_APP_SECRET` 及 `OSS_*`；不要提交真实密钥。

**真实联调状态：未执行。** 仓库没有测试平台的微信 AppID/Secret、手机号权限或 OSS 凭证，自动测试通过替身 provider 验证签名策略、授权边界和交换流程；编译、数据库迁移与容器健康检查属于本地验证。上线前需在真实微信和 OSS 测试环境复核登录、上传、HEAD、私有读取、手机号授权和分享。

## 复制新场景

复制仓库后，更改小程序名称和门户页面，再接入业务自己的数据与页面。业务管理商品元数据、业务订单、价格与履约；通用订单/支付能力留待后续阶段实现。本模板不包含多租户、购物车和优惠券。
