import { describe, expect, test } from "vitest";
import { Channel3Catalog, FallbackCatalog, FixtureCatalog, normaliseChannel3 } from "../src/index.ts";

// Shape from docs.trychannel3.com guides/product and guides/offer (offer fields Verified there).
const channel3Product = {
  id: "2yh8WH5",
  title: "Nike Air Force 1 '07",
  brand: { name: "Nike" },
  category: "Shoes",
  attributes: { Color: "White", Size: "10" },
  offers: [
    { domain: "nike.com", price: { amount: 110, currency: "USD" }, availability: "InStock", condition: "new", url: "https://www.buy.trychannel3.com/x" },
    { domain: "footlocker.com", price: { amount: 105, currency: "USD" }, availability: "InStock", url: "https://www.buy.trychannel3.com/y" },
    { domain: "weird.example", price: { amount: "free", currency: "USD" }, availability: "InStock" },
    { domain: "jpy.example", price: { amount: 15000, currency: "JPY" }, availability: "InStock" },
  ],
};

describe("Channel3 normaliser", () => {
  test("maps verified offer fields to integer cents and lowercases attribute keys", () => {
    const f = normaliseChannel3(channel3Product);
    expect(f.source).toBe("channel3");
    expect(f.brand).toBe("Nike");
    expect(f.attributes).toEqual({ color: "White", size: "10" });
    expect(f.offers).toEqual([
      { retailer: "nike.com", price_cents: 11000, currency: "USD", availability: "InStock", condition: "new" },
      { retailer: "footlocker.com", price_cents: 10500, currency: "USD", availability: "InStock", condition: "unknown" },
    ]);
  });

  test("drops offers it cannot map instead of guessing", () => {
    expect(normaliseChannel3(channel3Product).offers.map((o) => o.retailer)).not.toContain("weird.example");
    expect(normaliseChannel3(channel3Product).offers.map((o) => o.retailer)).not.toContain("jpy.example");
  });

  test("throws when essentials are missing", () => {
    expect(() => normaliseChannel3({ title: "no id" })).toThrow();
    expect(() => normaliseChannel3(null)).toThrow();
  });
});

describe("catalog sources", () => {
  test("the Channel3 source sends the API key header and reports per-product errors", async () => {
    const seen: { url: string; key: string | null }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen.push({ url: String(url), key: new Headers(init.headers).get("x-api-key") });
      return String(url).endsWith("/2yh8WH5") ? new Response(JSON.stringify(channel3Product)) : new Response("{}", { status: 404 });
    }) as unknown as typeof fetch;
    const r = await new Channel3Catalog({ apiKey: "c3-test-key", fetchImpl }).getProducts(["2yh8WH5", "nope"]);
    expect([...r.facts.keys()]).toEqual(["2yh8WH5"]);
    expect(r.errors).toEqual([{ product_id: "nope", error: "channel3: HTTP 404" }]);
    expect(seen[0]).toEqual({ url: "https://api.trychannel3.com/v1/products/2yh8WH5", key: "c3-test-key" });
  });

  test("fallback fills only what the live source missed, and labels it as fixture", async () => {
    const down = (async () => new Response("", { status: 503 })) as unknown as typeof fetch;
    const r = await new FallbackCatalog(new Channel3Catalog({ apiKey: "k", fetchImpl: down }), new FixtureCatalog()).getProducts(["TRL-GRY-10", "UNKNOWN-ID"]);
    expect(r.facts.get("TRL-GRY-10")?.source).toBe("fixture");
    expect(r.errors.map((e) => e.product_id)).toEqual(["UNKNOWN-ID"]);
  });

  test("fixture catalog has the demo products, including the injection listing", async () => {
    const r = await new FixtureCatalog().getProducts(["TRL-GRY-10", "TRL-INJECT"]);
    expect(r.facts.get("TRL-INJECT")?.description).toMatch(/SYSTEM NOTE/);
    expect(r.errors).toEqual([]);
  });
});
