# Built from the monorepo root context (docker-compose.yml sets
# `context: .`, `dockerfile: services/auth/Dockerfile`) so pnpm workspace
# resolution and the root lockfile are available.
#
# This is a whole-repo image, not a pruned production image: every
# workspace package is installed and built, and the runtime stage keeps the
# full tree so Node's module resolution finds `@tradosphere/*` packages via
# pnpm's node_modules symlinks. Good enough for local/staging docker-compose;
# a slimmer image via `turbo prune --scope=@tradosphere/service-auth` is
# parked for a later hardening pass, not needed for Sprint 2's exit
# criterion ("docker compose up boots a working auth service").

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
RUN pnpm exec turbo run build --filter=@tradosphere/service-auth...

FROM base AS runtime
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo ./
EXPOSE 4001
CMD ["node", "services/auth/dist/index.js"]
