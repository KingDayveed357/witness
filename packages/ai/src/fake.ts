// Deterministic stand-in for tests and evals-of-the-runner. Responses are produced by a handler per
// prompt id; failures can be injected to prove every caller fails closed.

import type { z } from "zod";
import { promptRef, type AiFailureReason, type AiResult, type LlmClient, type PromptDef } from "./llm.ts";

export type FakeHandler = (input: string) => unknown;

export class FakeLlm implements LlmClient {
  readonly name = "fake";
  readonly calls: { prompt: string; input: string }[] = [];
  #handlers = new Map<string, FakeHandler>();
  #failNext: AiFailureReason | null = null;
  #failAll: AiFailureReason | null = null;

  on(promptId: string, handler: FakeHandler): this {
    this.#handlers.set(promptId, handler);
    return this;
  }

  failNext(reason: AiFailureReason) {
    this.#failNext = reason;
  }

  failAll(reason: AiFailureReason | null) {
    this.#failAll = reason;
  }

  async structured<S extends z.ZodType>(prompt: PromptDef, input: string, schema: S): Promise<AiResult<z.infer<S>>> {
    this.calls.push({ prompt: prompt.id, input });
    const base = { model: "fake", promptVersion: promptRef(prompt), latencyMs: 0 };
    const injected = this.#failNext ?? this.#failAll;
    this.#failNext = null;
    if (injected) return { ok: false, reason: injected, detail: "injected failure", ...base };
    const h = this.#handlers.get(prompt.id);
    if (!h) return { ok: false, reason: "unavailable", detail: `no fake handler for ${prompt.id}`, ...base };
    const parsed = schema.safeParse(h(input));
    if (!parsed.success) return { ok: false, reason: "parse", detail: "fake output failed the schema", ...base };
    return { ok: true, value: parsed.data, ...base };
  }
}
