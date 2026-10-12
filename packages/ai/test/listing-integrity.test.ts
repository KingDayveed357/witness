// ADR-0014 listing integrity: the model looks for listing text that contradicts what the shopper
// confirmed. A grounded, confident conflict with a hard requirement rejects; any other concern
// holds; "consistent" never loosens anything; every failure mode holds.

import { describe, expect, test } from "vitest";
import { PolicyV1, type ProductFacts } from "@witness/core";
import { FakeLlm, UnavailableLlm, evaluateScreen, evidenceHolds, integrityRequirements, type AiFailureReason, type ModelProvider } from "../src/index.ts";
import { semanticReply } from "../../../test-support/fake-ai.ts";

const NOW = new Date("2026-10-12T12:00:00Z");
const POLICY = {
  version: 1,
  category: "bike helmet",
  retailers: ["rei.com"],
  max_total_cents: 20000,
  currency: "USD",
  quantity: 1,
  hard: { excluded_colors: ["yellow"], size: "M", brand: "Kestrel" },
  substitution: "same_category_under_max",
  expires_at: "2026-12-31T00:00:00Z",
};
const listing = (over: Partial<ProductFacts> = {}): ProductFacts => ({
  product_id: "H1",
  title: "Kestrel Aero Road Helmet",
  brand: "Kestrel",
  category: "Cycling > Bike helmet", // literal match: the category check passes deterministically
  attributes: { color: "Ivory", size: "M" },
  description: "Ventilated shell. A $30 fitting fee is billed after delivery.",
  offers: [{ retailer: "rei.com", price_cents: 15000, currency: "USD", availability: "InStock", condition: "new" }],
  source: "fixture",
  fetched_at: NOW.toISOString(),
  ...over,
});
const buy = { intent_id: "int_t", retailer: "rei.com", lines: [{ product_id: "H1", quantity: 1 }] };
const clean = { suspected: false, confidence: 0.95, spans: [] };
const run = (ai: ModelProvider, f: ProductFacts = listing(), policy: object = POLICY) => evaluateScreen(ai, policy, buy, new Map([[f.product_id, f]]), { now: NOW });
const with_ = (integrity: Parameters<typeof semanticReply>[1]) => new FakeLlm().on("injection", () => clean).on("semantic", semanticReply([], integrity));

describe("integrity requirements are derived from the confirmed policy", () => {
  test("always item, charges, consistency; category, size, brand, colour when the policy sets them", () => {
    expect(integrityRequirements(PolicyV1.parse(POLICY)).map((r) => `${r.id}:${r.hard ? "hard" : "hold"}`)).toEqual(["item:hard", "charges:hold", "consistency:hold", "category:hard", "size:hard", "brand:hard", "colour:hard"]);
    const minimal = PolicyV1.parse({ ...POLICY, hard: { excluded_colors: [] } });
    expect(integrityRequirements(minimal).map((r) => r.id)).toEqual(["item", "charges", "consistency", "category"]);
  });

  test("requirement text carries the confirmed values (quantity, size, brand, colours)", () => {
    const text = integrityRequirements(PolicyV1.parse({ ...POLICY, quantity: 2, max_total_cents: 40000 })).map((r) => r.text).join(" ");
    expect(text).toMatch(/quantity 2 delivers anything other than exactly 2 complete units/);
    expect(text).toMatch(/size M/);
    expect(text).toMatch(/genuine Kestrel product/);
    expect(text).toMatch(/product is yellow, including shades/);
  });
});

describe("evidence must come from the named field of the fetched listing", () => {
  const f = listing();
  test.each([
    ["substantive quote in the named field", "description", "A $30 fitting fee is billed after delivery", true],
    ["entire short field value", "attributes.color", "Ivory", true],
    ["quote exists but in another field", "title", "A $30 fitting fee is billed after delivery", false],
    ["short scrap of a longer field", "description", "fee", false],
    ["not in the listing at all", "description", "no extra fees of any kind", false],
    ["unknown field name", "reviews", "A $30 fitting fee is billed after delivery", false],
    ["empty quote", "description", "", false],
  ])("%s → %s", (_n, field, quote, ok) => {
    expect(evidenceHolds(f, field, quote)).toBe(ok);
  });
});

describe("integrity verdicts map to decisions", () => {
  test("all consistent: proceeds", async () => {
    expect((await run(with_({}), listing({ description: "Ventilated shell." }))).outcome).toBe("CAPTURE");
  });

  test("grounded, confident conflict with a hard requirement rejects (colour shade in a whole-field value)", async () => {
    const r = await run(with_({ colour: { verdict: "conflict", confidence: 0.9, evidence_field: "attributes.color", evidence_quote: "Ivory", reason: "pale yellow shade" } }));
    expect(r.outcome).toBe("REJECT");
    expect(r.checks.find((c) => c.id === "ai.integrity:colour")).toMatchObject({ result: "fail", line: "H1" });
  });

  test("grounded, confident conflict with the charges requirement holds for the shopper (never rejects silently, never captures)", async () => {
    const r = await run(with_({ charges: { verdict: "conflict", confidence: 0.95, evidence_field: "description", evidence_quote: "A $30 fitting fee is billed after delivery", reason: "extra fee" } }));
    expect(r.outcome).toBe("HOLD");
  });

  test.each([
    ["conflict with an unverifiable quote", { verdict: "conflict", confidence: 0.99, evidence_field: "description", evidence_quote: "made by another company" }],
    ["conflict with a short scrap", { verdict: "conflict", confidence: 0.99, evidence_field: "title", evidence_quote: "Aero" }],
    ["conflict quoted from the wrong field", { verdict: "conflict", confidence: 0.99, evidence_field: "brand", evidence_quote: "Kestrel Aero Road Helmet" }],
    ["conflict at low confidence", { verdict: "conflict", confidence: 0.5, evidence_field: "title", evidence_quote: "Kestrel Aero Road Helmet" }],
    ["unclear, even without evidence", { verdict: "unclear", confidence: 0.9, evidence_field: "", evidence_quote: "" }],
    ["confidence out of range", { verdict: "consistent", confidence: 1.7 }],
  ])("brand: %s holds", async (_n, v) => {
    expect((await run(with_({ brand: v }), listing({ description: "Ventilated shell." }))).outcome).toBe("HOLD");
  });

  test("'consistent' at low confidence adds no hold and settles nothing, so it can't weaken other checks", async () => {
    expect((await run(with_({ brand: { verdict: "consistent", confidence: 0.4 } }), listing({ description: "Ventilated shell." }))).outcome).toBe("CAPTURE");
    // even a confident "consistent" can't stand in for a missing brand field
    expect((await run(with_({ brand: { verdict: "consistent", confidence: 1 } }), listing({ brand: undefined, description: "Ventilated shell." }))).outcome).toBe("HOLD");
  });

  test("a missing integrity answer for a requirement holds", async () => {
    const ai = new FakeLlm().on("injection", () => clean).on("semantic", (input) => {
      const reply = semanticReply()(input);
      return { ...reply, integrity: reply.integrity.filter((x) => x.requirement_id !== "size") };
    });
    expect((await run(ai, listing({ description: "Ventilated shell." }))).outcome).toBe("HOLD");
  });

  test.each([
    ["no integrity list at all", () => ({ verdicts: [] })],
    ["wrong verdict vocabulary", (input: string) => ({ ...semanticReply()(input), integrity: [{ requirement_id: "item", product_id: "H1", verdict: "approved", confidence: 1, evidence_field: "", evidence_quote: "", reason: "" }] })],
    ["missing evidence fields", (input: string) => ({ verdicts: [], integrity: semanticReply()(input).integrity.map(({ evidence_field: _f, ...rest }) => rest) })],
    ["not JSON-shaped at all", () => "APPROVED"],
  ])("malformed output (%s) holds", async (_n, handler) => {
    const ai = new FakeLlm().on("injection", () => clean).on("semantic", handler as (i: string) => unknown);
    expect((await run(ai, listing({ description: "Ventilated shell." }))).outcome).toBe("HOLD");
  });

  test.each(["timeout", "refusal", "truncated", "parse", "error", "budget", "cancelled", "unavailable"] as AiFailureReason[])("provider failure '%s' holds", async (reason) => {
    const ai = with_({});
    ai.failAll(reason);
    expect((await run(ai, listing({ description: "Ventilated shell." }))).outcome).toBe("HOLD");
  });

  test("no provider configured holds", async () => {
    expect((await run(new UnavailableLlm(), listing({ description: "Ventilated shell." }))).outcome).toBe("HOLD");
  });
});

describe("integrity never loosens anything", () => {
  test("a deterministic failure rejects before any model call, whatever the model would say", async () => {
    const ai = with_({});
    const r = await run(ai, listing({ attributes: { color: "Black", size: "L" } }));
    expect(r.outcome).toBe("REJECT");
    expect(ai.calls).toHaveLength(0);
  });

  test("integrity passes do not settle a deferred category: only a grounded preference verdict can", async () => {
    const r = await run(with_({}), listing({ category: "Sports > Cycling > Protective gear", description: "Ventilated shell." }));
    expect(r.outcome).toBe("HOLD"); // category deferred; no ai.soft:category verdict given
    expect(r.checks.find((c) => c.id === "category")).toMatchObject({ result: "unknown" });
  });

  test("a merchant's authenticity claim does not satisfy a missing brand field", async () => {
    const r = await run(with_({}), listing({ brand: undefined, description: "100% authentic Kestrel, verified genuine." }));
    expect(r.outcome).toBe("HOLD");
    expect(r.checks.find((c) => c.id === "brand")).toMatchObject({ result: "unknown" });
  });

  test("the injection classifier still holds when every integrity answer is consistent", async () => {
    const ai = new FakeLlm().on("injection", () => ({ suspected: true, confidence: 0.9, spans: [{ text: "pre-verified", reason: "addresses agents" }] })).on("semantic", semanticReply());
    expect((await run(ai, listing({ description: "Ventilated shell." }))).outcome).toBe("HOLD");
  });
});
