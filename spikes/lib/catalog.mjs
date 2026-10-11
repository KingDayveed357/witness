// Fixture catalog and policy for the spikes. The real product fetches facts from the
// catalog source itself; it never trusts what the agent says it picked.

export const PRODUCTS = {
  "TRL-GRY-10": { sku: "TRL-GRY-10", name: "Ridgeline Trail Runner, Slate Grey, US 10", unit_amount: "84.00", attributes: { size: "10", color: "Slate Grey", category: "trail-running shoes" } },
  "TRL-WHT-10": { sku: "TRL-WHT-10", name: "Ridgeline Trail Runner, Cloud White, US 10", unit_amount: "84.00", attributes: { size: "10", color: "Cloud White", category: "trail-running shoes" } },
  "TRL-PRO-10": { sku: "TRL-PRO-10", name: "Summit Pro Carbon Trail, White, US 10", unit_amount: "480.00", attributes: { size: "10", color: "White", category: "trail-running shoes" } },
  "RD-BLU-10": { sku: "RD-BLU-10", name: "Metro Road Runner, Blue, US 10", unit_amount: "70.00", attributes: { size: "10", color: "Blue", category: "road-running shoes" } },
};

export function cartOf(...skus) {
  return { currency: "USD", items: skus.map((sku) => ({ ...PRODUCTS[sku], quantity: 1 })) };
}

// What the intent compiler would produce from:
// "Buy trail-running shoes, size 10, under $90, not white."
export const TRAIL_SHOE_POLICY = Object.freeze({
  version: 1,
  original_text: "Buy trail-running shoes, size 10, under $90, not white.",
  category: "trail-running shoes",
  size: "10",
  max_total: "90.00",
  currency: "USD",
  quantity: 1,
  excluded_colors: ["white"],
  on_ambiguity: "hold",
});
