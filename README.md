# Tradosphere OS

AI-powered Trading Intelligence & Education Operating System.

Not a dashboard. An AI Core → Operating System → API → Dashboard stack covering AI research, live market analysis, technical/fundamental/option-chain/sector/quant analysis, paper trading, portfolio, trading journal, a learning platform with an AI tutor, and a CIO decision engine that turns every expert's opinion into one explainable verdict.

## Status

Scaffold only. See `SPRINT_BOOK.md` for the 10-sprint build plan, `REBUILD_LOG.md` for current state, and `EXECUTION_BOOK.md` for the session-by-session log. Build with the `ai-exec-team` skill, sprint by sprint. Audit milestones with the `ai-team` skill.

## Stack

Node/TypeScript monorepo (pnpm + Turborepo), Next.js frontend, Node backend services, PostgreSQL + Redis.

## Structure

- `apps/` — deployable applications (api, web, admin, docs, mobile)
- `services/` — backend microservices (auth, broker/smc, market-data, research, ai, cio, education, paper-trading, portfolio, notifications, analytics)
- `packages/` — shared libraries (ui, shared-types, sdk, config, auth, database, logger)
- `knowledge/` — the platform's domain knowledge base (indicators, strategies, market-structure, options, glossary, courses, prompts)
- `infrastructure/` — docker, kubernetes, monitoring, observability, ci-cd
- `docs/` — architecture, api, database, adr, development, deployment docs
- `tests/` — unit, integration, e2e, performance, security
