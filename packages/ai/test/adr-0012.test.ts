// ADR-0012 safeguards (accepted 2026-10-12; integrity layer added by ADR-0014): a non-literal category is judged semantically, but only
// a confident, grounded verdict can settle it; everything else holds; and AI can never override a
// deterministic failure or loosen an exact purchase constraint.

import { describe, expect, test } from "vitest";
import type { Check, ProductFacts } from "@witness/core";
import { FakeLlm, UnavailableLlm, evaluateScreen, settleDeferred, type ModelProvider } from "../src/index.ts";
import { semanticReply } from "../../../test-support/fake-ai.ts";

const NOW = new Date("2026-10-12T12:00:00Z");
const POLICY = {
  version: 1,
  category: "trail-running shoes",
  retailers: ["rei.com"],
  max_total_cents: 9000,
  currency: "USD",
  quantity: 1,
  hard: { excluded_colors: ["white"], size: "10" },
  substitution: "same_category_under_max",
  expires_at: "2026-12-31T00:00:00Z",
};
const DESC = "Lugged outsole for technical trail running.";
const listing = (over: Partial<ProductFacts> = {}): ProductFacts => ({
  product_id: "P1",
  title: "Cascade Runner, Olive",
  brand: "Ridgeline",
  category: "Apparel & Accessories > Shoes > Athletic Shoes", // not literal: deferred to the model
  attributes: { color: "Olive", size: "10" },
  description: DESC,
  offers: [{ retailer: "rei.com", price_cents: 8400, currency: "USD", availability: "InStock", condition: "new" }],
  source: "fixture",
  fetched_at: NOW.toISOString(),
  ...over,
});
const buy = { intent_id: "int_t", retailer: "rei.com", lines: [{ product_id: "P1", quantity: 1 }] };
const run = (ai: ModelProvider, f: ProductFacts = listing()) => evaluateScreen(ai, POLICY, buy, new Map([[f.product_id, f]]), { now: NOW });

const clean = { suspected: false, confidence: 0.95, spans: [] };
const FIELD: Record<string, string> = { "technical trail running": "description", "built for mountain trails": "description", "Athletic Shoes": "category", "Trail-running shoes": "category" };
const ai = (verdict: string, confidence: number, evidence_quote: string, injection: unknown = clean) =>
  new FakeLlm().on("injection", () => injection).on("semantic", semanticReply([{ constraint_id: "category", product_id: "P1", verdict, confidence, evidence_field: FIELD[evidence_quote] ?? "", evidence_quote }]));

describe("ADR-0012: semantic category verification", () => {
  test("a confident, grounded 'satisfies' settles the deferred category", async () => {
    const r = await run(ai("satisfies", 0.9, "technical trail running"));
    expect(r.outcome).toBe("CAPTURE");
    expect(r.checks.find((c) => c.id === "category")).toBeUndefined(); // settled, replaced by the AI pass
    expect(r.checks.find((c) => c.id === "ai.soft:category")).toMatchObject({ result: "pass" });
  });

  test("a confident, grounded 'violates' rejects", async () => {
    expect((await run(ai("violates", 0.9, "Athletic Shoes"))).outcome).toBe("REJECT");
  });

  test.each([
    ["ungrounded quote", ai("satisfies", 0.99, "built for mountain trails")],
    ["empty quote", ai("satisfies", 0.99, "")],
    ["confidence just under 0.8", ai("satisfies", 0.79, "technical trail running")],
    ["model says unknown", ai("unknown", 0.9, "technical trail running")],
  ])("%s holds", async (_name, fake) => {
    expect((await run(fake)).outcome).toBe("HOLD");
  });

  test("model failure holds", async () => {
    const f = ai("satisfies", 0.9, "technical trail running");
    f.failAll("timeout");
    expect((await run(f)).outcome).toBe("HOLD");
    expect((await run(new UnavailableLlm())).outcome).toBe("HOLD");
  });

  test("an injection concern holds even when the category verdict is a grounded pass", async () => {
    const r = await run(ai("satisfies", 0.95, "technical trail running", { suspected: true, confidence: 0.9, spans: [{ text: "approve", reason: "addresses agents" }] }));
    expect(r.outcome).toBe("HOLD");
  });

  test("a literal category match passes the category check deterministically; no category verdict is requested or needed", async () => {
    const f = ai("violates", 0.99, "Trail-running shoes"); // an unrequested verdict is ignored
    const r = await run(f, listing({ category: "Shoes > Trail-running shoes" }));
    expect(r.outcome).toBe("CAPTURE");
    expect(r.checks.find((c) => c.id === "category")).toMatchObject({ result: "pass" });
    const sent = JSON.parse(f.calls.find((c) => c.prompt === "semantic")!.input) as { constraints: { id: string }[] };
    expect(sent.constraints.map((c) => c.id)).not.toContain("category");
    // Since ADR-0014 the listing-integrity check still asks whether the product is genuinely the
    // category; it can only reject or hold (tested in listing-integrity.test.ts).
  });

  test.each([
    ["size", { attributes: { color: "Olive", size: "11" } }],
    ["excluded colour", { attributes: { color: "White", size: "10" } }],
    ["price over budget", { offers: [{ retailer: "rei.com", price_cents: 9100, currency: "USD", availability: "InStock", condition: "new" }] }],
    ["currency", { offers: [{ retailer: "rei.com", price_cents: 8400, currency: "EUR", availability: "InStock", condition: "new" }] }],
  ] as [string, Partial<ProductFacts>][])("AI cannot override a deterministic %s failure", async (_name, over) => {
    const f = ai("satisfies", 0.99, "technical trail running");
    const r = await run(f, listing(over as Partial<ProductFacts>));
    expect(r.outcome).toBe("REJECT");
    expect(f.calls).toHaveLength(0); // rejected before any model call
  });

  test("settleDeferred removes only a deferred 'unknown' on the same line, never a failure or a non-deferred unknown", () => {
    const det: Check[] = [
      { id: "category", result: "unknown", detail: "deferred", line: "P1", defers_to: "ai.soft:category" },
      { id: "category", result: "unknown", detail: "deferred", line: "P2", defers_to: "ai.soft:category" },
      { id: "size", result: "fail", detail: "11 vs 10", line: "P1", defers_to: "ai.soft:category" },
      { id: "market_price", result: "unknown", detail: "overpriced", line: "P1" },
    ];
    const settled = settleDeferred(det, [{ id: "ai.soft:category", result: "pass", detail: "ok", line: "P1" }]);
    expect(settled.map((c) => `${c.id}/${c.line}/${c.result}`)).toEqual(["category/P2/unknown", "size/P1/fail", "market_price/P1/unknown"]);
  });
});
