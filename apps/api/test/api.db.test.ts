import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApiKey } from "@witness/db";
import { demoPolicy } from "@witness/engine";
import { buildApp } from "../src/app.ts";
import { createHarness, type Harness } from "../../../test-support/harness.ts";

let h: Harness;
let app: FastifyInstance;
const keys: Record<string, string> = {};
const bearer = (k: string) => ({ authorization: `Bearer ${keys[k]}` });

beforeAll(async () => {
  h = await createHarness();
  app = buildApp({ deps: h.d, webhookId: "WH-TEST", demoShopperId: h.shopperId });
  keys.agent = (await createApiKey(h.pool, h.tenantId, "agent:a1", ["agent:purchase"])).key;
  keys.agent2 = (await createApiKey(h.pool, h.tenantId, "agent:a2", ["agent:purchase"])).key;
  keys.shopper = (await createApiKey(h.pool, h.tenantId, `shopper:${h.shopperId}`, ["shopper"])).key;
  keys.ops = (await createApiKey(h.pool, h.tenantId, "ops:test", ["ops"])).key;
  keys.demo = (await createApiKey(h.pool, h.tenantId, "demo", ["demo"])).key;
});
afterAll(async () => {
  await app.close();
  await h.close();
});

async function confirmedIntent() {
  const c = await app.inject({ method: "POST", url: "/v1/intents", headers: bearer("shopper"), payload: { policy: demoPolicy(new Date()), source_text: "trail shoes under $90" } });
  expect(c.statusCode).toBe(201);
  const k = await app.inject({ method: "POST", url: `/v1/intents/${c.json().id}/confirm`, headers: bearer("shopper") });
  expect(k.json().status).toBe("CONFIRMED");
  return c.json().id as string;
}

const purchase = (intent: string, key: string, product = "TRL-GRY-10", who = "agent") =>
  app.inject({ method: "POST", url: "/v1/purchases", headers: { ...bearer(who), "idempotency-key": key }, payload: { intent_id: intent, retailer: "rei.com", lines: [{ product_id: product, quantity: 1 }] } });

describe("route inventory (ADR-0005)", () => {
  test("no route can capture, void or refund", () => {
    const routes = app.printRoutes({ commonPrefix: false });
    expect(routes).not.toMatch(/capture|void|refund|reauthorize/i);
  });
});

describe("auth", () => {
  test("missing or bad key -> 401; wrong scope -> 403", async () => {
    expect((await app.inject({ method: "POST", url: "/v1/purchases" })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/v1/purchases", headers: { authorization: "Bearer wk_nope" } })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/v1/purchases", headers: bearer("shopper") })).statusCode).toBe(403);
  });

  test("T10: an agent key cannot create or confirm intents (cannot edit its own policy)", async () => {
    const r = await app.inject({ method: "POST", url: "/v1/intents", headers: bearer("agent"), payload: { policy: demoPolicy(new Date()) } });
    expect(r.statusCode).toBe(403);
  });
});

describe("purchase flow over HTTP", () => {
  test("202 with an agent view that carries no PayPal identifiers; replay is 200 with the same id", async () => {
    const intent = await confirmedIntent();
    const r = await purchase(intent, "http-key-0001");
    expect(r.statusCode).toBe(202);
    expect(r.json().state).toBe("CAPTURE_APPROVED");
    expect(r.json().paypal).toBeUndefined();
    const again = await purchase(intent, "http-key-0001");
    expect(again.statusCode).toBe(200);
    expect(again.json().id).toBe(r.json().id);
  });

  test("Idempotency-Key is required; malformed carts are 422", async () => {
    const intent = await confirmedIntent();
    const noKey = await app.inject({ method: "POST", url: "/v1/purchases", headers: bearer("agent"), payload: {} });
    expect(noKey.statusCode).toBe(422);
    const bad = await app.inject({ method: "POST", url: "/v1/purchases", headers: { ...bearer("agent"), "idempotency-key": "http-key-bad1" }, payload: { intent_id: intent, retailer: "rei.com", lines: [{ product_id: "X", quantity: -1 }] } });
    expect(bad.statusCode).toBe(422);
    expect(bad.headers["content-type"]).toMatch(/problem\+json/);
  });

  test("an agent cannot read another agent's purchase", async () => {
    const intent = await confirmedIntent();
    const r = await purchase(intent, "http-key-0002");
    const other = await app.inject({ method: "GET", url: `/v1/purchases/${r.json().id}`, headers: bearer("agent2") });
    expect(other.statusCode).toBe(404);
  });

  test("ops sees evidence with checks, decisions, journal and a valid chain; and live PayPal state", async () => {
    const intent = await confirmedIntent();
    const r = await purchase(intent, "http-key-0003");
    await h.drain();
    const ev = await app.inject({ method: "GET", url: `/v1/purchases/${r.json().id}/evidence`, headers: bearer("ops") });
    expect(ev.statusCode).toBe(200);
    const body = ev.json();
    expect(body.purchase.state).toBe("CAPTURED");
    expect(body.checks.find((c: any) => c.check_id === "three_way_match").result).toBe("pass");
    expect(body.decisions.map((x: any) => x.outcome)).toEqual(["CAPTURE"]);
    expect(body.paypal_calls.map((c: any) => c.op)).toEqual(["create-order", "capture"]);
    expect(body.chain.valid).toBe(true);

    const live = await app.inject({ method: "GET", url: `/v1/purchases/${r.json().id}/paypal`, headers: bearer("ops") });
    expect(live.json().captures[0]).toMatchObject({ status: "COMPLETED", amount: { value: "84.00" } });
  });

  test("demo scenario route runs the cart swap end to end", async () => {
    const r = await app.inject({ method: "POST", url: "/v1/demo/scenarios/cart_swap", headers: bearer("demo") });
    expect(r.statusCode).toBe(202);
    expect(r.json().purchase.state).toBe("VOIDING");
    expect(r.json().purchase.outcome).toBe("VOID");
  });

  test("public chain verification", async () => {
    const r = await app.inject({ method: "GET", url: "/v1/verify/chain" });
    expect(r.json().valid).toBe(true);
    expect(r.json().count).toBeGreaterThan(0);
  });
});

describe("webhooks", () => {
  const headers = (sig: string, tid: string) => ({
    "paypal-auth-algo": "SHA256withRSA",
    "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT",
    "paypal-transmission-id": tid,
    "paypal-transmission-sig": sig,
    "paypal-transmission-time": new Date().toISOString(),
  });

  test("verified events are stored once and queued; duplicates are dropped", async () => {
    const event = { id: "WH-EVT-1", event_type: "PAYMENT.CAPTURE.COMPLETED", resource_type: "capture", resource: { id: "CAP-X" } };
    const a = await app.inject({ method: "POST", url: "/v1/webhooks/paypal", headers: headers("valid-signature", "t-1"), payload: event });
    expect(a.statusCode).toBe(200);
    const b = await app.inject({ method: "POST", url: "/v1/webhooks/paypal", headers: headers("valid-signature", "t-1b"), payload: event });
    expect(b.statusCode).toBe(200);
    const { rows } = await h.pool.query("SELECT count(*)::int AS n FROM webhook_events WHERE event_id = 'WH-EVT-1'");
    expect(rows[0].n).toBe(1);
    const results = await h.drain();
    expect(results.filter((x) => x.startsWith("witness-webhook"))).toEqual(["witness-webhook: no matching purchase"]);
  });

  test("a forged webhook is refused and never queued", async () => {
    const r = await app.inject({ method: "POST", url: "/v1/webhooks/paypal", headers: headers("forged", "t-2"), payload: { id: "WH-EVT-FORGED", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: "CAP-Y" } } });
    expect(r.statusCode).toBe(400);
    const { rows } = await h.pool.query("SELECT verified FROM webhook_events WHERE transmission_id = 't-2'");
    expect(rows).toEqual([{ verified: false }]);
  });
});
