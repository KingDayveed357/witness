// Deterministic offline provider for tests and runner checks. Never makes network calls and never
// costs anything. Responses come from a handler per prompt id; failures can be injected to prove
// every caller fails closed.

import type { z } from "zod";
import { promptRef, type AiFailureReason, type AiResult, type ModelProvider, type PromptDef } from "./llm.ts";

export type FakeHandler = (input: string) => unknown;

export class FakeProvider implements ModelProvider {
  readonly provider = "fake";
  readonly model = "fake";
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
    const base = { provider: this.provider, model: this.model, promptVersion: promptRef(prompt), latencyMs: 0 };
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

/** Back-compat alias. */
export const FakeLlm = FakeProvider;
export type FakeLlm = FakeProvider;
