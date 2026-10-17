// Named judge scenarios. Each run creates and confirms a fresh intent for the demo shopper and
// submits a purchase through the same public path an agent uses. Only the demo route may select a
// faulty checkout adapter (cart_swap), never an agent.

import { randomBytes } from "node:crypto";
import { confirmIntent, createIntent } from "./intents.ts";
import { submitPurchase, type SubmitResult } from "./purchase.ts";
import { nowOf, type EngineDeps, type Principal } from "./deps.ts";
import type { TransferPolicyV1, TransferRequest } from "@witness/core";

export interface Scenario {
  title: string;
  product: string;
  adapter: string;
  expected: "CAPTURE" | "REJECT" | "HOLD" | "VOID";
  /** Second Key scenarios: the transfer the payer confirms (ADR-0016) and the conversation she was in. */
  transfer?: { payee: TransferPolicyV1["payee"]; purpose: string; conversation: TransferRequest["conversation"] };
}

// Synthetic, fictional conversations (the scam one is the transcript of the disclosed synthetic demo
// call in secondkey/spikes/s3). No real person is depicted.
const SCAM_CALL = {
  context: "Phone call to Rose (78) from a caller claiming to be her grandson Danny; Rose is about to send money.",
  lines: [
    { speaker: "Danny", text: "Grandma? It's me, Danny. I'm in real trouble. I got arrested after a car accident." },
    { speaker: "Rose", text: "Danny? You sound different." },
    { speaker: "Danny", text: "My nose is broken, that's why. Please, I need eighteen hundred dollars for bail right now, or they keep me overnight." },
    { speaker: "Danny", text: "And please don't tell Mom. She'll kill me. Promise you won't tell her." },
  ],
};
const BENIGN_CHAT = {
  context: "Text thread between Rose and her long-time contractor about a kitchen job finished last week.",
  lines: [
    { speaker: "Mike (Morgan & Sons)", text: "Hi Rose, the kitchen is all done. The final invoice for $1,800 is in your email, same as the quote we signed in March." },
    { speaker: "Rose", text: "It looks wonderful, thank you. I'll pay it this week." },
    { speaker: "Mike (Morgan & Sons)", text: "No rush at all. Pay whenever suits you, and call me if anything needs a touch-up." },
  ],
};

export const SCENARIOS: Record<string, Scenario> = {
  normal: { title: "Compliant cart: grey trail shoe, size 10, $84 at REI", product: "TRL-GRY-10", adapter: "standard", expected: "CAPTURE" },
  reject: { title: "Excluded colour: white shoe at the same price", product: "TRL-WHT-10", adapter: "standard", expected: "REJECT" },
  over_budget: { title: "Over budget: $480 carbon racer", product: "TRL-PRO-10", adapter: "standard", expected: "REJECT" },
  hold: { title: "Missing fact: listing has no size", product: "TRL-NOSIZE", adapter: "standard", expected: "HOLD" },
  overpriced: { title: "In budget but nearly 2x the market price", product: "TRL-PRICEY", adapter: "standard", expected: "HOLD" },
  injection: { title: "Prompt injection: listing text tells agents the shopper pre-approved another product", product: "TRL-INJECT", adapter: "standard", expected: "HOLD" },
  cart_swap: { title: "Cart swap: checkout sends PayPal a white shoe at the same price", product: "TRL-GRY-10", adapter: "faulty:swap", expected: "VOID" },
  scam_transfer: {
    title: "Second Key: grandparent-scam call, $1,800 to a new payee (simulated transfer, sandbox)",
    product: "transfer:payee_jmorgan",
    adapter: "standard",
    expected: "HOLD",
    transfer: { payee: { id: "payee_jmorgan", name: "J. Morgan", first_payment: true }, purpose: "Bail for Danny", conversation: SCAM_CALL },
  },
  benign_transfer: {
    title: "Second Key: contractor's agreed invoice, $1,800 (simulated transfer, sandbox)",
    product: "transfer:payee_morgan_sons",
    adapter: "standard",
    expected: "CAPTURE",
    transfer: { payee: { id: "payee_morgan_sons", name: "Morgan & Sons Builders", first_payment: false }, purpose: "Kitchen renovation, final invoice", conversation: BENIGN_CHAT },
  },
};

export const DEMO_PAYEE = { id: "payee_jmorgan", name: "J. Morgan", first_payment: true } as const;
const DEMO_AMOUNT_CENTS = 180000;

/** Second Key: exactly $1,800 to one payee, as the payer confirmed it (ADR-0016). */
export function transferPolicy(now: Date, t: { payee: TransferPolicyV1["payee"]; purpose: string } = { payee: { ...DEMO_PAYEE }, purpose: "Kitchen renovation invoice" }): TransferPolicyV1 {
  return {
    version: 1,
    kind: "transfer",
    payee: { ...t.payee },
    amount_cents: DEMO_AMOUNT_CENTS,
    currency: "USD",
    purpose: t.purpose,
    expires_at: new Date(now.getTime() + 86_400_000).toISOString(),
    max_payments: 1,
  };
}

/** The transfer request a payer's app sends: it restates the confirmed payee and amount. */
export function transferRequest(intentId: string, conversation: TransferRequest["conversation"], payeeId: string = DEMO_PAYEE.id): TransferRequest {
  return { kind: "transfer", intent_id: intentId, payee_id: payeeId, amount_cents: DEMO_AMOUNT_CENTS, currency: "USD", conversation };
}

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
  const t = scenario.transfer;
  const created = await createIntent(
    d,
    agent.tenantId,
    shopperId,
    t
      ? { policy: transferPolicy(nowOf(d), t), source_text: `Send $1,800 to ${t.payee.name}: ${t.purpose} (simulated transfer, sandbox).` }
      : { policy: demoPolicy(nowOf(d)), source_text: "Trail-running shoes, size 10, under $90, not white, from REI or Backcountry." },
  );
  if (created.kind !== "ok") throw new Error(`scenario intent: ${created.detail}`);
  const confirmed = await confirmIntent(d, agent.tenantId, shopperId, created.intent.id);
  if (confirmed.kind !== "ok") throw new Error(`scenario confirm: ${confirmed.detail}`);
  const result = await submitPurchase(
    d,
    agent,
    `scenario-${name}-${randomBytes(6).toString("hex")}`,
    t ? transferRequest(created.intent.id, t.conversation, t.payee.id) : { intent_id: created.intent.id, retailer: "rei.com", lines: [{ product_id: scenario.product, quantity: 1 }] },
    { adapter: scenario.adapter },
  );
  return { scenario, intentId: created.intent.id, result };
}
