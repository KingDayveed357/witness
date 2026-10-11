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
