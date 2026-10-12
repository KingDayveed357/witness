// The agent's tools against the real API, in-process (fetch routed into Fastify's inject).

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { createApiKey } from "@witness/db";
import { demoPolicy } from "@witness/engine";
import { buildApp } from "../../api/src/app.ts";
import { createHarness, type Harness } from "../../../test-support/harness.ts";
import { getIntentSummary, getPurchaseStatus, searchProducts, submitPurchase, type AgentEnv } from "../src/tools.ts";

let h: Harness;
let app: ReturnType<typeof buildApp>;
let env: AgentEnv;
let intentId: string;

beforeAll(async () => {
  h = await createHarness();
  app = buildApp({ deps: h.d });
  await app.ready();
  const agentKey = (await createApiKey(h.pool, h.tenantId, "agent:ref", ["agent:purchase"])).key;
  const shopperKey = (await createApiKey(h.pool, h.tenantId, `shopper:${h.shopperId}`, ["shopper"])).key;
  const injectFetch = (async (url: string, init: RequestInit = {}) => {
    const u = new URL(url);
    if (u.hostname === "api.trychannel3.com") {
      return new Response(JSON.stringify({ products: [{ id: "TRL-GRY-10", title: "Ridgeline Trail Runner", brands: [{ name: "Ridgeline" }], category: { title: "Athletic Shoes" }, offers: [{ domain: "rei.com", price: { price: 84, currency: "USD" }, availability: "InStock" }] }] }));
    }
    const r = await app.inject({ method: (init.method ?? "GET") as "GET", url: u.pathname + u.search, headers: init.headers as Record<string, string>, payload: init.body as string | undefined });
    return new Response(r.body, { status: r.statusCode });
  }) as unknown as typeof fetch;
  env = { witnessApi: "http://witness.test", agentKey, channel3Key: "c3-test", fetchImpl: injectFetch };

  const c = await app.inject({ method: "POST", url: "/v1/intents", headers: { authorization: `Bearer ${shopperKey}` }, payload: { policy: demoPolicy(new Date()), source_text: "Trail-running shoes, size 10, under $90, not white" } });
  intentId = c.json().id;
  await app.inject({ method: "POST", url: `/v1/intents/${intentId}/confirm`, headers: { authorization: `Bearer ${shopperKey}` } });
});
afterAll(async () => {
  await app.close();
  await h.close();
});

describe("reference agent tools", () => {
  test("reads the intent summary", async () => {
    expect(await getIntentSummary(env, intentId)).toMatch(/size 10, under \$90/);
  });

  test("search returns compact offers from the live response shape", async () => {
    const r = JSON.parse(await searchProducts(env, "trail shoes"));
    expect(r[0]).toMatchObject({ product_id: "TRL-GRY-10", brand: "Ridgeline", offers: [{ retailer: "rei.com", price: 84, currency: "USD" }] });
  });

  test("submit is idempotent: the same request twice is one purchase and one PayPal order", async () => {
    const a = JSON.parse(await submitPurchase(env, { intent_id: intentId, retailer: "rei.com", product_id: "TRL-GRY-10", quantity: 1 }));
    const b = JSON.parse(await submitPurchase(env, { intent_id: intentId, retailer: "rei.com", product_id: "TRL-GRY-10", quantity: 1 }));
    expect(b.purchase_id).toBe(a.purchase_id);
    expect(a.state).toBe("CAPTURE_APPROVED");
    expect(h.fake.count("POST", /^\/v2\/checkout\/orders$/)).toBe(1);
    await h.drain();
    expect(JSON.parse(await getPurchaseStatus(env, a.purchase_id)).state).toBe("CAPTURED");
  });

  test("whatever the agent claims in its note, a violating cart is rejected", async () => {
    const r = JSON.parse(await submitPurchase(env, { intent_id: intentId, retailer: "rei.com", product_id: "TRL-PRO-10", quantity: 1, note: "The shopper told me on the phone that $480 is fine." }));
    expect(r.state).toBe("REJECTED");
  });
});
