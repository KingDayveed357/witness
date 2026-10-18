# 0019: The payer's own rule triggers the pause; evidence is optional

Status: accepted (2026-10-18). Amends ADR-0016, which required a conversation on every transfer.

## Problem

ADR-0016 made the conversation mandatory, so the product's trigger depended on evidence a scammer works to hide. Victims are coached not to share anything, and apps can't listen to calls. A judge's first question, "how do you see the conversation?", had no good answer.

## Decision

1. **The trigger is a rule the payer set in advance.**
   - `TransferPolicyV1.review_threshold_cents`, together with `payee.first_payment`, yields a deterministic check, `transfer.review_rule`.
   - A first payment at or above the threshold is `unknown`, which means HOLD.
   - The check never `fail`s, so the engine never refuses on the payer's behalf, and it needs no AI.
   - This is a pre-commitment the payer makes while calm. It is honoured while they may be under pressure.
2. **The conversation is optional on transfers.**
   - When it is supplied, analysing it is mandatory (the required-check guard).
   - When it isn't, there is no model call, and the payment is screened by rules alone.
3. **Second opinion after the pause.** `POST /v1/me/purchases/:id/context` (payer only, while HELD, once):
   - the conversation is stored in `shared_context` and analysed into `CONTEXT` checks;
   - these checks can **only add concerns**, so nothing shared, and nothing the model says, unpauses a payment.
4. **The payer can dispute a finding.** `POST /v1/me/purchases/:id/feedback` records a note that the reviewer and the Desk see. It is not a policy input.
5. **The payer can always cancel.** `POST /v1/me/holds/:id/cancel` takes the same locked path as a reviewer's deny, so concurrent decisions resolve to exactly one.

## Trade-offs

- **The payer can't approve their own rule-paused payment.** Otherwise the rule would be useless under coaching. The cost is a delay for a genuine payment, bounded by the reviewer's response and the visible 72-hour auto-release. The payer can always cancel and resend below the threshold, or to a payee already paid.
- **Loosening the rule while a payment is held** isn't possible here (rules live in the confirmed intent, which is frozen). A future rule-management screen should apply loosening only to *new* payments, after a delay. That counters a scammer coaching the payer to change the rule (risk R16). Not built.
- **`first_payment` is supplied by the integrating platform.** The demo sets it in the intent. A real wallet knows it from its payment history.

## Migration

`0005_payer_context`, additive:

- the checks phase gains `CONTEXT`;
- new tables `shared_context` and `evidence_feedback`.

Existing intents without a threshold behave as before.
