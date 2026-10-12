// Provider-neutral interface for structured model calls (ADR-0007). Every call returns a Result:
// failures are values, never exceptions, so callers can't forget to fail closed.

import type { z } from "zod";

export interface PromptDef {
  id: string;
  version: string;
  system: string;
}

export type AiFailureReason = "unavailable" | "timeout" | "refusal" | "truncated" | "parse" | "error";

export type AiResult<T> =
  | { ok: true; value: T; model: string; promptVersion: string; latencyMs: number }
  | { ok: false; reason: AiFailureReason; detail: string; model: string | null; promptVersion: string; latencyMs: number };

export interface LlmClient {
  readonly name: string;
  structured<S extends z.ZodType>(prompt: PromptDef, input: string, schema: S, opts?: { maxTokens?: number }): Promise<AiResult<z.infer<S>>>;
}

export const promptRef = (p: PromptDef) => `${p.id}@${p.version}`;

/** Used when no model is configured: every call fails closed. */
export class UnavailableLlm implements LlmClient {
  readonly name = "unavailable";
  async structured<S extends z.ZodType>(prompt: PromptDef): Promise<AiResult<z.infer<S>>> {
    return { ok: false, reason: "unavailable", detail: "no AI provider configured (ANTHROPIC_API_KEY unset)", model: null, promptVersion: promptRef(prompt), latencyMs: 0 };
  }
}
