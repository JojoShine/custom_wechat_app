# WebView 票据与位置接入实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让已登录的小程序用户打开已登记网页，以一次性 ticket 换取限定用途的 JWT，并可选择通过 URL 传递当前坐标。

**Architecture:** NestJS 以固定配置登记网页应用，在现有 PostgreSQL 中保存一次性票据，并提供兑换及最小资料接口。Taro 小程序提供像素风应用入口和 WebView 承载页；同一 API 镜像提供最小示例 H5。

**Tech Stack:** Taro 4.2.1、React 18、NestJS 12、Prisma 7、PostgreSQL 16、jose 6、Jest、Vitest、Docker。

**Spec:** `docs/superpowers/specs/2026-09-28-webview-bridge-design.md`

## Global Constraints

- 首版只支持微信小程序；使用现有数据库，不创建第二个库。
- `WEBVIEW_APPS_JSON` 固定登记 `appId`、名称、入口 URL 与网页来源；正式地址使用 HTTPS，HTTP 仅允许显式配置的 loopback 地址。
- ticket 有效期 60 秒、只可兑换一次；WebView JWT 有效期 15 分钟，不提供刷新令牌。
- 定位由用户点击触发；失败仍打开网页，URL 不含任何坐标参数；成功时使用 GCJ-02 的 `latitude`、`longitude`、`coordinateSystem=gcj02`。
- 网页资料只含 `id`、`nickname`、`avatarUrl`、`phoneBound`；WebView JWT 与小程序 JWT 不能互用。
- 不记录 ticket、JWT、完整 URL 或坐标；不提交真实凭证。运行 Node 时使用用户的 nvm Node 22.23.2。
- 保留工作区已有的 `apps/miniapp/src/pages/portal/index.css` 改动和 `.idea/`；最终只将本阶段改动本地合并到 `master`。

## Review Focus

- 入口 URL 自带查询参数或片段：Task 5 的 URL 测试确认参数不丢失、票据放在片段之前。
- 两次并发兑换同一 ticket：Task 3 的并发测试确认恰好一次成功。
- 一个应用的 ticket 用另一 `appId` 兑换：Task 3 的测试确认拒绝且不消费原票据。
- WebView JWT 请求原生接口：Task 4 的 Guard 及 `/users/me` 测试确认 401；原生 JWT 请求网页资料也为 401。
- 定位被拒绝、取消或不可用：Task 5 的测试确认仍打开网页且三个坐标字段全部缺席。

---

### Task 1: 应用登记与共享契约

**Files:**
- Create: `apps/api/src/modules/webview/webview.config.ts`
- Test: `apps/api/src/modules/webview/webview.config.spec.ts`
- Create: `packages/contracts/src/webview.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `apps/api/.env.example`

**Interfaces:**
- Produces: `loadWebviewApps(env: NodeJS.ProcessEnv): WebviewAppConfig[]`，其中 `WebviewAppConfig` 为 `{ appId: string; name: string; entryUrl: string; origin: string }`。
- Produces: `WebviewAppSummary`、`WebviewTicketResult`、`WebviewExchangeResult`、`WebviewProfile` 四个共享类型；票据结果含 `entryUrl`、`ticket`、`expiresIn`。

- [ ] **Step 1: 写失败测试**：配置测试断言空配置为 `[]`、重复 `appId` 被拒、入口来源不符被拒、普通 HTTP 被拒、显式 HTTP loopback 可用；契约文件导出四个类型。
- [ ] **Step 2: 验证红灯**：运行 `pnpm --filter @template/api test -- webview.config.spec.ts`，预期缺少实现而失败。
- [ ] **Step 3: 最小实现**：解析 `WEBVIEW_APPS_JSON` 数组并在启动时校验；在 `.env.example` 放置不含凭证的单应用本地样例。
- [ ] **Step 4: 验证绿灯**：运行同一测试及 `pnpm --filter @template/contracts build`，均通过。
- [ ] **Step 5: 提交**：只提交本任务文件，提交信息 `feat: register trusted webview apps`。

### Task 2: Prisma 票据表

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<generated>_add_webview_tickets/migration.sql`
- Test: `apps/api/src/modules/webview/webview.ticket-store.spec.ts`

**Interfaces:**
- Produces: `WebviewTicket` 数据模型：唯一 `tokenHash`、`userId`、`appId`、`expiresAt`、可空 `consumedAt`、`createdAt`；用户删除时级联删除票据。
- Provides Task 3 所需的 Prisma `webviewTicket` 模型及 `tokenHash`、`expiresAt` 索引。

- [ ] **Step 1: 写失败测试**：用现有测试数据库验证票据可关联用户、哈希唯一且删除用户会删除票据；测试仅清理自己创建的数据。
- [ ] **Step 2: 验证红灯**：运行 `pnpm --filter @template/api test -- webview.ticket-store.spec.ts`，预期模型缺失。
- [ ] **Step 3: 最小实现**：添加模型及迁移；在同一个本地 PostgreSQL 库执行 `prisma migrate deploy` 和 `prisma generate`，不另建库。
- [ ] **Step 4: 验证绿灯**：重跑聚焦测试并运行 `pnpm --filter @template/api typecheck`。
- [ ] **Step 5: 提交**：只提交 schema、迁移和测试，提交信息 `feat: persist one-time webview tickets`。

### Task 3: 票据签发与原子兑换

**Files:**
- Create: `apps/api/src/modules/webview/webview-ticket.service.ts`
- Test: `apps/api/src/modules/webview/webview-ticket.service.spec.ts`

**Interfaces:**
- Consumes: Task 1 的 `WebviewAppConfig`；Task 2 的 Prisma `webviewTicket`。
- Produces: `issue(userId: string, appId: string): Promise<WebviewTicketResult>` 和 `consume(appId: string, ticket: string): Promise<string>`，后者返回用户 ID。

- [ ] **Step 1: 写失败测试**：断言签发返回原文而数据库只存 SHA-256 哈希、有效期为 60 秒、未知应用拒绝、过期拒绝、跨应用拒绝且原票据仍可兑换、两次并发兑换恰好一次成功、签发时清理旧票据。
- [ ] **Step 2: 验证红灯**：运行 `pnpm --filter @template/api test -- webview-ticket.service.spec.ts`，预期实现缺失。
- [ ] **Step 3: 最小实现**：用 32 字节随机值生成 ticket；通过同一数据库中的条件更新完成原子消费。对外将不存在、过期、已消费统一为 401。
- [ ] **Step 4: 验证绿灯**：重跑聚焦测试；确认并发测试稳定通过。
- [ ] **Step 5: 提交**：只提交本任务文件，提交信息 `feat: issue and consume webview tickets`。

### Task 4: JWT 隔离、API 与 CORS

**Files:**
- Create: `apps/api/src/modules/webview/webview.guard.ts`
- Create: `apps/api/src/modules/webview/webview.controller.ts`
- Create: `apps/api/src/modules/webview/webview.module.ts`
- Test: `apps/api/src/modules/webview/webview.http.spec.ts`
- Modify: `apps/api/src/modules/auth/session.service.ts`
- Modify: `apps/api/src/modules/auth/access.guard.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/main.ts`

**Interfaces:**
- `GET /webview/apps -> WebviewAppSummary[]`；`POST /webview/tickets {appId} -> WebviewTicketResult`（原生 JWT）；`POST /webview/exchange {appId,ticket} -> WebviewExchangeResult`；`GET /webview/me -> WebviewProfile`（WebView JWT）。
- WebView JWT 使用 `token_use=webview`、`aud=appId`；原生 JWT 使用 `token_use=miniapp`。WebView Guard 向请求写入 `userId`、`webviewAppId`。

- [ ] **Step 1: 写失败 HTTP/Guard 测试**：断言未登录不能签发、未知应用失败、正常兑换后只得到四字段资料；WebView JWT 访问 `/users/me` 与原生 JWT 访问 `/webview/me` 均为 401；篡改 audience 或过期 JWT 为 401；CORS 仅精确允许登记来源。
- [ ] **Step 2: 验证红灯**：运行 `pnpm --filter @template/api test -- webview.http.spec.ts`，预期路由或用途校验缺失。
- [ ] **Step 3: 最小实现**：增加独立 Guard 和路由、头像短期 URL 复用既有文件服务；修改原生签发与 Guard 的用途声明；在启动时根据登记来源启用精确 CORS。保持请求日志只记录路由模板。
- [ ] **Step 4: 验证绿灯**：重跑聚焦测试和现有 auth/users/files/payments 相关测试，运行 API 类型检查。
- [ ] **Step 5: 提交**：只提交本任务文件，提交信息 `feat: exchange webview tickets for scoped jwt`。

### Task 5: 小程序打开流程

**Files:**
- Create: `apps/miniapp/src/core/webview/launch.ts`
- Test: `apps/miniapp/src/core/webview/launch.test.ts`
- Modify: `apps/miniapp/src/core/navigation/routes.ts`
- Modify: `apps/miniapp/src/core/navigation/guard.ts`
- Modify: `apps/miniapp/src/app.config.ts`

**Interfaces:**
- Produces: `buildWebviewUrl(entryUrl: string, appId: string, ticket: string, point?: GeoPoint): string`。
- Produces: `createWebviewLauncher(deps).open(appId: string, withLocation: boolean): Promise<string>`，其中 `deps` 提供 `issueTicket(appId)` 和 `getCurrentLocation()`；返回最终 URL。运行时依赖接入现有 `apiRequest` 与 `locationCapability`。
- 路由常量 `WEBVIEW_APPS_PATH`、`WEBVIEW_PAGE_PATH`；登录返回目标只允许固定的应用列表页。

- [ ] **Step 1: 写失败测试**：断言入口自带查询参数与 `#` 片段保留、ticket/appId 正确编码、非法 URL 拒绝；有坐标时恰好三个坐标字段，无坐标、拒绝、取消、不可用和失败时均不带坐标且仍返回 URL；票据请求在定位后发生。
- [ ] **Step 2: 验证红灯**：运行 `pnpm --filter @template/miniapp test -- launch.test.ts`，预期实现缺失。
- [ ] **Step 3: 最小实现**：实现纯 URL 构造和可注入依赖的打开流程；路由白名单只新增固定列表页，承载页不接受任意 `src` 参数。
- [ ] **Step 4: 验证绿灯**：重跑聚焦测试、导航测试和小程序类型检查。
- [ ] **Step 5: 提交**：只提交本任务文件，提交信息 `feat: prepare trusted webview launches`。

### Task 6: 像素风入口与承载页

**Files:**
- Create: `apps/miniapp/src/pages/webview-apps/index.tsx`
- Create: `apps/miniapp/src/pages/webview-apps/index.css`
- Create: `apps/miniapp/src/pages/webview/index.tsx`
- Test: `apps/miniapp/src/pages/webview-apps/index.test.tsx`
- Test: `apps/miniapp/src/pages/webview/index.test.tsx`
- Modify: `apps/miniapp/src/pages/capabilities/index.tsx`
- Modify: `apps/miniapp/src/pages/capabilities/index.css`

**Interfaces:**
- 消费 Task 4 的应用列表和 Task 5 的 `open`；承载页仅以登记应用 ID 从页内暂存的本次启动结果获取 URL，再渲染 Taro `WebView`。

- [ ] **Step 1: 写页面行为测试**：`webview-apps/index.test.tsx` 验证空列表、未登录返回列表及失败重试；`webview/index.test.tsx` 验证没有本次启动结果时不渲染 WebView。
- [ ] **Step 2: 验证红灯**：运行相应小程序页面测试，预期页面缺失。
- [ ] **Step 3: 最小实现**：新增列表、操作反馈和承载页；能力中心仅添加入口；样式沿用现有像素边框、色板和按钮体系。
- [ ] **Step 4: 验证绿灯**：运行页面测试、`pnpm --filter @template/miniapp typecheck` 与 `pnpm --filter @template/miniapp build:weapp`；在开发者工具检查入口、登录返回和 WebView 布局。
- [ ] **Step 5: 提交**：只提交本任务文件，提交信息 `feat: add pixel-style webview entry pages`。

### Task 7: 同一 API 镜像中的示例 H5

**Files:**
- Create: `apps/api/src/modules/webview/demo-page.ts`
- Test: `apps/api/src/modules/webview/demo-page.spec.ts`
- Modify: `apps/api/src/modules/webview/webview.controller.ts`

**Interfaces:**
- `GET /webview/demo` 返回无业务依赖的 HTML；页面读取 `appId`、`ticket` 和可选坐标，先移除地址栏 ticket，再同源调用兑换及资料接口。

- [ ] **Step 1: 写失败测试**：HTTP 测试断言示例路由返回 HTML，包含兑换与资料接口地址且不包含外部资源；在开发者工具验收清单中列出缺票据、成功兑换、地址栏清除及过期提示。
- [ ] **Step 2: 验证红灯**：运行 `pnpm --filter @template/api test -- demo-page.spec.ts`，预期示例缺失。
- [ ] **Step 3: 最小实现**：用独立 HTML 模板提供静态示例，不新增服务或前端依赖；JWT 仅存在页面内存，不写 URL 或持久存储。
- [ ] **Step 4: 验证绿灯**：重跑聚焦测试与 API 构建；构建现有 API Docker 镜像后请求 `/webview/demo`，确认页面在镜像内可访问。
- [ ] **Step 5: 提交**：只提交本任务文件，提交信息 `feat: include webview exchange demo`。

### Task 8: 接入说明与整体验证

**Files:**
- Create: `docs/webview-integration.md`
- Modify: `README.md`
- Modify: `apps/api/.env.example`（若本地示例值需补充）

**Interfaces:**
- 面向复制项目说明 `WEBVIEW_APPS_JSON`、三个 URL 参数、四个 API、JWT 用途、域名配置、本地 Docker/开发者工具步骤和正式环境验收清单。

- [ ] **Step 1: 写文档检查项**：逐项核对示例配置不含真实密钥，示例 URL 与真实路由一致，明确浏览器跨域、微信业务域名和 JWT 过期重入。
- [ ] **Step 2: 完成文档**：加入可复制的本地配置和 `curl`/开发者工具步骤，不把本地联通描述为真机验收。
- [ ] **Step 3: 全量验证**：用 nvm Node 22.23.2 执行相关单测、全仓类型检查、小程序构建、API Docker 构建；数据库测试只用现有本地库，记录实际结果。
- [ ] **Step 4: 本地联调**：现有 Docker API 与开发者工具验证小程序入口、示例 H5 兑换、定位失败继续；记录无法在当前环境验证的真机/正式域名事项。
- [ ] **Step 5: 提交与集成**：仅提交本任务文件；复核阶段差异后，将阶段提交本地合并到 `master`，保留用户原有未提交文件，不推送远端。
