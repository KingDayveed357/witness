// Offline tests for the capture gate. Run: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateCart, approve, assertCapturable, threeWayMatch, cartDigest, Decision, GateRefusal } from "../spikes/lib/gate.mjs";
import { cartOf, PRODUCTS, TRAIL_SHOE_POLICY as P } from "../spikes/lib/catalog.mjs";

// Shape a cart the way PayPal returns an order, so tests exercise the real matcher.
function paypalOrder(cart, amount) {
  const total = amount ?? cart.items.reduce((s, i) => s + Number(i.unit_amount) * i.quantity, 0).toFixed(2);
  return {
    purchase_units: [{
      amount: { currency_code: cart.currency, value: total },
      items: cart.items.map((i) => ({ name: i.name, sku: i.sku, quantity: String(i.quantity), unit_amount: { currency_code: cart.currency, value: i.unit_amount } })),
    }],
  };
}

test("compliant cart -> CAPTURE", () => {
  assert.equal(evaluateCart(P, cartOf("TRL-GRY-10")).decision, Decision.CAPTURE);
});

test("excluded colour -> VOID, even when the colour has a marketing name", () => {
  const r = evaluateCart(P, cartOf("TRL-WHT-10"));
  assert.equal(r.decision, Decision.VOID);
  assert.ok(r.checks.some((c) => c.id.startsWith("color") && c.result === "fail"));
});

test("over budget -> VOID", () => {
  assert.equal(evaluateCart(P, cartOf("TRL-PRO-10")).decision, Decision.VOID);
});

test("wrong category -> VOID", () => {
  assert.equal(evaluateCart(P, cartOf("RD-BLU-10")).decision, Decision.VOID);
});

test("several violations are all reported", () => {
  const r = evaluateCart(P, cartOf("TRL-PRO-10"));
  const failed = r.checks.filter((c) => c.result === "fail").map((c) => c.id.split(":")[0]);
  assert.deepEqual(new Set(failed), new Set(["max_total", "color"]));
});

test("missing attribute -> HOLD, never CAPTURE", () => {
  const cart = { currency: "USD", items: [{ ...PRODUCTS["TRL-GRY-10"], attributes: { size: "10", category: "trail-running shoes" }, quantity: 1 }] };
  assert.equal(evaluateCart(P, cart).decision, Decision.HOLD);
});

test("wrong currency -> VOID", () => {
  assert.equal(evaluateCart(P, { ...cartOf("TRL-GRY-10"), currency: "EUR" }).decision, Decision.VOID);
});

test("extra quantity -> VOID", () => {
  const cart = cartOf("TRL-GRY-10");
  cart.items[0].quantity = 2;
  assert.equal(evaluateCart({ ...P, max_total: "500.00" }, cart).decision, Decision.VOID);
});

test("approval cannot be issued for a non-CAPTURE decision", () => {
  const cart = cartOf("TRL-WHT-10");
  assert.throws(() => approve(P, cart, evaluateCart(P, cart)));
});

test("digest ignores item order and display names, not SKU, qty or price", () => {
  const a = cartOf("TRL-GRY-10", "RD-BLU-10");
  const b = cartOf("RD-BLU-10", "TRL-GRY-10");
  b.items[0].name = "renamed";
  assert.equal(cartDigest(a), cartDigest(b));
  b.items[1].unit_amount = "83.99";
  assert.notEqual(cartDigest(a), cartDigest(b));
});

test("exact match on PayPal's order -> capture amount is the approved amount", () => {
  const cart = cartOf("TRL-GRY-10");
  const approval = approve(P, cart, evaluateCart(P, cart));
  assert.deepEqual(assertCapturable(approval, paypalOrder(cart)), { currency_code: "USD", value: "84.00" });
});

test("cart swap at the same price is refused", () => {
  const cart = cartOf("TRL-GRY-10");
  const approval = approve(P, cart, evaluateCart(P, cart));
  const swapped = paypalOrder(cartOf("TRL-WHT-10"));
  assert.throws(() => assertCapturable(approval, swapped), GateRefusal);
  const diffs = threeWayMatch(approval, swapped);
  assert.ok(diffs.some((d) => d.includes("TRL-GRY-10")) && diffs.some((d) => d.includes("TRL-WHT-10")));
});

test("same items but a higher authorized amount is refused", () => {
  const cart = cartOf("TRL-GRY-10");
  const approval = approve(P, cart, evaluateCart(P, cart));
  assert.throws(() => assertCapturable(approval, paypalOrder(cart, "89.00")), /amount/);
});

test("an extra item slipped into PayPal's order is refused", () => {
  const cart = cartOf("TRL-GRY-10");
  const approval = approve(P, cart, evaluateCart(P, cart));
  assert.throws(() => assertCapturable(approval, paypalOrder(cartOf("TRL-GRY-10", "RD-BLU-10"), "84.00")), /unapproved/);
});

test("no approval -> no capture", () => {
  assert.throws(() => assertCapturable(null, paypalOrder(cartOf("TRL-GRY-10"))), GateRefusal);
});

test("approvals are immutable", () => {
  const cart = cartOf("TRL-GRY-10");
  const approval = approve(P, cart, evaluateCart(P, cart));
  assert.throws(() => { "use strict"; approval.amount = "999.00"; });
  cart.items[0].unit_amount = "1.00"; // mutating the original cart must not change the approval
  assert.equal(approval.cart.items[0].unit_amount, "84.00");
});
