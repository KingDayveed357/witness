# Witness build plan

Status: **Draft for Checkpoint 2** · 2026-10-11 · Target submission **Nov 10** (deadline Nov 12, 12:00 PT = 21:00 Lagos)

Owner key: **C** = Claude (engineering), **D** = Dave (decisions, sandbox-buyer steps, accounts, recording). Every stage ends at a checkpoint where Dave approves before the next starts.

## Timeline

| Stage | Dates (2026) | Checkpoint |
|---|---|---|
| 2 Product & architecture | Oct 11–13 | CP2: approve docs + ADRs |
| 3 Core engine | Oct 14–20 | CP3 |
| 4 AI layer & agent | Oct 21–25 | CP4 |
| 5 Product surface & sponsors | Oct 26–Nov 1 | CP5 |
| 6 Hardening | Nov 2–4 | CP6, feature freeze |
| 7 Demo & submission | Nov 5–8 | Submit by Nov 10 (2 days buffer) |

## Stage 3: Core engine (Oct 14–20)

| # | Task | Owner | Depends | Acceptance |
|---|---|---|---|---|
| 3.1 | Monorepo scaffold (pnpm, TS strict, Vitest, ESLint, architecture import checker (`scripts/architecture-rules.ts`), gitleaks, GH Actions) | C | CP2 | CI green on an empty pipeline; forbidden-import rule demonstrably fails a test import |
| 3.2 | `packages/core`: `PolicyV1` (Zod strict), deterministic checks (all lines, all units), JCS digests, three-way match (items, amount, currency, payee, every purchase unit), state-machine table | C | 3.1 | Every `validation/REPORT.md` FAIL is a passing test; illegal transitions throw |
| 3.3 | `packages/db`: Drizzle schema + migrations; audit-chain writer; trigger blocking UPDATE/DELETE; tenant-scoped repositories | C | 3.1 | Chain verify test; UPDATE on `audit_log` fails; cross-tenant read test fails closed |
| 3.4 | `packages/paypal`: port the spike client (exact-host guard, deterministic request ID, redaction, `paypal_calls` journal hooks) | C | 3.3 | Contract tests replay recorded Stage 1 responses |
| 3.5 | `packages/catalog`: Channel3 normaliser (`products.retrieve`, offers → market median) + fixture catalog | C, D (API key) | 3.1 | Fixture and live modes return the same normalised shape |
| 3.6 | `apps/api`: auth (SHA-256-hashed random API keys, scopes), intents (manual-policy confirm for now), `POST /purchases` with Idempotency-Key, screening → REJECT / authorize → verify → decision + approval + job | C | 3.2–3.5 | S1, S2, S5, S7 pass against the sandbox |
| 3.7 | `packages/executor` + `apps/worker`: `consumeApproval`, capture, void, reconciler, HOLD timeout | C | 3.6 | S8, S11 pass; no capture/void route exists (route-inventory test) |
| 3.8 | Webhooks: Render URL (needs 5.x deploy early) **or** a tunnel for local; verify-signature, store, dedupe, re-fetch | C, D (register webhook in dashboard) | 3.6 | Webhook events recorded per step → fills the "which events fire" Unknown in spike-results | **Done 2026-10-12**: 7 verified deliveries on Render, 0 rejected |
| 3.9 | `/verify` endpoints | C | 3.3 | Recompute matches; tampered fixture detected |
| 3.10 | Gate 4 completion: buyer-opened dispute + `spike:dispute next` | D (open dispute), C | — | BRIEF Gate 4 updated | **Open**: waiting for the buyer-opened dispute |
| 3.11 | Early Render deploy (api + worker + db) for the webhook URL | C, D (Render account, credits) | 3.6 | `/readyz` green on Render | **Done 2026-10-12**: https://witness-api-kee6.onrender.com, acceptance 5/5 |

## Stage 4: AI layer and agent (Oct 21–25)

| # | Task | Owner | Acceptance |
|---|---|---|---|
| 4.1 | `packages/ai`: LLM interface, Anthropic adapter, fake adapter, fail-closed wrapper, versioned prompts | C, D (API key) | Fault-injection tests → HOLD |
| 4.2 | Intent compiler + shopper confirm flow (API) | C | F1, F2 |
| 4.3 | Injection classifier + semantic verifier wired into screening and verify | C | F5 |
| 4.4 | HOLD flow: one-time link, phone approval page, 72h auto-void | C, D (test on phone) | S3, S4, S12 |
| 4.5 | Reference agent (Witness tools + Channel3 search only) | C | Runs the five judge scenarios via the API |
| 4.6 | Eval suite 1: 72 cases, runner, report, CI smoke + manual full run | C, D (review cases) | Report published; targets met or gaps stated |
| 4.7 | Evidence writer | C | Narrative cites only record fields; numbers template-inserted |

## Stage 5: Product surface and sponsors (Oct 26–Nov 1)

| # | Task | Owner | Acceptance |
|---|---|---|---|
| 5.1 | `apps/web` from the PayPal AG Grid boilerplate; auth for shopper, ops and demo | C | — |
| 5.2 | AG Studio console: theme, ledger, HOLD queue, **custom evidence-chain widget**, Studio Agent Framework agent ("blocked value by reason") | C, D (AG licence) | Prize-criteria checklist from ADR-0009 met |
| 5.3 | Shopper page (intent, confirm, receipts, mobile HOLD approval) | C | Usable on a phone |
| 5.4 | Judge landing page: 5 scenarios, free-text intent, "try to beat it", live counters, reset, "fetch from PayPal" links | C | A fresh person runs everything from the URL alone |
| 5.5 | Dispute view in the console | C | Evidence approve → submitted |
| 5.6 | Render Blueprint (web, api, worker, db, env groups) + docker-compose | C, D | Deployed; local compose works from the README |
| 5.7 | Postman collection (every endpoint + judge scenarios) | C | Runs green against the hosted API |
| 5.8 | README: judge quickstart, architecture diagram, eval table, honest limits, tools list | C, D (review) | — |

## Stage 6: Hardening (Nov 2–4)

Fresh-eyes run by someone new (D recruits); failure drills (slow sandbox, missed webhook, capture pending/declined, authorization near expiry, worker killed); eval suite 2 full run; security review (secrets, endpoints, rate limits); performance check; final docs. **Feature freeze at the end of Nov 4.**

## Stage 7: Demo and submission (Nov 5–8)

Video script and shot list → record on the deployed app against the real sandbox (trim waits, never results) → Devpost text, tools list → submission checklist (public repo, licence visible in About, YouTube public, under 3 minutes).

## Cut list (in order of what goes first if behind)

1. APIMatic SDK generation (keep only the Context Plugin use)
2. OpenAI adapter / two-provider comparison
3. Human-present (pay with your own sandbox buyer) judge path
4. External publication of the audit chain head
5. Shopper passkey signing of the policy digest
6. Price-history chart (keep the offer-median market check)
7. Dispute **filing** automation, falling back to a static evidence export (ADR-0010)
8. Studio agent query, if the AG licence is unresolved (keep the themed console + custom widget)

**Never cut:** isolated executor, single-use approvals, three-way match, REJECT/HOLD/VOID on the real sandbox, published eval numbers, honest limits.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| AG Studio licence lapses before Dec 15 | Medium | Ask AG Grid now (D); fallback to AG Grid tables |
| Render credits run out in December | Medium | Spend alerts; merge api+worker for the final weeks (ADR-0008) |
| Sandbox flakiness during recording | Medium | Record early in Stage 7; keep evidence of each take |
| LLM latency over target | Medium | Effort/model levers, decided by D with eval data |
| Scope (one engineer + one founder, 3 weeks) | High | Cut list; checkpoints |
