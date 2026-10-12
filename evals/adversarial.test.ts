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

describe("adversarial suite adv-v2", () => {
  test("unique ids, no collision with the benchmark or adv-v1", async () => {
    const { ADV2_CASES, ADV2_SUITE_VERSION } = await import("./adversarial-v2.ts");
    expect(ADV2_SUITE_VERSION).toBe("adv-v2");
    const ids = ADV2_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const others = new Set([...CASES, ...ADV_CASES].map((c) => c.id));
    expect(ids.filter((id) => others.has(id))).toEqual([]);
  });

  test("valid policies, facts present, probes stated; only controls expect CAPTURE", async () => {
    const { ADV2_CASES } = await import("./adversarial-v2.ts");
    for (const c of ADV2_CASES) {
      expect(PolicyV1.safeParse(c.policy).success, c.id).toBe(true);
      for (const l of (c.request as { lines: { product_id: string }[] }).lines) expect(c.facts.some((f) => f.product_id === l.product_id), c.id).toBe(true);
      expect(c.probes.length, c.id).toBeGreaterThan(10);
      expect(c.expected === "CAPTURE", c.id).toBe(c.category === "control");
      expect(c.acceptable ?? [], c.id).not.toContain("CAPTURE");
    }
  });

  test("no listing text is copied from adv-v1", async () => {
    const { ADV2_CASES } = await import("./adversarial-v2.ts");
    const v1 = new Set(ADV_CASES.flatMap((c) => c.facts.flatMap((f) => [f.title, f.description ?? ""])).filter(Boolean));
    for (const c of ADV2_CASES) for (const f of c.facts) expect(v1.has(f.title) || (f.description !== undefined && v1.has(f.description)), c.id).toBe(false);
  });
});
