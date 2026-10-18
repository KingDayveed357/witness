// ADR-0016: transfer intents. Deterministic screening derives the cart from the confirmed intent,
// refuses requests of the other kind, and leaves legacy shopping policies byte-identical.
import { describe, expect, test } from "vitest";
import { PolicyV1, parseIntentPolicy, parsePaymentRequest, policyDigest, screenOutcome, screenPayment, type TransferPolicyV1, type TransferRequest } from "../src/index.ts";
import { CTX, POLICY, factsMap, req } from "./fixtures.ts";

const TRANSFER: TransferPolicyV1 = {
  version: 1,
  kind: "transfer",
  payee: { id: "payee_jmorgan", name: "J. Morgan", first_payment: true },
  amount_cents: 180000,
  currency: "USD",
  expires_at: "2099-01-01T00:00:00Z",
  max_payments: 1,
};
const conversation = { context: "", lines: [{ speaker: "J. Morgan", text: "Invoice attached." }] };
const TR: TransferRequest = { kind: "transfer", intent_id: "int", payee_id: "payee_jmorgan", amount_cents: 180000, currency: "USD", conversation };

describe("transfer screening", () => {
  test("matching request proceeds; the cart is one line derived from the intent", () => {
    const r = screenPayment(TRANSFER, TR, new Map(), CTX);
    expect(screenOutcome(r.checks)).toBe("PROCEED");
    expect(r.cart).toMatchObject({ currency: "USD", total_cents: 180000, lines: [{ product_id: "transfer:payee_jmorgan", unit_cents: 180000, quantity: 1 }] });
  });

  test("amount, payee or currency different from the confirmed intent → fail; the cart still reflects the intent", () => {
    for (const [over, id] of [[{ amount_cents: 180001 }, "transfer.amount"], [{ payee_id: "payee_x" }, "transfer.payee"], [{ currency: "EUR" }, "currency"]] as const) {
      const r = screenPayment(TRANSFER, { ...TR, ...over }, new Map(), CTX);
      expect(r.checks.find((c) => c.id === id)?.result).toBe("fail");
      expect(r.cart?.total_cents).toBe(180000);
    }
  });

  test("expired intent and used-up intent fail like shopping intents", () => {
    expect(screenPayment({ ...TRANSFER, expires_at: "2000-01-01T00:00:00Z" }, TR, new Map(), CTX).checks.find((c) => c.id === "intent.not_expired")?.result).toBe("fail");
    expect(screenPayment(TRANSFER, TR, new Map(), { ...CTX, purchasesUsed: 1 }).checks.find((c) => c.id === "intent.purchases_left")?.result).toBe("fail");
  });

  test("kind mismatch fails in both directions with no cart", () => {
    const a = screenPayment(POLICY, TR, new Map(), CTX);
    const b = screenPayment(TRANSFER, req("TRL-GRY-10"), factsMap("TRL-GRY-10"), CTX);
    for (const r of [a, b]) {
      expect(r.cart).toBeNull();
      expect(r.checks).toEqual([expect.objectContaining({ id: "intent.kind", result: "fail" })]);
    }
  });
});

describe("parsing", () => {
  test("a policy without kind is a shopping policy and its digest is unchanged by parsing", () => {
    const raw = PolicyV1.parse(POLICY);
    const parsed = parseIntentPolicy(raw);
    expect(parsed.success && parsed.data).toEqual(raw);
    expect(parsed.success && "kind" in parsed.data).toBe(false);
    expect(policyDigest(parsed.success ? parsed.data : raw)).toBe(policyDigest(raw));
  });

  test("transfer policy is strict and dispatches on kind", () => {
    expect(parseIntentPolicy(TRANSFER).success).toBe(true);
    expect(parseIntentPolicy({ ...TRANSFER, retailers: ["rei.com"] }).success).toBe(false);
    expect(parseIntentPolicy({ ...TRANSFER, kind: "shopping" }).success).toBe(false);
  });

  test("a conversation is optional on transfers (ADR-0019) but must be well-formed when given", () => {
    const { conversation: _c, ...bare } = TR;
    expect(parsePaymentRequest(bare).success).toBe(true);
    expect(parsePaymentRequest(TR).success).toBe(true);
    expect(parsePaymentRequest({ ...TR, conversation: { lines: [] } }).success).toBe(false);
    expect(parsePaymentRequest(req("TRL-GRY-10")).success).toBe(true);
  });
});

describe("the payer's review rule (ADR-0019)", () => {
  const ruled = { ...TRANSFER, review_threshold_cents: 50000 };
  const rule = (p: TransferPolicyV1) => screenPayment(p, { ...TR, amount_cents: p.amount_cents }, new Map(), CTX).checks.find((c) => c.id === "transfer.review_rule");
  test("a first payment at or above the payer's threshold is held for a second look, with no AI involved", () => {
    const c = rule(ruled);
    expect(c).toMatchObject({ result: "unknown" });
    expect(c?.detail).toMatch(/second look for first payments of \$500\.00 or more/);
    expect(screenOutcome(screenPayment(ruled, TR, new Map(), CTX).checks)).toBe("HOLD");
  });
  test("below the threshold, or paid before, the rule passes; no rule set means no check", () => {
    expect(rule({ ...ruled, amount_cents: 49999 })?.result).toBe("pass");
    expect(rule({ ...ruled, payee: { ...ruled.payee, first_payment: false } })?.result).toBe("pass");
    expect(rule(TRANSFER)).toBeUndefined();
  });
  test("the rule never fails a payment: the payer decides with a reviewer, the engine doesn't refuse", () => {
    expect(screenPayment(ruled, TR, new Map(), CTX).checks.some((c) => c.result === "fail")).toBe(false);
  });
});
