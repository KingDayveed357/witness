// Intents: drafted, confirmed by the shopper (frozen, digested), revoked. Stage 4 adds the AI
// compiler that produces the draft from free text; Stage 3 accepts a structured policy.

import { and, eq } from "drizzle-orm";
import { PolicyV1, newId, policyDigest } from "@witness/core";
import { QUEUES, appendAudit, enqueue, recordDecision, schema, transition, withTx } from "@witness/db";
import { nowOf, type EngineDeps } from "./deps.ts";

const { intents, purchases, holds, shoppers } = schema;

export type IntentRow = typeof intents.$inferSelect;
export type IntentResult = { kind: "ok"; intent: IntentRow } | { kind: "error"; status: 404 | 409 | 422; title: string; detail: string };

const fail = (status: 404 | 409 | 422, title: string, detail: string): IntentResult => ({ kind: "error", status, title, detail });

export function intentView(i: IntentRow) {
  return {
    id: i.id,
    version: i.version,
    status: i.status,
    source_text: i.sourceText,
    policy: i.policy,
    policy_digest: i.policyDigest,
    ambiguities: i.ambiguities,
    confirmed_at: i.confirmedAt?.toISOString() ?? null,
  };
}

export async function createIntent(d: EngineDeps, tenantId: string, shopperId: string, input: { policy: unknown; source_text?: string }): Promise<IntentResult> {
  const parsed = PolicyV1.safeParse(input.policy);
  if (!parsed.success) return fail(422, "Invalid policy", parsed.error.issues.map((i) => `${i.path.join(".") || "(policy)"}: ${i.message}`).join("; "));
  return withTx(d.pool, async (tx) => {
    const shopper = (await tx.db.select().from(shoppers).where(and(eq(shoppers.id, shopperId), eq(shoppers.tenantId, tenantId))).limit(1))[0];
    if (!shopper) return fail(404, "Shopper not found", shopperId);
    const id = newId("int");
    const [row] = await tx.db
      .insert(intents)
      .values({ id, tenantId, shopperId, lineageId: id, version: 1, status: "DRAFT", sourceText: input.source_text ?? null, policy: parsed.data })
      .returning();
    await appendAudit(tx, { tenantId, purchaseId: null, eventType: "intent.drafted", payload: { intent_id: id, shopper_id: shopperId } });
    return { kind: "ok", intent: row! };
  });
}

export async function getIntent(d: EngineDeps, tenantId: string, id: string): Promise<IntentRow | null> {
  return (await withTx(d.pool, (tx) => tx.db.select().from(intents).where(and(eq(intents.id, id), eq(intents.tenantId, tenantId))).limit(1)))[0] ?? null;
}

/** The shopper confirms (optionally with an edited policy). The policy is frozen from here on. */
export async function confirmIntent(d: EngineDeps, tenantId: string, shopperId: string | null, id: string, edited?: unknown): Promise<IntentResult> {
  return withTx(d.pool, async (tx) => {
    const i = (await tx.db.select().from(intents).where(and(eq(intents.id, id), eq(intents.tenantId, tenantId))).for("update").limit(1))[0];
    if (!i || (shopperId && i.shopperId !== shopperId)) return fail(404, "Intent not found", id);
    if (i.status !== "DRAFT") return fail(409, "Intent is not a draft", `intent ${id} is ${i.status}`);
    const parsed = PolicyV1.safeParse(edited ?? i.policy);
    if (!parsed.success) return fail(422, "Invalid policy", parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; "));
    const digest = policyDigest(parsed.data);
    const [row] = await tx.db
      .update(intents)
      .set({ status: "CONFIRMED", policy: parsed.data, policyDigest: digest, confirmedAt: nowOf(d) })
      .where(eq(intents.id, id))
      .returning();
    await appendAudit(tx, { tenantId, purchaseId: null, eventType: "intent.confirmed", payload: { intent_id: id, version: i.version, policy_digest: digest, confirmed_by: shopperId ?? "admin" } });
    return { kind: "ok", intent: row! };
  });
}

/** Revoke an intent. Any purchase HELD on it is voided: a revoked intent can't be approved later. */
export async function revokeIntent(d: EngineDeps, tenantId: string, shopperId: string | null, id: string): Promise<IntentResult> {
  return withTx(d.pool, async (tx) => {
    const i = (await tx.db.select().from(intents).where(and(eq(intents.id, id), eq(intents.tenantId, tenantId))).for("update").limit(1))[0];
    if (!i || (shopperId && i.shopperId !== shopperId)) return fail(404, "Intent not found", id);
    if (i.status === "REVOKED") return { kind: "ok", intent: i };
    const [row] = await tx.db.update(intents).set({ status: "REVOKED", revokedAt: nowOf(d) }).where(eq(intents.id, id)).returning();
    await appendAudit(tx, { tenantId, purchaseId: null, eventType: "intent.revoked", payload: { intent_id: id, revoked_by: shopperId ?? "admin" } });

    const held = await tx.db
      .select()
      .from(purchases)
      .where(and(eq(purchases.intentId, id), eq(purchases.state, "HELD")))
      .for("update");
    for (const p of held) {
      const reasons = [`intent ${id} was revoked by the shopper`];
      await tx.db.update(holds).set({ resolvedAt: nowOf(d), resolution: "REVOKED" }).where(eq(holds.purchaseId, p.id));
      await recordDecision(tx, p.id, "VOID", reasons, `shopper:${shopperId ?? "admin"}`);
      await transition(tx, { tenantId, purchaseId: p.id, from: "HELD", to: "VOIDING", event: "purchase.void_decided", payload: { reasons }, patch: { outcome: "VOID", reasons } });
      await enqueue(d.boss, tx, QUEUES.void, { tenantId, purchaseId: p.id }, { singletonKey: `void:${p.id}` });
    }
    return { kind: "ok", intent: row! };
  });
}
