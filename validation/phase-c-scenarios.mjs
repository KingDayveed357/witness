// Phase C: probe the EXISTING gate against the baseline intent scenarios.
// Offline only. No PayPal request leaves this process: the one probe that drives the
// PayPal client (T9b) replaces global fetch with a recorder first.
//
//   node validation/phase-c-scenarios.mjs
//
// Each row reports what the current code actually does, not what it should do.
// Fixtures below are local test data for the $50 / Merchant A baseline; the spike
// catalog has no product under $50, and nothing in spikes/ is modified.

import { evaluateCart, approve, assertCapturable, threeWayMatch, Decision, GateRefusal } from "../spikes/lib/gate.mjs";
import { spawnSync } from "node:child_process";
import { rmSync, readdirSync, rmdirSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = join(HERE, "..", "spikes", "lib");

// --- Baseline fixtures ---------------------------------------------------------
const P_ = {
  "A-KETTLE-01": { sku: "A-KETTLE-01", merchant: "MERCHANT-A", name: "Steel Kettle 1L", unit_amount: "45.00", attributes: { category: "kettle" } },
  "A-KETTLE-02": { sku: "A-KETTLE-02", merchant: "MERCHANT-A", name: "Glass Kettle 1.7L", unit_amount: "39.00", attributes: { category: "kettle" } },
  "A-TOAST-01": { sku: "A-TOAST-01", merchant: "MERCHANT-A", name: "2-Slice Toaster", unit_amount: "45.00", attributes: { category: "toaster" } },
  "B-KETTLE-01": { sku: "B-KETTLE-01", merchant: "MERCHANT-B", name: "Steel Kettle 1L", unit_amount: "45.00", attributes: { category: "kettle" } },
};
const cart = (...lines) => ({
  currency: "USD",
  items: lines.map((l) => (typeof l === "string" ? { ...P_[l], quantity: 1 } : { ...P_[l.sku], ...l })),
});

// Intent: "Buy the Steel Kettle 1L from Merchant A, at most $50 USD, quantity one."
// merchant and sku are included to see whether the gate enforces them.
const POLICY = Object.freeze({
  version: 1,
  original_text: "Buy the Steel Kettle 1L from Merchant A, at most $50 USD, quantity one.",
  merchant: "MERCHANT-A",
  sku: "A-KETTLE-01",
  category: "kettle",
  max_total: "50.00",
  currency: "USD",
  quantity: 1,
  on_ambiguity: "hold",
});

// Shape a cart the way GET /v2/checkout/orders/{id} returns it.
function ppOrder(c, { id = "ORDER-1", amount, currency, payee = "MERCHANT-A-PAYPAL-ID", extraUnits = [] } = {}) {
  const cur = currency ?? c.currency;
  const total = amount ?? c.items.reduce((s, i) => s + Number(i.unit_amount) * i.quantity, 0).toFixed(2);
  return {
    id,
    status: "COMPLETED",
    purchase_units: [
      {
        payee: { merchant_id: payee },
        amount: { currency_code: cur, value: total },
        items: c.items.map((i) => ({ name: i.name, sku: i.sku, quantity: String(i.quantity), unit_amount: { currency_code: cur, value: i.unit_amount } })),
      },
      ...extraUnits,
    ],
  };
}

const capturable = (approval, order) => {
  try {
    assertCapturable(approval, order);
    return { allowed: true, reasons: [] };
  } catch (e) {
    if (!(e instanceof GateRefusal)) throw e;
    return { allowed: false, reasons: e.reasons };
  }
};

const okApproval = () => {
  const c = cart("A-KETTLE-01");
  return approve(POLICY, c, evaluateCart(POLICY, c));
};

// --- Result table --------------------------------------------------------------
const rows = [];
function row(id, name, { input, expected, actual, method, pass, notes = "" }) {
  rows.push({ id, name, input, expected, actual, method, status: pass === null ? "BLOCKED" : pass ? "PASS" : "FAIL", notes });
}
const UNIT = "automated unit probe (real gate code, PayPal order shape mocked)";

// T1 valid purchase
{
  const c = cart("A-KETTLE-01");
  const ev = evaluateCart(POLICY, c);
  const cap = capturable(approve(POLICY, c, ev), ppOrder(c));
  row("T1", "Valid purchase", {
    input: "A-KETTLE-01 @ 45.00 USD x1, Merchant A",
    expected: "Allowed to proceed",
    actual: `evaluateCart=${ev.decision}; assertCapturable allowed=${cap.allowed}`,
    method: UNIT,
    pass: ev.decision === Decision.CAPTURE && cap.allowed,
    notes: "There is no 'user approves exact purchase' step in Witness. approve() is issued by Witness's own code; the only human approval is PayPal buyer approval of the order.",
  });
}

// T2 excessive amount
{
  const c = cart({ sku: "A-KETTLE-01", unit_amount: "75.00", quantity: 1 });
  const ev = evaluateCart(POLICY, c);
  const post = capturable(okApproval(), ppOrder(cart("A-KETTLE-01"), { amount: "75.00" }));
  row("T2", "Excessive amount ($75)", {
    input: "Same SKU at 75.00; and a 45.00 approval against a PayPal order of 75.00",
    expected: "Denied before payment execution",
    actual: `evaluateCart=${ev.decision} (${ev.checks.find((x) => x.id === "max_total").detail}); post-approval capture allowed=${post.allowed}`,
    method: UNIT,
    pass: ev.decision === Decision.VOID && !post.allowed,
    notes: "Denied before CAPTURE. In the designed flow the buyer has already approved and PayPal has already placed an authorization hold; Witness voids it. So it is prevented from being captured, not prevented from being authorized.",
  });
}

// T3 merchant substitution
{
  const c = cart("B-KETTLE-01");
  const ev = evaluateCart(POLICY, c);
  row("T3", "Merchant substitution (A -> B)", {
    input: "B-KETTLE-01: same product and price, merchant MERCHANT-B; policy.merchant = MERCHANT-A",
    expected: "Denied",
    actual: `evaluateCart=${ev.decision}; checks run: ${ev.checks.map((x) => x.id).join(", ")}`,
    method: UNIT,
    pass: ev.decision !== Decision.CAPTURE,
    notes: "MISSING CAPABILITY: the gate ignores policy.merchant. Unknown policy fields are silently dropped, so the policy looks like it restricts the merchant but does not.",
  });
}

// T4 product substitution
{
  const sameCat = evaluateCart(POLICY, cart("A-KETTLE-02"));
  const otherCat = evaluateCart(POLICY, cart("A-TOAST-01"));
  const swap = capturable(okApproval(), ppOrder(cart("A-KETTLE-02"), { amount: "45.00" }));
  row("T4a", "Product substitution, same category", {
    input: "A-KETTLE-02 (different product, kettle, 39.00); policy.sku = A-KETTLE-01",
    expected: "Denied, or additional approval (HOLD)",
    actual: `evaluateCart=${sameCat.decision}`,
    method: UNIT,
    pass: sameCat.decision !== Decision.CAPTURE,
    notes: "MISSING CAPABILITY: no SKU allow-list and no substitution policy. Products are matched only on category/size/colour. on_ambiguity covers missing attributes, not substitutions.",
  });
  row("T4b", "Product substitution, different category", {
    input: "A-TOAST-01 (toaster, 45.00)",
    expected: "Denied",
    actual: `evaluateCart=${otherCat.decision}`,
    method: UNIT,
    pass: otherCat.decision === Decision.VOID,
  });
  row("T4c", "Product swapped after approval", {
    input: "Approval for A-KETTLE-01; PayPal order holds A-KETTLE-02 at the approved total",
    expected: "Capture refused",
    actual: `allowed=${swap.allowed}; ${swap.reasons.join(" | ")}`,
    method: UNIT,
    pass: !swap.allowed,
    notes: "This is the Gate 3 cart-swap check. It works in the unit probe; spike 04 tests it on a real sandbox order.",
  });
}

// T5 currency substitution
{
  const ev = evaluateCart(POLICY, { ...cart("A-KETTLE-01"), currency: "EUR" });
  const post = capturable(okApproval(), ppOrder(cart("A-KETTLE-01"), { currency: "EUR" }));
  row("T5", "Currency substitution (USD -> EUR)", {
    input: "Cart in EUR; and USD approval vs EUR PayPal order",
    expected: "Denied",
    actual: `evaluateCart=${ev.decision}; post-approval allowed=${post.allowed}`,
    method: UNIT,
    pass: ev.decision === Decision.VOID && !post.allowed,
  });
}

// T6 transaction changed after authorization
{
  const base = cart("A-KETTLE-01");
  const variants = {
    amount: ppOrder(base, { amount: "49.00" }),
    quantity: ppOrder(cart({ sku: "A-KETTLE-01", quantity: 2 })),
    currency: ppOrder(base, { currency: "EUR" }),
    sku: ppOrder(cart("A-KETTLE-02"), { amount: "45.00" }),
    merchant: ppOrder(base, { payee: "MERCHANT-B-PAYPAL-ID" }),
  };
  const results = Object.fromEntries(Object.entries(variants).map(([k, o]) => [k, capturable(okApproval(), o).allowed]));
  const leaked = Object.entries(results).filter(([, allowed]) => allowed).map(([k]) => k);
  row("T6", "Transaction changed after authorization", {
    input: "One approval vs PayPal orders that differ in amount / quantity / currency / SKU / payee",
    expected: "Every modified transaction refused",
    actual: Object.entries(results).map(([k, a]) => `${k}:${a ? "ALLOWED" : "refused"}`).join(", "),
    method: UNIT,
    pass: leaked.length === 0,
    notes: leaked.length ? `Not detected: ${leaked.join(", ")}. threeWayMatch never reads purchase_units[].payee.` : "",
  });
}

// T7 replay
{
  const a = okApproval();
  const first = capturable(a, ppOrder(cart("A-KETTLE-01"), { id: "ORDER-1" }));
  const second = capturable(a, ppOrder(cart("A-KETTLE-01"), { id: "ORDER-2" }));
  row("T7", "Replay of an approval", {
    input: "One approval presented for two different PayPal orders with identical carts",
    expected: "Second use refused",
    actual: `ORDER-1 allowed=${first.allowed}; ORDER-2 allowed=${second.allowed}`,
    method: UNIT,
    pass: first.allowed && !second.allowed,
    notes: "An approval is not bound to an order ID and is never marked used. It also has no expiry. A second capture on the SAME authorization should be rejected by PayPal (final_capture: true), but that is PayPal's check and is untested until Phase B. Each POST gets a fresh random PayPal-Request-Id, so a client retry after a timeout is not idempotent.",
  });
}

// T8 missing authorization
{
  const r = capturable(null, ppOrder(cart("A-KETTLE-01")));
  row("T8", "Missing authorization", {
    input: "assertCapturable(null, order)",
    expected: "Rejected",
    actual: `allowed=${r.allowed}; ${r.reasons.join(" | ")}`,
    method: UNIT,
    pass: !r.allowed,
    notes: "Passes only for callers that choose to call the gate. See T9.",
  });
}

// T9a forged approval: nothing proves an approval came from the policy engine
{
  const bad = cart("B-KETTLE-01"); // merchant B; could equally be $75 or EUR
  bad.items[0].unit_amount = "75.00";
  const forged = { cart: bad, cartDigest: (await import("../spikes/lib/gate.mjs")).cartDigest(bad), amount: "75.00", currency: "USD" };
  const r = capturable(forged, ppOrder(bad));
  row("T9a", "Forged approval object", {
    input: "Hand-built approval literal for a $75 Merchant-B cart that evaluateCart rejects",
    expected: "Rejected",
    actual: `allowed=${r.allowed}`,
    method: UNIT,
    pass: !r.allowed,
    notes: "An approval is an unsigned in-memory object. assertCapturable checks its shape, not where it came from: no signature, no policy-version check, no server-side lookup.",
  });
}

// T9b direct execution bypass through the shipped PayPal client
{
  process.env.PAYPAL_CLIENT_ID ||= "offline-probe-not-a-credential";
  process.env.PAYPAL_CLIENT_SECRET ||= "offline-probe-not-a-credential";
  process.env.PAYPAL_BASE_URL = "https://api-m.sandbox.paypal.com";
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    seen.push({ method: init.method ?? "GET", url: String(url) });
    const body = String(url).endsWith("/v1/oauth2/token")
      ? { access_token: "mock", expires_in: 3600, scope: "" }
      : { id: "MOCK-CAPTURE", status: "COMPLETED" };
    return new Response(JSON.stringify(body), { status: 201, headers: { "content-type": "application/json" } });
  };
  let file;
  try {
    const { captureAuthorization } = await import(pathToFileURL(join(LIB, "orders.mjs")));
    const res = await captureAuthorization("ANY-AUTH-ID", { currency_code: "USD", value: "75.00" });
    file = res.file;
  } finally {
    globalThis.fetch = realFetch;
  }
  // Remove the mock log so it can't be mistaken for sandbox evidence later.
  if (file && existsSync(file)) rmSync(file);
  const out = file && dirname(file);
  if (out && existsSync(out) && readdirSync(out).length === 0) rmdirSync(out);

  const capCall = seen.find((s) => s.url.includes("/capture"));
  row("T9b", "Direct execution bypass", {
    input: "captureAuthorization('ANY-AUTH-ID', 75.00 USD) with no approval, fetch replaced by a recorder",
    expected: "No path reaches PayPal capture without the gate",
    actual: capCall ? `client sent ${capCall.method} ${new URL(capCall.url).pathname}; gate never consulted` : "no capture request issued",
    method: "automated probe of the real client with fetch mocked (no network)",
    pass: !capCall,
    notes: "The gate is a library function that callers choose to call; it is not an enforcement point. orders.captureAuthorization and paypal() are exported and capture with no approval. Spike 02 line 61 does exactly this on purpose. Anyone holding the client secret can also call PayPal directly.",
  });
}

// T10 merchant isolation
{
  const r = capturable(okApproval(), ppOrder(cart("A-KETTLE-01"), { payee: "MERCHANT-B-PAYPAL-ID" }));
  row("T10", "Merchant isolation", {
    input: "Merchant A approval applied to an order whose payee is Merchant B",
    expected: "Rejected",
    actual: `allowed=${r.allowed}`,
    method: UNIT + " + manual inspection",
    pass: !r.allowed,
    notes: "MISSING CAPABILITY: there is no merchant or tenant model. One global PAYPAL_CLIENT_ID/SECRET; approvals carry no merchant; the matcher ignores payee.",
  });
}

// --- Extra probes found while reading the code --------------------------------
{
  const neg = cart({ sku: "A-KETTLE-02", quantity: 2 }, { sku: "A-KETTLE-01", quantity: -1 });
  const ev = evaluateCart(POLICY, neg);
  row("X1", "Negative quantity defeats total and quantity checks", {
    input: "A-KETTLE-02 x2 (78.00) + A-KETTLE-01 x-1 (-45.00)",
    expected: "Rejected as malformed",
    actual: `evaluateCart=${ev.decision}, total=${ev.total}`,
    method: UNIT,
    pass: ev.decision !== Decision.CAPTURE,
    notes: "No validation of item shape (quantity > 0, integer, price >= 0). PayPal would probably reject the order downstream; that is unverified.",
  });
}
{
  const a = okApproval();
  let mutated = true;
  try {
    a.cart.items[0].sku = "A-KETTLE-02";
    a.cart.items[0].unit_amount = "45.00";
  } catch {
    mutated = false;
  }
  const r = capturable(a, ppOrder(cart("A-KETTLE-02"), { amount: "45.00" }));
  row("X2", "Approval is only shallowly frozen", {
    input: "Mutate approval.cart.items[0] to match a swapped order",
    expected: "Mutation impossible, or caught",
    actual: `mutation succeeded=${mutated}; capture allowed=${r.allowed} (${r.reasons.join(" | ")})`,
    method: UNIT,
    pass: !r.allowed,
    notes: "Object.freeze is shallow. The cartDigest check catches the change, so the result holds, but only because of that one fallback line.",
  });
}
{
  const a = okApproval();
  const revoked = { ...POLICY, version: 2, max_total: "40.00" };
  const stillOk = evaluateCart(revoked, cart("A-KETTLE-01")).decision;
  const old = { ...a, issuedAt: "2020-01-01T00:00:00.000Z" };
  const r = capturable(old, ppOrder(cart("A-KETTLE-01")));
  row("X3", "Policy change / expiry not enforced at capture", {
    input: "Policy tightened to v2 (max 40.00); v1 approval issued in 2020",
    expected: "Stale approval rejected",
    actual: `v2 would decide ${stillOk}; old v1 approval capture allowed=${r.allowed}`,
    method: UNIT,
    pass: !r.allowed,
    notes: "policyVersion and issuedAt are recorded but never checked; assertCapturable takes no policy argument.",
  });
}
{
  const extra = { payee: { merchant_id: "MERCHANT-A-PAYPAL-ID" }, amount: { currency_code: "USD", value: "500.00" }, items: [{ name: "x", sku: "A-TOAST-01", quantity: "1", unit_amount: { currency_code: "USD", value: "500.00" } }] };
  const r = capturable(okApproval(), ppOrder(cart("A-KETTLE-01"), { extraUnits: [extra] }));
  row("X4", "Extra purchase units are ignored", {
    input: "PayPal order with an approved purchase_units[0] plus purchase_units[1] of 500.00",
    expected: "Refused",
    actual: `allowed=${r.allowed}`,
    method: UNIT,
    pass: !r.allowed,
    notes: "cartFromPayPalOrder reads only purchase_units[0]. Witness's own capture is still bounded to the approved amount, but the second unit's authorization is unexamined.",
  });
}
{
  // Import paypal.mjs in a child with a production host that contains the word "sandbox".
  // Import makes no network call; this only tests the guard.
  const url = pathToFileURL(join(LIB, "paypal.mjs")).href;
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", `await import(${JSON.stringify(url)}); console.log("guard-passed")`], {
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, PAYPAL_BASE_URL: "https://api-m.paypal.com/?sandbox" },
    encoding: "utf8",
  });
  const passed = child.stdout.includes("guard-passed");
  row("X5", "Sandbox guard is a substring check", {
    input: "PAYPAL_BASE_URL=https://api-m.paypal.com/?sandbox (the production host)",
    expected: "Refused",
    actual: passed ? "guard accepted the production host" : "guard refused",
    method: "automated probe, child process, no network",
    pass: !passed,
    notes: "paypal.mjs uses BASE_URL.includes('sandbox'). It should compare the parsed hostname with api-m.sandbox.paypal.com exactly.",
  });
}

// --- Report --------------------------------------------------------------------
for (const r of rows) {
  console.log(`\n[${r.status}] ${r.id} ${r.name}`);
  console.log(`  input:    ${r.input}`);
  console.log(`  expected: ${r.expected}`);
  console.log(`  actual:   ${r.actual}`);
  console.log(`  method:   ${r.method}`);
  if (r.notes) console.log(`  notes:    ${r.notes}`);
}
const tally = rows.reduce((t, r) => ({ ...t, [r.status]: (t[r.status] ?? 0) + 1 }), {});
console.log(`\n${Object.entries(tally).map(([k, v]) => `${k}: ${v}`).join("  ")}`);
