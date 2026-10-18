// The structured, versioned representation of what the human asked for.
// Strict on purpose: an unknown field is an error, never silently ignored
// (validation finding T3: `merchant` used to be accepted and then not enforced).

import { z } from "zod";
import { CURRENCIES } from "./money.ts";

export const Domain = z
  .string()
  .min(3)
  .max(253)
  .transform((s) => s.trim().toLowerCase())
  .pipe(z.string().regex(/^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/, "expected a domain like rei.com"));

export const PolicyV1 = z
  .strictObject({
    version: z.literal(1),
    /** Optional and never defaulted, so shopping policies written before ADR-0016 keep their digest. */
    kind: z.literal("shopping").optional(),
    /** Allowed canonical catalog product IDs. Omit to allow any product in `category`. */
    products: z.array(z.string().min(1).max(64)).min(1).max(20).optional(),
    category: z.string().min(1).max(120).optional(),
    retailers: z.array(Domain).min(1).max(20),
    max_total_cents: z.number().int().positive().max(10_000_000),
    currency: z.enum(CURRENCIES),
    quantity: z.number().int().min(1).max(99),
    hard: z
      .strictObject({
        excluded_colors: z.array(z.string().min(1).max(40)).max(20).default([]),
        size: z.string().min(1).max(20).optional(),
        brand: z.string().min(1).max(80).optional(),
      })
      .default({ excluded_colors: [] }),
    /** Constraints only a model can judge ("warm", "for trail"). Stage 4. */
    soft: z.array(z.strictObject({ id: z.string().min(1).max(40), text: z.string().min(1).max(200) })).max(10).default([]),
    substitution: z.enum(["deny", "hold", "same_category_under_max"]),
    expires_at: z.iso.datetime({ offset: true }),
    max_purchases: z.number().int().min(1).max(10).default(1),
    on_ambiguity: z.literal("hold").default("hold"),
  })
  .refine((p) => (p.products?.length ?? 0) > 0 || p.category !== undefined, {
    message: "a policy needs either allowed products or a category",
  })
  .refine((p) => p.substitution !== "same_category_under_max" || p.category !== undefined, {
    message: "substitution same_category_under_max needs a category",
  });

export type PolicyV1 = z.infer<typeof PolicyV1>;

/**
 * A one-off transfer the payer confirmed (ADR-0016): exactly this amount to exactly this payee.
 * Nothing in it comes from a catalog or a model.
 */
export const TransferPolicyV1 = z.strictObject({
  version: z.literal(1),
  kind: z.literal("transfer"),
  payee: z.strictObject({
    id: z.string().regex(/^[A-Za-z0-9_.:-]{1,64}$/, "1-64 characters of [A-Za-z0-9_.:-]"),
    name: z.string().min(1).max(80),
    /** True when the payer has never paid this payee before. */
    first_payment: z.boolean(),
    /** The recipient's PayPal email. If set, an approved, captured transfer is paid out here, and only here. */
    email: z.email().max(254).optional(),
  }),
  amount_cents: z.number().int().positive().max(10_000_000),
  currency: z.enum(CURRENCIES),
  purpose: z.string().min(1).max(200).optional(),
  /**
   * The payer's own rule, set in advance (ADR-0019): a first payment to someone new at or above this
   * amount always gets a second look, whatever the conversation says. Omitted means no such rule.
   */
  review_threshold_cents: z.number().int().positive().max(10_000_000).optional(),
  expires_at: z.iso.datetime({ offset: true }),
  max_payments: z.literal(1).default(1),
});
export type TransferPolicyV1 = z.infer<typeof TransferPolicyV1>;

export type IntentPolicy = PolicyV1 | TransferPolicyV1;
export type IntentKind = "shopping" | "transfer";

export const intentKindOf = (p: IntentPolicy): IntentKind => (p.kind === "transfer" ? "transfer" : "shopping");

/** Parse a stored or submitted policy by its kind; no `kind` means a shopping policy. */
export function parseIntentPolicy(input: unknown) {
  const kind = input && typeof input === "object" ? (input as { kind?: unknown }).kind : undefined;
  return kind === "transfer" ? TransferPolicyV1.safeParse(input) : PolicyV1.safeParse(input);
}
