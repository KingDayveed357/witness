import { describe, expect, test } from "vitest";
import { PayPalClient, PayPalHttpError, PayPalNetworkError, MoneyMovementForbidden, assertSandbox } from "../src/index.ts";
import { MoneyMovementClient } from "../src/money-movement.ts";
import { PayPalTransport } from "../src/transport.ts";

const BASE = "https://api-m.sandbox.paypal.com";
const creds = { baseUrl: BASE, clientId: "id-not-real", clientSecret: "secret-not-real" };

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

function fakeFetch(handler: (c: Call) => { status: number; body?: unknown; headers?: Record<string, string> } | Error) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit = {}) => {
    const c: Call = { url: String(url), method: init.method ?? "GET", headers: (init.headers ?? {}) as Record<string, string>, body: init.body as string | undefined };
    calls.push(c);
    if (c.url.endsWith("/v1/oauth2/token")) return new Response(JSON.stringify({ access_token: "tok-SECRET", expires_in: 3600 }), { status: 200 });
    const r = handler(c);
    if (r instanceof Error) throw r;
    return new Response(r.body === undefined ? "" : JSON.stringify(r.body), { status: r.status, headers: { "paypal-debug-id": "dbg1", ...r.headers } });
  }) as typeof fetch;
  return { impl, calls };
}

describe("sandbox guard (ADR-0001)", () => {
  test.each(["https://api-m.paypal.com", "https://api-m.paypal.com/?sandbox", "https://api-m.sandbox.paypal.com.evil.test", "http://api-m.sandbox.paypal.com", "https://api-m.sandbox.paypal.com:8443", "not a url"])(
    "refuses %s",
    (url) => {
      expect(() => assertSandbox(url)).toThrow(/Refusing/);
      expect(() => new PayPalClient({ ...creds, baseUrl: url })).toThrow(/Refusing/);
    },
  );

  test("accepts the sandbox host", () => {
    expect(assertSandbox(BASE).hostname).toBe("api-m.sandbox.paypal.com");
  });
});

describe("money movement isolation (ADR-0005)", () => {
  test("the API role cannot reach capture or void paths, even through the raw transport", async () => {
    const { impl, calls } = fakeFetch(() => ({ status: 201, body: {} }));
    const t = new PayPalTransport({ ...creds, role: "api", fetchImpl: impl });
    await expect(t.send("POST", "/v2/payments/authorizations/A1/capture", { requestId: "r", body: {} })).rejects.toThrow(MoneyMovementForbidden);
    await expect(t.send("POST", "/v2/payments/authorizations/A1/void", { requestId: "r", body: {} })).rejects.toThrow(MoneyMovementForbidden);
    await expect(t.send("POST", "/v2/payments/captures/C1/refund", { requestId: "r", body: {} })).rejects.toThrow(MoneyMovementForbidden);
    await expect(t.send("POST", "/v1/payments/payouts", { requestId: "r", body: {} })).rejects.toThrow(MoneyMovementForbidden);
    expect(calls).toHaveLength(0); // refused before any network traffic, including the token call
  });

  test("reading a payout batch is not money movement; creating one is executor-only", async () => {
    const { impl } = fakeFetch(() => ({ status: 200, body: { batch_header: { batch_status: "SUCCESS" } } }));
    const c = new PayPalClient({ ...creds, fetchImpl: impl });
    expect((await c.getPayoutBatch("B1")).data.batch_header.batch_status).toBe("SUCCESS");
    expect((c as unknown as Record<string, unknown>)["createPayout"]).toBeUndefined();
  });

  test("the public client exposes no capture or void method", () => {
    const c = new PayPalClient(creds) as unknown as Record<string, unknown>;
    expect(c["captureAuthorization"]).toBeUndefined();
    expect(c["voidAuthorization"]).toBeUndefined();
  });

  test("the executor client sends an explicit amount, final_capture and the given request ID", async () => {
    const { impl, calls } = fakeFetch(() => ({ status: 201, body: { id: "CAP1", status: "COMPLETED" } }));
    const m = new MoneyMovementClient({ ...creds, fetchImpl: impl });
    const r = await m.captureAuthorization("A1", { currency_code: "USD", value: "84.00" }, "req-123");
    expect(r.data.status).toBe("COMPLETED");
    const call = calls.at(-1)!;
    expect(call.headers["PayPal-Request-Id"]).toBe("req-123");
    expect(JSON.parse(call.body!)).toEqual({ amount: { currency_code: "USD", value: "84.00" }, final_capture: true });
  });
});

describe("transport behaviour", () => {
  test("POSTs require a deterministic request ID", async () => {
    const { impl } = fakeFetch(() => ({ status: 201, body: {} }));
    const t = new PayPalTransport({ ...creds, role: "api", fetchImpl: impl });
    await expect(t.send("POST", "/v2/checkout/orders", { body: {} })).rejects.toThrow(/PayPal-Request-Id is required/);
  });

  test("the OAuth token is cached across calls", async () => {
    const { impl, calls } = fakeFetch(() => ({ status: 200, body: { id: "O1" } }));
    const c = new PayPalClient({ ...creds, fetchImpl: impl });
    await c.getOrder("O1");
    await c.getOrder("O1");
    expect(calls.filter((x) => x.url.endsWith("/oauth2/token"))).toHaveLength(1);
  });

  test("4xx becomes PayPalHttpError with issue and debug ID, never the token", async () => {
    const { impl } = fakeFetch(() => ({ status: 422, body: { name: "UNPROCESSABLE_ENTITY", details: [{ issue: "INSTRUMENT_DECLINED", description: "declined" }] } }));
    const c = new PayPalClient({ ...creds, fetchImpl: impl });
    const err = await c.createOrder({}, "r1").catch((e) => e);
    expect(err).toBeInstanceOf(PayPalHttpError);
    expect(err.issue).toBe("INSTRUMENT_DECLINED");
    expect(err.debugId).toBe("dbg1");
    expect(JSON.stringify(err) + err.message).not.toMatch(/tok-SECRET|secret-not-real/);
  });

  test("5xx and network failures are 'outcome unknown', to be reconciled", async () => {
    const five = fakeFetch(() => ({ status: 503, body: {} }));
    await expect(new PayPalClient({ ...creds, fetchImpl: five.impl }).getOrder("O1")).rejects.toThrow(PayPalNetworkError);
    const down = fakeFetch(() => new TypeError("fetch failed"));
    await expect(new PayPalClient({ ...creds, fetchImpl: down.impl }).createOrder({}, "r")).rejects.toThrow(PayPalNetworkError);
  });

  test("a failed OAuth call does not leak the client secret", async () => {
    const impl = (async () => new Response(JSON.stringify({ error: "invalid_client", error_description: "Client Authentication failed" }), { status: 401 })) as unknown as typeof fetch;
    const err = await new PayPalClient({ ...creds, fetchImpl: impl }).getOrder("O1").catch((e) => e);
    expect(err).toBeInstanceOf(PayPalHttpError);
    expect(err.message + JSON.stringify(err.data)).not.toMatch(/secret-not-real|id-not-real/);
  });

  test("webhook verification is true only for verification_status SUCCESS", async () => {
    const h = { auth_algo: "SHA256withRSA", cert_url: "https://api.sandbox.paypal.com/cert", transmission_id: "t1", transmission_sig: "sig", transmission_time: "2026-10-11T00:00:00Z" };
    const ok = fakeFetch(() => ({ status: 200, body: { verification_status: "SUCCESS" } }));
    // The raw event is embedded byte-for-byte (PayPal requires it posted back exactly as received).
    const raw = `{"id":"E1","amount":{"value":"84.00"},"note":"caf\u00e9"}`;
    expect(await new PayPalClient({ ...creds, fetchImpl: ok.impl }).verifyWebhookSignature(h, "WH1", raw, "r")).toBe(true);
    const sent = ok.calls.at(-1)!.body!;
    expect(sent.endsWith(`"webhook_event":${raw}}`)).toBe(true);
    expect(JSON.parse(sent)).toMatchObject({ webhook_id: "WH1", transmission_id: "t1", webhook_event: { id: "E1" } });
    const bad = fakeFetch(() => ({ status: 200, body: { verification_status: "FAILURE" } }));
    expect(await new PayPalClient({ ...creds, fetchImpl: bad.impl }).verifyWebhookSignature(h, "WH1", "{}", "r")).toBe(false);
  });
});
