// Second Key policy v2 (ADR-0019): what a PAYER can do with their own paused payment.
//
//   shareContext  — optionally share the conversation after the pause, for a second opinion. It is
//                   analysed like submitted evidence, but recorded as CONTEXT checks that can only add
//                   concerns: nothing a payer shares, and nothing the model says, unpauses a payment.
//   giveFeedback  — say a finding is wrong. A note the reviewer and the Desk see; not a policy input.
//   cancel        — handled by resolveHold(…, "deny", { shopperId }): the payer can always cancel.

import { and, eq } from "drizzle-orm";
import { ConversationInput, type Check } from "@witness/core";
import { appendAudit, dbOf, recordChecks, schema, withTx } from "@witness/db";
import { UnavailableLlm, checkManipulation } from "@witness/ai";
import { type EngineDeps } from "./deps.ts";

const { purchases, intents, sharedContext, evidenceFeedback } = schema;

export type ContextResult<T> = { kind: "ok"; value: T } | { kind: "error"; status: 400 | 404 | 409; title: string; detail?: string };
const bad = (status: 400 | 404 | 409, title: string, detail?: string): ContextResult<never> => ({ kind: "error", status, title, ...(detail ? { detail } : {}) });

async function ownPurchase(d: EngineDeps, tenantId: string, shopperId: string, purchaseId: string) {
  const db = dbOf(d.pool);
  const p = (await db.select().from(purchases).where(and(eq(purchases.id, purchaseId), eq(purchases.tenantId, tenantId))).limit(1))[0];
  if (!p) return null;
  const i = (await db.select().from(intents).where(eq(intents.id, p.intentId)).limit(1))[0];
  return i?.shopperId === shopperId ? p : null;
}

/** Share the conversation behind a paused transfer, once, and analyse it. Never changes the payment's state. */
export async function shareContext(d: EngineDeps, tenantId: string, shopperId: string, purchaseId: string, body: unknown): Promise<ContextResult<{ check: Check }>> {
  const parsed = ConversationInput.safeParse((body as { conversation?: unknown } | null)?.conversation);
  if (!parsed.success) return bad(400, "Invalid conversation", parsed.error.issues.map((i) => `${i.path.join(".") || "(conversation)"}: ${i.message}`).join("; "));
  const p = await ownPurchase(d, tenantId, shopperId, purchaseId);
  if (!p) return bad(404, "Payment not found");
  if ((p.request as { kind?: string } | null)?.kind !== "transfer") return bad(409, "Only transfers take shared context");
  if (p.state !== "HELD") return bad(409, `The payment is ${p.state}`, "Context can only be shared while a payment is paused");
  if ((p.request as { conversation?: unknown }).conversation) return bad(409, "A conversation was already shared with this payment");

  // Claim the slot first (primary key), so two concurrent shares can't both spend a model call.
  const claimed = await withTx(d.pool, async (tx) => {
    const r = await tx.db.insert(sharedContext).values({ purchaseId, conversation: parsed.data, sharedBy: `shopper:${shopperId}` }).onConflictDoNothing().returning({ id: sharedContext.purchaseId });
    if (!r.length) return false;
    await appendAudit(tx, { tenantId, purchaseId, eventType: "context.shared", payload: { lines: parsed.data.lines.length, shared_by: `shopper:${shopperId}` } });
    return true;
  });
  if (!claimed) return bad(409, "A conversation was already shared with this payment");

  // Outside any transaction: the model call. Failure is recorded as "couldn't analyse", which changes nothing.
  const check = await checkManipulation(d.ai ?? new UnavailableLlm(), parsed.data);
  await withTx(d.pool, async (tx) => {
    await recordChecks(tx, purchaseId, "CONTEXT", [check]);
    await appendAudit(tx, { tenantId, purchaseId, eventType: "context.analysed", payload: { result: check.result, evidence: check.evidence?.length ?? 0, model: check.model ?? null, prompt_version: check.prompt_version ?? null } });
  });
  return { kind: "ok", value: { check } };
}

/** A payer says a finding is wrong. Recorded and shown; it does not change the decision rules. */
export async function giveFeedback(d: EngineDeps, tenantId: string, shopperId: string, purchaseId: string, body: unknown): Promise<ContextResult<{ id: number }>> {
  const b = (body ?? {}) as { quote?: unknown; note?: unknown };
  if (typeof b.quote !== "string" || b.quote.trim().length < 1 || b.quote.length > 300) return bad(400, "quote: 1-300 characters");
  if (typeof b.note !== "string" || b.note.trim().length < 1 || b.note.length > 500) return bad(400, "note: 1-500 characters");
  const p = await ownPurchase(d, tenantId, shopperId, purchaseId);
  if (!p) return bad(404, "Payment not found");
  if (p.state !== "HELD") return bad(409, `The payment is ${p.state}`);
  const id = await withTx(d.pool, async (tx) => {
    const [row] = await tx.db.insert(evidenceFeedback).values({ purchaseId, quote: b.quote as string, note: (b.note as string).trim(), givenBy: `shopper:${shopperId}` }).returning({ id: evidenceFeedback.id });
    await appendAudit(tx, { tenantId, purchaseId, eventType: "evidence.disputed", payload: { feedback_id: row!.id, given_by: `shopper:${shopperId}` } });
    return row!.id;
  });
  return { kind: "ok", value: { id } };
}

/** The conversation behind a payment: submitted with it, or shared after the pause. */
export async function conversationOf(d: EngineDeps, p: { id: string; request: unknown }): Promise<{ conversation: unknown; source: "submitted" | "shared_after_pause" } | null> {
  const submitted = (p.request as { conversation?: unknown } | null)?.conversation;
  if (submitted) return { conversation: submitted, source: "submitted" };
  const s = (await dbOf(d.pool).select().from(sharedContext).where(eq(sharedContext.purchaseId, p.id)).limit(1))[0];
  return s ? { conversation: s.conversation, source: "shared_after_pause" } : null;
}

export async function feedbackOf(d: EngineDeps, purchaseId: string) {
  const rows = await dbOf(d.pool).select().from(evidenceFeedback).where(eq(evidenceFeedback.purchaseId, purchaseId));
  return rows.map((r) => ({ quote: r.quote, note: r.note, given_by: r.givenBy, at: r.createdAt.toISOString() }));
}
