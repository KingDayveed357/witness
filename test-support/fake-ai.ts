// A FakeLlm wired with plausible default behaviour for pipeline tests: listing text that addresses
// agents is flagged as injection; soft constraints get "unknown" unless a test overrides it; the
// intent compiler extracts the obvious fields from the shopper's text.

import { FakeLlm } from "@witness/ai";

export function harnessAi(): FakeLlm {
  return new FakeLlm()
    .on("injection", (input) => {
      const hit = input.match(/SYSTEM NOTE[^<\n]*|ignore (?:all |previous )?instructions[^<\n]*|pre-approved[^<\n]*/i);
      return hit ? { suspected: true, confidence: 0.92, spans: [{ text: hit[0].slice(0, 120), reason: "addresses AI agents" }] } : { suspected: false, confidence: 0.95, spans: [] };
    })
    .on("intent", (input) => {
      const text = input.replace(/<\/?request>/g, "");
      const amount = text.match(/\$\s?(\d+(?:\.\d{1,2})?)/);
      return {
        category: /trail/i.test(text) ? "trail-running shoes" : null,
        max_total: amount ? Number(amount[1]) : null,
        currency: "USD",
        quantity: 1,
        retailers: [...text.matchAll(/\b([a-z0-9-]+\.com)\b/gi)].map((m) => m[1]!.toLowerCase()),
        excluded_colors: /not white/i.test(text) ? ["white"] : [],
        size: text.match(/size (\d+)/i)?.[1] ?? null,
        brand: null,
        soft: [],
        substitution: "same_category_under_max",
        expires_in_days: null,
        ambiguities: [],
        confidence: 0.9,
      };
    })
    .on("semantic", (input) => {
      const { constraints, products } = JSON.parse(input) as { constraints: { id: string }[]; products: { product_id: string }[] };
      return { verdicts: constraints.flatMap((c) => products.map((p) => ({ constraint_id: c.id, product_id: p.product_id, verdict: "unknown", confidence: 0.5, evidence_quote: "" }))) };
    });
}
