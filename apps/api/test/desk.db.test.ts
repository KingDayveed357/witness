// Public, read-only Protection Desk feed: current demo session only, no free-text reasons or intent
// ids, payee email masked in evidence, and fields the grid needs to keep AI, policy, human and PayPal
// facts separate.

import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApiKey } from "@witness/db";
import { buildApp } from "../src/app.ts";
import { createHarness, type Harness } from "../../../test-support/harness.ts";

let h: Harness;
let app: FastifyInstance;
const keys: Record<string, string> = {};
const bearer = (k: string) => ({ authorization: `Bearer ${keys[k]}` });

beforeAll(async () => {
  h = await createHarness();
  h.d.demoRecipientEmail = "sb-recipient77@personal.example.com";
  app = buildApp({ deps: h.d, demoShopperId: h.shopperId });
  await app.ready();
  keys.demo = (await createApiKey(h.pool, h.tenantId, "demo", ["demo"])).key;
  keys.admin = (await createApiKey(h.pool, h.tenantId, "admin", ["admin"])).key;
  keys.shopper = (await createApiKey(h.pool, h.tenantId, `shopper:${h.shopperId}`, ["shopper"])).key;
});
afterAll(async () => {
  await app.close();
  await h.close();
});

const incidents = async () => (await app.inject({ method: "GET", url: "/v1/demo/incidents", headers: bearer("demo") })).json();

describe("/v1/demo/incidents", () => {
  test("only the current demo session; nothing from before the reset", async () => {
    const before = (await app.inject({ method: "POST", url: "/v1/demo/scenarios/normal", headers: bearer("demo") })).json().purchase.id;
    await h.drain();
    expect((await app.inject({ method: "POST", url: "/v1/demo/reset", headers: bearer("admin") })).statusCode).toBe(202);
    h.clock.now = new Date(h.clock.now.getTime() + 1000);
    const after = (await app.inject({ method: "POST", url: "/v1/demo/scenarios/scam_transfer", headers: bearer("demo") })).json().purchase.id;
    const r = await incidents();
    const ids = r.purchases.map((p: { id: string }) => p.id);
    expect(r.read_only).toBe(true);
    expect(r.session_started_at).toEqual(expect.any(String));
    expect(ids).toContain(after);
    expect(ids).not.toContain(before);
  });

  test("rows carry separate AI, policy, human and PayPal fields, and no free-text reasons or intent ids", async () => {
    const row = (await incidents()).purchases.find((p: { kind: string }) => p.kind === "transfer");
    expect(row).toMatchObject({ state: "HELD", top_tactic: expect.any(String), has_conversation: true, last_event: "purchase.held", payout_status: null });
    expect(row.evidence_count).toBeGreaterThan(0);
    expect(row.paypal_authorization_id).toEqual(expect.any(String));
    expect(row.reasons).toBeUndefined();
    expect(row.intent_id).toBeUndefined();
  });

  test("evidence never exposes the full payee email", async () => {
    const id = (await incidents()).purchases.find((p: { kind: string }) => p.kind === "transfer").id;
    const ev = (await app.inject({ method: "GET", url: `/v1/purchases/${id}/evidence`, headers: bearer("demo") })).json();
    expect(ev.intent.policy.payee.email).toBe("sb•••77@personal.example.com");
    expect(JSON.stringify(ev)).not.toContain("sb-recipient77");
  });

  test("requires the demo (or admin) key", async () => {
    expect((await app.inject({ method: "GET", url: "/v1/demo/incidents" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/v1/demo/incidents", headers: bearer("shopper") })).statusCode).toBe(403);
  });
});
