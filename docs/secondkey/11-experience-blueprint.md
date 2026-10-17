# Second Key: Experience Blueprint

Status: decided 2026-10-17, before building any UI. This records the decisions and why they were made. It is not a theory document.

## 1. Promise

**"When someone is pressuring you to pay, a person you trust holds the second key."**

The person (or AI agent) has technically authorized the payment, but may have been manipulated into it. Second Key pauses the payment while the money is reserved but not taken. It shows the trusted contact the exact words that look like pressure, and lets *them* decide. Nothing is cancelled or completed until PayPal confirms it, and every claim on screen is backed by a verified state.

## 2. People

| Persona | Situation | Goal | Anxieties | Needs | Tech level |
|---|---|---|---|---|---|
| **Rose, the payer** (synthetic, 78, competent, not frail) | A distressed call; she is about to send $1,800 | Help her grandson, fast | Being foolish; disappointing family; losing money; "is the money gone?" | Large type, plain words, no blame, one clear next step, certainty about where the money is | Uses a banking app; doesn't know what an "authorization" is |
| **Sarah, the trusted contact** (daughter) | Gets a link at work, on her phone | Decide correctly in two minutes | Overriding her mother unfairly; acting on false alarms; "did my tap do anything?" | Who, what, why, the exact evidence, what each button does, confirmation it worked | Any |
| **Investigator / platform reviewer / judge** | After the fact, or a demo | Reconstruct what happened and prove it | Trusting a UI that lies; missing a failure | Original evidence in context, the decision and who made it, PayPal's own state, the audit trail | High |

## 3. Journeys and states (all from real backend states)

**Payer.**

1. **Compose.** Payee, amount and the conversation that prompted the payment.
2. **Checking.** Shown while the engine moves `SCREENING → AUTHORIZING → VERIFYING`.
3. Then one of three outcomes:
   - **Paused** (`HELD`): money reserved, not sent (PayPal authorization `CREATED`, 0 captures).
   - **Sent** (`CAPTURED`): verified capture.
   - **Not sent** (`REJECTED`): policy refused it; PayPal was never called.
4. From **Paused**: "Ask Sarah" issues a one-time link, then waits.
5. **Sarah decided** (the decision is recorded). Then **Cancelling** (`VOIDING`) → **Cancelled** (`VOIDED`, verified), or **Completing** (`CAPTURE_APPROVED`/`CAPTURE_PENDING`) → **Sent** (`CAPTURED`, verified).
6. Failures shown honestly: auth failed, `NEEDS_RECONCILE` ("we're confirming with PayPal"), timeout.

**Trusted contact.** Open link, then:

- **Review** (`HELD`): evidence, conversation and consequences.
- **Confirm sheet**, then **Decision recorded** (200, or `replayed`), then **Waiting for PayPal** (`VOIDING`/`CAPTURE_*`), then **Verified outcome** (`VOIDED`/`CAPTURED`, plus a live PayPal read).
- Error states: **Expired** (410), **Replaced** (403), **Already decided** (409, with what was decided), **Unreachable** (retry is safe).

**Desk.** Sign in, then the **incident queue**. Selecting an incident shows:

- the evidence in its source (conversation or product listing);
- the assessment (each check, deterministic vs. AI);
- the decision (who, when);
- the payment as PayPal reports it (live read);
- the timeline (hash-chained audit events, chain validity).

## 4. Information architecture

| Route | Experience | Access |
|---|---|---|
| `/` | Second Key home: the promise, how it works, and the two live demos (payer; AI agent). The verified/simulated legend lives here | Public (demo key server-side) |
| `/pay` | **Payer** (Rose's phone) | Public demo |
| `/holds/[id]?t=…` | **Trusted contact** (Sarah's phone). Same URL the API issues | One-time token only |
| `/desk` | **Protection Desk** | Console session (ops key server-side) |
| `/witness`, `/shop`, `/console` | Legacy Witness surfaces, kept working, own layout | unchanged |

There is no global dashboard. Each person lands where their job is.

## 5. Visual concept: "the second signature"

- **Concept:** two keys turning together. The brand mark is two key-bows side by side, one outlined (the payer) and one solid (the trusted person). The same pairing recurs as the "two-step" status indicator: *your decision*, then *PayPal's confirmation*.
- **Type:**
  - **Geist** for the interface: neutral, precise, modern.
  - **Newsreader** (serif) for *what people said*: quotes are set like testimony, visibly different from system text.
  - **Geist Mono** for references (authorization IDs, hashes).
- **Colour.** Warm paper and ink, not cold "security" blue or alarm red.
  - Ink `#16181d` on paper `#f7f5f0`; surface white.
  - Brand: deep evergreen `#0f3b36`.
  - **Brass** `#9a6a14` marks "held / needs a second key". It signals concern, not alarm.
  - Verified: moss `#2e6b3e`. Failed: brick `#a3402e`, used only for real failures, never to label a person a scammer.
  - Dark-mode tokens are defined.
- **Shape and space.** 4-pt spacing scale. Generous whitespace; 14–16 px radius on cards, full pills for states. Hairline borders, no drop-shadow stacks, no gradients, no glow.
- **Motion.** Only for cause and effect:
  - the status rail advances when the backend state changes;
  - the confirm sheet slides from its button;
  - a quote highlights in the transcript when its evidence card is focused.

  `prefers-reduced-motion` turns all of it off.
- **Accessibility.**
  - Body text 17 px on the payer and reviewer screens (16 px on the Desk), contrast ≥ 4.5:1, 48 px touch targets on phones.
  - Visible focus rings, logical heading order, `aria-live` for state changes.
  - Every action is reachable by keyboard; no colour-only meaning (every state has a word).

## 6. Language rules (truthfulness)

| Never say | Say |
|---|---|
| "Scam detected", "fraud", "you are being scammed" | "This conversation has patterns common in scams" |
| "Your money is safe" | "$1,800 is reserved, not sent. Nothing has been taken" (only when PayPal shows authorization CREATED and 0 captures) |
| "Cancelled" on tap | "Your decision is recorded. Cancelling with PayPal…" until `VOIDED`, then "PayPal confirms: cancelled, $0 taken" |
| "Second Key holds your money" | "PayPal is holding an authorization. Second Key decides whether it is completed or released" |
| "Sent to J. Morgan" on approve | "PayPal shows $1,800 captured", then, only when the payout item is SUCCESS, "PayPal shows $1,800 paid out to J. Morgan" (ADR-0018) |
| Confidence percentages | Words: "clear", "unclear in places" |
| Quotes from audio as exact words | "Heard as (automatic transcript)" when the source is a machine transcript |

Every screen carries a quiet legend: **● Live sandbox** marks a state read from the real backend or PayPal sandbox; **◌ Demo data** marks synthetic people, conversations and delivery (the link shown on screen instead of an SMS).

## 7. Capabilities

| Capability | Status | Used where |
|---|---|---|
| Transfer intents, screening, manipulation check, HOLD | **Verified** (sandbox E2E) | Payer, Desk |
| One-time reviewer link, 30-min lifetime, idempotent decisions | **Verified** | Reviewer |
| Deny → executor void → PayPal VOIDED (direct GET) | **Verified** | Payer, Reviewer, Desk |
| Approve → re-check → executor capture → PayPal CAPTURED | **Verified** | Payer, Reviewer, Desk |
| Benign transfer → captured without review | **Verified** | Payer |
| AI agent: listing injection → HOLD → same review → void | **Verified** | Home (agent demo), Reviewer, Desk |
| Payout to the recipient after capture | **Verified** (added after this blueprint, ADR-0018) | Payer, Reviewer, Desk: shown as a separate step, "paid out" only on a SUCCESS item |
| SMS/email delivery of the link | **Not built** | Link shown on screen, labelled "demo delivery" |
| Live microphone transcription | **Not proven**; prepared transcript used | Labelled "prepared transcript of a synthetic call" |
| Payer cancelling their own hold | Engine supports it (signed-in shopper); not exposed in this slice | Not shown |

**Backend additions needed (small, additive, tested):**

1. **Structured evidence on checks** (`evidence` jsonb, migration 0003). The AI checks store their grounded quotes as data, so the UI never parses strings.
2. **Reviewer view enriched:** payer name, payee, purpose, kind, conversation, structured concerns.
3. **Read-only token-scoped verification** `GET /v1/holds/:id/verification`, so the reviewer can see PayPal's own state.
4. **Scenario details** (conversation, payee, amount) in `GET /v1/demo/scenarios`.
5. **Ledger kind and decision.** The incident queue knows human vs. agent, and who decided.

## 8. The three-minute demo (screens ↔ verified capability)

| Time | Beat | Screen | Proven by |
|---|---|---|---|
| 0:00 | "Payments made under pressure can't be undone. Here's a second key." | `/` | — |
| 0:15 | Rose's phone: the call transcript and a $1,800 payment to a new payee. She taps Send | `/pay` | Real transfer request |
| 0:35 | "Paused: $1,800 reserved, not sent", with three quoted patterns | `/pay` | HELD + PayPal authorization CREATED |
| 0:55 | Rose taps "Ask Sarah to check"; Sarah's phone opens the link | `/pay` → `/holds/…` | One-time link |
| 1:10 | Sarah reads the evidence and consequences, then taps Don't send → confirm | `/holds/…` | Decision recorded |
| 1:25 | Both phones: "Cancelling with PayPal…" → "PayPal confirms: cancelled, $0 taken" | both | VOIDING → VOIDED, live GET |
| 1:45 | Contrast: a contractor's invoice goes straight through, verified capture | `/pay` | CAPTURED |
| 2:05 | The same safety for an AI agent: a hidden instruction in a product listing → paused → same review | `/` agent demo → `/holds/…` | ai.injection HOLD |
| 2:30 | Protection Desk: the incident traced from the quote, to Sarah's decision, to PayPal's VOIDED, to the hash-chained timeline | `/desk` | Evidence, audit chain |
| 2:50 | "Sandbox, synthetic people, real PayPal states." | — | — |

## 9. Phases and acceptance criteria

1. **Backend additions** (§7), with tests. *Accept:* unit + DB tests green; no change to existing behaviour.
2. **Design system + payer + reviewer.** *Accept:* the full denial flow works against the live sandbox from the UI; every state in §3 renders, including expired, replaced, conflict and replay; keyboard-only run-through works.
3. **Desk.** *Accept:* an incident can be traced from evidence → decision → PayPal state → audit chain, and it agrees with backend records.
4. **Approve, benign and agent paths.** *Accept:* each verified separately; payout shown as not part of the flow.
5. **Polish and rehearsal.** *Accept:* screenshots at 390 px and 1440 px; no placeholder copy or dead controls; reduced motion respected; the demo runs clean from a fresh start.

AG Grid **Community** (MIT, already a dependency) is used for the Desk's incident queue only, where sorting and filtering many rows earns its place. AG Studio (licence needed for judging) is not used in Second Key.
