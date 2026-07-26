# Built from the monorepo root context (docker-compose.yml sets
# `context: .`, `dockerfile: apps/api/Dockerfile`) so pnpm workspace
# resolution and the root lockfile are available. Identical structure to
# services/portfolio/Dockerfile and services/analytics/Dockerfile -- same
# whole-repo-image tradeoff (a pruned `turbo prune` image is parked for a
# later hardening pass, not needed for Sprint 9's exit criteria).

FROM node:20-alpine AS base
RUN corepack enable

FROM base AS deps
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY services ./services
COPY apps ./apps
RUN pnpm install --frozen-lockfile

FROM deps AS build
RUN pnpm exec turbo run build --filter=@tradosphere/api...

FROM base AS runtime
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo ./
EXPOSE 4000
CMD ["node", "apps/api/dist/index.js"]
