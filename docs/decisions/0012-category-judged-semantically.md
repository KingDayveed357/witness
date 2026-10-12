# 0012: Product category is judged semantically when it doesn't match literally

Status: **Accepted with safeguards** (Dave, Checkpoint 4, 2026-10-12; conditions at the end)

## Context

The deterministic category check compared the shopper's category ("trail-running shoes") with the catalog's category by substring. The first live Channel3 response (2026-10-12) files a Nike trail-running shoe under **"Apparel & Accessories > Shoes > Athletic Shoes"**. Real retailer taxonomies almost never repeat the shopper's words, so the strict check would have rejected nearly every real product. That would blow the false-reject target (under 5%) and make the demo fail on real data.

Category is a judgement about what a product *is*. It isn't a money field.

## Options

1. Keep the strict substring check. Safe, but rejects real products.
2. Drop the category check. Unsafe: the agent could buy a sandal.
3. **Literal match passes deterministically. A non-literal category becomes an "unknown" check that defers to the semantic verifier** ("is this a trail-running shoe?"), under the same fail-closed rules as every AI check.

## Decision

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

## Acceptance conditions (Dave, 2026-10-12)

1. A literal category match stays deterministic.
2. A non-literal match passes only on a semantic verdict that is supported by verifiable listing evidence (the quoted text must appear in the listing) and meets the 0.8 confidence threshold.
3. Violations REJECT. Uncertainty, missing evidence, model failure or an injection concern HOLD.
4. Money, currency, payee, quantity, SKU, size, retailer and other exact purchase constraints stay deterministic.
5. The AI never overrides a deterministic failure.

Each condition is covered by a test in `packages/ai/test/adr-0012.test.ts`:
- grounded, confident pass and violation;
- ungrounded, empty-quote, below-threshold and "unknown" verdicts hold;
- model failure holds;
- an injection concern holds even with a grounded pass;
- a literal match never consults the model about category;
- deterministic size, colour, budget and currency failures reject before any model call;
- `settleDeferred` removes only a deferred "unknown" on the same line, never a failure.

**Known limit (adversarial suite adv-v1, case adv-cat-01).** Condition 1 trusts the merchant's category field. A listing that literally claims the category but describes a different product (a road flat filed under "Trail-running shoes") is captured. Closing this means also asking the model on literal matches, where it could only make the decision stricter. That is a separate decision; see the Checkpoint 4 report.

**Residual risk.** A grounding quote can be very short (one word that appears in the listing). Accepted for now.

**Update, 2026-10-12 (ADR-0014):**
- **Literal matches.** A literal match still passes the category check deterministically, so condition 1 holds. The listing-integrity check now also asks whether the product is genuinely the category, judged from the whole listing. It can only REJECT or HOLD, never pass anything. adv-cat-01 (a road flat filed under "Trail-running shoes") now rejects on all runs.
- **Evidence.** A preference verdict's quote must now come from the listing field the model names, and be at least 12 characters or that field's entire value. That closes the residual risk above.
- **Settling deferred checks.** Deferred checks are still settled only by a grounded preference verdict, never by an integrity answer.
