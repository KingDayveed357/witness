// Milestone B, F7: a buyer-approved checkout that names the RECIPIENT as payee (no vaulted wallet,
// whose billing agreement belongs to the platform's merchant only). SANDBOX ONLY; never prints
// credentials. Two steps, because the payer must approve in PayPal's own page (a human logs in;
// this script never sees a password):
//   SK_RECIPIENT_EMAIL=... npx tsx secondkey/spikes/s4/direct-payee.ts create   → prints 2 approve links
//   (payer opens each link, logs in to a personal sandbox account, approves)
//   npx tsx secondkey/spikes/s4/direct-payee.ts finish   → authorize both; void #1 (deny), capture #2 (approve)
// Writes secondkey/reports/s4-direct-payee.json.

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, loadDotEnv } from "@witness/config";

loadDotEnv();
const BASE = process.env.PAYPAL_BASE_URL!.replace(/\/$/, "");
if (!/^https:\/\/api(-m)?\.sandbox\.paypal\.com$/.test(BASE)) throw new Error("sandbox only");
const STATE = join(ROOT, "secondkey", "spikes", "s4", ".direct-payee-orders.json"); // order IDs only
const REPORT = join(ROOT, "secondkey", "reports", "s4-direct-payee.json");
const mode = process.argv[2];

let token = "";
async function call(method: string, path: string, body?: unknown) {
  if (!token) {
    const r = await fetch(`${BASE}/v1/oauth2/token`, {
      method: "POST",
      headers: { authorization: `Basic ${Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    });
    token = ((await r.json()) as { access_token: string }).access_token;
  }
  const r = await fetch(`${BASE}${path}`, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "paypal-request-id": randomUUID(), prefer: "return=representation" }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  return { status: r.status, debug_id: r.headers.get("paypal-debug-id"), data: t ? JSON.parse(t) : null };
}
const issue = (d: any) => d?.details?.[0]?.issue ?? d?.name ?? null;
const prior = existsSync(REPORT) ? (JSON.parse(readFileSync(REPORT, "utf8")).steps as Record<string, unknown>[]) : [];
const steps: Record<string, unknown>[] = mode === "create" ? [] : prior;
const log = (step: string, r: { status: number; debug_id: string | null; data: any }, extra: Record<string, unknown> = {}) => {
  const row = { step, http: r.status, debug_id: r.debug_id, issue: r.status >= 400 ? issue(r.data) : null, ...extra };
  steps.push(row);
  console.log(JSON.stringify(row));
};

if (mode === "create") {
  const recipient = process.env.SK_RECIPIENT_EMAIL;
  if (!recipient) throw new Error("SK_RECIPIENT_EMAIL required");
  const ids: string[] = [];
  for (const [i, value] of ["30.00", "31.00"].entries()) {
    const r = await call("POST", "/v2/checkout/orders", {
      intent: "AUTHORIZE",
      purchase_units: [{ reference_id: `sk-direct-${i + 1}`, description: `Second Key direct-payee probe #${i + 1} (SANDBOX)`, amount: { currency_code: "USD", value }, payee: { email_address: recipient } }],
      payment_source: { paypal: { experience_context: { user_action: "CONTINUE", return_url: "https://example.com/return", cancel_url: "https://example.com/cancel", shipping_preference: "NO_SHIPPING" } } },
    });
    log(`F7.create_order_${i + 1}_payee_recipient`, r, { order_status: r.data?.status ?? null, payee_merchant_id_resolved: Boolean(r.data?.purchase_units?.[0]?.payee?.merchant_id) });
    if (r.data?.id) {
      ids.push(r.data.id);
      const approve = r.data.links?.find((l: any) => l.rel === "payer-action" || l.rel === "approve")?.href;
      console.log(`APPROVE #${i + 1}: ${approve}`);
    }
  }
  writeFileSync(STATE, JSON.stringify({ ids }) + "\n");
} else if (mode === "finish") {
  const { ids } = JSON.parse(readFileSync(STATE, "utf8")) as { ids: string[] };
  for (const [i, id] of ids.entries()) {
    const o = await call("GET", `/v2/checkout/orders/${id}`);
    log(`F7.order_${i + 1}_after_payer_action`, o, { order_status: o.data?.status ?? null });
    const a = await call("POST", `/v2/checkout/orders/${id}/authorize`, {});
    const auth = a.data?.purchase_units?.[0]?.payments?.authorizations?.[0];
    log(`F7.authorize_${i + 1}`, a, { order_status: a.data?.status ?? null, auth_status: auth?.status ?? null, payee_merchant_id_resolved: Boolean(a.data?.purchase_units?.[0]?.payee?.merchant_id) });
    if (!auth) continue;
    if (i === 0) {
      log("F7.void_on_deny_by_platform", await call("POST", `/v2/payments/authorizations/${auth.id}/void`));
      const g = await call("GET", `/v2/payments/authorizations/${auth.id}`);
      log("F7.get_after_void", g, { auth_status: g.data?.status ?? null });
    } else {
      const c = await call("POST", `/v2/payments/authorizations/${auth.id}/capture`, { final_capture: true });
      log("F7.capture_on_approve_by_platform", c, { capture_status: c.data?.status ?? null });
      if (c.data?.id) {
        const gc = await call("GET", `/v2/payments/captures/${c.data.id}`);
        log("F7.get_capture", gc, { capture_status: gc.data?.status ?? null, payee_is_recipient: gc.data?.payee?.email_address === process.env.SK_RECIPIENT_EMAIL, net_to_payee: gc.data?.seller_receivable_breakdown?.net_amount?.value ?? null });
      }
    }
  }
} else throw new Error("usage: create | finish");

mkdirSync(join(ROOT, "secondkey", "reports"), { recursive: true });
writeFileSync(REPORT, JSON.stringify({ ran_at: new Date().toISOString(), environment: "PayPal SANDBOX", steps }, null, 2) + "\n");
