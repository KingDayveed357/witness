# 0017: One authoritative policy for trusted-contact links

Status: accepted (2026-10-17).

## Problem

Two expiries were conflated:

- the code gave a reviewer link the **hold's** lifetime: `token_expires_at = auto_void_at`, 72 h after authorization;
- the OpenAPI doc and the threat model (T12) promised a **15-minute** link.

Neither was right on its own. A 72 h bearer link sitting in an SMS thread is too long. A 15-minute link with no clear way to get a new one strands the reviewer.

## Decision

There are two separate clocks, both enforced on the server.

| Clock | Meaning | Default | Where |
|---|---|---|---|
| **Hold window** (`auto_void_at`) | How long the money stays reserved before it is released automatically if nobody decides | 72 h after authorization, inside PayPal's 3-day honour period | `EngineDeps.holdMs`, hold-timeout job |
| **Link lifetime** (`link_expires_at`) | How long one reviewer link works | **30 min**, never past `auto_void_at` | `WITNESS_HOLD_LINK_TTL_MINUTES` (5–1440) → `EngineDeps.holdLinkMs` |

Rules (`packages/engine/src/holds.ts`):

1. **One token.** A link is a 192-bit random token, stored as SHA-256, compared in constant time, and bound to one purchase. Issuing a new link replaces the old one; the old one then gets 403.
2. **Expiry.** An expired link gets 410 for viewing and deciding. The hold is unaffected, and the payer (or an admin) can issue a new link.
3. **A link decides once.**
   - Retrying the **same** decision returns the recorded result with `replayed: true`, so a network retry or double tap is safe and nothing runs twice.
   - The **opposite** decision gets 409.
   - Of two concurrent requests, exactly one is applied: the row lock on `HELD` decides.
4. **After a decision**, the spent link can still *show* the outcome until it expires. It cannot change it.
5. **A decision never moves money directly.**
   - Deny records a void decision; the executor voids.
   - Approve first re-reads PayPal's order and re-runs the three-way match plus the intent check. If anything changed, it voids. If not, it records an approval, and only the executor captures, for the held amount.
6. **Input limits.** A missing token, a token that isn't a string, or one shorter than 20 or longer than 128 characters gets 401. An agent key gets 401 on decisions and 403 on issuing links. A malformed body gets 400.

## Consequences

- **OpenAPI, the threat model and the reviewer page now match.** The page shows both clocks ("This link works until …; if nobody decides, the money is released at …") and plain messages for expired, replaced and already-decided links.
- **No DB migration.** The token hash is now kept after a decision (it used to be nulled) so retries can be recognised. A spent hash is useless for anything else.
- **Rate limiting on `/v1/holds/*` is still absent.** Brute force against a 192-bit token is infeasible, but a limiter is still sensible defence in depth before a public deployment (blocker list, low severity).
