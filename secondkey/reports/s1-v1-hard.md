# S1 detection evaluation, manipulation@v1 (v1, hard set)

Model `claude-haiku-5-5` · 16 cases (10 scam / 6 benign) · 2026-10-16T19:48:58.851Z · flagged = intervention is not PROCEED (HOLD_FOR_TRUSTED_CONTACT or VERIFY_BEFORE_PAYING). Strict = HOLD_FOR_TRUSTED_CONTACT only.

| Metric | All | Dev | Holdout |
|---|---|---|---|
| Confusion (TP/FN/FP/TN) | 10/0/0/6 | 0/0/0/0 | 10/0/0/6 |
| Scam recall | 100.0% (10/10; 95% CI 72.2%–100.0%) | 0.0% | 100.0% |
| False-positive rate (benign) | 0.0% (0/6; 95% CI 0.0%–39.0%) | 0.0% | 0.0% |
| Precision | 100.0% | 0.0% | 100.0% |
| Strict HOLD recall / FPR | 100.0% / 0.0% | | |
| Tactic recall (scam cases) | 83.3% | | |
| Key-quote recall (scam cases) | 94.7% | | |
| Quotes grounded in the source | 100.0% (25 kept, 0 discarded) | | |
| Speaker attribution of kept quotes | 100.0% | | |
| Model failures (all HOLD) | 0 | | |
| Latency p50 / p95 | 2736 / 4605 ms | | |
| Cost | $0.0033 (16 requests; tokens in 2848, out 5399, cache read 29856, cache write 0) | | |

## By category

| Category | Label | n | Flagged | Strict HOLD |
|---|---|---|---|---|
| hard_bec | scam | 1 | 1 | 1 |
| hard_spoof | scam | 1 | 1 | 1 |
| hard_fake_verification | scam | 1 | 1 | 1 |
| hard_slow_romance | scam | 1 | 1 | 1 |
| hard_injection | scam | 1 | 1 | 1 |
| hard_polite | scam | 1 | 1 | 1 |
| hard_fake_invoice | scam | 1 | 1 | 1 |
| hard_deepfake_boss | scam | 1 | 1 | 1 |
| hard_rental | scam | 1 | 1 | 1 |
| hard_fake_charity | scam | 1 | 1 | 1 |
| hard_benign_closing | benign | 1 | 0 | 0 |
| hard_benign_fine | benign | 1 | 0 | 0 |
| hard_benign_tax | benign | 1 | 0 | 0 |
| hard_benign_family_wire | benign | 1 | 0 | 0 |
| hard_benign_surprise | benign | 1 | 0 | 0 |
| hard_benign_crypto | benign | 1 | 0 | 0 |

## Errors

None.
