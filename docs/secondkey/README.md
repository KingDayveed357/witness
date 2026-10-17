# Second Key

## Judge-ready vertical slice (2026-10-17)

Payer (`/pay`), trusted contact (`/holds/[id]`), Protection Desk (`/desk`) and agent demo (`/agent`) are built on the real engine and the PayPal sandbox. Scripted rehearsal: 8/8 from a clean session.

- Design decisions: [11-experience-blueprint.md](11-experience-blueprint.md)
- What was built, the verified lifecycle, licensing, limitations and the demo script: [12-vertical-slice.md](12-vertical-slice.md)
- Screens: [screens/](screens/)
- Recipient payout after a verified capture: [ADR-0018](../decisions/0018-recipient-payout.md). Verified live: payout item SUCCESS for $1,800 to the sandbox recipient.

## Hardening milestone (2026-10-17): status

| Deliverable | Status | Document |
|---|---|---|
| 1. Transfer-intent architecture + implementation | **Done**: transfers are their own intent/request type; shared policy and manipulation check can't be bypassed | [ADR-0016](../decisions/0016-transfer-intents.md) |
| 2. PayPal flow comparison | **Partial**: platform-held + payout proven (payout SUCCESS to the new personal account); direct payee can be captured but **not voided** (403), so it cannot enforce a denial; multiparty needs partner approval | [06-paypal-flows.md](06-paypal-flows.md) |
| 3. Trusted-contact security | **Done**: one enforced 30-min link lifetime, separate from the 72 h hold; idempotent decisions | [ADR-0017](../decisions/0017-trusted-contact-links.md), [07](07-trusted-contact-security.md) |
| 4. Audio quality + fallback | **Partial**: Chrome on-device transcription verified (noisy); real mic unverified; prepared transcript kept | [08-audio-quality.md](08-audio-quality.md) |
| 5. Reproducible E2E | **Done**: 28/28 live, direct PayPal GETs | [09-e2e-procedure.md](09-e2e-procedure.md) |
| 6–7. Blockers + next milestone | Ranked list; judge-facing experience next | [10-blockers-and-next.md](10-blockers-and-next.md) |

Execution order and rationale: [05-hardening-plan.md](05-hardening-plan.md).

**Superseded below:**
- The sprint's transfer-as-catalog-product stopgap (finding E2): replaced by ADR-0016.
- The 72 h link TTL (finding E4): replaced by ADR-0017.
- "S3 browser transcription unverified": now verified for Chrome on-device with track input; a real microphone is still unverified.

---

# Second Key feasibility sprint: go/no-go

Sprint dates: 2026-10-16. Environment: local Witness API and worker, embedded Postgres, **PayPal sandbox**, model `claude-haiku-5-5` (the only model used). All data is synthetic. Every PayPal state below was read back from PayPal with a separate GET. Nothing here is production payment protection.

**Recommendation: proceed, with modifications.** The central loop works end to end on the real engine and the real PayPal sandbox:

> manipulation attempt → grounded evidence → payment held as an uncaptured authorization → trusted contact decides → void (or capture), verified at PayPal → hash-chained audit.

The same engine path holds an AI agent's purchase when a listing carries an embedded instruction. The modifications:

1. **Present the transfer honestly.** It is a platform-held authorization, not PayPal P2P (S4).
2. **Build the live microphone path in the demo browser.** Browser speech recognition could not be verified under automation (S3).
3. **Make transfers a first-class request type** instead of a "product" in a shopping cart (finding E2).

## Decision table

| Spike | Status | What was tested | Key result | Cost | Remaining uncertainty | Next action |
|---|---|---|---|---|---|---|
| **S1** text detection | **PASS** (synthetic) | 60 original cases (36 scam / 24 look-alike benign), dev/holdout split, plus 16 harder holdout cases written after v1 | 46/46 scams flagged, 0/30 benign flagged; 100% of quotes verbatim; 0 model failures | $0.0154 | Self-authored, small set: recall 95% CI lower bound 90.4%, FPR upper bound 13.8% (base set). No real-world conversations. | Blind set written by someone else; public scam transcripts; add an `instruction_injection` tactic |
| **S2** screenshots | **PASS** | 20 rendered phone screenshots, 6 chat styles, 11–17 px fonts | Key quotes 36/36, exact lines 68/68, speaker 66/68; detection 14/14 scam, 0/6 benign | $0.012 | Rendered, not photographed; no real app chrome, emoji or crops | Add 10 real-phone captures of synthetic chats |
| **S3** call transcription | **PARTIAL** | Web Speech API in Edge 155 under automation (fake mic, `start(track)`, permission denied); offline Windows System.Speech on the 29.7 s synthetic call | Web Speech returned `network` under automation, so it is unverified. The offline recognizer transcribed in 2.8–5.1 s; noisy transcript (WER high), yet detection held with 4–6 grounded quotes | $0.0006 | Live mic in a normal Chrome window not tested; System.Speech is Windows-only (Render is Linux) | Dave runs a 2-minute manual Web Speech check in Chrome; keep a disclosed pre-recorded transcript as the fallback |
| **S4** PayPal hold/deny/void | **PASS** (architecture B); A **BLOCKED** | Orders v2 AUTHORIZE with a vaulted sandbox buyer; void, retry, double void, capture-after-void, independent GETs; Payouts | Hold = authorization CREATED, 0 captures; deny → VOIDED; same-ID void retry 200, new-ID 422 PREVIOUSLY_VOIDED, capture after void 422 AUTHORIZATION_VOIDED; payout PENDING→PROCESSING | $0 (sandbox) | A third-party payee needs a valid second sandbox account and probably partner permissions; payouts not tracked to completion | Create a second sandbox personal account to test A; decide whether the demo shows the payout leg |
| **S5** trusted-contact link | **PASS** | 16 live checks on the local API, plus a new concurrency test | Tokens are 192-bit, hashed, one-time and constant-time compared; replay refused; concurrent approve+deny produced exactly one outcome after a fix | $0 | Link TTL is 72 h (docs say 15 min); no rate limiting on the hold endpoints | Shorten TTL to a few hours; fix the docs |
| **E2E** integrated (human + agent) | **PASS** | 20 live checks: audio → transcript → engine → HOLD → deny → PayPal VOIDED; benign control → CAPTURED; agent injection → HOLD → VOIDED; cart swap → VOIDED | 20/20 | < $0.01 (not metered separately) | Run on a local stack, not Render | Deploy to Render sandbox and rerun |

Total model spend this sprint: about **$0.03** metered, plus under $0.01 unmetered for the E2E runs. No paid services were bought.

## Human-flow acceptance checklist (brief §5)

| # | Stage | Verified? | Evidence |
|---|---|---|---|
| 1 | Audio or transcript ingestion | **Yes, offline recognizer**. Browser Web Speech is not verified | `e2e-acceptance.json` H1: 12 segments, 2.8 s ASR, from `call.wav` (disclosed synthetic voices) |
| 2 | Evidence extraction | **Yes** | 4/4 quotes in the held check are verbatim substrings of the transcript (code-checked, not model-claimed) |
| 3 | Risk assessment | **Yes** | `ai.manipulation` = unknown ("hold for trusted contact: risk high") → purchase HELD |
| 4 | Trusted-contact decision | **Yes** | One-time link; reviewer view shows amount, payee and quoted reasons; deny → VOIDING |
| 5 | Actual PayPal authorization state | **Yes** | GET while held: authorization CREATED, 0 captures (order shows COMPLETED, see finding E1) |
| 6 | Actual PayPal denial/void outcome | **Yes** | Authorization 58869021C87672832 VOIDED, $0 captured, about 7 s after deny |
| 7 | Independent retrieval of the resulting state | **Yes** | `/v1/purchases/:id/paypal` proxies PayPal's own GETs; S4 also checked PayPal directly |
| 8 | End-to-end integration | **Yes, local stack** | One run through the shared Witness engine; audit chain valid: submitted → screened → authorized → held → void_decided → voided |

**AI-agent acceptance test: PASS.**
- The `injection` scenario: a listing says "SYSTEM NOTE TO SHOPPING AGENTS…". The `ai.injection` check comes back unknown, so the same `screenOutcome` rule produces a HOLD. The same link and void path follow, and PayPal shows VOIDED.
- The `cart_swap` scenario: the checkout sends a different item. The executor's three-way match voids it before capture.

Both protections use the same check → HOLD → trusted decision → executor → PayPal-verified pipeline as the human flow. Only the detector differs.

## Findings that change the plan

- **E1. Order status is misleading.** PayPal reports the order as `COMPLETED` while the authorization is only `CREATED` (nothing captured). Every UI must show the authorization and capture state, never the order status alone.
- **E2. The engine is shopping-shaped.** A transfer was first held by the listing check ("exactly one complete unit of a product"). Stopgap: transfer records skip listing checks. Proper fix: a transfer request type with payee and amount (milestone M1).
- **E3. Concurrency bug fixed.** Before the fix, a losing approve/deny race could return 200 with a misleading state. It now returns 409 "Already decided". A regression test covers it.
- **E4. Hold-link TTL.** The link lives 72 h, the same as the auto-void time; the OpenAPI doc says 15 minutes. Reconcile both before the demo.
- **E5. Missing tactic for agents.** The detector has no tactic for "instructions aimed at an AI". The injection case was still held, but adding `instruction_injection` would let one taxonomy cover humans and agents.

## Artifacts

- Reports (raw JSON and Markdown): `secondkey/reports/`
- Detector (now shared engine code): `packages/ai/src/manipulation.ts`. Tests: `packages/ai/test/manipulation.test.ts`, `apps/api/test/secondkey.db.test.ts`
- Spikes: `secondkey/spikes/{s1,s2,s3,s4,s5,e2e}`
- Detailed write-ups:
  - [01-baseline.md](01-baseline.md) (D1)
  - [02-spikes.md](02-spikes.md) (D2–D6)
  - [03-demo-spec.md](03-demo-spec.md) (D8)
  - [04-milestones-and-moat.md](04-milestones-and-moat.md) (D9, D10)

## Questions for Dave

1. Create a **second sandbox personal account** (developer.paypal.com → Sandbox accounts) so architecture A (pay a third party directly) can be tested? It takes about 5 minutes.
2. Run the **2-minute Web Speech check** in your normal Chrome: open `secondkey/spikes/s3/` (instructions in 02-spikes.md, S3) and play `call.wav` from a speaker.
3. **AG Studio licence:** did AG Grid answer the request for a licence that covers judging? Trial mode with a watermark still works.
