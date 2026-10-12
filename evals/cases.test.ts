// The eval set itself must be well formed, and the eval function must agree with the engine.

import { describe, expect, test } from "vitest";
import { PolicyV1 } from "@witness/core";
import { CASES } from "./cases.ts";

describe("eval cases", () => {
  test("72 cases with unique ids, distributed as docs/evals.md says", () => {
    expect(CASES).toHaveLength(72);
    expect(new Set(CASES.map((c) => c.id)).size).toBe(72);
    const count = (cat: string) => CASES.filter((c) => c.category === cat).length;
    expect({ clean: count("clean"), hard: count("hard_violation"), semantic: count("semantic_violation"), ambiguity: count("ambiguity"), injection: count("injection"), substitution: count("substitution"), overpriced: count("overpriced"), malformed: count("malformed") }).toEqual({
      clean: 14, hard: 12, semantic: 10, ambiguity: 8, injection: 12, substitution: 8, overpriced: 6, malformed: 2,
    });
  });

  test("every policy is a valid PolicyV1 and every requested product has facts", () => {
    for (const c of CASES) {
      expect(PolicyV1.safeParse(c.policy).success, c.id).toBe(true);
      if (c.category === "malformed") continue;
      const ids = (c.request as { lines: { product_id: string }[] }).lines.map((l) => l.product_id);
      for (const id of ids) expect(c.facts.some((f) => f.product_id === id), `${c.id} ${id}`).toBe(true);
    }
  });

  test("no bad cart lists CAPTURE as acceptable", () => {
    for (const c of CASES.filter((x) => x.expected !== "CAPTURE")) expect(c.acceptable ?? []).not.toContain("CAPTURE");
  });
});
