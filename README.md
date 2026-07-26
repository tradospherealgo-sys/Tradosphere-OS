# Tradosphere OS

AI-powered Trading Intelligence & Education Operating System.

Not a dashboard. An AI Core → Operating System → API → Dashboard stack covering AI research, live market analysis, technical/fundamental/option-chain/sector/quant analysis, paper trading, portfolio, trading journal, a learning platform with an AI tutor, and a CIO decision engine that turns every expert's opinion into one explainable verdict.

## Status

Sprints 1–9 (Foundation, Infrastructure, Market Data, Research Engine, AI Council, Stabilization, CIO Engine, Education, Trading, APIs) are built and signed off. Education includes a Postgres-backed CRUD content service for courses/glossary/strategies/quizzes, an AI tutor endpoint reusing the AI Council's Education agent, and a trade-idea annotation wired into every CIO-generated trade idea. Trading includes paper trading execution (8.1), the trade journal (8.2), portfolio tracking (8.3) — holdings, cash ledger, realized/unrealized P&L, daily mark-to-market, allocation and risk exposure — and analytics (8.4) — win rate, average return, risk/reward, drawdown, Sharpe/Sortino, expectancy, monthly reports, strategy/session/instrument breakdowns, heatmaps, and a persisted-report performance API. All three Sprint 8 exit criteria are met, independently re-verified by the ai-team review board (CONDITIONAL GO, 86/100) before Anshh's sign-off. APIs (Sprint 9) is `apps/api`, the single public gateway in front of all ten backend services — reverse-proxying the five that already have an HTTP surface and hosting the other five (research, ai, cio, paper-trading, journal) as in-process routes — plus auth, Redis-backed rate limiting, a WebSocket layer streaming market ticks and CIO verdicts, a hand-authored `openapi.yaml` (80 paths, 103 operations, 109 schemas), a typed `packages/sdk` client, and Prometheus metrics. All three exit criteria are met, including a live-endpoint test suite proving the generated SDK actually works against a real running gateway. See `SPRINT_BOOK.md` for the 10-sprint build plan, `REBUILD_LOG.md` for current state, and `EXECUTION_BOOK.md` for the session-by-session log. Build with the `ai-exec-team` skill, sprint by sprint. Audit milestones with the `ai-team` skill.

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
