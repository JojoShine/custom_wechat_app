FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

FROM base AS build
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@8.9.2 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --frozen-lockfile --filter @template/api... --registry=https://registry.npmjs.org

COPY apps/api apps/api
COPY packages/contracts packages/contracts
RUN pnpm --filter @template/api prisma generate \
 && pnpm --filter @template/contracts build \
 && pnpm --filter @template/api build \
 && pnpm --filter @template/api deploy /prod/api

FROM base
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /prod/api ./
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
