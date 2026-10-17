# Deliverable 3: Trusted-contact security report

Decision record: [ADR-0017](../decisions/0017-trusted-contact-links.md). Code: `packages/engine/src/holds.ts`, `apps/api/src/app.ts` (`holdActor`). Tests: `apps/api/test/holds-security.db.test.ts` (11 tests) and `apps/api/test/stage4.db.test.ts`. Live checks: `secondkey/reports/e2e-acceptance.json`.

## The 72-hour vs 15-minute mismatch

| | Before | After |
|---|---|---|
| What 72 h meant | The **hold window**: authorization to automatic release (`auto_void_at`). The code also used it as the link lifetime | Still the hold window, and only that |
| What 15 min meant | Doc-only promise (OpenAPI `holdToken`, threat model T12); never enforced | Replaced by an enforced **30-minute link lifetime**, configurable 5–1440 min, capped at `auto_void_at` |
| Re-issue | Replaced the token; expiry = 72 h | Replaces the token; expiry = now + 30 min |
| After a decision | Token nulled → any retry 410 | Token kept as a hash → same decision replays (200, `replayed: true`), opposite 409, view shows outcome until expiry |
| Docs / UI | Inconsistent | OpenAPI, threat model and reviewer page show both clocks; approve/deny responses corrected from the undocumented 202 to the actual 200, with 401/403/409/410/502 documented |

**Why 30 minutes.** It is long enough to read the evidence and phone the family member, and short enough that a forwarded or leaked SMS link goes stale quickly. A new link is one tap for the payer, and the hold itself lasts 72 h.

## Test results

| Case | Expected | Result | Where |
|---|---|---|---|
| Link lifetime | 30 min, separate from the 72 h hold | ✅ exactly 30 min; `auto_void_at` more than 70 h later | DB test + live (human and agent flows: `link_minutes: 30`) |
| Expired link (view and decide) | 410; hold unchanged; new link works | ✅ | DB test |
| Link never outlives the hold | `expires_at` = `auto_void_at` when the hold is shorter | ✅ | DB test |
| Reused link, same decision | 200 `replayed: true`; no second void | ✅ DB: one void call; live: replayed | DB + live |
| Reused link, opposite decision | 409 | ✅ | DB + live |
| Re-issued link | Old token 403 | ✅ | DB + S5 |
| Concurrent approve + deny | Exactly one applied; loser 409; final state matches PayPal | ✅ `[200, 409]` | DB test (S5 live earlier) |
| Double tap (two concurrent denies) | Both 200, one `replayed`; exactly one void at PayPal | ✅ | DB test |
| Wrong payment | Token of A on B → 410 (B has no link) / 403 (B has one); A unaffected | ✅ | DB test |
| Unauthorized / malformed | No token, short, over 128 characters, number, array, duplicated `t` query → 401; bad JSON → 400; unknown purchase → 404; agent key → 401 (decide) / 403 (issue) | ✅; the hold is unchanged afterwards | DB test |
| Approve can't move money by itself | Re-reads PayPal order; response `CAPTURE_APPROVED`; no capture call until the executor runs; captured amount = held amount | ✅ | DB test |
| Changed PayPal order on approve | Void, not capture | ✅ (existing) | stage4 DB test |
| Hold resolved elsewhere (intent revoked) | Link approve → 409; payment VOIDED | ✅ | DB test |
| Deny response wording | `VOIDING` (decision), `VOIDED` only after PayPal confirms | ✅ live, plus direct PayPal GET with its own token | Live E2E |

## Binding and safety argument

- **Binding.** The token's hash lives on the purchase's own `holds` row. There is no global token lookup, so a token can only ever match the purchase it was issued for.
- **Approve (applied under a row lock on `HELD`):**
  1. checks the intent is still confirmed with the same policy digest;
  2. re-runs the three-way match against PayPal's live order;
  3. records an approval with a TTL.

  Capture happens only in the executor (separate credentials) and only for the matched amount.
- **Deny** records a void decision; the executor voids.
- **The reviewer cannot change** the amount, payee or items, and cannot trigger a capture of anything other than what was authorized and matched.

## Open items

| Severity | Item |
|---|---|
| Low | No rate limit on `/v1/holds/*`. A 192-bit token makes guessing infeasible; add a per-IP limiter before a public deployment |
| Medium (product) | The reviewer is "whoever holds the link". A real trusted-contact identity (invite, verified phone/email, optional second factor) is milestone M2 |
| Low | Spent token hashes remain until the row is archived; harmless (they can only replay a recorded outcome) |
