// AI checks inside the real pipeline: they can only make outcomes stricter, and every failure holds.

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { and, eq } from "drizzle-orm";
import { FakeLlm, UnavailableLlm } from "@witness/ai";
import { dbOf, schema } from "@witness/db";
import { confirmIntent, createIntent, demoPolicy, submitPurchase } from "@witness/engine";
import { createHarness, type Harness } from "../../../test-support/harness.ts";

let h: Harness;
beforeEach(async () => {
  h = await createHarness();
});
afterEach(async () => h.close());

const ORDERS = /^\/v2\/checkout\/orders$/;

async function buy(product: string, policy: Record<string, unknown> = {}) {
  const c = await createIntent(h.d, h.tenantId, h.shopperId, { policy: { ...demoPolicy(h.clock.now), ...policy } });
  if (c.kind !== "ok") throw new Error(c.detail);
  await confirmIntent(h.d, h.tenantId, h.shopperId, c.intent.id);
  const r = await submitPurchase(h.d, h.agent, `ai-${Math.random().toString(36).slice(2)}`, { intent_id: c.intent.id, retailer: "rei.com", lines: [{ product_id: product, quantity: 1 }] });
  if (r.kind !== "ok") throw new Error(r.detail);
  return r.purchase;
}

describe("AI in the pipeline", () => {
  test("prompt injection in a listing that passes every rule: HELD, never captured", async () => {
    const p = await buy("TRL-INJECT");
    expect(p.state).toBe("HELD");
    expect(p.reasons.join()).toMatch(/possible prompt injection.*SYSTEM NOTE/);
    await h.drain();
    expect(h.fake.count("POST", /\/capture$/)).toBe(0);
    const ai = await dbOf(h.pool).select().from(schema.checks).where(and(eq(schema.checks.purchaseId, p.id), eq(schema.checks.kind, "ai")));
    expect(ai[0]).toMatchObject({ checkId: "ai.injection", result: "unknown", model: "fake", promptVersion: "injection@v1" });
  });

  test("no AI provider configured: everything holds (fail closed), nothing is captured", async () => {
    h.d.ai = new UnavailableLlm();
    const p = await buy("TRL-GRY-10");
    expect(p.state).toBe("HELD");
    expect(p.reasons.join()).toMatch(/unavailable/);
    await h.drain();
    expect(h.fake.count("POST", /\/capture$/)).toBe(0);
  });

  test("a confident, grounded soft-constraint violation REJECTS before PayPal", async () => {
    h.d.ai = new FakeLlm()
      .on("injection", () => ({ suspected: false, confidence: 0.95, spans: [] }))
      .on("semantic", () => ({ verdicts: [{ constraint_id: "mesh", product_id: "TRL-GRY-10", verdict: "violates", confidence: 0.95, evidence_quote: "Recycled mesh" }] }));
    const p = await buy("TRL-GRY-10", { soft: [{ id: "mesh", text: "no mesh uppers" }] });
    expect(p.state).toBe("REJECTED");
    expect(p.reasons.join()).toMatch(/ai\.soft:mesh/);
    expect(h.fake.count("POST", ORDERS)).toBe(0);
  });

  test("AI never rescues a deterministic violation (REJECT happens before the model is asked)", async () => {
    const ai = new FakeLlm().on("injection", () => ({ suspected: false, confidence: 1, spans: [] }));
    h.d.ai = ai;
    const p = await buy("TRL-WHT-10");
    expect(p.state).toBe("REJECTED");
    expect(ai.calls).toHaveLength(0);
  });

  test("a model timeout on a clean cart holds instead of capturing", async () => {
    const ai = new FakeLlm().on("injection", () => ({ suspected: false, confidence: 1, spans: [] }));
    ai.failAll("timeout");
    h.d.ai = ai;
    expect((await buy("TRL-GRY-10")).state).toBe("HELD");
  });
});
