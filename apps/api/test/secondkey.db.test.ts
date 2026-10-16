// Second Key through the shared engine: a conversation submitted with a payment is screened for
// manipulation. A flagged or unscreenable conversation holds the payment for a trusted contact; a
// clean one cannot loosen any other check.

import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApiKey } from "@witness/db";
import { transferPolicy } from "@witness/engine";
import { buildApp } from "../src/app.ts";
import { createHarness, type Harness } from "../../../test-support/harness.ts";

let h: Harness;
let app: FastifyInstance;
const keys: Record<string, string> = {};
const bearer = (k: string) => ({ authorization: `Bearer ${keys[k]}` });

beforeAll(async () => {
  h = await createHarness();
  app = buildApp({ deps: h.d, demoShopperId: h.shopperId });
  await app.ready();
  keys.agent = (await createApiKey(h.pool, h.tenantId, "agent:sk", ["agent:purchase"])).key;
  keys.shopper = (await createApiKey(h.pool, h.tenantId, `shopper:${h.shopperId}`, ["shopper"])).key;
  keys.demo = (await createApiKey(h.pool, h.tenantId, "demo", ["demo"])).key;
  keys.ops = (await createApiKey(h.pool, h.tenantId, "ops:sk", ["ops"])).key;
});
afterAll(async () => {
  await app.close();
  await h.close();
});

const manipulationCheck = async (id: string) =>
  (await app.inject({ method: "GET", url: `/v1/purchases/${id}/evidence`, headers: bearer("ops") })).json().checks.find((c: { check_id: string }) => c.check_id === "ai.manipulation");

async function submit(conversation: unknown, policy = transferPolicy(new Date())) {
  const i = await app.inject({ method: "POST", url: "/v1/intents", headers: bearer("shopper"), payload: { policy } });
  await app.inject({ method: "POST", url: `/v1/intents/${i.json().id}/confirm`, headers: bearer("shopper") });
  return app.inject({
    method: "POST",
    url: "/v1/purchases",
    headers: { ...bearer("agent"), "idempotency-key": `sk-${Math.random()}` },
    payload: { intent_id: i.json().id, retailer: "secondkey.test", lines: [{ product_id: "XFER-NEW-PAYEE", quantity: 1 }], conversation },
  });
}

describe("Second Key screening", () => {
  test("scam call → HELD with the quoted line; trusted contact denies → VOIDED, nothing captured", async () => {
    const r = await app.inject({ method: "POST", url: "/v1/demo/scenarios/scam_transfer", headers: bearer("demo") });
    const p = r.json().purchase;
    expect(p).toMatchObject({ state: "HELD", outcome: "HOLD" });
    const c = await manipulationCheck(p.id);
    expect(c).toMatchObject({ result: "unknown", kind: "ai" });
    expect(c.detail).toContain("Promise you won");
    const link = (await app.inject({ method: "POST", url: `/v1/purchases/${p.id}/hold-link`, headers: bearer("shopper") })).json();
    expect((await app.inject({ method: "POST", url: `/v1/holds/${p.id}/deny`, payload: { token: link.token } })).json().state).toBe("VOIDING");
    await h.drain();
    const after = (await app.inject({ method: "GET", url: `/v1/purchases/${p.id}`, headers: bearer("ops") })).json();
    expect(after.state).toBe("VOIDED");
    expect(h.fake.calls.some((x) => x.path.includes(`${after.paypal.authorization_id}/capture`))).toBe(false);
  });

  test("agreed invoice → manipulation check passes, purchase captured", async () => {
    const r = await app.inject({ method: "POST", url: "/v1/demo/scenarios/benign_transfer", headers: bearer("demo") });
    const id = r.json().purchase.id;
    expect((await manipulationCheck(id)).result).toBe("pass");
    await h.drain();
    expect((await app.inject({ method: "GET", url: `/v1/purchases/${id}`, headers: bearer("ops") })).json().state).toBe("CAPTURED");
  });

  test("detector unavailable → HELD, never captured", async () => {
    const saved = h.d.ai;
    const { FakeLlm } = await import("@witness/ai");
    const ai = new FakeLlm();
    ai.failAll("timeout");
    h.d.ai = ai;
    const r = await submit({ context: "", lines: [{ speaker: "J. Morgan", text: "Invoice attached, pay when you can." }] });
    h.d.ai = saved;
    expect(r.json().state).toBe("HELD");
    expect((await manipulationCheck(r.json().id)).detail).toMatch(/unavailable/);
  });

  test("a clean conversation cannot loosen policy: over the cap is still rejected", async () => {
    const r = await submit({ context: "", lines: [{ speaker: "J. Morgan", text: "Invoice attached, pay when you can." }] }, { ...transferPolicy(new Date()), max_total_cents: 50000 });
    expect(r.json()).toMatchObject({ state: "REJECTED" });
  });

  test("conversation is validated: oversized or malformed input is refused", async () => {
    const big = await submit({ context: "", lines: Array.from({ length: 61 }, () => ({ speaker: "x", text: "y" })) });
    expect(big.statusCode).toBe(422);
    const bad = await submit({ lines: [{ speaker: "x", text: "y", role: "system" }] });
    expect(bad.statusCode).toBe(422);
  });
});
