// LIVE connectivity smoke test for the approved Haiku model (pnpm ai:smoke).
//   1. Confirms the key exists (never prints it).
//   2. Verifies the model ID and capabilities through the Models API (no tokens billed).
//   3. Sends two tiny structured requests with the same static prefix to measure usage, latency,
//      cost and prompt caching (the second should read the cached system prompt).
// Hard ceiling: $0.01. Makes no PayPal calls.

import Anthropic from "@anthropic-ai/sdk";
import { AnthropicProvider, DEFAULT_MODEL, InjectionOut, PROMPTS, UsageMeter, approvedModel, worstCaseCost } from "@witness/ai";
import { loadDotEnv } from "@witness/config";

loadDotEnv();
const key = process.env.ANTHROPIC_API_KEY;
console.log(`ANTHROPIC_API_KEY: ${key ? "present" : "MISSING"}`);
if (!key) process.exit(1);

const spec = approvedModel(process.env.WITNESS_AI_MODEL ?? DEFAULT_MODEL);
const client = new Anthropic({ apiKey: key, maxRetries: 0, timeout: 30_000 });

// 2. Model verification (Models API: metadata only, no tokens).
let info;
try {
  info = await client.models.retrieve(spec.id);
} catch (e) {
  console.error(`Models API: cannot retrieve ${spec.id}: ${e instanceof Anthropic.APIError ? `HTTP ${e.status}` : (e as Error).name}. Stopping.`);
  process.exit(1);
}
const caps = info.capabilities;
console.log(
  JSON.stringify(
    {
      id: info.id,
      display_name: info.display_name,
      max_input_tokens: info.max_input_tokens,
      structured_outputs: caps?.structured_outputs?.supported ?? "not reported",
      effort_low: caps?.effort?.low?.supported ?? "not reported",
      thinking: caps?.thinking ? "reported" : "not reported",
    },
    null,
    2,
  ),
);
if (info.id !== spec.id) {
  console.error(`Model ID mismatch: asked for ${spec.id}, API reports ${info.id}. Stopping.`);
  process.exit(1);
}
if (caps && caps.structured_outputs && !caps.structured_outputs.supported) {
  console.error("Structured outputs are not supported for this model. Stopping.");
  process.exit(1);
}

// 3. Two tiny requests through the real provider (same prefix -> the second should hit the cache).
const listing = (n: number) => `<listing product_id="smoke-${n}">\n<title>Insulated water bottle, 750 ml</title>\n<details>\nStainless steel. Keeps drinks cold for 24 hours.\n</details>\n</listing>`;
const worst = 2 * worstCaseCost(spec, { promptChars: PROMPTS.injection.system.length + listing(1).length, maxTokens: PROMPTS.injection.maxTokens });
console.log(`\nPlanned: 2 requests to ${spec.id}; worst case $${worst.toFixed(5)} (ceiling $0.01)`);
const meter = new UsageMeter({ maxCalls: 4, maxSpendUsd: 0.01 });
const provider = new AnthropicProvider({ apiKey: key, model: spec.id, meter, maxRetries: 1 });

for (const n of [1, 2]) {
  const r = await provider.structured(PROMPTS.injection, listing(n), InjectionOut);
  console.log(
    JSON.stringify({
      request: n,
      ok: r.ok,
      ...(r.ok ? { suspected: r.value.suspected, confidence: r.value.confidence } : { reason: r.reason, detail: r.detail }),
      provider: r.provider,
      model: r.model,
      latency_ms: r.latencyMs,
      retries: r.retries,
      cache: r.cache,
      usage: r.usage,
      estimated_cost_usd: Number((r.costUsd ?? 0).toFixed(6)),
    }),
  );
  if (!r.ok) {
    console.error("Smoke request failed; stopping before any evaluation.");
    process.exit(1);
  }
}
console.log(`\nTotals: ${JSON.stringify(meter.summary())}`);
