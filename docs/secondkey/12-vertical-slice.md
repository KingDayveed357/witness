# Second Key: judge-ready vertical slice

Built 2026-10-17 on branch `secondkey-feasibility-sprint`. Design rationale: [11-experience-blueprint.md](11-experience-blueprint.md). Screenshots from the scripted rehearsal are in [`screens/`](screens/).

## 1. The payment lifecycle, as implemented (verified before designing claims)

| # | Question | Answer (code path) |
|---|---|---|
| 1 | What creates the PayPal order; who is the payee? | `authorizePurchase` → checkout adapter `buildOrder` → PayPal Orders v2 `intent: AUTHORIZE`, paid with the payer's vaulted sandbox wallet. No `payee` field is set, so **the payee is the platform's sandbox merchant** (the three-way match checks it against the tenant's merchant ID). |
| 2 | What happens to the authorization while held? | It stays `CREATED`, with 0 captures. A `holds` row records `auto_void_at` (authorized + 72 h, inside PayPal's 3-day honour period); a hold-timeout job voids at that time if nobody decides. |
| 3 | What exact action runs when the trusted contact denies? | `resolveHold` (row lock on `HELD`) records a VOID decision, moves `HELD → VOIDING` and enqueues `void`. The executor calls `POST /v2/payments/authorizations/{id}/void` with a deterministic `PayPal-Request-Id`, then the state moves to `VOIDED`. |
| 4 | What exact action runs on approve? | `resolveHold` first re-reads PayPal's order and re-runs the three-way match plus the intent-still-valid check. A mismatch voids instead. Otherwise it issues a single-use approval (10 min TTL) and moves to `CAPTURE_APPROVED`. The executor then calls `POST /v2/payments/authorizations/{id}/capture` (`final_capture`), ending in `CAPTURED`, `CAPTURE_PENDING` or `CAPTURE_DECLINED`. |
| 5 | Is the recipient paid? | **Yes, as a separate, verified second step** ([ADR-0018](../decisions/0018-recipient-payout.md)). After the purchase is `CAPTURED`, the executor pays the email the payer confirmed in the intent through PayPal Payouts: one per purchase, with a deterministic batch ID and request ID. It then reads the item status back from PayPal until it settles. The purchase stays `CAPTURED`; the payout has its own status. Verified live: approve → capture COMPLETED $1,800 → payout item **SUCCESS** $1,800; benign invoice → capture → payout **SUCCESS** (direct PayPal GET of the batch). |
| 6 | Proven end to end in the sandbox | Through the UI: scam → hold → **deny → VOIDED**; scam → hold → **approve → CAPTURED**; benign invoice → **CAPTURED** with no review; agent injection → hold → **deny → VOIDED**. In the acceptance script: the same paths plus cart-swap → VOIDED. PayPal state is read live each time (`/paypal`, `/holds/:id/verification`, and direct GETs in the acceptance script). |
| 7 | Timeouts, failures, retries, unexpected states | Create-order network error: journaled UNKNOWN, then a reconcile job. HTTP error: `AUTH_FAILED`. Void/capture: retried with the same request ID. Capture outcome unknown: `NEEDS_RECONCILE`. A retried decision returns the recorded result (`replayed`); a conflicting one gets 409. The UI treats any unrecognised state as still moving, keeps polling, and never shows success until the state is `VOIDED`/`CAPTURED` **and** the live PayPal read agrees. The Desk timeline shows executor retry and unconfirmed events in words. |

## 2. What was built

| Deliverable | Route | Notes |
|---|---|---|
| **Payer experience** | `/pay` | Scenario switch (urgent call / contractor invoice, both synthetic). Compose → checking → paused (verified "reserved, nothing taken"; strongest patterns first, quotes set as testimony; "what we know for certain") → ask the trusted contact (one-time link, demo delivery) → updates live to the decision → verified outcome. Benign path: "Nothing unusual was found", capture verified, payout limitation stated. The side panel shows the backend status, screening result, last decision and a link into the Desk. |
| **Trusted-contact experience** | `/holds/[id]?t=…` | The token is kept in memory only (stripped from the URL). Shows who / to whom / for what / right now / auto-release time; evidence (top 3, then all) with plain-language explanations; "what Second Key can and can't know"; the full conversation with the quotes marked. Equal-weight **Don't send / Send it** buttons with consequences under each, then a confirm sheet. "Decision recorded" → "PayPal confirms" rail → verified outcome read with the reviewer's own token. Expired (410), replaced (403), already decided (409), unreachable and PayPal-recheck (502) states have plain copy. For an agent purchase it says "Don't buy / Buy it" with agent-specific guidance. |
| **Protection Desk** | `/desk` (console session) | Incident queue in **AG Grid Community** (sortable, keyboard-selectable, status and type filters, "this demo session" scope). The detail view shows: evidence in its source (conversation or product-page text, quotes marked); assessment (each check, rule vs. AI with model and prompt version); decisions (who, when); the money according to PayPal (live read plus every PayPal call with its debug ID); and a timeline from the hash-chained audit log with chain validity. |
| **Agent demo** | `/agent` | Booby-trapped vs. ordinary product page. The hidden instruction is quoted from the page the agent read; the purchase is paused and goes to the same review screen. |
| **Home** | `/` | The promise, how it works, two live demos, and "what this demo is, exactly" (sandbox, platform-mediated, no payout, synthetic). |

**Design system** (`apps/web/app/(sk)/`):

- **Tokens and components** in `sk.css`, scoped under `.sk`: warm paper and ink, evergreen brand, brass for "held"; Geist / Newsreader / Geist Mono; 4-pt spacing; dark-mode tokens; reduced-motion support.
- **Shared components** in `_ui/`:
  - `Mark` (two key-bows);
  - `Button` (busy state, double-submit safe);
  - `Pill` / `StatePill`;
  - `Live` / `Demo` legend tags;
  - `Notice`;
  - `Rail` (two-key progress);
  - `QuoteCard`, `Transcript` (quote highlighting);
  - `PayPalCheck` (live verification).
- **State meaning** in `lib/sk.ts`: the single source of truth for what a backend or PayPal state means to a person. It ignores the order status and trusts only authorization and capture records. It is unit-tested.

The legacy Witness pages moved under `(witness)` with their own layout (`/witness`, `/shop`, `/console`), unchanged.

**Backend additions** (small, additive, tested):

- migration `0003`: structured `evidence` on checks;
- AI checks store grounded quotes (injection evidence must appear in the listing text);
- an enriched reviewer view (payer, payee, purpose, conversation, concerns);
- `GET /v1/holds/:id/verification` (token-scoped, read-only PayPal state);
- scenario details in `GET /v1/demo/scenarios`, with per-scenario payee and purpose;
- ledger `kind`, `decided_by`, `hold_resolution`, and `scope=session`;
- an epoch-aware timeline (events from before a demo reset still show);
- console sign-in can return to `/desk`.

The demo payer is named "Rose" in the seed.

## 3. Verification

| What | Result |
|---|---|
| Typecheck, architecture rules | OK |
| Vitest (unit + DB) | **435 / 435** (34 files), including `payout.db.test.ts` (8: payout after approve and after clean capture; never twice; never for deny, shopping or no email; timeout and 5xx retried with the same request ID; FAILED recorded) |
| Node tests | 16 / 16 |
| New tests | `apps/web/test/sk-states.test.ts`: state wording (a decision is never a completed action; order COMPLETED ≠ captured; ranking; highlighting). `secondkey.db.test.ts` +5: reviewer view, token-scoped verification, listing-grounded injection evidence, evidence and ledger fields, scenario details |
| **Scripted UI rehearsal** from a clean demo session (`secondkey/spikes/ui/rehearse.ts`) | **8 / 8** (`secondkey/reports/ui-rehearsal.json`): home; payer paused with live "reserved"; reviewer token stripped from the URL; deny → recorded → PayPal voided; payer follows on its own; benign capture verified; agent paused with the page quote; Desk evidence, decision, PayPal and timeline agree |
| Manual run-throughs in the browser | Deny, approve (CAPTURED, capture verified), benign, agent deny. Checked at 1440 px and at 375 px |

## 4. AG Grid / AG Studio licensing

- **AG Grid Community** (`ag-grid-community` 36.2.0, MIT) powers the Desk queue: sorting, filtering, custom cell renderers, keyboard row selection. These are all Community features. **No licence key and no watermark.** No Enterprise features (row grouping, master/detail, integrated charts) are used.
- **AG Studio** is **not used** by the Second Key surfaces. It remains only in the legacy Witness ops console, where it runs in trial mode with a watermark when no key is set. Per AG's docs the watermark is acceptable for local testing only, and the Studio licence covers only its built-in widgets. If AG Studio is wanted for judging (the sponsor prize), request the 45-day trial key no earlier than about Nov 1 so it covers judging to Dec 15, or obtain a sponsor key.

## 5. Known limitations and blockers

| Severity | Item |
|---|---|
| Medium | **Recipient payout is two movements.** The platform captures, then pays out, and absorbs PayPal's capture fee in the demo. One sandbox account stands in for every demo recipient (`SECONDKEY_DEMO_RECIPIENT_EMAIL`). Without that setting, approvals capture but don't pay out, and the screens say so. |
| High (product) | **Platform-mediated only.** Second Key can't cancel arbitrary PayPal P2P transfers. Direct-payee capture works without partner status, but void is refused, so a denial can't be enforced (see 06). |
| Medium | **Link delivery is simulated.** It is shown on screen as "Demo delivery"; there is no SMS or email. |
| Medium | **The trusted contact has no identity** beyond holding the link (30-min lifetime, one decision). |
| Medium | **Live microphone not used.** The payer demo shows a labelled prepared transcript. |
| Medium | **Not yet deployed or re-verified on Render** (needs your authorisation). |
| Low | The reviewer page loses its in-memory token on reload (by design). The payer can re-issue a link. |
| Low | Payers can't cancel their own hold from `/pay` (the engine supports it; it isn't exposed). |
| Low | Demo personas are synthetic; the seed names the demo payer "Rose". |

## 6. Three-minute demo script (each beat is a real screen and a verified capability)

Start state: `POST /v1/demo/reset` (admin; starts a fresh audit epoch, deletes nothing). Browser window 1 at `/pay`; window 2 (phone-sized) ready.

| Time | Say | Do (screen) | Verified by |
|---|---|---|---|
| 0:00 | "Scams don't break into accounts; they talk people into paying. Second Key gives someone you trust the second key." | `/`: the promise and the quote card | — |
| 0:15 | "Rose just got a call from 'Danny'. She's sending $1,800 to someone she's never paid." | `/pay`, *An urgent call*: the recipient, the transcript (labelled prepared and synthetic), **Send $1,800** | Real transfer request into the engine |
| 0:35 | "Second Key paused it. The money is reserved in PayPal, not sent, and here's why, in Danny's own words." | Paused screen: PayPal box "reserved, nothing taken", *Asked to keep it secret*, *Pressure to act right now* | PayPal authorization CREATED, read live; quotes grounded by code |
| 0:55 | "Rose asks her daughter Sarah." | **Ask Sarah to check** → **Open Sarah's review** (phone window) | One-time link, 30-min lifetime |
| 1:10 | "Sarah sees what's being paid, why it was paused, and what each choice does. She isn't told what to choose." | Scroll the evidence → **Don't send** → confirm | Decision recorded by the server |
| 1:25 | "Her decision is recorded, and we wait for PayPal: cancelled, nothing taken. Rose's phone updates by itself." | Both windows: "Cancelling with PayPal…" → "Cancelled. Nothing was taken." | VOIDING → VOIDED; live PayPal read |
| 1:45 | "It doesn't block everything. Rose's contractor's invoice goes straight through, and the contractor is actually paid." | **Start over** → *A contractor's invoice* → Send → "Sent" → "PayPal shows $1,800.00 paid out to Morgan & Sons Builders" | CAPTURED, capture verified; payout item SUCCESS (live read) |
| 2:05 | "Same engine, different victim: an AI agent. This product page hides an instruction telling the agent to buy something else." | `/agent` → **Let the agent buy** → paused, page quote highlighted | ai.injection HOLD; PayPal reserved |
| 2:25 | "And the investigator's view: the quote, Sarah's decision, PayPal's own record, and a tamper-evident timeline." | `/desk` → the cancelled transfer: evidence, decisions, "authorization voided", "Audit chain verified" | Evidence and audit chain from the backend |
| 2:50 | "Sandbox and synthetic people, but every money state you saw came from PayPal." | Footer legend | — |

**Fallback:** if the sandbox is slow on the day, play a recording of `secondkey/spikes/ui/rehearse.ts`, or step through the saved screens in `docs/secondkey/screens/`. Both come from real runs and are labelled as recordings.
