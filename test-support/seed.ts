// Minimal rows for tests: a tenant, a shopper with a vault, a confirmed intent.

import type pg from "pg";
import { newId, policyDigest, type PolicyV1 } from "@witness/core";

export const PAYEE = "7L6D422CPFA9Q";

export async function seedTenant(pool: pg.Pool, policy: PolicyV1, opts: { vaultId?: string } = {}) {
  const tenantId = newId("ten");
  const shopperId = newId("shp");
  const intentId = newId("int");
  await pool.query("INSERT INTO tenants (id, name, paypal_merchant_id) VALUES ($1, 'Test MoR', $2)", [tenantId, PAYEE]);
  await pool.query("INSERT INTO shoppers (id, tenant_id, display_name, vault_id) VALUES ($1, $2, 'Test Shopper', $3)", [shopperId, tenantId, opts.vaultId ?? "vault_test"]);
  await pool.query(
    `INSERT INTO intents (id, tenant_id, shopper_id, lineage_id, version, status, source_text, policy, policy_digest, confirmed_at)
     VALUES ($1, $2, $3, $1, 1, 'CONFIRMED', 'test intent', $4, $5, now())`,
    [intentId, tenantId, shopperId, JSON.stringify(policy), policyDigest(policy)],
  );
  return { tenantId, shopperId, intentId };
}

export async function seedPurchase(pool: pg.Pool, t: { tenantId: string; intentId: string }, state = "SCREENING") {
  const id = newId("pur");
  await pool.query(
    `INSERT INTO purchases (id, tenant_id, intent_id, intent_version, policy_digest, agent_principal, idempotency_key, request_hash, request, state)
     VALUES ($1, $2, $3, 1, 'sha256:x', 'agent:test', $1, 'h', '{}', $4)`,
    [id, t.tenantId, t.intentId, state],
  );
  return id;
}
