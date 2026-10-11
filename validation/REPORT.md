# Witness spike validation: Phases A–D

Date: 2026-10-11 · Node v24.14.1 · Environment: offline (no PayPal credentials present)

**Bottom line so far.** The money mechanism Witness relies on is sound in code: rebuild the cart from PayPal's own order, compare it with the approved cart digest, then capture an explicit amount or void. That catches cart swaps, amount changes, quantity changes and currency changes. But the current code is **a library check that callers choose to run, not an enforcement point**. Merchant binding, order binding, replay protection, provenance of approvals, and isolation between merchants are all missing. The central hypothesis is **not yet supported**: Witness cannot today stop an agent that can reach the payment client. No real PayPal call has been made yet (Phase B is blocked on credentials), so none of the PayPal-side behaviour is evidenced.

---

## Phase A: Inventory

Repository: `witness/` (not a git repository). It has no runtime dependencies; spikes run on plain Node ≥ 20.12.

| Spike | Purpose / hypothesis | Run | APIs | Human step | Mocked / limits |
|---|---|---|---|---|---|
| `test/gate.test.mjs` | Gate logic is deterministic and correct | `npm test` | none | none | PayPal order shape is hand-built |
| `01-auth` | Credentials work; token has orders / vault / disputes scopes | `npm run spike:auth` | `POST /v1/oauth2/token` | none | Scope matching is heuristic |
| `02-authorize-capture-void` | **Gate 1:** authorize→capture and authorize→void on real authorizations; a voided authorization can't be captured | `npm run spike:lifecycle` | Orders v2 create / get / authorize; Payments v2 capture / void / get | Buyer approves 2 orders | Both orders go to PayPal even though B is VOID (on purpose) |
| `03-vault-authorize` | **Gate 2:** AUTHORIZE with a saved wallet, buyer not present | `npm run spike:vault` | Vault v3 setup-tokens / payment-tokens; Orders v2 | Buyer approves wallet saving once | Needs Vault enabled; production needs an eligibility review |
| `04-cart-swap` | **Gate 3:** a same-price SKU swap is caught on PayPal's order, then voided | `npm run spike:swap [-- --vault]` | Orders v2, Payments v2 | 1 approval (none with `--vault`) | The swap is simulated by the script itself creating the wrong order |
| `05-dispute` | **Gate 4:** dispute defended with the Witness record | `npm run spike:dispute -- create / next <id>` | Disputes v1, sandbox-only adjudicate | Wait between steps | Verdict chosen by us; sandbox only |

Shared code: `lib/paypal.mjs` (REST client; logs every call to `spikes/out/` with the `Authorization` header redacted), `lib/orders.mjs` (lifecycle helpers), `lib/gate.mjs` (policy, digest, three-way match, `assertCapturable`), `lib/catalog.mjs` (fixture products plus one hard-coded policy).

Critical path: `npm test` → 01 → 02 (Gate 1) → 03 (Gate 2) → 04 (Gate 3, `--vault` if Gate 2 passed) → 05 (Gate 4, uses `spikes/out/record-order-A.json` from 02).

Environment variables (from `.env.example`): `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_BASE_URL`, `WITNESS_RETURN_URL`, `WITNESS_CANCEL_URL`. There is no webhook ID because webhooks are not implemented.

---

## Phase B: PayPal connectivity: **BLOCKED**

| Step | Status | Reason |
|---|---|---|
| 1. Sandbox base URL verified | **Done (offline)** | The guard was a substring check that accepted `https://api-m.paypal.com/?sandbox`. **Fixed** in `spikes/lib/paypal.mjs`: it now requires `https:` and the exact hostname `api-m.sandbox.paypal.com`. Verified: rejects the production host, `…sandbox.paypal.com.evil.test` and `http://`; accepts the sandbox URL. |
| 2–10 | **Blocked** | `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` are not set. `witness/.env` does not exist. `C:\Users\DELL\Downloads\witness-spikes\.env` exists but is empty, and is in the wrong place: the client loads `witness/.env`. |

To unblock:
1. `copy witness\.env.example witness\.env` and paste the **sandbox** client ID and secret. Leave `PAYPAL_BASE_URL` unchanged.
2. Enable Vault on the sandbox app (needed for spike 03).
3. Run spike 01 (no interaction needed). Then run spike 02: it prints two approval links. Log in as the **sandbox Personal** account and approve both yourself. The agent must not type PayPal passwords.

Order status semantics to check against live responses: after create → `CREATED` (or `PAYER_ACTION_REQUIRED`); after buyer approval → `APPROVED`; after `/authorize` the order is `COMPLETED`, but money is only **held** (authorization `CREATED`). Only a capture whose own status is `COMPLETED` means funds moved. Spike 02 already reads `GET /v2/payments/captures/{id}` instead of trusting the order status.

---

## Phase C: Does Witness enforce intent?

Harness: `node validation/phase-c-scenarios.mjs`. It runs the real gate code against mocked PayPal order shapes. **None of these rows involved a real Sandbox request.**

Baseline intent: Merchant A, `A-KETTLE-01`, at most $50 USD, quantity 1.

| # | Scenario | Expected | Actual | Method | Result |
|---|---|---|---|---|---|
| T1 | Valid purchase | Allowed | `CAPTURE`; capture check allowed | unit | **PASS** |
| T2 | $75 total | Denied | `VOID` (75.00 vs 50.00); post-approval $75 refused | unit | **PASS**\* |
| T3 | Merchant A→B | Denied | `CAPTURE`: `policy.merchant` is silently ignored | unit | **FAIL** (missing capability) |
| T4a | Different product, same category | Deny / HOLD | `CAPTURE`: there is no SKU allow-list or substitution policy | unit | **FAIL** (missing capability) |
| T4b | Different category | Denied | `VOID` | unit | **PASS** |
| T4c | SKU swapped after approval | Refused | Refused (missing + unapproved SKU) | unit | **PASS** |
| T5 | USD→EUR | Denied | `VOID`; post-approval refused | unit | **PASS** |
| T6 | Changed after approval | All refused | amount / qty / currency / SKU refused; **payee change allowed** | unit | **FAIL** |
| T7 | Replay | 2nd use refused | One approval accepted for two different orders | unit | **FAIL** |
| T8 | No approval | Rejected | `assertCapturable(null)` throws | unit | **PASS**\*\* |
| T9a | Forged approval | Rejected | Hand-built approval for a $75 Merchant-B cart accepted | unit | **FAIL** |
| T9b | Direct capture bypass | No path | `captureAuthorization()` sent `POST …/capture` with no approval | real client, fetch mocked | **FAIL** |
| T10 | Merchant isolation | Rejected | Merchant A approval accepted on a Merchant B payee order; no tenant model | unit + inspection | **FAIL** (missing capability) |
| X1 | Negative quantity | Rejected | `CAPTURE`, total 33.00 (2×39 + −1×45) | unit | **FAIL** |
| X2 | Mutating the approval's cart | Caught | Mutation succeeds (shallow freeze); digest check catches it | unit | PASS (one line of defence) |
| X3 | Stale policy / old approval | Rejected | `policyVersion` and `issuedAt` are never checked | unit | **FAIL** |
| X4 | Extra purchase unit | Refused | Only `purchase_units[0]` is read | unit | **FAIL** |
| X5 | Sandbox guard | Refuses prod | Was accepting prod → fixed | child process | PASS after fix |

\* "Denied before payment execution" means before **capture**. In the designed flow the buyer has already approved and PayPal has already placed an authorization hold, which Witness then voids. The buyer can briefly see that hold (BRIEF "Honest limits").
\*\* Only for callers that call the gate. T9 shows that calling it is optional.

**What really holds:** the three-way match against PayPal's re-read order, plus capturing an explicit amount with `final_capture: true`. This is the product's real asset and the right place to anchor it.

**What doesn't:** everything that would make the check *mandatory* and *specific to one transaction*.

---

## Phase D: Authorization vs payment lifecycle

1. **Authoritative intent record:** none. `TRAIL_SHOE_POLICY` is a code constant. The `intentDigest` written into PayPal's `custom_id` is a label that nothing verifies. ⚠ `05-dispute` evidence calls it the *"Buyer's signed instruction"*, but nothing is signed. That wording should not go to PayPal as evidence.
2. **How the authorization is represented:** a frozen in-memory JS object `{policyVersion, cart, cartDigest, amount, currency, issuedAt}`. It is unsigned, not persisted and shallowly frozen.
3. **What it's bound to:** SKU, quantity, unit price, currency and total. **Not bound to:** merchant/payee, PayPal order ID, authorization ID, user identity, policy version (stored but not checked), expiry, shipping/tax breakdown, or purchase units beyond the first.
4. **Detecting changes after approval:** re-`GET` the order before capture and run `threeWayMatch`. This works for the bound fields only.
5. **One-time, reusable or expiring:** reusable indefinitely (T7, X3). Only PayPal's own authorization lifetime and `final_capture` limit it.
6. **Retries and duplicates:** each POST gets a **fresh random** `PayPal-Request-Id`, so a retry after a timeout is a *new* request, not an idempotent replay. The `requestId` option exists but nothing passes it. Witness keeps no decision store.
7. **PayPal succeeds but Witness fails to record:** the record is written only at the end of spike 02. A crash between capture and `saveJson` leaves money captured with no Witness record, and there is no reconciliation. `custom_id` could support reconciliation later.
8. **Timeouts, webhooks, ordering:** there are no webhooks, no fetch timeouts and no handling of out-of-order events. The spikes only poll.
9. **Can the agent change its own policy?** There is no boundary. The policy, the gate and the PayPal client share one process, and any code there can build an approval (T9a).
10. **Can the agent call PayPal directly?** Yes, if it shares the process or the credentials (T9b). The architecture has to make Witness the **only** holder of the PayPal secret and the only route to capture. Even then, whoever holds that secret, Witness or the merchant, can bypass it. Witness can protect against the *agent*, not against the credential holder, unless PayPal itself enforces something.
11. **Server-side checks:** there is no server. Every check runs inside a local script.
12. **External dependencies:** the merchant sends real line items with SKUs to PayPal; catalog facts are trustworthy (fixtures today); the merchant account is eligible for intent `AUTHORIZE` and Vault; Witness's operator holds capture rights (merchant-of-record); PayPal rejects capture on voided or fully captured authorizations (spike 02 tests the voided case).

**Against the central hypothesis.** BRIEF positions Witness *inside the merchant's PayPal integration*. That means every merchant must integrate it and route capture through it, which is the opposite of "without requiring every merchant … to implement this logic." It is honest as a merchant-of-record product, where one platform holds the credentials and captures for many agents. It is not, today, a neutral layer across merchants.

---

## Changes made

- `spikes/lib/paypal.mjs`: sandbox guard now checks the exact host and https (safety fix, needed before any network call).
- `validation/phase-c-scenarios.mjs`: new offline harness (not matched by `npm test`).
- `validation/REPORT.md`: this file.

Not touched: spikes, gate, tests, catalog, `.env` files.

## Recommended minimum before building (for discussion, not done)

1. Make Witness a separate service that alone holds the PayPal secret and exposes capture only through `assertCapturable`.
2. Persist approvals server-side, bound to `order_id`, `authorization_id`, `payee.merchant_id`, `policy_version`, `expires_at` and `used_at`. Consume them atomically, and send a deterministic `PayPal-Request-Id` derived from the approval ID.
3. Add `merchant` and `sku`/substitution rules to the policy schema. Fail closed on unknown policy fields and on malformed items. Match every purchase unit.
4. Write the decision record *before* capture, then reconcile.
