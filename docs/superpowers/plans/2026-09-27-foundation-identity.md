# 仓库底座与身份 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立可构建的 Taro + NestJS monorepo，并打通微信登录、业务会话、用户资料和需要登录的页面。

**Architecture:** `apps/miniapp` 和 `apps/api` 独立构建，通过 `packages/contracts` 共享传输类型。API 用 Prisma 持久化用户与刷新会话；小程序集中处理请求、会话和页面准入。微信外部调用通过可替换的 provider 接口隔离，便于本地验证。

**Tech Stack:** pnpm workspace、Taro 4、React、TypeScript、NestJS、Prisma、PostgreSQL、Docker Compose、Jest。

**Spec:** `docs/superpowers/specs/2026-09-27-wechat-miniapp-template-design.md`；本计划只实现其中第 1 阶段，其余三个阶段各写独立计划。

## Global Constraints

- 首版只运行微信小程序；不实现其他端，也不引入多租户。
- portal 只提供导航和页面骨架，使用 Taro 基础组件与少量自有基础组件。
- 业务订单和商品不属于本阶段，也不属于通用身份模块。
- 密钥由环境变量或部署密钥注入；仓库只提交变量示例。
- PostgreSQL 在本地 Docker 中运行；API 后续可打包为生产镜像。
- 不存储微信 `session_key` 到小程序，也不把令牌或敏感资料写入日志。

## Review Focus

1. 微信返回空 `code` 或 `code2Session` 失败：登录接口应返回明确错误，不能创建用户。（Task 3）
2. 同一个微信身份重复登录：只能有一个用户记录，不能重复创建。（Task 3）
3. 过期、撤销或重复使用的刷新令牌：不能续期，应清除客户端会话。（Task 4、5）
4. 多个请求同时遇到过期访问令牌：只应发起一次续期，其余请求等待该结果。（Task 5）
5. 未登录访问受保护页面：应转到登录入口，并在成功后返回原目标页面。（Task 6）

---

## File Map

- 根目录 `package.json`、`pnpm-workspace.yaml`、`tsconfig.base.json`、`.gitignore`：workspace 命令与共享编译基线。
- `packages/contracts/src/auth.ts`、`user.ts`、`errors.ts`：前后端共用的传输类型和错误码。
- `apps/api/src/modules/auth/`：微信凭证交换、会话签发、刷新、退出；`apps/api/src/modules/users/`：用户读取与资料更新。
- `apps/api/prisma/schema.prisma`：用户与刷新会话表；`apps/api/src/common/`：配置验证、错误映射和认证守卫。
- `apps/miniapp/src/core/`：配置、请求、会话存储、登录、页面准入；`apps/miniapp/src/pages/`：登录、门户和个人资料骨架。
- `apps/api/Dockerfile`、`compose.yaml`、`.env.example`：API 镜像、本地数据库与配置示例。

### Task 1: 可构建的 workspace

**Files:** Create root workspace files; create `apps/miniapp/`、`apps/api/`、`packages/contracts/` 的最小入口和配置。

**Interfaces:** Produces `pnpm build`、`pnpm typecheck`、`pnpm test`；三个 workspace 包名分别为 `@template/miniapp`、`@template/api`、`@template/contracts`，后者可由两个应用导入。

- [ ] **Step 1: 写失败的构建检查**：新增根目录 `scripts/check-workspace.mjs`，断言两个应用能解析 `@template/contracts`，并将其加入 `pnpm test`。
- [ ] **Step 2: 运行 `pnpm test`**，确认因 workspace 尚不存在而失败。
- [ ] **Step 3: 创建最小 workspace**：固定同一组兼容的 Taro 包版本；NestJS 与 contracts 各有独立 `package.json` 和 TypeScript 配置；小程序有最小入口与空白 portal；API 有最小模块和启动入口。
- [ ] **Step 4: 运行 `pnpm install --frozen-lockfile`、`pnpm build`、`pnpm typecheck`、`pnpm test`**，全部退出码为 0；锁文件纳入版本控制。
- [ ] **Step 5: 提交**：`feat: scaffold full-stack miniapp workspace`。

### Task 2: 数据库与 API 基础

**Files:** Create `apps/api/prisma/schema.prisma`、迁移文件、`src/common/config/`、`src/common/http/`、`src/health/`、`compose.yaml`、`.env.example`。

**Interfaces:** Produces `GET /health`；Prisma `User`（`id`、唯一 `wechatOpenId`、可空 `nickname`、时间戳）与 `RefreshSession`（`id`、`userId`、令牌摘要、`expiresAt`、`revokedAt`）；统一错误体 `{ code, message }`。

- [ ] **Step 1: 写失败测试**：`GET /health` 返回 200 和 `{ status: 'ok' }`；缺少必需数据库配置时应用启动失败；Prisma schema 中 `wechatOpenId` 唯一。
- [ ] **Step 2: 运行 `pnpm --filter @template/api test`**，确认失败原因分别是路由、配置和模型缺失。
- [ ] **Step 3: 实现健康检查、配置校验、错误格式、Prisma 模型与迁移**；Compose 只包含本地 PostgreSQL 服务，不写真实平台密钥。
- [ ] **Step 4: 运行 `docker compose up -d db`、`pnpm --filter @template/api prisma migrate deploy`、`pnpm --filter @template/api test`**，确认迁移与测试通过。
- [ ] **Step 5: 提交**：`feat: add API database and configuration baseline`。

### Task 3: 微信登录与用户创建

**Files:** Create `packages/contracts/src/auth.ts`、`apps/api/src/modules/auth/wechat-identity.provider.ts`、`wechat-auth.service.ts`、`auth.controller.ts` 及对应测试。

**Interfaces:** `WechatIdentityProvider.exchangeCode(code: string): Promise<{ openId: string }>`；`POST /auth/wechat` 输入 `{ code: string }`，输出 `AuthTokens { accessToken: string; refreshToken: string; expiresIn: number }`；后续任务复用 `WechatAuthService.login(code)`。

- [ ] **Step 1: 写失败测试**：空 `code` 返回 400；交换失败不创建用户；首次登录创建用户并返回令牌；相同 `openId` 再次登录复用用户。
- [ ] **Step 2: 运行 `pnpm --filter @template/api test -- auth`**，确认失败原因是接口未实现。
- [ ] **Step 3: 实现 provider、用户 upsert 和登录服务**；provider 使用微信 `code2Session`，微信密钥仅从服务端配置读取。访问令牌有效期 15 分钟，刷新令牌有效期 30 天；数据库只存刷新令牌摘要。
- [ ] **Step 4: 运行 `pnpm --filter @template/api test -- auth` 与 `pnpm --filter @template/api typecheck`**，全部通过。
- [ ] **Step 5: 提交**：`feat: add WeChat login and user identity`。

### Task 4: 会话续期、退出与用户资料 API

**Files:** Create `apps/api/src/modules/auth/session.service.ts`、`access.guard.ts`、`apps/api/src/modules/users/users.controller.ts`、共享 `user.ts` 与测试；modify Prisma 模型或迁移仅在必要时。

**Interfaces:** `POST /auth/refresh` 输入 `{ refreshToken }` 并轮换令牌；`POST /auth/logout` 撤销刷新会话；`GET /users/me` 返回 `{ id, nickname }`；`PATCH /users/me` 接受 `{ nickname }`。用户资料更新要求有效访问令牌。

- [ ] **Step 1: 写失败测试**：有效刷新令牌轮换；旧令牌、过期令牌、已退出会话均不能续期；未授权不能读资料；本人可以修改昵称，不能修改其他用户资料。
- [ ] **Step 2: 运行 `pnpm --filter @template/api test -- auth users`**，确认因路由和服务缺失而失败。
- [ ] **Step 3: 实现刷新令牌轮换与撤销、访问守卫及资料路由**；刷新令牌轮换与撤销使用数据库原子更新，避免并发重复使用成功。
- [ ] **Step 4: 运行 `pnpm --filter @template/api test -- auth users` 和 `pnpm --filter @template/api typecheck`**，全部通过。
- [ ] **Step 5: 提交**：`feat: add session lifecycle and user profile API`。

### Task 5: 小程序请求与会话客户端

**Files:** Create `apps/miniapp/src/core/api/client.ts`、`session/storage.ts`、`session/auth.ts`、`session/auth.test.ts`；modify `packages/contracts` export。

**Interfaces:** `apiRequest<T>(options: RequestOptions): Promise<T>`；`loginWithWeChat(): Promise<void>`；`refreshSession(): Promise<boolean>`；`logout(): Promise<void>`；令牌存储接口只暴露读写与清除。

- [ ] **Step 1: 写失败测试**：登录取得微信 code 并调用 API；请求附加访问令牌；过期时续期并重试原请求一次；并发过期请求只续期一次；续期失败清除会话并返回认证错误。
- [ ] **Step 2: 运行 `pnpm --filter @template/miniapp test -- core`**，确认因接口缺失而失败。
- [ ] **Step 3: 实现请求、会话存储和单飞续期**；通过依赖注入或 mock 隔离 Taro 网络及存储 API，避免测试依赖微信运行时。
- [ ] **Step 4: 运行 `pnpm --filter @template/miniapp test -- core` 与 `pnpm --filter @template/miniapp typecheck`**，全部通过。
- [ ] **Step 5: 提交**：`feat: add miniapp API and session client`。

### Task 6: 门户、登录与页面准入

**Files:** Create `apps/miniapp/src/pages/login/`、`pages/portal/`、`pages/profile/`、`src/core/navigation/guard.ts` 及测试；modify `src/app.config.ts`。

**Interfaces:** `navigateProtected(target: string): Promise<void>`；登录成功后回到经过校验的原目标页面；portal 只提供导航与页面骨架。

- [ ] **Step 1: 写失败测试**：未登录访问资料页跳转登录并保存安全的目标路径；登录后返回该页；非法外部目标路径回退 portal；已登录可直接进入。
- [ ] **Step 2: 运行 `pnpm --filter @template/miniapp test -- navigation`**，确认因 guard 缺失而失败。
- [ ] **Step 3: 实现页面和准入规则**；使用 Taro 基础组件，资料页调用 `GET/PATCH /users/me`，不加入业务视觉或行业内容。
- [ ] **Step 4: 运行 `pnpm --filter @template/miniapp test -- navigation`、`pnpm --filter @template/miniapp typecheck` 与 `pnpm --filter @template/miniapp build:weapp`**，全部通过。
- [ ] **Step 5: 提交**：`feat: add portal skeleton and authenticated navigation`。

### Task 7: Docker 镜像与第一阶段接入说明

**Files:** Create `apps/api/Dockerfile`、`README.md`、`apps/api/.env.example`、`apps/miniapp/.env.example`、`scripts/test-container.mjs`；modify root `package.json` to add `test:container`。

**Interfaces:** `docker build -f apps/api/Dockerfile .` 生成可启动 API 镜像；README 给出本地数据库、迁移、API、小程序的启动顺序及测试环境凭证接入点。

- [ ] **Step 1: 写失败的容器检查**：`scripts/test-container.mjs` 在 Compose PostgreSQL 可用时构建并启动镜像，断言 `GET /health` 返回 200；检查 `.env.example` 只含占位值。
- [ ] **Step 2: 运行 `pnpm test:container`**，确认因 Dockerfile 或配置缺失而失败。
- [ ] **Step 3: 实现多阶段 Dockerfile、环境示例和第一阶段 README**；镜像只包含运行必需文件，迁移命令明确且可重复执行。
- [ ] **Step 4: 运行 `pnpm test`、`pnpm typecheck`、`pnpm build`、`pnpm test:container` 和 `git diff --check`**，全部通过。若已有测试环境微信凭证，再做一次真实登录联调并记录结果；没有凭证时明确记录未执行。
- [ ] **Step 5: 提交**：`docs: document and package foundation stage`。

## Stage Boundary

完成本计划后，只宣称第 1 阶段完成。OSS、手机号、分享、Winston 上报、支付、退款及对账属于后续三个独立计划；不要以占位实现标记它们为完成。
