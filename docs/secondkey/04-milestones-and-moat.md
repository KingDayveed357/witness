# D9. Next implementation milestones

These are ordered by the risk they remove. Dates assume the Nov 12 deadline. Each milestone ends with a live sandbox rerun of `secondkey/spikes/e2e/acceptance.ts`.

| # | Milestone | Why | Done when | Est. |
|---|---|---|---|---|
| **M0** | Dave's three checks: second sandbox account, manual Web Speech check in Chrome, AG licence answer | Unblocks S3 and architecture A; settles the AG plan | Results recorded in the README | 0.5 day (Dave) |
| **M1** | **Transfer request type**: `POST /v1/transfers {payee, amount, conversation?, channel}`, a transfer policy (cap, payee novelty), no listing checks | Removes the shopping-cart stopgap (E2); gives the demo honest objects | Scam/benign/outage tests pass on the new type; old scenarios unchanged | 2 days |
| **M2** | **Reviewer identity**: invite a trusted contact (email/SMS link in the sandbox; on-screen QR in the demo), link TTL 4 h, rate limit on `/v1/holds/*`, docs corrected | Closes S5 open items (E4) | Tests for expiry, rate limit, wrong reviewer | 1.5 days |
| **M3** | **Consumer screen + reviewer screen** (D8 A/B) on the existing Next.js app: transcript stream (live Web Speech, or the disclosed recorded fallback), QuoteCards, PaymentStateChip | The core 2-minute story | A judge can run it from a URL, phone-sized | 3 days |
| **M4** | **Detector v2**: add `instruction_injection`, sharpen impersonation of institutions and existing-thread BEC; blind set of 40 cases written by someone else; rerun S1 with fixed thresholds | Removes the "self-authored" caveat; one taxonomy for humans and agents | Blind-set recall and FPR reported with CIs; no regression on S1 | 2 days |
| **M5** | **Protection Desk** (AG Grid Community) + AG Studio "Tactic trends" and "Evidence analyst" agent | Continuous evaluation, sponsor fit | Desk lists evaluation + live incidents with outcome mismatches | 2.5 days |
| **M6** | **Render deploy (sandbox)** + rerun all acceptance tests against the deployed URL | Brief: don't assume Render matches local | E2E 20/20 against Render | 1 day (needs Dave's go-ahead) |
| **M7** | Approve path shows the payout leg (Payouts → recipient), labelled; optional architecture A if M0 unblocks it | Completes the money story | Payout batch reaches `SUCCESS` in the sandbox, or is clearly shown as pending | 1 day |
| **M8** | Polish, a recorded 3-minute video, README for judges | Submission | Video + links | 2 days |

Total is about 15 working days against about 19 left. M5 and M7 are the first to cut if needed.

---

# D10. Product and moat implications

## What the sprint demonstrated

1. **Explainable, quote-grounded detection is cheap and fast enough to sit in a payment flow.**
   - About $0.0002 and 2.4 s p50 per conversation on Haiku.
   - Every quote shown to a reviewer is checked in code against the source.
   - That is the difference between an alarm and evidence a family member can act on.
2. **"Pause, don't block" can be enforced with existing rails.** PayPal's authorize → void/capture gives a real, reversible hold, verified at PayPal. No new financial primitive is needed for a platform-held flow.
3. **One engine protects two kinds of manipulated decision.** Human scams and AI-agent prompt injection end in the same check → HOLD → independent decision → verified outcome. That is the infrastructure claim, now shown in code rather than slides.

## Where defensibility can come from (and what's not a moat)

- **Not a moat:** the prompt, the model, or the UI. Anyone can call an LLM on a transcript.
- **Plausible moats, in order of strength:**
  1. **Outcome-labelled incident data.** Each hold produces a labelled example: the conversation pattern, the reviewer's decision, and the payment outcome. Detection improves with volume, and reviewer decisions give ground truth that banks' after-the-fact fraud labels lack. The Protection Desk is the instrument that collects it.
  2. **The enforcement integration.** Being the pre-send gate inside a payment provider (architecture C) is sticky: risk, compliance and UX teams sign off once. The deterministic, audited, fail-closed design is what such a team needs to approve it.
  3. **The trusted-contact network.** Invited reviewers are a distribution loop, and they create switching costs for families.
  4. **Regulatory pull.** The UK requires reimbursement of authorised push payment (APP) fraud (61% of £576M reimbursed). Australia's Scams Prevention Framework (2025) puts obligations on banks and platforms. Documented "reasonable steps" with an audit trail become worth paying for.

## Potential customers (hypotheses; none validated with a customer yet)

| Segment | Pain | Why they might buy | Unvalidated questions |
|---|---|---|---|
| P2P/wallet providers (PayPal, Venmo, Zelle banks) | APP scam losses, reimbursement rules, brand damage | Pre-send gate with evidence + audit | Will they let a third party see conversation context? Latency budget at send time? |
| Banks serving older customers | Elder fraud, regulator scrutiny | Trusted-contact concepts already exist in finance (e.g. FINRA Rule 4512 for brokerages) but have no evidence layer at payment time | Procurement cycle; on-premises model requirements |
| AI-agent platforms with payments | Prompt-injected purchases | Same engine, a hold instead of a blind charge | Do agent builders pay for safety before regulators require it? |
| Caregiver services (Carefull, EverSafe class) | They alert *after* money moves | Moves them before the payment | Partnership versus competition |

## Commercial questions that still need customer validation

1. Will payers (or their families) consent to sharing call or chat content at the moment of payment? This is a privacy and consent design question, not a technical one.
2. Would a provider accept a 3–6 s pause on flagged sends only? The detector only needs to run on risky sends (new payee, large amount).
3. Who pays: the provider (loss reduction), the family (subscription), or both?
4. Liability when Second Key does *not* flag a scam. The positioning must stay "a second key held by someone you trust", not a guarantee.
