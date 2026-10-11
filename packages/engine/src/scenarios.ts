// Named judge scenarios. Each run creates and confirms a fresh intent for the demo shopper and
// submits a purchase through the same public path an agent uses. Only the demo route may select a
// faulty checkout adapter (cart_swap), never an agent.

import { randomBytes } from "node:crypto";
import { confirmIntent, createIntent } from "./intents.ts";
import { submitPurchase, type SubmitResult } from "./purchase.ts";
import { nowOf, type EngineDeps, type Principal } from "./deps.ts";

export interface Scenario {
  title: string;
  product: string;
  adapter: string;
  expected: "CAPTURE" | "REJECT" | "HOLD" | "VOID";
}

export const SCENARIOS: Record<string, Scenario> = {
  normal: { title: "Compliant cart: grey trail shoe, size 10, $84 at REI", product: "TRL-GRY-10", adapter: "standard", expected: "CAPTURE" },
  reject: { title: "Excluded colour: white shoe at the same price", product: "TRL-WHT-10", adapter: "standard", expected: "REJECT" },
  over_budget: { title: "Over budget: $480 carbon racer", product: "TRL-PRO-10", adapter: "standard", expected: "REJECT" },
  hold: { title: "Missing fact: listing has no size", product: "TRL-NOSIZE", adapter: "standard", expected: "HOLD" },
  overpriced: { title: "In budget but nearly 2x the market price", product: "TRL-PRICEY", adapter: "standard", expected: "HOLD" },
  cart_swap: { title: "Cart swap: checkout sends PayPal a white shoe at the same price", product: "TRL-GRY-10", adapter: "faulty:swap", expected: "VOID" },
};

export function demoPolicy(now: Date) {
  return {
    version: 1,
    category: "trail-running shoes",
    retailers: ["rei.com", "backcountry.com"],
    max_total_cents: 9000,
    currency: "USD",
    quantity: 1,
    hard: { excluded_colors: ["white"], size: "10" },
    substitution: "same_category_under_max",
    expires_at: new Date(now.getTime() + 30 * 86_400_000).toISOString(),
    max_purchases: 1,
  };
}

export async function runScenario(
  d: EngineDeps,
  agent: Principal,
  shopperId: string,
  name: string,
): Promise<{ scenario: Scenario; intentId: string; result: SubmitResult } | null> {
  const scenario = SCENARIOS[name];
  if (!scenario) return null;
  const created = await createIntent(d, agent.tenantId, shopperId, {
    policy: demoPolicy(nowOf(d)),
    source_text: "Trail-running shoes, size 10, under $90, not white, from REI or Backcountry.",
  });
  if (created.kind !== "ok") throw new Error(`scenario intent: ${created.detail}`);
  const confirmed = await confirmIntent(d, agent.tenantId, shopperId, created.intent.id);
  if (confirmed.kind !== "ok") throw new Error(`scenario confirm: ${confirmed.detail}`);
  const result = await submitPurchase(
    d,
    agent,
    `scenario-${name}-${randomBytes(6).toString("hex")}`,
    { intent_id: created.intent.id, retailer: "rei.com", lines: [{ product_id: scenario.product, quantity: 1 }] },
    { adapter: scenario.adapter },
  );
  return { scenario, intentId: created.intent.id, result };
}
