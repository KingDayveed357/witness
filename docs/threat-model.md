# Witness threat model

Status: **Draft for Checkpoint 2** · 2026-10-11 · Scope: the hackathon system in `docs/architecture.md`, sandbox only.

## Assets

| Asset | Why it matters |
|---|---|
| A1 Shopper funds (authorizations and captures) | The thing being protected |
| A2 PayPal client secret | Whoever holds it can move money outside Witness |
| A3 Confirmed intents (policy + digest) | Define what may be bought |
| A4 Approvals | Single-use capabilities to capture |
| A5 Audit chain and evidence | Basis for dispute defence and public verification |
| A6 Shopper vault ID | Lets PayPal authorize without the buyer present |
| A7 LLM, Channel3 and AG Studio keys; ops sessions | Cost and data exposure |

## Actors

| Actor | Capability assumed |
|---|---|
| Malicious or confused **agent** | Holds an agent API key; can send any cart, replay requests, and read its own purchase status |
| **Prompt injector** | Controls third-party text the system reads (product titles and descriptions, merchant pages) |
| Faulty or compromised **checkout adapter** | Can change the lines sent to PayPal |
| **Network attacker / forger** | Can send arbitrary HTTP to public endpoints, including fake webhooks |
| **Judge or public visitor** | Uses the demo key on the "try to beat it" page, at high volume |
| **Operator with the PayPal secret** | Out of scope: can bypass Witness entirely (stated honest limit) |
| **Compromised verifier model** | The LLM returns wrong or adversarial output |

## Threats and controls

| # | Threat | Asset | Control | Residual risk / test |
|---|---|---|---|---|
| T1 | **Prompt injection** in product text makes the agent pick a different item, or tells the verifier to approve | A1 | Injection classifier on all third-party text; the semantic verifier only judges named constraints and returns a structured verdict; **no AI output can set amount, SKU, merchant or quantity**; deterministic checks run whatever the AI says | A fooled model can only push PASS on a *soft* constraint. Hard limits still hold. Eval suite 1 has ≥ 12 injection cases (target: 0 false captures). |
| T2 | **Cart swap**: the PayPal order differs from the approved cart | A1 | The three-way match against `GET /v2/checkout/orders/{id}` before the approval is issued, and again right before capture | Gate 3 evidence; sandbox scenario S5 |
| T3 | **Replay** of a purchase request or an approval | A1, A4 | Idempotency-Key on purchases; approval bound to order, authorization and payee; atomic `used_at`; `final_capture: true`; intent `max_purchases` | Unit test: second consume returns nothing; sandbox: a second capture on the same authorization is refused by PayPal |
| T4 | **Forged approval** (a caller supplies approval content) | A4 | Approvals exist only as DB rows inserted by the decision engine; the executor takes an ID and reads the row; agents have no write path | Test: no API route accepts approval fields |
| T5 | **Direct capture bypass** inside our code | A1 | Executor isolated in the worker (no port), branded `ConsumedApproval`, architecture import checker (`scripts/architecture-rules.ts`) CI rule, no capture/void routes | CI fails on a forbidden import; route-inventory test |
| T6 | **Forged webhook** sets state or fakes a capture | A1, A5 | `POST /v1/notifications/verify-webhook-signature` (**Verified** endpoint and fields) before storing; even verified events only trigger a **re-fetch** from PayPal | A forged event can at most cause an extra GET |
| T7 | **Duplicate or out-of-order webhooks** | A5 | Unique event ID; state chosen from fetched PayPal state; backward transitions are no-ops | Test: replaying an event log in shuffled order gives the same final states |
| T8 | **Over-capture** | A1 | Capture amount = the approval amount, explicit; never rely on PayPal's 115% default overage (**Verified**); one purchase unit per order | Test: the executor refuses if the re-GET amount differs from the approval |
| T9 | **Stale intent**: revoked, expired or superseded policy still used | A3 | The approval stores `intent_version` + `policy_digest` and must match the current CONFIRMED version at consume time; revoke voids open HOLDs | Test: revoke between approve and consume → no capture |
| T10 | **Agent edits its own policy** | A3 | Agent keys lack the `intent:*` scope; intents are immutable after confirm; the confirm call needs a shopper session | Test: agent key → 403 on intent routes |
| T11 | **Cross-tenant access** | All | Every query is scoped by `tenant_id` from the authenticated key (a repository-layer guard, not route code); payee check against the tenant | Test: tenant A's key can't read or act on tenant B's purchases |
| T12 | **HOLD approval hijack** | A1 | One-time token (192-bit), hashed at rest, bound to one purchase, 30-minute link lifetime (configurable, never past the 72 h auto-void), replaced on re-issue; decides once (same decision retried → recorded result, opposite → 409); the approve path re-runs the three-way match and only records an approval, capture is the executor's (ADR-0017) | `apps/api/test/holds-security.db.test.ts`: expired → 410, wrong purchase → 403, re-issued → 403, races → exactly one decision |
| T13 | **Secret leakage** in logs, evidence files or the repo | A2, A7 | Logger redaction plus a test; `.env` gitignored; secret scan in CI (gitleaks); PayPal secret only in the API and worker env groups, never in web | Stage 1 incident: credentials pasted into `.env.example`, removed, rotation recommended |
| T14 | **Compromised verifier model** (adversarial or garbage output) | A1 | Zod-validated outputs; any parse failure, refusal, timeout or low confidence → HOLD, never CAPTURE; the model sees no secrets and no tools | Eval: fault-injected model responses → 100% HOLD or REJECT |
| T15 | **Demo abuse** (judges or the public flood scenarios, burn credits, leave holds open) | A1, A7 | A demo key with a per-IP rate limit; scenarios run against the demo shopper's vault only; reset voids open authorizations; LLM and Channel3 spend alarms | Accept: sandbox money only |
| T16 | **Audit tampering** | A5 | Hash chain; DB trigger blocks UPDATE and DELETE; the app role is INSERT/SELECT; public `/verify` recomputes; the console shows the chain head | Someone with DB superuser could rewrite the chain. Mitigation on the cut list: periodically publish the chain head to an external place (for example a GitHub commit). |
| T17 | **Production host misconfiguration** | A1 | Exact-host sandbox guard (ADR-0001) in `packages/paypal` | Unit test |
| T18 | **Timeouts and partial failure** cause a double capture or a lost record | A1, A5 | Journal before the call; deterministic request ID; reconciler (architecture §8) | Failure drill in Stage 6 |

## Out of scope (stated in the README)

- An operator holding the PayPal secret (Witness protects against the agent, not the credential holder).
- Real-money and production deployment, PCI scope (no card data is handled; PayPal wallet only).
- PayPal's own adjudication of disputes. Sandbox verdicts are chosen by us.
