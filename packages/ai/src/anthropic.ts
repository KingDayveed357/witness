// Anthropic adapter: structured outputs (output_config.format with a Zod schema), schema re-validated
// locally, and every failure mode (refusal, truncation, timeout, parse, API error) returned as a
// failure value. Server-side fallback ("default") is enabled so a refused request can be retried on
// another model; whichever model actually answered is recorded with every check.

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { promptRef, type AiResult, type LlmClient, type PromptDef } from "./llm.ts";

export interface AnthropicLlmOptions {
  apiKey?: string;
  model?: string;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  timeoutMs?: number;
  client?: Anthropic;
}

export class AnthropicLlm implements LlmClient {
  readonly name = "anthropic";
  readonly model: string;
  readonly #client: Anthropic;
  readonly #effort: NonNullable<AnthropicLlmOptions["effort"]>;
  readonly #timeoutMs: number;

  constructor(o: AnthropicLlmOptions = {}) {
    this.#client = o.client ?? new Anthropic(o.apiKey ? { apiKey: o.apiKey } : {});
    this.model = o.model ?? "claude-opus-5-5";
    // Opus 5.5 defaults to medium effort; set it explicitly so behaviour doesn't drift with defaults.
    this.#effort = o.effort ?? "medium";
    this.#timeoutMs = o.timeoutMs ?? 60_000;
  }

  async structured<S extends z.ZodType>(prompt: PromptDef, input: string, schema: S, opts: { maxTokens?: number } = {}): Promise<AiResult<z.infer<S>>> {
    const started = Date.now();
    const fail = (reason: Extract<AiResult<unknown>, { ok: false }>["reason"], detail: string, model: string | null = this.model): AiResult<z.infer<S>> => ({
      ok: false,
      reason,
      detail,
      model,
      promptVersion: promptRef(prompt),
      latencyMs: Date.now() - started,
    });
    try {
      const msg = await this.#client.beta.messages.parse(
        {
          model: this.model,
          max_tokens: opts.maxTokens ?? 16_000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system: prompt.system,
          messages: [{ role: "user", content: input }],
          output_config: { format: betaZodOutputFormat(schema), effort: this.#effort },
        },
        { timeout: this.#timeoutMs, maxRetries: 1 },
      );
      if (msg.stop_reason === "refusal") return fail("refusal", "the model declined to answer", msg.model);
      if (msg.stop_reason === "max_tokens") return fail("truncated", "output hit max_tokens", msg.model);
      const checked = schema.safeParse(msg.parsed_output);
      if (msg.parsed_output == null || !checked.success) return fail("parse", "output did not match the schema", msg.model);
      return { ok: true, value: checked.data, model: msg.model, promptVersion: promptRef(prompt), latencyMs: Date.now() - started };
    } catch (e) {
      if (e instanceof Anthropic.APIConnectionTimeoutError) return fail("timeout", `no answer within ${this.#timeoutMs} ms`);
      if (e instanceof Anthropic.APIError) return fail("error", `Anthropic API ${e.status ?? "connection"} error`);
      return fail("error", (e as Error).name);
    }
  }
}
