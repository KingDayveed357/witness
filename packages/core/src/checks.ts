// Deterministic screening: a cart against a confirmed policy, using facts Witness fetched itself.
// Any fail -> REJECT (no PayPal call). Any unknown -> HOLD. Otherwise PROCEED to authorize.

import { z } from "zod";
import type { ProductFacts } from "./facts.ts";
import { Domain, type PolicyV1 } from "./policy.ts";
import type { Currency } from "./money.ts";

export type CheckResult = "pass" | "fail" | "unknown";
export interface Check {
  id: string;
  result: CheckResult;
  detail: string;
  line?: string;
  /** Deterministic unless set. AI checks also record which model and prompt version produced them. */
  kind?: "deterministic" | "ai";
  model?: string;
  prompt_version?: string;
  /**
   * An "unknown" deterministic check that an AI check may settle (e.g. category: retailer taxonomies
   * rarely match the shopper's words literally). Settled only by a definitive, grounded AI verdict.
   */
  defers_to?: string;
}

export const PurchaseRequest = z.strictObject({
  intent_id: z.string().min(1).max(64),
  retailer: Domain,
  lines: z
    .array(
      z.strictObject({
        product_id: z.string().min(1).max(64),
        quantity: z.number().int().min(1).max(99),
      }),
    )
    .min(1)
    .max(10),
  /** Untrusted free text from the agent. Stored, never used to decide. */
  agent_note: z.string().max(500).optional(),
});
export type PurchaseRequest = z.infer<typeof PurchaseRequest>;

export interface CartLine {
  product_id: string;
  name: string;
  unit_cents: number;
  quantity: number;
  brand?: string | undefined;
  category?: string | undefined;
  attributes: Record<string, string>;
  /** Median in-stock price for this product across all retailers, when there are at least two offers. */
  market_median_cents?: number | undefined;
}

export interface ResolvedCart {
  retailer: string;
  currency: Currency;
  lines: CartLine[];
  total_cents: number;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
};

/** Price each line from the chosen retailer's offer. Problems become failing checks. */
export function resolveCart(req: PurchaseRequest, facts: Map<string, ProductFacts>): { cart: ResolvedCart | null; checks: Check[] } {
  const checks: Check[] = [];
  const lines: CartLine[] = [];
  const seen = new Set<string>();
  let currency: Currency | undefined;

  for (const line of req.lines) {
    if (seen.has(line.product_id)) {
      checks.push({ id: "cart.duplicate_line", result: "fail", detail: `product ${line.product_id} appears twice`, line: line.product_id });
      continue;
    }
    seen.add(line.product_id);

    const f = facts.get(line.product_id);
    if (!f) {
      checks.push({ id: "facts.available", result: "fail", detail: `no catalog facts for ${line.product_id}`, line: line.product_id });
      continue;
    }
    const offer = f.offers.find((o) => o.retailer === req.retailer && o.availability === "InStock" && o.condition !== "used");
    if (!offer) {
      checks.push({ id: "offer.available", result: "fail", detail: `${req.retailer} has no new, in-stock offer for ${line.product_id}`, line: line.product_id });
      continue;
    }
    if (currency && offer.currency !== currency) {
      checks.push({ id: "cart.single_currency", result: "fail", detail: `mixed currencies ${currency} and ${offer.currency}`, line: line.product_id });
      continue;
    }
    currency = offer.currency;

    const sameCurrencyInStock = f.offers.filter((o) => o.availability === "InStock" && o.currency === offer.currency).map((o) => o.price_cents);
    lines.push({
      product_id: f.product_id,
      name: f.title,
      unit_cents: offer.price_cents,
      quantity: line.quantity,
      brand: f.brand,
      category: f.category,
      attributes: f.attributes,
      market_median_cents: sameCurrencyInStock.length >= 2 ? median(sameCurrencyInStock) : undefined,
    });
  }

  if (checks.length || !currency || lines.length === 0) return { cart: null, checks };
  const total_cents = lines.reduce((s, l) => s + l.unit_cents * l.quantity, 0);
  return { cart: { retailer: req.retailer, currency, lines, total_cents }, checks };
}

export interface ScreenContext {
  now: Date;
  /** Purchases already made (or in flight) against this intent version. */
  purchasesUsed: number;
  /** Price above this multiple of the market median -> HOLD. */
  overpricedRatio?: number;
}

const norm = (s: string) => s.trim().toLowerCase();

export function screenCart(policy: PolicyV1, cart: ResolvedCart, ctx: ScreenContext): Check[] {
  const checks: Check[] = [];
  const add = (id: string, result: CheckResult, detail: string, line?: string) => checks.push(line ? { id, result, detail, line } : { id, result, detail });

  add("intent.not_expired", ctx.now.getTime() <= Date.parse(policy.expires_at) ? "pass" : "fail", `expires ${policy.expires_at}`);
  add("intent.purchases_left", ctx.purchasesUsed < policy.max_purchases ? "pass" : "fail", `${ctx.purchasesUsed} of ${policy.max_purchases} used`);
  add("currency", cart.currency === policy.currency ? "pass" : "fail", `cart ${cart.currency}, policy ${policy.currency}`);
  add("retailer", policy.retailers.includes(cart.retailer) ? "pass" : "fail", `${cart.retailer} vs allowed ${policy.retailers.join(", ")}`);
  add("max_total", cart.total_cents <= policy.max_total_cents ? "pass" : "fail", `${cart.total_cents} vs max ${policy.max_total_cents} cents`);

  const qty = cart.lines.reduce((s, l) => s + l.quantity, 0);
  add("quantity", qty === policy.quantity ? "pass" : "fail", `${qty} vs required ${policy.quantity}`);

  const ratio = ctx.overpricedRatio ?? 1.5;
  for (const l of cart.lines) {
    const id = l.product_id;
    const categoryMatches = policy.category !== undefined && l.category !== undefined && norm(l.category).includes(norm(policy.category));

    if (policy.products) {
      if (policy.products.includes(id)) add("product.allowed", "pass", `${id} is an allowed product`, id);
      else if (policy.substitution === "deny") add("product.allowed", "fail", `${id} is not an allowed product; substitution denied`, id);
      else if (policy.substitution === "hold") add("product.allowed", "unknown", `${id} is a substitute; policy says ask`, id);
      else if (categoryMatches) add("product.allowed", "pass", `${id} substitute in category ${l.category}`, id);
      else checks.push({ id: "product.allowed", result: "unknown", detail: `${id} is a substitute; whether it is a ${policy.category} is judged semantically`, line: id, defers_to: "ai.soft:category" });
    }

    if (policy.category !== undefined) {
      if (l.category === undefined) add("category", "unknown", "listing has no category", id);
      else if (categoryMatches) add("category", "pass", `${l.category} vs ${policy.category}`, id);
      else checks.push({ id: "category", result: "unknown", detail: `listing category "${l.category}" doesn't literally say "${policy.category}"; judged semantically`, line: id, defers_to: "ai.soft:category" });
    }

    if (policy.hard.size !== undefined) {
      const size = l.attributes["size"];
      if (size === undefined) add("size", "unknown", "listing has no size", id);
      else add("size", norm(size) === norm(policy.hard.size) ? "pass" : "fail", `${size} vs ${policy.hard.size}`, id);
    }

    if (policy.hard.excluded_colors.length) {
      const color = l.attributes["color"];
      if (color === undefined) add("color", "unknown", "listing has no color", id);
      else {
        const bad = policy.hard.excluded_colors.some((c) => norm(color).includes(norm(c)));
        add("color", bad ? "fail" : "pass", `${color} vs excluded ${policy.hard.excluded_colors.join(", ")}`, id);
      }
    }

    if (policy.hard.brand !== undefined) {
      if (l.brand === undefined) add("brand", "unknown", "listing has no brand", id);
      else add("brand", norm(l.brand) === norm(policy.hard.brand) ? "pass" : "fail", `${l.brand} vs ${policy.hard.brand}`, id);
    }

    if (l.market_median_cents !== undefined) {
      const over = l.unit_cents > Math.round(l.market_median_cents * ratio);
      add("market_price", over ? "unknown" : "pass", `${l.unit_cents} vs market median ${l.market_median_cents} cents`, id);
    }
  }
  return checks;
}

export type ScreenOutcome = "REJECT" | "HOLD" | "PROCEED";

export function screenOutcome(checks: Check[]): ScreenOutcome {
  if (checks.some((c) => c.result === "fail")) return "REJECT";
  if (checks.some((c) => c.result === "unknown")) return "HOLD";
  return "PROCEED";
}
