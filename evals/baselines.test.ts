// Frozen regression baselines (Checkpoint 4 remediation, 2026-10-12). suite1-v2 and adv-v1 must not
// change: they are the before/after yardstick for every later fix. A change here means a new suite
// version (new file, new id), never an edit. Their pre-remediation reports are in evals/baselines/.

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { ADV_CASES } from "./adversarial.ts";
import { CASES } from "./cases.ts";

const fingerprint = (x: unknown) => createHash("sha256").update(JSON.stringify(x)).digest("hex");

describe("frozen baselines", () => {
  test("suite1-v2 case set is unchanged", () => {
    expect(fingerprint(CASES)).toBe("5d2e674661d4e3d031bbe823ff3eef4b32ba4ca83142f662333990cc9bf5453b");
  });

  test("adv-v1 case set is unchanged", () => {
    expect(fingerprint(ADV_CASES)).toBe("1a9565a25c024770dc4d4fa0b92aa2094ab3483bd920ba77eb5d760005701a9d");
  });

  test("pre-remediation reports are kept", () => {
    for (const f of ["suite1-v2-2026-10-12", "adv-v1-2026-10-12"]) for (const ext of ["md", "json"]) expect(existsSync(join(import.meta.dirname, "baselines", `${f}.${ext}`)), `${f}.${ext}`).toBe(true);
  });
});
