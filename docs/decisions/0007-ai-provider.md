# 0007: AI provider and models

Status: **Proposed** · See `docs/ai-design.md`

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
