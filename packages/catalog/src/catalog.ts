// Catalog sources. Witness always fetches facts itself by canonical product ID; it never uses the
// agent's description of a product.
//
// Channel3: GET https://api.trychannel3.com/v1/products/{id} with header x-api-key (Verified in
// docs.trychannel3.com/guides/product-detail; the endpoint is free). Offer fields `domain`,
// `price.amount`, `price.currency`, `availability`, `condition` are Verified (guides/offer).
// The live response shape was verified on 2026-10-12 (see normaliseChannel3). Anything the normaliser
// can't map confidently is dropped: a missing attribute becomes HOLD in screening, never a pass.

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

/**
 * Map a Channel3 product object to ProductFacts, or throw if the essentials are missing.
 *
 * Shape verified against a live response on 2026-10-12 (test/fixtures/channel3-product.json).
 * It differs from the docs in places: the offer price is `price.price` (docs show `price.amount`),
 * brands are a `brands[]` array, category is an object with a `path`, and attributes live in
 * `structured_attributes` (arrays) and `variants.selected`. Variant "Color" labels can be style
 * codes (e.g. "FV2338-201"), so only plain-word labels are taken as colours: otherwise colour stays
 * unknown and an excluded-colour policy holds instead of passing.
 */
export function normaliseChannel3(raw: unknown, now = new Date()): ProductFacts {
  if (!raw || typeof raw !== "object") throw new Error("Channel3 product is not an object");
  const p = raw as Record<string, unknown>;
  const offers: Offer[] = [];
  for (const o of Array.isArray(p["offers"]) ? (p["offers"] as Record<string, unknown>[]) : []) {
    const price = o["price"] as Record<string, unknown> | undefined;
    const currency = str(price?.["currency"]);
    const amount = price?.["price"] ?? price?.["amount"];
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
  const put = (k: string, v: unknown) => {
    const val = Array.isArray(v) ? v.map(str).filter(Boolean).join(", ") : str(v);
    if (val) attributes[k.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")] = val;
  };
  for (const key of ["attributes", "structured_attributes"]) {
    const obj = p[key];
    if (obj && typeof obj === "object" && !Array.isArray(obj)) for (const [k, v] of Object.entries(obj)) put(k, v);
  }
  if (Array.isArray(p["materials"])) put("material", p["materials"]);
  const selected = (p["variants"] as { selected?: { name?: unknown; label?: unknown }[] } | undefined)?.selected;
  for (const sel of Array.isArray(selected) ? selected : []) {
    const name = str(sel.name)?.toLowerCase();
    const label = str(sel.label);
    if (!name || !label) continue;
    if (name === "color" || name === "colour") {
      if (/^[A-Za-z][A-Za-z /&-]{1,40}$/.test(label)) attributes["color"] = label;
    } else put(name, label);
  }

  const brands = Array.isArray(p["brands"]) ? (p["brands"] as unknown[]) : [];
  const brand = nameOf(brands[0]) ?? nameOf(p["brand"]);
  const cat = p["category"];
  let category: string | undefined = str(cat);
  if (!category && cat && typeof cat === "object") {
    const path = (cat as { path?: { title?: unknown }[] }).path;
    category = Array.isArray(path) && path.length ? path.map((x) => str(x.title)).filter(Boolean).join(" > ") : str((cat as { title?: unknown }).title);
  }
  const features = Array.isArray(p["key_features"]) ? (p["key_features"] as unknown[]).map(str).filter(Boolean) : [];
  const description = [str(p["description"]), ...features].filter(Boolean).join("\n").slice(0, 10_000) || undefined;

  return ProductFacts.parse({
    product_id: str(p["id"]),
    title: str(p["title"]),
    brand,
    category,
    attributes,
    description,
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
