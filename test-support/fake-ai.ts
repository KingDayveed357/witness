// A FakeLlm wired with plausible default behaviour for pipeline tests: listing text that addresses
// agents is flagged as injection; soft constraints get "unknown" and listing integrity "consistent"
// unless a test overrides it; the
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
      const { constraints } = JSON.parse(input) as { constraints: { id: string }[] };
      const products = (JSON.parse(input) as { products: { product_id: string }[] }).products;
      return semanticReply(constraints.flatMap((c) => products.map((p) => ({ constraint_id: c.id, product_id: p.product_id, verdict: "unknown", confidence: 0.5, evidence_quote: "" }))))(input);
    });
}

interface FakeVerdict {
  constraint_id: string;
  product_id: string;
  verdict: string;
  confidence: number;
  evidence_field?: string;
  evidence_quote: string;
}
interface FakeIntegrity {
  verdict: string;
  confidence: number;
  evidence_field?: string;
  evidence_quote?: string;
  reason?: string;
}

/**
 * A semantic@v3 reply: the given preference verdicts, and "consistent" (0.95) for every listing-
 * integrity requirement in the request unless overridden by requirement id.
 */
export function semanticReply(verdicts: FakeVerdict[] = [], integrity: Record<string, FakeIntegrity> = {}) {
  return (input: string) => {
    const { requirements, products } = JSON.parse(input) as { requirements: { id: string }[]; products: { product_id: string }[] };
    return {
      verdicts: verdicts.map((v) => ({ evidence_field: "", ...v })),
      integrity: requirements.flatMap((q) => products.map((p) => ({ requirement_id: q.id, product_id: p.product_id, verdict: "consistent", confidence: 0.95, evidence_field: "", evidence_quote: "", reason: "", ...integrity[q.id] }))),
    };
  };
}
