// Fault-injection acceptance against the REAL PayPal sandbox (S8, S11 in docs/evals.md).
// Uses its own fresh database on the dev Postgres, so a running worker cannot race these jobs.
// A fetch wrapper loses the response AFTER PayPal applies a capture, or fails BEFORE sending,
// to prove reconciliation yields exactly one capture on PayPal's side.
// Writes docs/evidence/stage3-sandbox-faults.md.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { FixtureCatalog } from "@witness/catalog";
import { newId } from "@witness/core";
import { loadDotEnv, ROOT } from "@witness/config";
import { createBoss, createPool, dbOf, ensureQueues, migrate, schema } from "@witness/db";
import { confirmIntent, createIntent, demoPolicy, submitPurchase } from "@witness/engine";
import { executeCapture, reconcile, type ExecutorDeps } from "@witness/executor";
import { PayPalClient } from "@witness/paypal";
import { MoneyMovementClient } from "@witness/paypal/money-movement";
import { eq } from "drizzle-orm";

loadDotEnv();
const admin = process.env.DEV_DB_ADMIN_URL ?? "postgres://witness:witness-dev-only@127.0.0.1:54330/postgres";
const merchant = process.env.PAYPAL_MERCHANT_ID ?? "";
const vaultId = JSON.parse(readFileSync(join(ROOT, "spikes", "out", "vault.json"), "utf8")).vaultId as string;
if (!merchant) throw new Error("PAYPAL_MERCHANT_ID required");

const dbName = `witness_faults_${Date.now()}`;
const c = new pg.Client({ connectionString: admin });
await c.connect();
await c.query(`CREATE DATABASE ${dbName}`);
await c.end();
const url = admin.replace(/\/postgres$/, `/${dbName}`);
const pool = createPool(url);
await migrate(pool);
const boss = createBoss(url, "api");
boss.on("error", () => {});
await boss.start();
await ensureQueues(boss);

// Fault injection around the real fetch.
let mode: null | "lose-capture-response" | "fail-capture-before-send" = null;
const faultyFetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const isCapture = /\/capture$/.test(String(input)) && init?.method === "POST";
  if (isCapture && mode === "fail-capture-before-send") {
    mode = null;
    throw new TypeError("injected: connection failed before the request was sent");
  }
  const res = await fetch(input, init);
  if (isCapture && mode === "lose-capture-response") {
    mode = null;
    await res.text(); // PayPal has processed it; we just never see the answer
    throw new TypeError("injected: connection dropped after PayPal processed the capture");
  }
  return res;
}) as typeof fetch;

const creds = { baseUrl: process.env.PAYPAL_BASE_URL!, clientId: process.env.PAYPAL_CLIENT_ID!, clientSecret: process.env.PAYPAL_CLIENT_SECRET!, fetchImpl: faultyFetch };
const tenantId = newId("ten");
const shopperId = newId("shp");
await pool.query("INSERT INTO tenants (id, name, paypal_merchant_id) VALUES ($1, 'Faults MoR', $2)", [tenantId, merchant]);
await pool.query("INSERT INTO shoppers (id, tenant_id, display_name, vault_id) VALUES ($1, $2, 'Faults Shopper', $3)", [shopperId, tenantId, vaultId]);
const d: ExecutorDeps = { pool, boss, paypal: new PayPalClient({ ...creds, role: "script" }), money: new MoneyMovementClient(creds), catalog: new FixtureCatalog() };
const agent = { tenantId, principal: "agent:faults", scopes: ["agent:purchase"] };
const reader = new PayPalClient({ ...creds, fetchImpl: fetch, role: "script" });

async function approvedPurchase() {
  const i = await createIntent(d, tenantId, shopperId, { policy: demoPolicy(new Date()) });
  if (i.kind !== "ok") throw new Error(i.detail);
  await confirmIntent(d, tenantId, shopperId, i.intent.id);
  const r = await submitPurchase(d, agent, `faults-${Math.random().toString(36).slice(2)}`, { intent_id: i.intent.id, retailer: "rei.com", lines: [{ product_id: "TRL-GRY-10", quantity: 1 }] });
  if (r.kind !== "ok" || r.purchase.state !== "CAPTURE_APPROVED") throw new Error(`setup: ${JSON.stringify(r)}`);
  const a = (await dbOf(pool).select().from(schema.approvals).where(eq(schema.approvals.purchaseId, r.purchase.id)))[0]!;
  return { p: r.purchase, job: { tenantId, purchaseId: r.purchase.id, approvalId: a.id }, approval: a };
}
const stateOf = async (id: string) => (await dbOf(pool).select().from(schema.purchases).where(eq(schema.purchases.id, id)))[0]!;
const paypalCaptures = async (orderId: string) => ((await reader.getOrder(orderId)).data.purchase_units[0].payments.captures ?? []) as { id: string; status: string; amount: { value: string } }[];

const rows: string[] = [];
const log = (id: string, name: string, pass: boolean, detail: string) => {
  console.log(`${pass ? "PASS" : "FAIL"} ${id} ${name}: ${detail}`);
  rows.push(`| ${id} | ${name} | ${detail.replace(/\|/g, "/")} | ${pass ? "**PASS**" : "**FAIL**"} |`);
};

// S11a: PayPal captured, response lost.
{
  const { p, job } = await approvedPurchase();
  mode = "lose-capture-response";
  const first = await executeCapture(d, job);
  const mid = await stateOf(p.id);
  const capsMid = await paypalCaptures(p.paypalOrderId!);
  const rec = await reconcile(d, job);
  const end = await stateOf(p.id);
  const capsEnd = await paypalCaptures(p.paypalOrderId!);
  log("S11a", "Capture applied by PayPal, response lost", mid.state === "NEEDS_RECONCILE" && capsMid.length === 1 && end.state === "CAPTURED" && capsEnd.length === 1 && end.paypalCaptureId === capsEnd[0]!.id,
    `executor: "${first}" -> ${mid.state} while PayPal already had ${capsMid.length} capture; reconcile: "${rec}" -> ${end.state}; PayPal captures after: ${capsEnd.length} (${capsEnd.map((x) => `${x.id} ${x.status} ${x.amount.value}`).join(", ")}); order ${p.paypalOrderId}`);
}

// S11b: request never sent.
{
  const { p, job } = await approvedPurchase();
  mode = "fail-capture-before-send";
  const first = await executeCapture(d, job);
  const mid = await stateOf(p.id);
  const capsMid = await paypalCaptures(p.paypalOrderId!);
  const rec = await reconcile(d, job);
  const end = await stateOf(p.id);
  const capsEnd = await paypalCaptures(p.paypalOrderId!);
  const calls = await dbOf(pool).select().from(schema.paypalCalls).where(eq(schema.paypalCalls.purchaseId, p.id));
  const captureReqIds = new Set(calls.filter((x) => x.op === "capture").map((x) => x.requestId));
  log("S11b", "Capture never reached PayPal; retried with the same request ID", mid.state === "NEEDS_RECONCILE" && capsMid.length === 0 && end.state === "CAPTURED" && capsEnd.length === 1 && captureReqIds.size === 1,
    `executor: "${first}" -> ${mid.state}, PayPal captures ${capsMid.length}; reconcile: "${rec}" -> ${end.state}; PayPal captures after: ${capsEnd.length}; capture attempts ${calls.filter((x) => x.op === "capture").length} with ${captureReqIds.size} distinct request ID; order ${p.paypalOrderId}`);
}

// S8: the capture job runs twice; then probe PayPal's own idempotency and final_capture directly.
{
  const { p, job, approval } = await approvedPurchase();
  const r1 = await executeCapture(d, job);
  const r2 = await executeCapture(d, job);
  const caps = await paypalCaptures(p.paypalOrderId!);
  const end = await stateOf(p.id);
  log("S8", "Capture job executed twice", end.state === "CAPTURED" && caps.length === 1 && r2 === "purchase is CAPTURED", `first: "${r1}"; second: "${r2}"; PayPal captures: ${caps.length}; order ${p.paypalOrderId}`);

  const money = new MoneyMovementClient({ ...creds, fetchImpl: fetch });
  const same = await money.captureAuthorization(approval.paypalAuthorizationId, { currency_code: "USD", value: "84.00" }, approval.requestId);
  const capsAfterSame = await paypalCaptures(p.paypalOrderId!);
  log("PP-1", "PayPal: repeat capture with the SAME PayPal-Request-Id", (same.status === 200 || same.status === 201) && same.data?.id === caps[0]?.id && capsAfterSame.length === 1,
    `HTTP ${same.status}, returned capture ${same.data?.id} (original ${caps[0]?.id}); captures on order: ${capsAfterSame.length}; debug ${same.debugId}`);

  const diff = await money.captureAuthorization(approval.paypalAuthorizationId, { currency_code: "USD", value: "84.00" }, `probe-${Date.now()}`);
  const capsAfterDiff = await paypalCaptures(p.paypalOrderId!);
  log("PP-2", "PayPal: new capture on a final-captured authorization (different request ID)", !diff.ok && capsAfterDiff.length === 1,
    `HTTP ${diff.status} ${diff.data?.details?.[0]?.issue ?? diff.data?.name ?? ""}; captures on order: ${capsAfterDiff.length}; debug ${diff.debugId}`);
}

await boss.stop({ graceful: false, close: true });
await pool.end();
mkdirSync(join(ROOT, "docs", "evidence"), { recursive: true });
writeFileSync(
  join(ROOT, "docs", "evidence", "stage3-sandbox-faults.md"),
  [
    "# Stage 3: sandbox fault-injection run",
    "",
    `Run: ${new Date().toISOString()} · real PayPal sandbox · generated by \`scripts/sandbox-faults.ts\` (own database \`${dbName}\`, no worker).`,
    "Faults are injected in the HTTP client: the request either never leaves, or PayPal processes it and the response is dropped. PayPal state is read with a separate, unfaulted client.",
    "",
    "| # | Scenario | What happened | Result |",
    "|---|---|---|---|",
    ...rows,
    "",
  ].join("\n"),
);
process.exit(rows.some((r) => r.includes("**FAIL**")) ? 1 : 0);
