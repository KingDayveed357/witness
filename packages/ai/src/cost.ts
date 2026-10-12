// Token usage and cost accounting with hard limits. Measured usage comes from the API's response;
// money is an ESTIMATE from the pricing table in models.ts, not Anthropic's bill. Reconcile against
// the Anthropic Console.
//
// The meter is checked BEFORE every attempt (including retries): if the worst case of the next
// request could exceed the call or spend ceiling, the request is not sent and the caller fails
// closed (HOLD). It never switches models or providers.

import { PRICING_VERSION, approvedModel, type ModelSpec } from "./models.ts";

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

export const ZERO_USAGE: TokenUsage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };

/** Estimated USD for measured usage. `input_tokens` excludes cache reads/writes (API convention). */
export function costOf(usage: TokenUsage, spec: ModelSpec): number {
  const promptTokens = usage.input_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens;
  const long = promptTokens > spec.longContextThreshold;
  const inRate = (long ? spec.longInputPerMTok : spec.inputPerMTok) / 1e6;
  const outRate = (long ? spec.longOutputPerMTok : spec.outputPerMTok) / 1e6;
  return (
    usage.input_tokens * inRate +
    usage.cache_creation_input_tokens * inRate * spec.cacheWrite5mMultiplier +
    usage.cache_read_input_tokens * inRate * spec.cacheReadMultiplier +
    usage.output_tokens * outRate
  );
}

/**
 * Conservative upper bound for one request: every input token billed as a cache write (the most
 * expensive input category), every allowed output token used. Input tokens are estimated from
 * characters at 1 token per 2.5 characters (real English is ~3.5-4; the margin is deliberate).
 */
export function worstCaseCost(spec: ModelSpec, o: { promptChars: number; maxTokens: number; schemaOverheadTokens?: number }): number {
  const inputTokens = Math.ceil(o.promptChars / 2.5) + (o.schemaOverheadTokens ?? 400);
  const long = inputTokens > spec.longContextThreshold;
  const inRate = (long ? spec.longInputPerMTok : spec.inputPerMTok) / 1e6;
  const outRate = (long ? spec.longOutputPerMTok : spec.outputPerMTok) / 1e6;
  return inputTokens * inRate * Math.max(1, spec.cacheWrite5mMultiplier) + o.maxTokens * outRate;
}

export interface BudgetLimits {
  maxCalls: number;
  maxSpendUsd: number;
}

export interface CallRecord {
  prompt: string;
  model: string;
  ok: boolean;
  reason?: string;
  usage: TokenUsage;
  cost_usd: number;
  latency_ms: number;
  retries: number;
  cache: "hit" | "write" | "none";
}

export class BudgetExceeded extends Error {}

export class UsageMeter {
  readonly limits: BudgetLimits;
  readonly records: CallRecord[] = [];
  #attempts = 0;
  #spent = 0;
  #reserved = 0;

  constructor(limits: BudgetLimits) {
    this.limits = limits;
  }

  /** Reserve the worst case of one attempt, or throw BudgetExceeded without sending anything. */
  reserve(worstCaseUsd: number): () => void {
    if (this.#attempts + 1 > this.limits.maxCalls) throw new BudgetExceeded(`call limit reached (${this.limits.maxCalls})`);
    if (this.#spent + this.#reserved + worstCaseUsd > this.limits.maxSpendUsd) {
      throw new BudgetExceeded(`spend ceiling $${this.limits.maxSpendUsd.toFixed(2)} would be exceeded (spent ~$${this.#spent.toFixed(4)}, next request up to $${worstCaseUsd.toFixed(4)})`);
    }
    this.#attempts++;
    this.#reserved += worstCaseUsd;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.#reserved -= worstCaseUsd;
      }
    };
  }

  /** Record actual spend for an attempt that reached the API (billed or not, usage says). */
  charge(usd: number) {
    this.#spent += usd;
  }

  record(r: CallRecord) {
    this.records.push(r);
  }

  get attempts() {
    return this.#attempts;
  }

  get spentUsd() {
    return this.#spent;
  }

  summary() {
    const sum = (k: keyof TokenUsage) => this.records.reduce((s, r) => s + r.usage[k], 0);
    const lat = this.records.filter((r) => r.ok).map((r) => r.latency_ms).sort((a, b) => a - b);
    const q = (p: number) => (lat.length ? lat[Math.min(lat.length - 1, Math.floor(p * lat.length))]! : 0);
    return {
      pricing_version: PRICING_VERSION,
      requests: this.records.length,
      attempts_including_retries: this.#attempts,
      failed: this.records.filter((r) => !r.ok).length,
      retries: this.records.reduce((s, r) => s + r.retries, 0),
      tokens: { input: sum("input_tokens"), output: sum("output_tokens"), cache_write: sum("cache_creation_input_tokens"), cache_read: sum("cache_read_input_tokens") },
      cache: { hits: this.records.filter((r) => r.cache === "hit").length, writes: this.records.filter((r) => r.cache === "write").length, none: this.records.filter((r) => r.cache === "none").length },
      estimated_cost_usd: Number(this.#spent.toFixed(6)),
      latency_ms: { p50: q(0.5), p95: q(0.95) },
      limits: this.limits,
      note: "Usage is measured from API responses; cost is a local estimate from models.ts pricing, not Anthropic's bill.",
    };
  }
}

export const specFor = approvedModel;
