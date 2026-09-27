# 文件与微信能力 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有全栈模板中交付私有 OSS 图片直传与读取、用户主动获取手机号及头像昵称、通用分享和基础日志埋点。

**Architecture:** API 负责授权、核验、持久化和微信服务端交换；小程序只持有短期上传表单字段并通过用户操作触发原生能力。文件、微信资料和日志分别独立测试，使用 `packages/contracts` 共享传输类型。

**Tech Stack:** Taro 4.2.1、React 18、NestJS 12、Prisma 7/PostgreSQL、Aliyun OSS Node SDK、Winston、Vitest、Jest。

**Spec:** `docs/superpowers/specs/2026-09-27-file-wechat-capabilities-design.md`；总体边界见 `docs/superpowers/specs/2026-09-27-wechat-miniapp-template-design.md`。

## Global Constraints

- 首版只运行微信小程序；不引入多租户、业务商品或支付。
- OSS Bucket 私有；读取地址由服务端签发 5 分钟有效的 GET URL。
- 只上传 JPEG/PNG/WebP，1 字节至 10 MiB；POST V4 授权 10 分钟有效且锁定完整对象键、类型、大小和成功状态。
- 微信与 OSS 长期密钥只在 API 环境变量中；仓库只提交示例值。
- 手机号和头像由用户主动操作触发，不作为登录条件。
- Winston 只输出基础结构化日志；不记录令牌、手机号、微信 code、OSS 签名或请求体。
- 真实 OSS 与微信联调只有在测试凭证可用时执行，替身测试不算真实联调。
- 保留用户本地未跟踪的 `.idea/` 目录，不编辑或清理。

## Review Focus

1. 伪造 MIME、大小或对象键：授权策略必须约束实际上传，确认接口再次以 OSS 元数据核对。（Tasks 1、2）
2. 过期或他人上传意图、重复确认：不可越权或从失败状态转成就绪；同一有效意图可幂等确认。（Task 2）
3. 上传网络失败后重试：生成新授权与对象键，不能复用过期策略。（Task 3）
4. 手机号授权拒绝、code 交换失败：不更新原号码，不触发无 code 的 API 请求。（Task 4）
5. 事件上报包含敏感字段或异常堆栈：API 拒绝额外字段，Winston 不记录敏感值；上报失败不影响用户操作。（Task 6）

---

## File Map

- `packages/contracts/src/file.ts`：授权、文件、读取响应；`user.ts`：资料扩展；`telemetry.ts`：受控事件。
- `apps/api/prisma/schema.prisma` 和新迁移：上传意图、用户头像与手机号。
- `apps/api/src/modules/files/`：OSS provider、上传意图、确认、私有读取路由。
- `apps/api/src/modules/users/`：头像关联与手机号 code 交换。
- `apps/api/src/common/logging/` 和 `modules/telemetry/`：Winston 分类日志、请求记录和上报入口。
- `apps/miniapp/src/core/files/`：上传流程；`pages/profile/`：头像、昵称与手机号；`pages/portal/`：分享；`core/telemetry/`：非阻断上报。
- `apps/api/.env.example`、`README.md`：配置与真实联调步骤。

### Task 1: 文件契约、模型与 OSS 授权

**Files:** Create `packages/contracts/src/file.ts`、`apps/api/src/modules/files/oss.provider.ts`、`files.service.ts` 和测试；modify Prisma schema、迁移、API 依赖及环境示例。

**Interfaces:** `FilesService.authorize(userId, {contentType,size}): Promise<UploadAuthorization>`；`OssProvider.signUpload({key,contentType,maxBytes,expiresAt})` 返回 HTTPS 地址和 V4 表单字段。Prisma `UploadIntent` 包含 `id`、`userId`、唯一 `objectKey`、`contentType`、`expectedSize`、`expiresAt`、`status`、`confirmedAt`。

- [ ] **Step 1: 写失败测试**：合法 JPEG/PNG/WebP 返回 10 分钟内授权和随机的用户专属键；0 字节、超过 10 MiB、其他类型拒绝；解码 V4 policy 验证完整键、类型、大小、Bucket 和成功状态。
- [ ] **Step 2: 运行 `pnpm --filter @template/api test -- files`**，确认服务或契约缺失导致失败。
- [ ] **Step 3: 实现**：用官方 Aliyun OSS Node SDK 的 V4 POST 签名；凭证仅服务端配置；保存 `PENDING` 意图，生成 Prisma 迁移并在本地 PostgreSQL 执行。
- [ ] **Step 4: 运行文件测试、API typecheck、`prisma migrate deploy` 和 `prisma generate`**，验证全部通过。
- [ ] **Step 5: 提交**：`feat: authorize private OSS image uploads`。

### Task 2: 上传确认和私有读取 API

**Files:** Create `apps/api/src/modules/files/files.controller.ts`、`files.module.ts` 和测试；modify OSS provider、`app.module.ts`。

**Interfaces:** `POST /files/uploads`；`POST /files/uploads/:id/confirm` 返回 `ReadyFile {id,contentType,size}`；`GET /files/:id/read-url` 返回 `{url,expiresAt}`。`FilesService.confirm(userId,uploadId)` 与 `FilesService.readUrl(userId,fileId)` 供路由和资料模块复用。路由均使用现有 `AccessGuard`。

- [ ] **Step 1: 写失败测试**：无登录被拒；其他用户、过期意图、OSS 不存在及元数据不符不能确认；成功确认与重复确认返回同一文件；他人不能获取读取 URL，自己的就绪文件获得 5 分钟地址。
- [ ] **Step 2: 运行 `pnpm --filter @template/api test -- files`**，确认路由/状态逻辑缺失。
- [ ] **Step 3: 实现**：`HEAD` 后用条件更新将 `PENDING` 设为 `READY`；读取只按文件 ID 查库并校验所有者，不接受对象键；重复确认读取已就绪记录并保持幂等。
- [ ] **Step 4: 运行文件测试、API typecheck 与 HTTP 路由测试**，确认状态码和授权行为。
- [ ] **Step 5: 提交**：`feat: confirm and read private files`。

### Task 3: 小程序图片上传与头像资料

**Files:** Create `apps/miniapp/src/core/files/upload.ts` 与测试；modify `pages/profile/index.tsx`、`apps/api/src/modules/users/users.controller.ts`、共享 `user.ts` 和相关测试。

**Interfaces:** `uploadImage(filePath, size, contentType): Promise<ReadyFile>`；`selectAndUploadImage(): Promise<ReadyFile | null>`（取消时为 `null`）；`PATCH /users/me` 可提交 `{nickname?,avatarFileId?}`；`GET /users/me` 增加 `avatarFileId` 与短期头像读取地址。

- [ ] **Step 1: 写失败测试**：选图取消不调用 API；本地大文件拒绝；授权→上传→确认成功；OSS 上传失败后用户重试得到新授权；头像文件必须属于本人且 `READY`，否则资料不变。
- [ ] **Step 2: 运行 `pnpm --filter @template/miniapp test -- files` 与 `pnpm --filter @template/api test -- users`**，确认缺少实现。
- [ ] **Step 3: 实现**：Taro `chooseMedia`/`chooseAvatar` 用户触发、`uploadFile` 表单直传、确认；资料页用 `Input type="nickname"`，保存头像文件 ID 和昵称；复用现有失效会话跳转。
- [ ] **Step 4: 运行双方测试、typecheck 和 `build:weapp`**，确认页面编译与失败分支。
- [ ] **Step 5: 提交**：`feat: upload profile images from miniapp`。

### Task 4: 微信手机号主动绑定

**Files:** Create `apps/api/src/modules/users/wechat-phone.provider.ts` 与测试；modify `users.controller.ts`、`schema.prisma`、迁移、`user.ts`、资料页和相关测试。

**Interfaces:** `WechatPhoneProvider.exchangeCode(code): Promise<{countryCode,phoneNumber}>`；`POST /users/me/phone` 输入 `{code}`、返回扩展 `UserProfile`，其中只暴露 `phoneBound` 和 `maskedPhone`。

- [ ] **Step 1: 写失败测试**：无 code 或拒绝不调用 API；微信 access token 在有效期内缓存、过期后更新；换号接口失败不覆盖原值；成功时只更新当前用户并返回掩码号码。
- [ ] **Step 2: 运行 `pnpm --filter @template/api test -- phone` 和 `pnpm --filter @template/miniapp test -- phone`**，确认失败是能力缺失。
- [ ] **Step 3: 实现**：微信 access token 与手机号服务端交换；`openType="getPhoneNumber"` 回调只发送有效 code；号码仅存数据库，日志与小程序响应不返回明文。
- [ ] **Step 4: 执行迁移，运行双方测试、typecheck 与 `build:weapp`**，全部通过。
- [ ] **Step 5: 提交**：`feat: bind phone after WeChat consent`。

### Task 5: 门户分享

**Files:** Modify `apps/miniapp/src/pages/portal/index.tsx`；create page config 和纯函数测试。

**Interfaces:** 分享标题与安全门户路径从单一模板配置读取；Taro `useShareAppMessage` 和分享按钮共用配置。

- [ ] **Step 1: 写失败测试**：默认分享路径只指向门户，动态参数不能包含 token、手机号或签名 URL；按钮和页面分享使用相同配置。
- [ ] **Step 2: 运行 `pnpm --filter @template/miniapp test -- share`**，确认缺少配置。
- [ ] **Step 3: 实现**：开启页面分享并添加按钮；不代理 Taro Hook，只集中安全配置。
- [ ] **Step 4: 运行分享测试、typecheck 与 `build:weapp`**，全部通过。
- [ ] **Step 5: 提交**：`feat: add safe portal sharing`。

### Task 6: Winston 分类日志与小程序埋点

**Files:** Create `packages/contracts/src/telemetry.ts`、`apps/api/src/common/logging/`、`apps/api/src/modules/telemetry/`、`apps/miniapp/src/core/telemetry/` 和测试；modify API 主模块、异常过滤器与小程序调用点。

**Interfaces:** `POST /telemetry/events` 要求认证，单条事件仅含 `kind/name/page/result/occurredAt`；Winston JSON 日志类别 `request`、`event`、`error`，写标准流。

- [ ] **Step 1: 写失败测试**：敏感/额外字段、超长字段和未登录上报被拒；合法事件记录受控字段；请求与异常日志不含 Authorization、查询串、body、手机号或签名；客户端上报失败不阻断操作且最多内存重试一次。
- [ ] **Step 2: 运行 `pnpm --filter @template/api test -- telemetry logging` 和 `pnpm --filter @template/miniapp test -- telemetry`**，确认失败原因是功能缺失。
- [ ] **Step 3: 实现**：Winston logger、请求耗时记录、异常稳定错误码、受控上报路由及非阻断客户端调用；不建数据库或日志后台。
- [ ] **Step 4: 运行双方测试、typecheck 和构建**，全部通过。
- [ ] **Step 5: 提交**：`feat: add structured logging and telemetry`。

### Task 7: 第二阶段联调说明与整体验收

**Files:** Modify `README.md`、`.env.example` 和必要的检查脚本。

**Interfaces:** README 列出 OSS 私有 Bucket、RAM 权限、合法上传/下载域名、手机号能力前提、测试凭证和联调步骤；明确模拟与真实验证的区别。

- [ ] **Step 1: 写失败的配置检查**：示例环境只含占位值；OSS 配置缺失时授权失败且不生成宽松策略；文档列出文件和手机号真实联调前提。
- [ ] **Step 2: 运行配置检查**，确认缺少环境说明或校验而失败。
- [ ] **Step 3: 补齐配置与联调说明**；若测试凭证可用，完成真实 OSS 上传/HEAD/私有读取和微信手机号联调并记录结果，否则明确标注未执行。
- [ ] **Step 4: 运行 `pnpm test`、`pnpm typecheck`、`pnpm build`、`pnpm test:container`、`git diff --check`，全部通过。
- [ ] **Step 5: 提交**：`docs: complete stage two integration guide`。

## Stage Boundary

完成本计划只宣称第二阶段完成。第三阶段支付、退款与对账，以及第四阶段完整模板交付，另行规划和实现。
