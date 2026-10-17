// Read side of Second Key recipient payouts (the executor writes them). Views never expose the full
// recipient email, and the live read asks PayPal itself rather than trusting the stored status.

import { eq } from "drizzle-orm";
import { fromCents } from "@witness/core";
import { dbOf, schema } from "@witness/db";
import { PayPalHttpError, PayPalNetworkError } from "@witness/paypal";
import { nowOf, type EngineDeps } from "./deps.ts";

const { payouts } = schema;

/** "sb-abcd1234567@personal.example.com" → "sb•••67@personal.example.com". */
export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  if (!domain) return "•••";
  return `${local.slice(0, 2)}•••${local.length > 4 ? local.slice(-2) : ""}@${domain}`;
}

export interface PayoutView {
  status: string;
  amount: { currency_code: string; value: string };
  receiver: string; // masked
  batch_id: string | null;
  item_id: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export async function getPayout(d: EngineDeps, purchaseId: string): Promise<PayoutView | null> {
  const r = (await dbOf(d.pool).select().from(payouts).where(eq(payouts.purchaseId, purchaseId)).limit(1))[0];
  if (!r) return null;
  return {
    status: r.status,
    amount: { currency_code: r.currency, value: fromCents(r.amountCents) },
    receiver: maskEmail(r.receiver),
    batch_id: r.batchId,
    item_id: r.itemId,
    last_error: r.lastError,
    created_at: r.createdAt.toISOString(),
    updated_at: r.updatedAt.toISOString(),
  };
}

export interface LivePayout {
  fetched_at: string;
  debug_id: string | null;
  batch_id: string;
  batch_status: string | null;
  item_id: string | null;
  item_status: string | null;
  amount: string | null;
  error?: string;
}

/** PayPal's own record of the payout batch (read-only). Null when no batch exists yet. */
export async function livePayout(d: EngineDeps, view: PayoutView | null): Promise<LivePayout | null> {
  if (!view?.batch_id) return null;
  try {
    const r = await d.paypal.getPayoutBatch(view.batch_id);
    const item = r.data?.items?.[0];
    return {
      fetched_at: nowOf(d).toISOString(),
      debug_id: r.debugId ?? null,
      batch_id: view.batch_id,
      batch_status: r.data?.batch_header?.batch_status ?? null,
      item_id: item?.payout_item_id ?? null,
      item_status: item?.transaction_status ?? null,
      amount: item?.payout_item?.amount?.value ?? null,
    };
  } catch (e) {
    if (!(e instanceof PayPalNetworkError || e instanceof PayPalHttpError)) throw e;
    return { fetched_at: nowOf(d).toISOString(), debug_id: null, batch_id: view.batch_id, batch_status: null, item_id: null, item_status: null, amount: null, error: "couldn't reach PayPal" };
  }
}
