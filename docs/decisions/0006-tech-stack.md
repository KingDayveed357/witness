# 0006: Tech stack

Status: **Proposed** · Constraint: Dave's skills are TypeScript/Next.js, React, Node, Python/FastAPI, Laravel, PostgreSQL.

| Concern | Choice | Alternatives considered | Why |
|---|---|---|---|
| Language | **TypeScript end to end** | Python/FastAPI for the API | AG Studio is React; PayPal's AG Grid boilerplate is Next.js + `@paypal/paypal-server-sdk` (**Verified**: boilerplate `package.json`); Channel3 has a TS SDK (**Verified**); one language for shared Zod schemas |
| UI | **Next.js (App Router)** | Vite SPA | Boilerplate starts here (Next 16, React 19, **Verified**); server components keep keys server-side |
| API | **Fastify** | Next.js route handlers, Hono | Isolation (ADR-0005), OpenAPI from Zod, hooks |
| PayPal client | **Own thin REST client** (port `spikes/lib/paypal.mjs`) | `@paypal/paypal-server-sdk` | We need deterministic `PayPal-Request-Id`, request journaling, redaction and the exact-host guard on every call, and Stage 1 evidence was produced by this client. Revisit if the SDK supports all four cleanly (**Unknown**). |
| DB | **PostgreSQL** | none | Dave knows it; transactions, row locks and a trigger-protected audit table |
| ORM | **Drizzle** | Prisma | SQL-first: the invariant depends on exact statements (`UPDATE … WHERE used_at IS NULL RETURNING`, `SELECT … FOR UPDATE`, triggers), and Drizzle keeps those visible. Lighter runtime. |
| Jobs | **pg-boss** | graphile-worker; BullMQ + Redis; Render Workflows | Postgres-backed, so jobs enqueue **in the same transaction** as the state change; job deferral, retries with exponential backoff and cron scheduling (**Verified**: README); no Redis bill. Render Workflows "do not yet natively support scheduling task runs" (**Verified**), which HOLD timeouts need. |
| Validation | **Zod** on every external input and AI output | — | One schema source for runtime checks, TS types and OpenAPI |
| Canonical JSON | **RFC 8785 (JCS)** for digests | ad-hoc `JSON.stringify` | Stable digests across languages and versions |
| AI | `@anthropic-ai/sdk` behind an interface (ADR-0007) | — | |
| Catalog | `@channel3/sdk` + fixture fallback | — | **Verified**: TS SDK, `products.retrieve` (free), `products.lookup` |
| Tests | **Vitest** (unit/integration), recorded sandbox contract tests, **Playwright** (judge flows), eval runner | Jest | Fast, ESM-native |
| CI | GitHub Actions: typecheck, lint, Vitest, dependency-cruiser, gitleaks, eval smoke | — | |
| Monorepo | pnpm workspaces | npm workspaces, Turborepo | Strict dependency boundaries help the isolation rule |
| Logging | pino (JSON), `trace_id` = purchase ID | — | |

Consequence: one new library family for Dave to learn (Drizzle, pg-boss). Both are thin layers over SQL he already knows.
