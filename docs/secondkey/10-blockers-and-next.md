# Deliverables 6 and 7: Remaining blockers and recommended next milestone

## Gate status

| Gate | Status | Evidence |
|---|---|---|
| A. Transfer intent architecture | **PASS** | [ADR-0016](../decisions/0016-transfer-intents.md). Transfers are their own intent and request type; the catalog fixture and the category-string stopgap are gone. The shared deterministic policy and manipulation check can't be bypassed (kind-mismatch, required-check guard). 17 DB + 7 core + 4 AI regression tests |
| B. PayPal payment flow | **PARTIAL** | Platform-held + Payouts proven, including a payout **SUCCESS** to the new personal account. Direct payee: authorize and capture work (recipient received $29.43 net), but void is refused 403, so a denial can't be enforced. Multiparty refused without partner status ([06](06-paypal-flows.md)) |
| C. Trusted-contact security | **PASS** | [ADR-0017](../decisions/0017-trusted-contact-links.md): one enforced 30-minute link lifetime, separate from the 72 h hold; idempotent retries; 11 DB tests + live checks ([07](07-trusted-contact-security.md)) |
| D. Audio evidence | **PARTIAL** | Browser transcription now **verified** (Chrome on-device + `start(track)`) but noisy (WER 53%; amount misheard). Real microphone still unverified. Prepared-transcript fallback kept ([08](08-audio-quality.md)) |
| E. Reproducible E2E | **PASS** | 28/28 live with direct PayPal GETs ([09](09-e2e-procedure.md)) |

## Remaining blockers, by severity

| # | Severity | Blocker | Impact on the demo | Smallest next step | Owner |
|---|---|---|---|---|---|
| 1 | **High** | **No supported way to pay a P2P recipient directly while holding the decision** (partner approval needed for multiparty) | The story must say "held by Second Key, paid out on approval", not "intercepts PayPal transfers" | Keep architecture B, honestly labelled. Show the payout leg (proven SUCCESS) on approve. Pursue partner access only as business development | Dave (decision), Claude (labels) |
| 2 | **High** | **Distorted quotes from live transcription** ("100 for bail") can mislead a reviewer | A judge could see a wrong amount quoted as evidence | Label transcript quotes "heard as"; suppress amounts that conflict with the confirmed amount; time-stamp quotes. Use the prepared transcript as the fallback in the recorded demo | Claude (M3) |
| 3 | Medium | **Real microphone untested** | Can't promise a live-mic demo | Dave runs `live-check.html` once in his Chrome (2 min). Until then, play the call audio inside the page and feed it as a track (verified path) | Dave |
| 4 | Medium | **Trusted contact has no identity** (anyone holding the link) | Fine for the demo; weak for a product claim | Invite flow + verified channel (M2) | Claude |
| 5 | Medium | **Not yet re-verified on Render** (all runs local) | Judges use the deployed URL | Deploy the branch to the Render sandbox and rerun `acceptance.ts` against it, after Dave authorises a deploy | Dave (authorise), Claude |
| 6 | Medium | **AG Studio licence for judging** | The watermark is acceptable only for local testing per AG's docs. The Studio licence covers only its built-in grid/chart widgets; AG Grid Enterprise in custom widgets needs its own licence | Request the 45-day AG Studio trial key no earlier than about Nov 1, so it covers judging to Dec 15, or get a sponsor key. Build the Protection Desk grid on AG Grid **Community** (MIT) | Dave |
| 8 | Low | No rate limit on `/v1/holds/*` | None (192-bit tokens) | Add a per-IP limiter before a public launch | Claude |
| 9 | Low | Raw conversation stored in `purchases.request` | Synthetic data only, for now | Store hash + grounded quotes; retention policy | Claude |

## Recommended next milestone: judge-facing experience (about 8 working days)

The payment and security gates are clear enough to start the interface, so long as blockers 1 and 2 are handled in the UI copy and evidence rendering.

1. **Consumer screen (Rose):** payment summary from the confirmed transfer intent; "why we paused" in plain language; QuoteCards labelled by source ("heard as" for audio); a PaymentStateChip that shows only PayPal-verified states (authorization/capture, never order status); next actions.
2. **Trusted-contact screen (Sarah):** the six questions from the demo spec; both clocks; replay-safe buttons; clear expired/replaced/decided states (ADR-0017 messages already in place).
3. **Audio in the demo:** the page plays the synthetic call and feeds it to Chrome on-device recognition as a track. A "use recorded transcript" switch is always visible and labelled.
4. **Approve path completes the story:** capture, then a Payout to the recipient, each with its own "Verified with PayPal (sandbox)" chip.
5. **Protection Desk (AG Grid Community):** incidents from evaluation and live runs; expected vs. outcome; tactic filters; evidence and audit history per row; false positives and misses visible. AG Studio "Tactic trends" only if a licence key is secured.
6. **Then:** deploy to the Render sandbox (with authorisation), rerun the acceptance test there, and record the three-minute video.

Out of scope until then: real P2P interception, partner onboarding, a production trusted-contact identity, server-side STT.
