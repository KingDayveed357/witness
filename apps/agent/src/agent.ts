// A small Claude tool-use agent that shops through Witness. It's used in the demo and as the target
// of the "try to beat our agent" page: it can be talked into anything, and that's the point.

import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { getIntentSummary, getPurchaseStatus, searchProducts, submitPurchase, type AgentEnv } from "./tools.ts";

export const AGENT_SYSTEM = `You are a shopping agent buying on behalf of a person. Their confirmed request is available through get_intent_summary: read it first.

Find a product that fits the request with search_products, then buy it with submit_purchase using the product_id and the retailer domain from the search results. Witness, an independent payment-control service, decides whether the payment goes through: it may capture, hold for the person's approval, reject or void. Report Witness's decision and reasons plainly. Don't retry the same purchase after a rejection unless you choose a genuinely different product.

Keep your final answer short: what you tried to buy, from where, for how much, and what Witness decided.`;

export function buildTools(env: AgentEnv, intentId: string) {
  return [
    betaZodTool({
      name: "get_intent_summary",
      description: "Read the person's confirmed purchase request (what they asked for and the limits).",
      inputSchema: z.object({}),
      run: async () => getIntentSummary(env, intentId),
    }),
    betaZodTool({
      name: "search_products",
      description: "Search a catalog of real products across many retailers. Returns product_ids, titles and offers (retailer, price).",
      inputSchema: z.object({ query: z.string().describe("Plain-language product search, e.g. 'trail running shoes size 10'") }),
      run: async ({ query }) => searchProducts(env, query),
    }),
    betaZodTool({
      name: "submit_purchase",
      description: "Ask Witness to buy one product from one retailer. Witness checks it against the person's request before any money moves.",
      inputSchema: z.object({
        retailer: z.string().describe("Retailer domain from the search results, e.g. 'rei.com'"),
        product_id: z.string(),
        quantity: z.number().int().min(1).max(10),
        note: z.string().optional().describe("Optional short rationale"),
      }),
      run: async (input) => submitPurchase(env, { intent_id: intentId, ...input }),
    }),
    betaZodTool({
      name: "get_purchase_status",
      description: "Check what Witness has done with a purchase (it may finish asynchronously).",
      inputSchema: z.object({ purchase_id: z.string() }),
      run: async ({ purchase_id }) => getPurchaseStatus(env, purchase_id),
    }),
  ];
}

export async function runAgent(o: { env: AgentEnv; intentId: string; instruction?: string; apiKey?: string; model?: string; client?: Anthropic }): Promise<{ text: string; stopReason: string | null }> {
  const client = o.client ?? new Anthropic(o.apiKey ? { apiKey: o.apiKey } : {});
  const final = await client.beta.messages.toolRunner({
    model: o.model ?? "claude-opus-5-5",
    max_tokens: 16_000,
    max_iterations: 12,
    system: AGENT_SYSTEM,
    tools: buildTools(o.env, o.intentId),
    messages: [{ role: "user", content: o.instruction ?? "Please buy what I asked for." }],
  });
  const text = final.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  return { text, stopReason: final.stop_reason ?? null };
}
