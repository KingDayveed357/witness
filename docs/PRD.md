# Witness PRD

Status: **Draft for Checkpoint 2** · Owner: Dave · 2026-10-11 · Supersedes nothing; BRIEF.md remains the thesis.

## 1. Problem

AI agents now buy things for people while nobody watches the cart (AP2's human-not-present mode). Nothing independent checks that the cart an agent built is what the person asked for. When it's wrong (a misread intent, a prompt injection on a product page, or a checkout that sends PayPal a different order than was agreed), the **merchant of record pays**: refund, dispute fee, and lost goods. Payment rails record *that* money moved, never *why*.

**Evidence we have:** Stage 1 showed that PayPal lets a platform authorize with the buyer absent, capture an explicit amount, void, and detect a same-price SKU swap on PayPal's own record (`docs/spike-results.md`).
**Inference to validate with users:** the cost of a dispute relative to order value. The brief's "over twice the order" figure needs a cited source before it goes on a slide (**Unknown**).

## 2. Users

| User | Job to be done | What they see |
|---|---|---|
| **Merchant-of-record agent platform** (buyer, first customer) | "Let our agents check out for users without eating disputes for purchases the user never wanted." | API + ops console |
| **Shopper** (protected party) | "Let the agent buy what I asked for, and nothing else, without babysitting it." | Shopper page: state intent, confirm, approve HOLDs on phone, see receipts |
| **Ops reviewer** (platform staff) | "See every decision and why; clear the HOLD queue; defend disputes fast." | AG Studio console |
| **Agent developer** | "Integrate a safe checkout in a few lines." | OpenAPI, Postman collection, reference agent |

## 3. User journeys

1. **Shopper states an intent.** Types "Trail running shoes, size 10, under $90, not white, from REI or Backcountry". Witness compiles it into a structured policy and shows every field plus questions about anything ambiguous. The shopper answers and confirms. The confirmed intent gets a version and a digest.
2. **Agent submits a cart.** The agent searches (Channel3), picks a product and calls `POST /purchases`. Witness re-fetches the facts itself and screens the cart.
3. **Outcome:**
   - *CAPTURE*: authorized and captured in seconds. The receipt shows real PayPal IDs and a "fetch from PayPal" link.
   - *REJECT*: blocked before PayPal; no hold appears on the shopper's account. The shopper sees why.
   - *HOLD*: funds genuinely reserved. The shopper gets a link on their phone, sees the reason ("listing has no size information") and approves or denies. Witness captures or voids.
   - *VOID*: something changed between approval and PayPal's order (cart swap). Witness voids; $0 captured.
4. **Ops console.** Ledger of every decision; HOLD queue; an evidence-chain widget per purchase; the Studio agent answers "blocked value by reason this week" by building a widget.
5. **Dispute defence.** A dispute arrives on a captured purchase. Witness assembles evidence from the chain. The reviewer approves it and Witness submits it through the Disputes API (sandbox verdict labelled simulated).
6. **Judge.** Landing page: five scenario buttons, a free-text intent box, "try to beat our agent", live counters (attempts, dollars wrongly captured), and reset.

## 4. Functional requirements and acceptance criteria

| ID | Requirement | Acceptance criteria |
|---|---|---|
| F1 | Compile intent from text | Valid `PolicyV1` draft + ambiguities for ≥ 90% of eval intents; nothing becomes CONFIRMED without a shopper click |
| F2 | Versioned, immutable intents | Editing a confirmed intent creates v+1; old approvals tied to vN can't be used after vN+1 or a revoke |
| F3 | Independent product facts | Facts come from Channel3 by canonical product ID (fixture fallback when unavailable, labelled in the evidence); the agent's description is never used |
| F4 | Deterministic screening before PayPal | Violations of amount, currency, retailer, payee, SKU/substitution, quantity or expiry → REJECT with no PayPal call (verified: no order ID exists) |
| F5 | AI checks fail closed | Parse failure, refusal, timeout or low confidence → HOLD; fault-injection eval at 100% |
| F6 | Authorize against the saved wallet | Order created from the verified cart with `vault_id`; authorization `CREATED` |
| F7 | Three-way match against PayPal's order | Compares every purchase unit: items (SKU, qty, unit price), amount, currency, payee; any diff → VOID |
| F8 | Single-use bound approvals | Approval bound to order, authorization, payee, amount, cart digest, policy digest; consumed atomically; second use impossible (test) |
| F9 | Isolated executor | No capture/void HTTP route exists; CI blocks executor imports outside the worker |
| F10 | HOLD with a real authorization | Phone approval via a one-time link; auto-void at 72h; re-verified before capture |
| F11 | Idempotency | Idempotency-Key on purchases; deterministic PayPal-Request-Id; S7/S8/S11 pass |
| F12 | Webhooks | Signature verified via PayPal; deduped; re-fetch decides state; reconciler covers misses |
| F13 | Hash-chained audit | Every transition is chained; `/verify` recomputes; UPDATE/DELETE blocked by a DB trigger |
| F14 | Dispute evidence | Evidence package from the chain; reviewer approval; submitted via API in sandbox |
| F15 | Ops console | AG Studio: themed ledger, HOLD queue, custom evidence-chain widget, Studio agent query |
| F16 | Judge experience | Every scenario runnable from the hosted URL alone; reset voids open authorizations |
| F17 | Published evals | README shows suite 1 metrics and suite 2 results with dates |

## 5. Non-goals

- Intercepting payments Witness isn't integrated into; acting as a PayPal partner or using multiparty APIs.
- A general shopping agent, a fraud model, or a chargeback outsourcing service.
- A new signing protocol: we "operationalise AP2 on PayPal" (§8).
- Card data; production money.

## 6. Honest limits (stated in the README and the video)

1. An authorization is a hold the shopper may briefly see even when voided. REJECT avoids this for policy violations; it still applies to HOLD and VOID.
2. Saved-wallet payments need merchant eligibility review in production.
3. Sandbox dispute verdicts are chosen by us; we prove the evidence pipeline, not PayPal's judgment.
4. Witness protects against the agent, a faulty checkout and its own bugs, **not** against whoever holds the PayPal secret.
5. AI checks can be wrong. That's why they can only make things stricter (HOLD/REJECT) and never loosen a hard limit. Error rates are published.
6. Intents are recorded and hash-chained, **not cryptographically signed** by the shopper (passkey signing is on the cut list).

## 7. Success metrics (hackathon)

- 0 unauthorized captures across both eval suites.
- False-reject rate < 5% on clean cases (published).
- Every judge scenario runs from the hosted URL in under 60 s end to end.
- Every decision shows reasons + live PayPal IDs + chain proof.

## 8. Positioning (verify before slides)

| Alternative | What it does | What Witness adds | Status |
|---|---|---|---|
| **AP2** (v0.2): Checkout and Payment mandates, each with open and closed stages, as signed verifiable credentials ([ap2-protocol.org](https://ap2-protocol.org/)) | Defines how intent and authorization are expressed and chained | Checks the **cart** against the open mandate, checks **PayPal's order**, and moves (or refuses) the money | **Verified** (site): mandate names. Note: the brief's "IntentMandate/CartMandate" names are outdated. |
| Card-network agent tokens (Visa, Mastercard), Stripe agentic tools | Amount and merchant limits on a credential | "Is this the right item?" + the cart-swap catch on PayPal's order | **Inference**: needs links before slides |
| Intent firewalls (AgentGuard-style) | Rail-agnostic intent checks | Real PayPal hold, three-way match on PayPal's record, dispute loop | **Inference**: needs links |
| Chargeback tools (Chargeflow, Justt) | Fight disputes after the fact | Prevention first, and the evidence exists because the check happened | **Inference**: needs links |

## 9. Why it stands out (feature → judging criterion → prize)

You can win one Grand **or** one Honorable Mention prize, **plus** one Sponsor prize (Rules §8, **Verified**).

| Feature | Criterion | Prize it supports |
|---|---|---|
| Every verdict ends in a PayPal state judges can fetch live | Technological Implementation, Presentation | Grand, Best Use of PayPal + AI, Best Demo Delivery |
| Cart-swap catch on PayPal's own order | Innovation | Grand, Most Creative |
| HOLD backed by a real authorization, approved on a phone | Design, Impact | Best Use of Agentic Commerce |
| REJECT before PayPal (no hold for policy violations) | Design, Impact | Most Impactful |
| "Try to beat our agent" page with a live wrongly-captured counter | Presentation, Innovation | Best Demo Delivery, Most Creative |
| Published false-capture / false-reject rates | Technological Implementation | Grand (tie-break goes to Tech Implementation first, Rules §6) |
| Engineering PayPal engineers respect: state machine, idempotency, webhook verification, isolated executor, ADRs, threat model | Technological Implementation | Grand |
| AG Studio console: theming, custom evidence-chain widget, Studio Agent Framework | Design | **Best Use of AG Grid** (the one sponsor prize we target) |
| Channel3 as independent fact source and market-price reference | Technological Implementation | (Best Use of Channel3: not targeted, since only one sponsor prize can be won) |

## 10. Open questions

1. Dispute-cost figure and source for the pitch (Unknown).
2. AG Studio licence through the Dec 15 judging window (ask AG Grid; see ADR-0009).
3. Should judges also be able to pay with their own sandbox buyer (human-present path), or vault-only? I recommend vault-only, with the human-present path as an optional extra.
