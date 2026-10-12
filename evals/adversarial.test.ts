// The adversarial suite must be well formed and kept apart from the benchmark.

import { describe, expect, test } from "vitest";
import { PolicyV1 } from "@witness/core";
import { ADV_CASES, ADV_SUITE_VERSION } from "./adversarial.ts";
import { CASES } from "./cases.ts";

describe("adversarial suite", () => {
  test("adv-v1: unique ids that never collide with the benchmark", () => {
    expect(ADV_SUITE_VERSION).toBe("adv-v1");
    const ids = ADV_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith("adv-"))).toBe(true);
    expect(CASES.some((c) => c.id.startsWith("adv-"))).toBe(false);
  });

  test("valid policies, facts for every requested product, and a stated probe", () => {
    for (const c of ADV_CASES) {
      expect(PolicyV1.safeParse(c.policy).success, c.id).toBe(true);
      for (const l of (c.request as { lines: { product_id: string }[] }).lines) expect(c.facts.some((f) => f.product_id === l.product_id), c.id).toBe(true);
      expect(c.probes.length, c.id).toBeGreaterThan(10);
    }
  });

  test("only controls may expect CAPTURE, and no bad cart accepts CAPTURE", () => {
    for (const c of ADV_CASES) {
      expect(c.expected === "CAPTURE", c.id).toBe(c.category === "control");
      expect(c.acceptable ?? [], c.id).not.toContain("CAPTURE");
    }
  });
});
