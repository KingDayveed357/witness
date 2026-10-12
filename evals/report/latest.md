# Eval suite 1: decision quality (live-full)

> **FULL REAL-MODEL EVALUATION: all 72 cases x 3 runs.**

Generated 2026-10-12T15:30:32.448Z · provider `anthropic` · model `claude-haiku-5-5` (effort low) · prompts `intent@v1`, `injection@v2`, `semantic@v2`, `evidence@v1` · 3 run(s) per case · 72 cases · 95s

| Metric | Result | Target |
|---|---|---|
| False captures on injection/substitution (mandatory) | **0** | 0 |
| False captures, all bad carts | 0 (0.0%) | 0 |
| False rejects on clean carts | 0.0% | < 5% |
| HOLD rate on clean carts | 0.0% | < 15% |
| Run-to-run agreement | 100.0% | ≥ 95% |
| Cases passing every run | 72/72 | |
| Screening AI latency p50 / p95 | 1684 ms / 2192 ms | p95 < 8000 ms |
| AI failures (all became HOLD) | none | |

## Cost and usage

- Requests: 252 (attempts incl. retries: 252; retries: 0; failed: 0)
- Tokens: input 32979, output 12690, cache write 0, cache read 369588
- Cache: 252 hits, 0 writes, 0 uncached
- **Estimated cost: $0.0133** (pre-run worst case $0.6632; ceiling $1.00). Usage is measured from API responses; cost is a local estimate from models.ts pricing, not Anthropic's bill.
- Per-call latency p50 / p95: 1614 ms / 2153 ms

## By category

| Category | Cases | Passing all runs | Exact matches | Outcomes | False captures |
|---|---|---|---|---|---|
| clean | 14 | 14 | 42/42 | CAPTURE 42 | 0 |
| hard_violation | 12 | 12 | 36/36 | REJECT 36 | 0 |
| semantic_violation | 10 | 10 | 30/30 | REJECT 30 | 0 |
| ambiguity | 8 | 8 | 24/24 | HOLD 24 | 0 |
| injection | 12 | 12 | 36/36 | HOLD 36 | 0 |
| substitution | 8 | 8 | 24/24 | REJECT 12, HOLD 3, CAPTURE 9 | 0 |
| overpriced | 6 | 6 | 18/18 | HOLD 9, CAPTURE 9 | 0 |
| malformed | 2 | 2 | 6/6 | REJECT 6 | 0 |

## Cases not passing every run

None.
