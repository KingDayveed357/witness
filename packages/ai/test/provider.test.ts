// AnthropicProvider and cost accounting, offline (stub client; no network, no credits).

import { describe, expect, test } from "vitest";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { APPROVED_MODELS, AnthropicProvider, ModelNotApproved, PROMPTS, UsageMeter, approvedModel, costOf, worstCaseCost } from "../src/index.ts";

const schema = z.object({ ok: z.boolean() });
const usage = (o: Partial<Record<string, number>> = {}) => ({ input_tokens: 900, output_tokens: 120, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, ...o });
const reply = (over: Record<string, unknown> = {}) => ({ model: "claude-haiku-5-5", stop_reason: "end_turn", parsed_output: { ok: true }, usage: usage(), ...over });

function stub(script: (unknown | Error)[]) {
  const sent: any[] = [];
  const client = {
    messages: {
      parse: async (body: unknown) => {
        sent.push(body);
        const next = script.shift();
        if (next instanceof Error) throw next;
        return next;
      },
    },
  } as unknown as Anthropic;
  return { client, sent };
}
const noSleep = async () => {};
const headers = new Headers();
const rateLimit = () => new Anthropic.RateLimitError(429, { type: "error" }, "rate limited", headers);
const overloaded = () => new Anthropic.InternalServerError(529, { type: "error" }, "overloaded", headers);
const unauthorized = () => new Anthropic.AuthenticationError(401, { type: "error" }, "bad key", headers);

describe("model allowlist", () => {
  test("only Haiku 5.5 is approved; anything else is a configuration error", () => {
    expect(Object.keys(APPROVED_MODELS)).toEqual(["claude-haiku-5-5"]);
    for (const m of ["claude-opus-5-5", "claude-sonnet-5-5", "claude-fable-5-1", "claude-haiku-4-5", "gpt-x"]) {
      expect(() => approvedModel(m)).toThrow(ModelNotApproved);
      expect(() => new AnthropicProvider({ apiKey: "k", model: m })).toThrow(ModelNotApproved);
    }
  });

  test("a missing key is a construction error, not a silent fake", () => {
    expect(() => new AnthropicProvider({})).toThrow(/ANTHROPIC_API_KEY/);
  });
});

describe("requests", () => {
  test("approved model, low effort, thinking left adaptive, no fallback, cache breakpoint on the system prompt only", async () => {
    const { client, sent } = stub([reply()]);
    const r = await new AnthropicProvider({ client }).structured(PROMPTS.injection, "<listing>x</listing>", schema);
    expect(r).toMatchObject({ ok: true, provider: "anthropic", model: "claude-haiku-5-5", promptVersion: "injection@v2" });
    const body = sent[0];
    expect(body.model).toBe("claude-haiku-5-5");
    expect(body.max_tokens).toBe(PROMPTS.injection.maxTokens);
    expect(body.output_config.effort).toBe("low");
    expect(body.thinking).toBeUndefined();
    expect(body.fallbacks).toBeUndefined();
    expect(body.betas).toBeUndefined();
    expect(body.system).toEqual([{ type: "text", text: PROMPTS.injection.system, cache_control: { type: "ephemeral" } }]);
    // Purchase data is only in the user turn, never in the cached prefix.
    expect(body.messages).toEqual([{ role: "user", content: "<listing>x</listing>" }]);
  });

  test("a different model answering is refused (no silent fallback)", async () => {
    const { client } = stub([reply({ model: "claude-sonnet-5-5" })]);
    const r = await new AnthropicProvider({ client }).structured(PROMPTS.injection, "x", schema);
    expect(r).toMatchObject({ ok: false, reason: "error" });
    expect(!r.ok && r.detail).toMatch(/not the approved claude-haiku-5-5/);
  });

  test.each([
    ["refusal", reply({ stop_reason: "refusal", parsed_output: null })],
    ["truncated", reply({ stop_reason: "max_tokens", parsed_output: null })],
    ["parse", reply({ parsed_output: null })],
    ["parse", reply({ parsed_output: { ok: "yes" } })],
  ])("%s is a failure and is not retried", async (reason, r0) => {
    const { client, sent } = stub([r0, reply()]);
    const r = await new AnthropicProvider({ client }).structured(PROMPTS.injection, "x", schema);
    expect(r).toMatchObject({ ok: false, reason, retries: 0 });
    expect(sent).toHaveLength(1);
  });
});

describe("retries", () => {
  test("429 and overloaded are retried with backoff, bounded by maxRetries", async () => {
    const waits: number[] = [];
    const { client, sent } = stub([rateLimit(), overloaded(), reply()]);
    const r = await new AnthropicProvider({ client, maxRetries: 2, sleep: async (ms) => void waits.push(ms), random: () => 0.5 }).structured(PROMPTS.injection, "x", schema);
    expect(r).toMatchObject({ ok: true, retries: 2 });
    expect(sent).toHaveLength(3);
    expect(waits).toEqual([250, 500]); // full jitter at 0.5 of 500 ms, then of 1000 ms
  });

  test("retries stop at the limit and fail closed", async () => {
    const { client, sent } = stub([rateLimit(), rateLimit(), rateLimit(), reply()]);
    const r = await new AnthropicProvider({ client, maxRetries: 2, sleep: noSleep }).structured(PROMPTS.injection, "x", schema);
    expect(r).toMatchObject({ ok: false, reason: "error", retries: 2 });
    expect(sent).toHaveLength(3);
  });

  test("authentication errors are never retried and never echo the key", async () => {
    const { client, sent } = stub([unauthorized(), reply()]);
    const r = await new AnthropicProvider({ client, sleep: noSleep }).structured(PROMPTS.injection, "x", schema);
    expect(r).toMatchObject({ ok: false, reason: "error", retries: 0 });
    expect(sent).toHaveLength(1);
    expect(JSON.stringify(r)).not.toMatch(/sk-ant/);
  });

  test("timeouts are retried like other transient errors, then reported as timeout", async () => {
    const { client } = stub([new Anthropic.APIConnectionTimeoutError(), new Anthropic.APIConnectionTimeoutError()]);
    const r = await new AnthropicProvider({ client, maxRetries: 1, sleep: noSleep }).structured(PROMPTS.injection, "x", schema);
    expect(r).toMatchObject({ ok: false, reason: "timeout", retries: 1 });
  });
});

describe("budget and cost accounting", () => {
  test("usage, cost and cache status are recorded per call, with no prompt contents", async () => {
    const meter = new UsageMeter({ maxCalls: 10, maxSpendUsd: 1 });
    const { client } = stub([reply({ usage: usage({ input_tokens: 100, cache_creation_input_tokens: 800 }) }), reply({ usage: usage({ input_tokens: 100, cache_read_input_tokens: 800 }) })]);
    const p = new AnthropicProvider({ client, meter });
    const a = await p.structured(PROMPTS.injection, "SECRET-PURCHASE-TEXT-1", schema);
    const b = await p.structured(PROMPTS.injection, "SECRET-PURCHASE-TEXT-2", schema);
    expect(a.cache).toBe("write");
    expect(b.cache).toBe("hit");
    expect(b.costUsd!).toBeLessThan(a.costUsd!);
    const s = meter.summary();
    expect(s).toMatchObject({ requests: 2, attempts_including_retries: 2, cache: { hits: 1, writes: 1 }, tokens: { cache_read: 800, cache_write: 800 } });
    expect(s.estimated_cost_usd).toBeCloseTo(a.costUsd! + b.costUsd!, 6);
    expect(JSON.stringify(meter.records)).not.toMatch(/SECRET-PURCHASE-TEXT/);
  });

  test("the spend ceiling stops a request BEFORE it is sent; the caller gets 'budget' (-> HOLD)", async () => {
    const { client, sent } = stub([reply(), reply()]);
    const tiny = new UsageMeter({ maxCalls: 10, maxSpendUsd: 0.0001 });
    const r = await new AnthropicProvider({ client, meter: tiny }).structured(PROMPTS.injection, "x", schema);
    expect(r).toMatchObject({ ok: false, reason: "budget" });
    expect(sent).toHaveLength(0);
  });

  test("the call ceiling counts retries", async () => {
    const meter = new UsageMeter({ maxCalls: 2, maxSpendUsd: 1 });
    const { client, sent } = stub([rateLimit(), rateLimit(), reply()]);
    const r = await new AnthropicProvider({ client, meter, maxRetries: 5, sleep: noSleep }).structured(PROMPTS.injection, "x", schema);
    expect(r).toMatchObject({ ok: false, reason: "budget" });
    expect(sent).toHaveLength(2);
  });

  test("cost math uses the pricing table: input $0.10, output $0.50, cache write 1.25x, read 0.1x", () => {
    const spec = approvedModel("claude-haiku-5-5");
    const z0 = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
    // 100K tokens: at the long-context threshold, so standard rates apply.
    expect(costOf({ ...z0, input_tokens: 100_000 }, spec)).toBeCloseTo(0.01, 9);
    expect(costOf({ ...z0, output_tokens: 100_000 }, spec)).toBeCloseTo(0.05, 9);
    expect(costOf({ ...z0, cache_creation_input_tokens: 100_000 }, spec)).toBeCloseTo(0.0125, 9);
    expect(costOf({ ...z0, cache_read_input_tokens: 100_000 }, spec)).toBeCloseTo(0.001, 9);
    // Above 100K prompt tokens, the long-context card ($0.50 / $2.50) applies to the whole request.
    expect(costOf({ ...z0, input_tokens: 200_000, output_tokens: 1_000 }, spec)).toBeCloseTo(0.1 + 0.0025, 9);
  });

  test("the worst-case estimate is above any realistic call", () => {
    const spec = approvedModel("claude-haiku-5-5");
    const worst = worstCaseCost(spec, { promptChars: 3500, maxTokens: 1200 });
    const realistic = costOf({ input_tokens: 1300, output_tokens: 400, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }, spec);
    expect(worst).toBeGreaterThan(realistic);
  });
});
