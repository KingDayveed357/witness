# 0007: AI provider and models

Status: **Accepted** (Dave, Checkpoint 2, 2026-10-11) · See `docs/ai-design.md`

## Context

Four AI components (intent compiler, injection classifier, semantic verifier, evidence writer) all need schema-valid structured output, and all must fail closed. The brief asks for at least two providers compared on structured-output reliability, latency and cost, with the provider kept behind an interface.

## Options

| | Anthropic Claude | OpenAI |
|---|---|---|
| Structured output | JSON-schema structured outputs (`output_config.format`) and strict tool use | Strict JSON-schema structured outputs (**Verified**, [docs](https://developers.openai.com/api/docs/guides/structured-outputs)) |
| Default model / price | `claude-opus-5-5`, $4 in / $20 out per MTok; `claude-haiku-5-5`, $0.10 / $0.50 (vendor table, 2026-10-06) | **Unknown**: not priced yet |
| Refusal signal | `stop_reason: "refusal"` → we treat it as HOLD | `refusal` content item → HOLD |
| Latency on our prompts | **Unknown**: measured by the eval runner | **Unknown** |

## Decision (proposed)

Claude via `@anthropic-ai/sdk` behind `LlmClient`. Default `claude-opus-5-5` for every component. The eval runner is provider-neutral; an OpenAI adapter is on the cut list, added only if you want a published comparison.

Your decisions, deferred to Stage 4 with eval numbers:
- whether the classifier moves to a cheaper or faster model;
- whether to publish a two-provider comparison.

Disclosure: this recommendation is written by a Claude model. The provider-neutral eval runner exists so the choice can be checked on data.

## Consequences

- One API key, one SDK, one set of refusal semantics to handle.
- Budget: about 430 calls per full eval run. The cost is measured on the first run and reported before CI runs it automatically.

## Amendment (Stage 4 verification, 2026-10-12, at Dave's direction)

- **Model:** `claude-haiku-5-5` only, for every real-model path (API, evals, reference agent), enforced by an allowlist in `packages/ai/src/models.ts`. Opus, Sonnet and other models are rejected as configuration errors.
- **Fallback:** removed. No server-side fallback is requested (Haiku 5.5 doesn't offer one), and a response from any other model is treated as a failure.
- **Effort:** `low`, with thinking left adaptive.
- **Measured** in the full live evaluation (72 cases × 3 runs, 252 calls): 0 false captures, 72/72 cases passing every run, 100% agreement, screening p95 2.2 s, estimated cost $0.0133. See `evals/report/latest.md` and `docs/ai-operations.md`.
- **Provider abstraction for future BYOM/BYOK:** [ADR-0013](0013-byom-byok-foundations.md).
