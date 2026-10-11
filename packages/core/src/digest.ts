// Digests over RFC 8785 canonical JSON, so the same content always hashes the same.

import { createHash } from "node:crypto";
import canonicalize from "canonicalize";
import type { PolicyV1 } from "./policy.ts";

export function canonicalJson(value: unknown): string {
  const out = canonicalize(value);
  if (out === undefined) throw new Error("value cannot be canonicalized");
  return out;
}

export const sha256Hex = (s: string) => createHash("sha256").update(s).digest("hex");

export interface CartItemKey {
  sku: string;
  quantity: number;
  unit_cents: number;
}

/** The money-relevant identity of a cart: currency plus SKU, quantity and unit price per line. */
export function cartDigest(currency: string, items: CartItemKey[]): string {
  const sorted = items
    .map(({ sku, quantity, unit_cents }) => ({ sku, quantity, unit_cents }))
    .sort((a, b) => (a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0));
  return "sha256:" + sha256Hex(canonicalJson({ currency, items: sorted }));
}

export function policyDigest(policy: PolicyV1): string {
  return "sha256:" + sha256Hex(canonicalJson(policy));
}
