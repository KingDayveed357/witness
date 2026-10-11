// Catalog sources. Witness always fetches facts itself by canonical product ID; it never uses the
// agent's description of a product.
//
// Channel3: GET https://api.trychannel3.com/v1/products/{id} with header x-api-key (Verified in
// docs.trychannel3.com/guides/product-detail; the endpoint is free). Offer fields `domain`,
// `price.amount`, `price.currency`, `availability`, `condition` are Verified (guides/offer).
// Brand, category and attribute field shapes are NOT yet verified against a live response, so the
// normaliser accepts only what it can map confidently and drops the rest (a missing attribute
// becomes HOLD in screening, never a pass). Contract test pending a Channel3 key.

import { CURRENCIES, numberToCents, ProductFacts, type Offer } from "@witness/core";
import { fixtureFacts } from "./fixtures.ts";

export interface CatalogResult {
  facts: Map<string, ProductFacts>;
  errors: { product_id: string; error: string }[];
}

export interface CatalogSource {
  readonly name: string;
  getProducts(ids: string[]): Promise<CatalogResult>;
}

export class FixtureCatalog implements CatalogSource {
  readonly name = "fixture";
  async getProducts(ids: string[]): Promise<CatalogResult> {
    const all = fixtureFacts();
    const facts = new Map<string, ProductFacts>();
    const errors: CatalogResult["errors"] = [];
    for (const id of ids) {
      const f = all.get(id);
      if (f) facts.set(id, f);
      else errors.push({ product_id: id, error: "not in fixture catalog" });
    }
    return { facts, errors };
  }
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const nameOf = (v: unknown): string | undefined => str(v) ?? (v && typeof v === "object" ? str((v as Record<string, unknown>)["name"]) : undefined);

/** Map a Channel3 product object to ProductFacts, or throw if the essentials are missing. */
export function normaliseChannel3(raw: unknown, now = new Date()): ProductFacts {
  if (!raw || typeof raw !== "object") throw new Error("Channel3 product is not an object");
  const p = raw as Record<string, unknown>;
  const offers: Offer[] = [];
  for (const o of Array.isArray(p["offers"]) ? (p["offers"] as Record<string, unknown>[]) : []) {
    const price = o["price"] as Record<string, unknown> | undefined;
    const currency = str(price?.["currency"]);
    const amount = price?.["amount"];
    const retailer = str(o["domain"])?.toLowerCase();
    if (!retailer || typeof amount !== "number" || !currency || !(CURRENCIES as readonly string[]).includes(currency)) continue;
    let price_cents: number;
    try {
      price_cents = numberToCents(amount);
    } catch {
      continue;
    }
    const availability = o["availability"] === "InStock" ? "InStock" : o["availability"] === "OutOfStock" ? "OutOfStock" : "Unknown";
    const cond = str(o["condition"]);
    const condition = cond === "new" || cond === "used" || cond === "refurbished" ? cond : "unknown";
    offers.push({ retailer, price_cents, currency: currency as Offer["currency"], availability, condition });
  }

  const attributes: Record<string, string> = {};
  const rawAttrs = p["attributes"];
  if (rawAttrs && typeof rawAttrs === "object" && !Array.isArray(rawAttrs)) {
    for (const [k, v] of Object.entries(rawAttrs)) if (str(v)) attributes[k.toLowerCase()] = str(v)!;
  }

  return ProductFacts.parse({
    product_id: str(p["id"]),
    title: str(p["title"]),
    brand: nameOf(p["brand"]),
    category: nameOf(p["category"]),
    attributes,
    description: str(p["description"])?.slice(0, 10_000),
    offers,
    source: "channel3",
    fetched_at: now.toISOString(),
  });
}

export class Channel3Catalog implements CatalogSource {
  readonly name = "channel3";
  readonly #key: string;
  readonly #fetch: typeof fetch;
  readonly #base: string;

  constructor(o: { apiKey: string; fetchImpl?: typeof fetch; baseUrl?: string }) {
    if (!o.apiKey) throw new Error("CHANNEL3_API_KEY is required for the Channel3 catalog");
    this.#key = o.apiKey;
    this.#fetch = o.fetchImpl ?? fetch;
    this.#base = o.baseUrl ?? "https://api.trychannel3.com";
  }

  async getProducts(ids: string[]): Promise<CatalogResult> {
    const facts = new Map<string, ProductFacts>();
    const errors: CatalogResult["errors"] = [];
    await Promise.all(
      ids.map(async (id) => {
        try {
          const res = await this.#fetch(`${this.#base}/v1/products/${encodeURIComponent(id)}`, {
            headers: { "x-api-key": this.#key },
            signal: AbortSignal.timeout(8_000),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          facts.set(id, normaliseChannel3(await res.json()));
        } catch (e) {
          errors.push({ product_id: id, error: `channel3: ${(e as Error).message}` });
        }
      }),
    );
    return { facts, errors };
  }
}

/** Live source first; fixture only for products the live source couldn't return. */
export class FallbackCatalog implements CatalogSource {
  readonly name: string;
  readonly primary: CatalogSource;
  readonly fallback: CatalogSource;
  constructor(primary: CatalogSource, fallback: CatalogSource) {
    this.primary = primary;
    this.fallback = fallback;
    this.name = `${primary.name}+${fallback.name}`;
  }
  async getProducts(ids: string[]): Promise<CatalogResult> {
    const first = await this.primary.getProducts(ids);
    const missing = ids.filter((id) => !first.facts.has(id));
    if (!missing.length) return first;
    const second = await this.fallback.getProducts(missing);
    for (const [k, v] of second.facts) first.facts.set(k, v);
    // One error per product still missing, naming why each source failed.
    const why = (list: CatalogResult["errors"], id: string) => list.find((e) => e.product_id === id)?.error ?? "missing";
    const errors = missing.filter((id) => !second.facts.has(id)).map((id) => ({ product_id: id, error: `${why(first.errors, id)}; ${why(second.errors, id)}` }));
    return { facts: first.facts, errors };
  }
}

export function catalogFromEnv(env: { CHANNEL3_API_KEY?: string | undefined }): CatalogSource {
  return env.CHANNEL3_API_KEY ? new FallbackCatalog(new Channel3Catalog({ apiKey: env.CHANNEL3_API_KEY }), new FixtureCatalog()) : new FixtureCatalog();
}
