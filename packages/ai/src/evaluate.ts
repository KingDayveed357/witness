// The screening decision as a pure function of (policy, request, facts, model): exactly the
// composition the engine runs (deterministic screen -> AI screen -> settle deferred), for both intent kinds,
// minus database and PayPal. Used by the eval runner so evals measure production logic.

import { parseIntentPolicy, parsePaymentRequest, screenOutcome, screenPayment, type Check, type ProductFacts } from "@witness/core";
import { screenPaymentAi, settleDeferred, type AiSubject } from "./components.ts";
import type { LlmClient } from "./llm.ts";

export type EvalOutcome = "CAPTURE" | "HOLD" | "REJECT";

export interface ScreenEvaluation {
  outcome: EvalOutcome;
  checks: Check[];
  ai_called: boolean;
  ai_ms: number;
}

export async function evaluateScreen(
  ai: LlmClient,
  policyInput: unknown,
  requestInput: unknown,
  facts: Map<string, ProductFacts>,
  ctx: { now: Date; purchasesUsed?: number },
): Promise<ScreenEvaluation> {
  const policy = parseIntentPolicy(policyInput);
  const req = parsePaymentRequest(requestInput);
  if (!policy.success || !req.success) {
    return { outcome: "REJECT", checks: [{ id: "schema", result: "fail", detail: (policy.success ? req.error : policy.error)!.issues.map((i) => i.message).join("; ") }], ai_called: false, ai_ms: 0 };
  }
  const { cart, checks: deterministic } = screenPayment(policy.data, req.data, facts, { now: ctx.now, purchasesUsed: ctx.purchasesUsed ?? 0 });
  if (!cart || screenOutcome(deterministic) === "REJECT") return { outcome: "REJECT", checks: deterministic, ai_called: false, ai_ms: 0 };

  const t0 = Date.now();
  const subject: AiSubject = policy.data.kind === "transfer" ? { kind: "transfer" } : { kind: "shopping", policy: policy.data, cart, facts, deterministic };
  const aiChecks = await screenPaymentAi(ai, subject, req.data.conversation);
  const ai_ms = Date.now() - t0;
  const all = [...settleDeferred(deterministic, aiChecks), ...aiChecks];
  const o = screenOutcome(all);
  return { outcome: o === "PROCEED" ? "CAPTURE" : o, checks: all, ai_called: true, ai_ms };
}
