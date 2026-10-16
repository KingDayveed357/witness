// Offline fail-safe tests for the Second Key manipulation detector (no network): every model failure or untrustworthy
// output leads to human review, invented quotes are discarded, and policy can override a "low" verdict.
import { describe, expect, test } from "vitest";
import { FakeLlm, checkManipulation, type AiFailureReason } from "@witness/ai";
import { assess, decide, locate, type Conversation } from "../src/manipulation.ts";

const conv: Conversation = {
  context: "Rose is asked to send money.",
  lines: [
    { speaker: "Caller", text: "Grandma, I need $1,800 for bail right now." },
    { speaker: "Caller", text: "Please don't tell Mom about this." },
  ],
};
const reply = (o: Record<string, unknown>) => () => ({ risk: "high", tactics: [], legitimate_explanation: "none plausible", confidence: 0.9, needs_independent_verification: true, recommended_action: "hold_and_verify", ...o });

describe("detector fail-safes", () => {
  test.each(["timeout", "refusal", "truncated", "parse", "error", "budget", "unavailable"] as AiFailureReason[])("model failure '%s' → HOLD", async (reason) => {
    const ai = new FakeLlm().on("manipulation", reply({}));
    ai.failAll(reason);
    const a = await assess(ai, conv);
    expect(a.ok).toBe(false);
    expect(a.intervention).toBe("HOLD_FOR_TRUSTED_CONTACT");
  });

  test("malformed output (schema mismatch) → HOLD", async () => {
    const a = await assess(new FakeLlm().on("manipulation", () => ({ risk: "fine", tactics: "none" })), conv);
    expect(a.intervention).toBe("HOLD_FOR_TRUSTED_CONTACT");
  });

  test("confidence outside 0..1 → HOLD", async () => {
    const a = await assess(new FakeLlm().on("manipulation", reply({ risk: "low", confidence: 7, recommended_action: "proceed" })), conv);
    expect(a.intervention).toBe("HOLD_FOR_TRUSTED_CONTACT");
  });

  test("invented quotes are discarded and reported; real quotes keep the source speaker", async () => {
    const a = await assess(
      new FakeLlm().on("manipulation", reply({ risk: "medium", tactics: [
        { tactic: "secrecy", quote: "don't tell Mom about this", speaker: "Grandson", why: "isolation" },
        { tactic: "threat", quote: "or you'll never see me again", speaker: "Caller", why: "made up" },
      ] })),
      conv,
    );
    expect(a.grounded.map((g) => g.quote)).toEqual(["don't tell Mom about this"]);
    expect(a.grounded[0]!.speaker).toBe("Caller");
    expect(a.ungrounded_quotes).toEqual(["or you'll never see me again"]);
    expect(a.intervention).toBe("HOLD_FOR_TRUSTED_CONTACT");
  });

  test("medium risk with no verifiable evidence → verify, not proceed", async () => {
    const a = await assess(new FakeLlm().on("manipulation", reply({ risk: "medium", tactics: [{ tactic: "urgency", quote: "act now or else", speaker: "Caller", why: "x" }] })), conv);
    expect(a.grounded).toHaveLength(0);
    expect(a.intervention).toBe("VERIFY_BEFORE_PAYING");
  });

  test("a scrap of matching text is not evidence", () => {
    expect(locate(conv, "bail")).toBe(-1);
    expect(locate(conv, "$1,800 for bail right now")).toBe(0);
  });

  test("policy overrides a 'low' verdict that carries two severe grounded tactics", () => {
    const g = (tactic: "safe_account" | "remote_access") => ({ tactic, quote: "q", speaker: "s", model_speaker: "s", why: "w", line_index: 0 });
    expect(decide({ risk: "low", tactics: [], legitimate_explanation: "", confidence: 0.9, needs_independent_verification: false, recommended_action: "proceed" }, [g("safe_account"), g("remote_access")])).toBe("VERIFY_BEFORE_PAYING");
    expect(decide(null, [])).toBe("HOLD_FOR_TRUSTED_CONTACT");
  });
});

describe("checkManipulation (the engine's screening check)", () => {
  test("grounded high risk → unknown (HOLD), detail carries only verified quotes", async () => {
    const ai = new FakeLlm().on("manipulation", reply({ tactics: [
      { tactic: "urgency", quote: "I need $1,800 for bail right now", speaker: "Caller", why: "deadline" },
      { tactic: "secrecy", quote: "wire it to the escrow agent tonight", speaker: "Caller", why: "invented" },
    ] }));
    const c = await checkManipulation(ai, conv);
    expect(c).toMatchObject({ id: "ai.manipulation", result: "unknown", kind: "ai" });
    expect(c.detail).toMatch(/hold for trusted contact/);
    expect(c.detail).toContain("I need $1,800 for bail right now");
    expect(c.detail).not.toContain("escrow agent");
  });

  test("never 'fail': the trusted contact decides, the model cannot reject on its own", async () => {
    for (const risk of ["high", "medium", "insufficient_information"]) {
      const c = await checkManipulation(new FakeLlm().on("manipulation", reply({ risk })), conv);
      expect(c.result).toBe("unknown");
    }
  });

  test("model unavailable → unknown (HOLD), never pass", async () => {
    const ai = new FakeLlm();
    ai.failAll("timeout");
    const c = await checkManipulation(ai, conv);
    expect(c).toMatchObject({ result: "unknown" });
    expect(c.detail).toMatch(/unavailable/);
  });

  test("confident low risk with no severe tactics → pass", async () => {
    const c = await checkManipulation(new FakeLlm().on("manipulation", reply({ risk: "low", confidence: 0.9, recommended_action: "proceed" })), conv);
    expect(c.result).toBe("pass");
  });
});
