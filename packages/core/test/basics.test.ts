import { describe, expect, test } from "vitest";
import {
  IllegalTransition,
  STATES,
  WITNESS_NAMESPACE,
  assertTransition,
  canTransition,
  expectedItems,
  fromCents,
  isTerminal,
  paypalRequestId,
  policyDigest,
  resolveCart,
  standardAdapter,
  swapAdapter,
  threeWayMatch,
  toCents,
  uuidv5,
} from "../src/index.ts";
import { POLICY, factsMap, req } from "./fixtures.ts";

describe("money", () => {
  test("round-trips cents exactly", () => {
    expect(toCents("84.00")).toBe(8400);
    expect(toCents("84.5")).toBe(8450);
    expect(toCents("0.07")).toBe(7);
    expect(fromCents(8400)).toBe("84.00");
    expect(fromCents(7)).toBe("0.07");
  });

  test.each(["-1.00", "1e3", "84.001", "", " 84.00", "084.00", "NaN"])("rejects %j", (v) => {
    expect(() => toCents(v)).toThrow();
  });
});

describe("deterministic IDs", () => {
  test("uuidv5 matches Python's reference implementation", () => {
    expect(uuidv5("python.org", "6ba7b810-9dad-11d1-80b4-00c04fd430c8")).toBe("886313e1-3b8a-5372-9b90-0c9aee199e5d");
    expect(uuidv5("capture:apr_test", WITNESS_NAMESPACE)).toBe("59811e21-b0de-51fa-9532-2d8c882f0f98");
  });

  test("PayPal-Request-Id is stable per subject and operation", () => {
    expect(paypalRequestId("apr_test", "capture")).toBe(paypalRequestId("apr_test", "capture"));
    expect(paypalRequestId("apr_test", "capture")).not.toBe(paypalRequestId("apr_test", "void"));
  });
});

describe("state machine", () => {
  test("the happy path is legal", () => {
    const path = ["SCREENING", "AUTHORIZING", "VERIFYING", "CAPTURE_APPROVED", "CAPTURING", "CAPTURED"] as const;
    for (let i = 1; i < path.length; i++) expect(() => assertTransition(path[i - 1]!, path[i]!)).not.toThrow();
  });

  test("illegal transitions throw", () => {
    expect(() => assertTransition("SCREENING", "CAPTURED")).toThrow(IllegalTransition);
    expect(() => assertTransition("REJECTED", "AUTHORIZING")).toThrow(IllegalTransition);
    expect(() => assertTransition("VOIDED", "CAPTURING")).toThrow(IllegalTransition);
    expect(() => assertTransition("HELD", "CAPTURED")).toThrow(IllegalTransition);
  });

  test("nothing reaches CAPTURING except through CAPTURE_APPROVED or reconciliation", () => {
    const into = STATES.filter((s) => canTransition(s, "CAPTURING"));
    expect(into.sort()).toEqual(["CAPTURE_APPROVED", "NEEDS_RECONCILE"]);
  });

  test("terminal states have no exits", () => {
    for (const s of ["REJECTED", "AUTH_FAILED", "VOIDED", "CAPTURE_DECLINED", "REFUNDED"] as const) expect(isTerminal(s)).toBe(true);
  });
});

describe("checkout adapters", () => {
  const { cart } = resolveCart(req("TRL-GRY-10"), factsMap("TRL-GRY-10"));
  const ctx = { purchaseId: "pur_1", policyDigest: policyDigest(POLICY), vaultId: "vault_1" };

  // Pretend PayPal stored exactly what we sent, with the payee filled in.
  const asStored = (body: Record<string, unknown>) => {
    const pu = (body.purchase_units as Record<string, unknown>[])[0]!;
    return { id: "ORDER-1", status: "COMPLETED", purchase_units: [{ payee: { merchant_id: "PAYEE" }, ...pu }] };
  };
  const exp = { order_id: "ORDER-1", currency: "USD", amount_cents: 8400, payee_merchant_id: "PAYEE", items: expectedItems(cart!) };

  test("the standard adapter's order matches the approval", () => {
    const body = standardAdapter.buildOrder(cart!, ctx);
    expect(body.intent).toBe("AUTHORIZE");
    expect(threeWayMatch(exp, asStored(body))).toEqual([]);
  });

  test("the swap adapter's order is caught", () => {
    const body = swapAdapter({ sku: "TRL-WHT-10", name: "White" }).buildOrder(cart!, ctx);
    expect(threeWayMatch(exp, asStored(body))).toHaveLength(2);
  });

  test("custom_id carries the purchase and policy digest within PayPal's 255-char limit", () => {
    const body = standardAdapter.buildOrder(cart!, ctx) as { purchase_units: { custom_id: string }[] };
    const custom = body.purchase_units[0]!.custom_id;
    expect(custom.startsWith("w1:pur_1:")).toBe(true);
    expect(custom.length).toBeLessThanOrEqual(255);
  });
});
