# Deliverable 2: PayPal payment-flow comparison

Sandbox runs on 2026-10-16/17. Raw results, with PayPal debug IDs:

- `secondkey/reports/s4-architectures.json` (sprint);
- `secondkey/reports/s4-flows.json` (F1–F6);
- `secondkey/reports/s4-direct-payee.json` (F7).

Scripts are in `secondkey/spikes/s4/`.

- **Payer:** the vaulted personal sandbox buyer.
- **Intended recipient:** the new personal sandbox account (`SK_RECIPIENT_EMAIL`, not stored in reports).
- **Platform:** the Witness sandbox merchant.

**Bottom line.** With the access we have (a standard REST app, not a PayPal partner), the only flow that is proven end to end, and that can both hold the decision and reach the recipient, is the **platform-held authorization plus Payouts** (option B below). On approval the money goes to the platform first, then to the recipient. That is not a P2P transfer and must not be presented as one. Multiparty flows that would pay the recipient directly while the platform controls authorize/void/capture **require PayPal partner approval**; the sandbox refused them (F1, F2, F4).

## Options

| # | Flow | Who receives the initial payment | Does the intended recipient get paid? | Hold / void / capture under our control? | Requirements | Proven in sandbox vs. from docs |
|---|---|---|---|---|---|---|
| **B** | **Platform-held authorization → void on deny / capture + Payouts on approve** (current demo) | The platform merchant (authorization, then capture) | **Yes, via a second movement:** a Payout to the recipient's email. F5 (2026-10-17): item **SUCCESS** to the new personal account; the sprint payout was PENDING→PROCESSING | **Yes.** Authorization CREATED while held; void → VOIDED; capture COMPLETED; idempotent void retry; capture after void refused (S4 B1–B13) | Standard REST app + Payouts enabled (it is, in the sandbox). Live: Payouts approval, plus the platform's money-transmission/escrow obligations | **Proven:** hold, void, capture, payout to a real personal sandbox account. **Not proven:** payout to an unregistered email (stays unclaimed); refunds of the payout leg |
| **A1** | Orders `AUTHORIZE` with `payee.email_address` = recipient, paid with the **vaulted** wallet | n/a | **No:** 422 `BILLING_AGREEMENT_NOT_FOUND` (F3). The vault's billing agreement is between the buyer and *our* merchant; it can't pay anyone else | n/a | — | **Proven refused** |
| **A2** | Orders `AUTHORIZE` with `payee.email_address` = recipient, **buyer approves in PayPal checkout** (no vault) | The recipient, if it completes | Order creation **accepted**: 200 `PAYER_ACTION_REQUIRED` with an approval link (F7) | **Untested:** the payer approval wasn't completed (`ORDER_NOT_APPROVED`), so we don't yet know whether *our* app may void/capture an authorization whose payee is someone else. Docs suggest third-party authorize/capture is a partner (multiparty) capability | Payer must approve each payment in PayPal's UI (no vault); likely partner permissions for capture/void | **Proven:** order accepted with a personal-account payee. **Inferred (docs):** capture/void for a third-party payee needs partner status. **Next:** `direct-payee.ts finish` after an approval |
| **M1** | **Multiparty / PayPal Complete Payments**: platform onboards the recipient as a seller, then authorize/capture on their behalf (`PayPal-Partner-Attribution-Id`, `PayPal-Auth-Assertion`) | The seller (recipient) | Yes, directly | Yes (auth + capture documented for partners) | **PayPal partner approval**; seller onboarding through partner referrals; recipient must be onboarded as a seller (not a casual P2P recipient) | **Proven refused for this app:** partner referrals 403 `NOT_AUTHORIZED` (F1); acting on behalf of an unconsented account 401 `invalid_subject` (F6) |
| **M2** | **Multiparty delayed disbursement** (`payment_instruction.disbursement_mode: DELAYED`, release with referenced payouts, auto-release after 28 days per docs) | The seller, with funds held by PayPal | Yes, after release | Hold via delayed disbursement (and authorization) | Approved partner + seller onboarded with `DELAY_FUNDS_DISBURSEMENT` | **Proven refused:** 422 `UNSUPPORTED_PAYMENT_INSTRUCTION` for our own payee (F2) and for the recipient (F4) |
| **P2P** | PayPal "Send Money" / Friends & Family through an API | Recipient | Yes | No public API to hold or intercept; Adaptive Payments (the old P2P/split API) is closed to new integrations per PayPal's archive docs | — | **Docs only:** no supported API exists for us to test |

## What this means for the product and the demo

- **Demo (now):** keep architecture B, labelled on every screen:
  > Simulated transfer. Your payment is held by Second Key (PayPal sandbox authorization). On approval it is captured and paid out to the recipient. This is not a PayPal Friends & Family payment.

  The approve path can now show a real payout to a personal sandbox account (F5 SUCCESS) as a second, separately verified step (milestone M7).
- **Product (later):** the credible integrations are:
  - **C, the payment provider calls Second Key before it executes a send.** It needs PayPal or a bank as a partner; it can't be built from outside.
  - **M1/M2 for marketplaces and invoices.** The recipient is an onboarded seller, which suits "pay a contractor's invoice" better than "send money to grandson".

  Both need commercial or partner approval, which is a business-development step, not an engineering one.
- **Do not claim:**
  - that we intercept arbitrary PayPal P2P transfers;
  - that the sandbox payment went "directly" to the recipient;
  - that partner-only flows work.

## Remaining tests

1. **A2 finish:** a payer approves the two pending orders (or new ones from `direct-payee.ts create`), then run `direct-payee.ts finish`. This shows whether a non-partner app can void/capture a third-party-payee authorization.
2. **Payout edge cases:** an unregistered recipient email (unclaimed and returned after 30 days, per docs), and a payout to a restricted account.
