# ─── Tradosphere OS — Production Dockerfile ──────────────────────────────
# Unified Dockerfile for all services. Select the runtime target:
#
#   API service:
#     docker build --target=api-runtime \
#       --build-arg PKG_FILTER=@tradosphere/service-auth \
#       --build-arg SERVICE_PORT=4001 \
#       --build-arg CMD_PATH=services/auth/dist/index.js \
#       -t tradosphere/auth:latest .
#
#   Web frontend (Next.js):
#     docker build --target=web-runtime \
#       --build-arg PKG_FILTER=@tradosphere/web \
#       -t tradosphere/web:latest .
#
# The build context must be the `out/` directory from `turbo prune --docker`
# with pnpm-workspace.yaml + turbo.json copied alongside (see build.sh).

ARG NODE_VERSION=20-alpine

# ═══════════════════════════════════════════════════════════════════════
# Stage 1: Install dependencies from pruned workspace
# ═══════════════════════════════════════════════════════════════════════
FROM node:${NODE_VERSION} AS deps
RUN corepack enable
WORKDIR /app
COPY json/ ./
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY turbo.json ./
RUN pnpm install --frozen-lockfile

# ═══════════════════════════════════════════════════════════════════════
# Stage 2: Build
# ═══════════════════════════════════════════════════════════════════════
FROM node:${NODE_VERSION} AS builder
RUN corepack enable
WORKDIR /app
COPY full/ ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/pnpm-lock.yaml ./
ARG PKG_FILTER
RUN pnpm exec turbo run build --filter=${PKG_FILTER}...
# Strip dev dependencies — not needed at runtime
RUN pnpm prune --prod

# ═══════════════════════════════════════════════════════════════════════
# Stage 3a: API service runtime
# ═══════════════════════════════════════════════════════════════════════
FROM node:${NODE_VERSION} AS api-runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app ./
ARG SERVICE_PORT
EXPOSE ${SERVICE_PORT}
ARG CMD_PATH
ENV CMD_PATH=${CMD_PATH}
CMD node ${CMD_PATH}

# ═══════════════════════════════════════════════════════════════════════
# Stage 3b: Next.js web frontend runtime
# ═══════════════════════════════════════════════════════════════════════
FROM node:${NODE_VERSION} AS web-runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Next.js reads .next, public/, next.config.mjs, and package.json from
# its own working directory — place them at /app so `next start` finds them
COPY --from=builder /app/apps/web/.next /app/.next
COPY --from=builder /app/apps/web/public /app/public
COPY --from=builder /app/apps/web/next.config.mjs /app/
COPY --from=builder /app/apps/web/package.json /app/
# pnpm symlinks @tradosphere/* packages — keep them resolvable
COPY --from=builder /app/packages /app/packages
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/package.json /app/
EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "-p", "3000"]
