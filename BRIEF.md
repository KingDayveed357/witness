# Witness — Product Brief v0.2

*Living document. Update it after each gate; write the full PRD only after Gate 2.*

## Thesis

When an AI agent buys something while the buyer isn't watching, nothing checks that the cart it built is what the buyer asked for. When it's wrong, the merchant eats a chargeback that costs over twice the order. Witness sits inside the merchant's PayPal integration and checks three things against each other before capture: what the human asked for, what the product really is, and what PayPal actually authorized. Then it captures, holds or voids.

**One line:** Witness lets AI agents spend on PayPal only what the human actually asked for.

## User

- **Buyer (first customer):** a merchant-of-record agent platform, meaning a service that buys on a user's behalf and charges that user's PayPal. It receives the payment, so it can capture or void, and it eats every dispute.
- **Later:** PayPal merchants taking agent orders, and agent developers integrating Witness through an SDK.
- **Protected party:** the person who delegated the purchase.

## Failure scenarios Witness prevents

1. The agent misreads the intent and buys the wrong item (white shoes when the buyer said "not white").
2. A product page injects instructions and the agent buys something else.
3. **Cart swap:** the agent's cart is right, but the order PayPal receives is different (same price, different SKU). Spend limits, AP2 mandates and intent firewalls all miss this. Witness catches it by reading PayPal's own order.

## Core promise and invariant

> No code path can capture a payment unless Witness approved the exact cart and amount that PayPal authorized.

The approval is bound to a cart digest (SKUs, quantities, unit prices, currency) and the policy version. Before capture, Witness rebuilds the cart from `GET /v2/checkout/orders/{id}` and compares it. Any difference means VOID.

## Decisions

| Decision | When | PayPal action |
|---|---|---|
| CAPTURE | Every check passes and PayPal's order matches the approval exactly | Capture an explicit amount, `final_capture: true` |
| HOLD | A required fact is missing, or confidence is low | Keep the authorization; ask the human before the 3-day honour period ends |
| VOID | Any violation, or any mismatch with PayPal's order | Void the authorization; $0 captured |

## Where AI is used, and where it isn't

- **AI:** turning free text into a structured policy, and judging constraints rules can't express ("warm", "for trail", a "merino blend" against "no wool").
- **Never AI:** the money boundary. Amount, currency, SKU, quantity and the three-way match are deterministic code. A fully fooled model still can't capture more than the human approved.

## Non-goals (hackathon)

- Intercepting PayPal payments Witness isn't integrated into.
- A general shopping agent, a fraud model, or a chargeback service.
- Claiming protection against every injection. We publish what we tested.
- A custom signing protocol. Use AP2-shaped mandates.

## Honest limits

- An authorization is a hold; the buyer may briefly see it even if it is voided.
- Saved-wallet payments need merchant eligibility review in production.
- Sandbox dispute verdicts are chosen by us, so they prove the evidence pipeline, not PayPal's judgment.

## Gates (spikes in this repo)

| Gate | Question | Spike | Result |
|---|---|---|---|
| 1 | Authorize → capture and authorize → void on real sandbox authorizations? | `02-authorize-capture-void` | **PASS** 2026-10-11: capture `536404883W4495032` COMPLETED; voided auth refused with 422 `AUTHORIZATION_VOIDED` |
| 2 | Authorize with a saved wallet, buyer **not** present? | `03-vault-authorize` | **PASS** ×2 2026-10-11: `vault_id` order authorized in one call, no buyer action |
| 3 | Cart swap caught against PayPal's own order and voided? | `04-cart-swap` | **PASS** ×2 (buyer-present and `--vault`): SKU diff found, authorization VOIDED, $0 captured |
| 4 | Dispute on a Witness capture, defended with the record, settled? | `05-dispute` | **BLOCKED**: API create isn't a documented operation (400 "No permissions to set target_client_id"); next step is a buyer-opened dispute in the sandbox UI |

Details, IDs and evidence files: [docs/spike-results.md](docs/spike-results.md).

**Decision rule after the gates**

- 1–4 pass → build Witness as designed (human-not-present).
- 2 fails as an API limitation, the rest pass → build with buyer approval per order; lead the demo with HOLD and the cart swap.
- 1 or 3 fails → stop and diagnose before building anything else.
- 4 fails → keep disputes as a static evidence export; it's 25 seconds of the demo, not the product.

## Success criteria for the hackathon build

- Zero unauthorized captures across the published test set.
- False-void rate measured and published.
- Every decision shows its reasons and the real PayPal IDs and status.
- A judge can run the scenarios from the README or the hosted URL alone.
