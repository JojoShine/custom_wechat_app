# 第四阶段模板交付实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让内部团队直接复制本仓库、替换门户并接入业务能力，且能按文档完成构建与本地验收。

**Architecture:** 保留现有单实例 monorepo 和平台能力模块。集中小程序页面路径以降低复制时漏改导航的风险，提供复制与环境说明，并在隔离工作树中验证默认和演示构建；不增加模板生成器或业务通用模型。

**Tech Stack:** Taro 4.2.1、React 18、NestJS 12、Prisma 7、PostgreSQL、pnpm 8.9.2、Node 22.23.2、Docker。

**Spec:** `docs/superpowers/specs/2026-09-28-template-delivery-design.md`

## Global Constraints

- 团队直接复制仓库，保留 `apps/miniapp`、`apps/api`、`packages/contracts`；不制作模板生成器。
- 门户保持中性；商品、业务订单、定价、退款决策、履约由复制后的业务模块负责。
- 演示支付默认关闭，保留为可删除的接入示例。
- 只使用现有单个本地 PostgreSQL 测试数据库；不新建第二个数据库。
- Node 命令先加载 nvm 并使用 Node 22.23.2；不把真实凭证写入仓库。
- 第四阶段结束后才向用户提供真实微信支付、退款和 OSS 联调参数清单。

## Review Focus

- 新增业务页面漏登记回跳白名单：Task 1 的测试验证已登记路径可返回，未知或外部路径仍回门户。
- 演示页默认泄露到正式构建：Task 1 和 Task 4 分别检查路由配置和默认构建产物。
- 复制时只改一个 `@template/*` 包名导致依赖失效：Task 2 指引列出需同步更改的文件，并用仓库检查命令验证。
- 前端环境文件误放商户、OSS 或微信服务端密钥：Task 3 对照 `.env.example` 列出每项作用域，并运行已有敏感变量检查。
- 已部署复制品删除演示迁移造成历史漂移：Task 2 明确要求新增迁移，Task 4 检查 Prisma 迁移状态。

---

### Task 1: 可替换门户的页面路径

**Files:**
- Create: `apps/miniapp/src/core/navigation/routes.ts`
- Modify: `apps/miniapp/src/app.config.ts`, `apps/miniapp/src/core/navigation/guard.ts`, `apps/miniapp/src/core/navigation/guard.test.ts`, `apps/miniapp/src/pages/portal/index.tsx`, `apps/miniapp/src/core/share/portal.ts`
- Test: `apps/miniapp/src/core/navigation/routes.test.ts`

**Interfaces:**
- Produces: `PORTAL_PATH`、`LOGIN_PATH`、`PROFILE_PATH`、`DEMO_PAYMENT_PATH` 和 `enabledPages(includeDemo: boolean): string[]`；页面配置和登录回跳均使用这些常量。

- [ ] **Step 1: 写失败测试。** `guard.test.ts` 验证登记的资料页可以作为返回目标、未知路径回门户；新增 `routes.test.ts` 验证 `enabledPages(false)` 不含演示页、`enabledPages(true)` 含演示页且门户为首屏。
- [ ] **Step 2: 运行测试确认失败。** `pnpm --filter @template/miniapp test -- guard.test.ts routes.test.ts`；缺少 `routes.ts` 或导出时失败。
- [ ] **Step 3: 实现最小路径表。** 只集中路径和 `enabledPages`，让页面配置、守卫、门户按钮和分享读取同一组路径；不创建动态菜单框架。
- [ ] **Step 4: 验证。** 上述测试及 `pnpm --filter @template/miniapp typecheck` 通过。
- [ ] **Step 5: 提交。** `feat: centralize miniapp template routes`。

### Task 2: 内部复制与业务接入指引

**Files:**
- Create: `docs/template-copy-guide.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 1 的页面路径登记位置、现有 `DemoPaymentsService`、`PaymentService`、`RefundService`、`PaymentEvents` 接口。
- Produces: 团队复制仓库后可逐项执行的检查表；README 指向该文档。

- [ ] **Step 1: 写指引。** 包含复制与命名、环境准备、迁移、门户替换、业务页面登记、业务服务调用平台支付/退款、支付事件消费、演示模块关闭或移除、上线前检查。具体命令和路径以当前仓库为准。
- [ ] **Step 2: 对照代码核查。** 逐项确认包名、Dockerfile、脚本、路由、Prisma 演示表和支付服务签名；说明改 `@template/*` 时应一起改 workspace 依赖与锁文件，已部署时删除演示表须新增迁移。
- [ ] **Step 3: 验证。** 核查指引提到的 `apps/miniapp/src/pages/portal/index.tsx`、`apps/api/src/modules/demo-payments`、`apps/api/prisma/schema.prisma` 和命令均存在；`node scripts/check-workspace.mjs` 通过。文档修改不增加镜像式单元测试。
- [ ] **Step 4: 提交。** `docs: add internal template copy guide`。

### Task 3: 环境变量与外部联调边界

**Files:**
- Create: `docs/template-environments.md`
- Modify: `README.md`, `scripts/check-workspace.mjs`（仅当现有检查漏掉明确的服务端密钥时）

**Interfaces:**
- Consumes: `apps/api/.env.example`、`apps/miniapp/.env.example` 和当前配置读取代码。
- Produces: 每个环境变量的用途、部署位置、敏感级别、可选条件和对应域名/回调说明。

- [ ] **Step 1: 建立变量清单。** 将本地 PostgreSQL、微信身份、OSS、微信支付、公钥验签、演示开关和小程序公开变量逐项对应到 `.env.example`，说明测试与生产配置差别。
- [ ] **Step 2: 写安全与域名说明。** 标清服务端密钥、小程序可公开变量、request/upload/download 合法域名、支付和退款 HTTPS 回调；文档只用占位符。
- [ ] **Step 3: 验证。** 对照两份 `.env.example` 检查变量名完整一致；运行 `node scripts/check-workspace.mjs`，必要时补充其服务端密钥不出现在小程序示例中的断言。
- [ ] **Step 4: 提交。** `docs: document template environment matrix`。

### Task 4: 复制品演练与整体验收

**Files:**
- Modify: `README.md`（仅记录本阶段验收方式和真实联调限制）

**Interfaces:**
- Consumes: Tasks 1–3 的代码与文档；产出本阶段本地验证证据及交付说明。

- [ ] **Step 1: 在隔离工作树模拟复制品。** 使用已有依赖和同一个本地测试数据库，不创建第二库；确认 `.env.example` 与指引足以运行命令。
- [ ] **Step 2: 运行 `TEST_DATABASE_URL=postgresql://template:localdev@localhost:5433/template_payment_dev pnpm test`、`pnpm typecheck`、`pnpm build`。** 记录测试数量及失败原因；默认小程序构建检查不含演示路由。
- [ ] **Step 3: 运行 `TARO_APP_DEMO_PAYMENTS_ENABLED=true pnpm --filter @template/miniapp build:weapp` 与 `pnpm test:container`。** 检查启用构建含演示路由、API 容器 `/health` 正常。
- [ ] **Step 4: 核对 Prisma 迁移状态与 Git 变更。** 只使用现有数据库，不重置或创建额外库；如未注入外部凭证，明确记录真实链路未验证。
- [ ] **Step 5: 提交并按用户既有偏好本地合并到 `master`。** 不推送；保留已有未跟踪 `.idea/`。

## 完成后交付

向用户展示真实联调参数清单，分别列出微信小程序身份、普通直连商户支付与退款、微信支付公钥及证书、私有 OSS、微信合法域名和 HTTPS 回调。标明哪些值是敏感信息、哪些是配置或开通状态；待用户按需提供后再做真实联调。
