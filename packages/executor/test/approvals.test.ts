import { describe, expect, test } from "vitest";
import { assertConsumed, type ConsumedApproval } from "../src/approvals.ts";

describe("T9a: forged approvals", () => {
  test("a hand-built approval object is refused at run time, even if it satisfies the type", () => {
    const forged = {
      id: "apr_forged",
      purchase_id: "pur_x",
      tenant_id: "ten_x",
      paypal_order_id: "ORDER",
      paypal_authorization_id: "AUTH",
      payee_merchant_id: "PAYEE",
      amount_cents: 7500,
      currency: "USD",
      cart_digest: "sha256:x",
      policy_digest: "sha256:y",
      intent_version: 1,
      request_id: "req",
      expires_at: new Date(Date.now() + 60_000),
      used_at: new Date(),
    } as unknown as ConsumedApproval; // the cast is the only way to even compile this
    expect(() => assertConsumed(forged)).toThrow(/not obtained through consumeApproval/);
  });
});
