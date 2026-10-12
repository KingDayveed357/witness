# 0012: Product category is judged semantically when it doesn't match literally

Status: **Proposed** (implemented in Stage 4; for Dave's review at Checkpoint 4)

## Context

The deterministic category check compared the shopper's category ("trail-running shoes") with the catalog's category by substring. The first live Channel3 response (2026-10-12) files a Nike trail-running shoe under **"Apparel & Accessories > Shoes > Athletic Shoes"**. Real retailer taxonomies almost never repeat the shopper's words, so the strict check would have rejected nearly every real product. That would blow the false-reject target (under 5%) and make the demo fail on real data.

Category is a judgement about what a product *is*. It isn't a money field.

## Options

1. Keep the strict substring check. Safe, but rejects real products.
2. Drop the category check. Unsafe: the agent could buy a sandal.
3. **Literal match passes deterministically. A non-literal category becomes an "unknown" check that defers to the semantic verifier** ("is this a trail-running shoe?"), under the same fail-closed rules as every AI check.

## Decision (proposed)

Option 3.
- **Grounded `violates`** with confidence ≥ 0.8, and the quote found in the listing → **REJECT** before PayPal.
- **Grounded `satisfies`** with confidence ≥ 0.8 → the deferred check is settled. It's recorded as a pass, with the AI's reasoning attached.
- **Anything else** (unknown, low confidence, ungrounded quote, model failure) → **HOLD**.

The same applies to same-category substitutes. Amount, currency, retailer, payee, quantity, SKU allow-list, size, brand and excluded colours stay strictly deterministic.

## Consequences

- Real products can be bought without a human in the loop when the listing clearly shows what they are.
- A fooled or failing model can at most cause a HOLD or a REJECT. It can't loosen a money rule.
- Deferred checks are written to the database only once settled, so stored checks always match the decision (a bug the pipeline test caught during implementation).
- Eval suite 1 measures this directly: clean-03/04, sem-09/10, sub-04/05.
