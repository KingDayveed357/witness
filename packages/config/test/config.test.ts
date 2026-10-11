import { describe, expect, test } from "vitest";
import { ApiConfig, parseConfig } from "../src/index.ts";

const base = { DATABASE_URL: "postgres://x", PAYPAL_CLIENT_ID: "id", PAYPAL_CLIENT_SECRET: "secret" };

describe("config", () => {
  test("blank dashboard values count as unset", () => {
    const c = parseConfig(ApiConfig, { ...base, PAYPAL_WEBHOOK_ID: "", WITNESS_DEMO_SHOPPER_ID: "  ", CHANNEL3_API_KEY: "" });
    expect(c.PAYPAL_WEBHOOK_ID).toBeUndefined();
    expect(c.WITNESS_DEMO_SHOPPER_ID).toBeUndefined();
    expect(c.CHANNEL3_API_KEY).toBeUndefined();
    expect(c.PORT).toBe(4000);
  });

  test("missing required values name the variable but never echo values", () => {
    expect(() => parseConfig(ApiConfig, { ...base, PAYPAL_CLIENT_SECRET: "" })).toThrow(/PAYPAL_CLIENT_SECRET/);
    try {
      parseConfig(ApiConfig, { ...base, PAYPAL_CLIENT_ID: "" });
    } catch (e) {
      expect((e as Error).message).not.toMatch(/secret|postgres:\/\/x/);
    }
  });
});
