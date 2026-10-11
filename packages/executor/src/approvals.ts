// The single-use capability. `ConsumedApproval` can only be produced by `consumeApproval`, which
// marks the row used in one atomic UPDATE. `capture` refuses anything else, at compile time (the
// brand) and at run time (the WeakSet). Approvals are always read from the database by ID: the
// executor never accepts approval content from a caller (validation finding T9a).

import type { Tx } from "@witness/db";

declare const brand: unique symbol;

export interface ApprovalRecord {
  id: string;
  purchase_id: string;
  tenant_id: string;
  paypal_order_id: string;
  paypal_authorization_id: string;
  payee_merchant_id: string;
  amount_cents: number;
  currency: string;
  cart_digest: string;
  policy_digest: string;
  intent_version: number;
  request_id: string;
  expires_at: Date;
  used_at: Date;
}

export type ConsumedApproval = Readonly<ApprovalRecord> & { readonly [brand]: true };

const issued = new WeakSet<object>();

export async function consumeApproval(tx: Tx, a: { approvalId: string; tenantId: string; purchaseId: string }): Promise<ConsumedApproval | null> {
  const { rows } = await tx.client.query<ApprovalRecord>(
    `UPDATE approvals SET used_at = now()
      WHERE id = $1 AND tenant_id = $2 AND purchase_id = $3 AND used_at IS NULL AND expires_at > now()
      RETURNING id, purchase_id, tenant_id, paypal_order_id, paypal_authorization_id, payee_merchant_id,
                amount_cents, currency, cart_digest, policy_digest, intent_version, request_id, expires_at, used_at`,
    [a.approvalId, a.tenantId, a.purchaseId],
  );
  if (!rows[0]) return null;
  const consumed = Object.freeze({ ...rows[0] }) as ConsumedApproval;
  issued.add(consumed);
  return consumed;
}

/** Re-load an approval this purchase already consumed (reconciliation after a crash or timeout). */
export async function reloadConsumedApproval(tx: Tx, a: { tenantId: string; purchaseId: string }): Promise<ConsumedApproval | null> {
  const { rows } = await tx.client.query<ApprovalRecord>(
    `SELECT id, purchase_id, tenant_id, paypal_order_id, paypal_authorization_id, payee_merchant_id,
            amount_cents, currency, cart_digest, policy_digest, intent_version, request_id, expires_at, used_at
       FROM approvals WHERE tenant_id = $1 AND purchase_id = $2 AND used_at IS NOT NULL`,
    [a.tenantId, a.purchaseId],
  );
  if (!rows[0]) return null;
  const consumed = Object.freeze({ ...rows[0] }) as ConsumedApproval;
  issued.add(consumed);
  return consumed;
}

export function assertConsumed(a: ConsumedApproval): void {
  if (!issued.has(a)) throw new Error("capture refused: approval was not obtained through consumeApproval()");
}
