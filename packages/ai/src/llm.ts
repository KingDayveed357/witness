// Provider-neutral interface for structured model calls (ADR-0007, BYOM foundation in ADR-0013).
// Every call returns a Result: failures are values, never exceptions, so callers can't forget to
// fail closed. Results carry provider/model/usage/cost metadata for audit and cost accounting.

import type { z } from "zod";
import type { TokenUsage } from "./cost.ts";

export interface PromptDef {
  id: string;
  version: string;
  system: string;
  /** Output-token cap for this task (thinking counts toward it). Justified per prompt. */
  maxTokens: number;
}

export type AiFailureReason = "unavailable" | "timeout" | "refusal" | "truncated" | "parse" | "error" | "budget" | "cancelled";

export interface AiCallMeta {
  provider: string;
  model: string | null;
  promptVersion: string;
  latencyMs: number;
  usage?: TokenUsage;
  costUsd?: number;
  retries?: number;
  cache?: "hit" | "write" | "none";
}

export type AiResult<T> = ({ ok: true; value: T } | { ok: false; reason: AiFailureReason; detail: string }) & AiCallMeta;

export interface StructuredOptions {
  maxTokens?: number;
  signal?: AbortSignal;
}

/**
 * A model provider. Implementations: AnthropicProvider (approved Haiku only), FakeProvider (offline),
 * UnavailableProvider (no key configured). Future providers implement this same interface (ADR-0013).
 */
export interface ModelProvider {
  readonly provider: string;
  readonly model: string | null;
  structured<S extends z.ZodType>(prompt: PromptDef, input: string, schema: S, opts?: StructuredOptions): Promise<AiResult<z.infer<S>>>;
}

/** Back-compat name used across the engine. */
export type LlmClient = ModelProvider;

export const promptRef = (p: PromptDef) => `${p.id}@${p.version}`;

/** Used when no model is configured: every call fails closed. */
export class UnavailableProvider implements ModelProvider {
  readonly provider = "none";
  readonly model = null;
  async structured<S extends z.ZodType>(prompt: PromptDef): Promise<AiResult<z.infer<S>>> {
    return { ok: false, reason: "unavailable", detail: "no AI provider configured (ANTHROPIC_API_KEY unset)", provider: this.provider, model: null, promptVersion: promptRef(prompt), latencyMs: 0 };
  }
}

/** Back-compat alias. */
export const UnavailableLlm = UnavailableProvider;
