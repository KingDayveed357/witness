// HOLD resolution (docs/architecture.md §6.2). Funds stay genuinely authorized while the shopper
// decides. Approval re-reads PayPal's order and re-runs the three-way match before issuing the
// single-use approval: a human can resolve an ambiguity, but never a mismatch with PayPal.
//
// Two ways to decide: as the signed-in shopper, or with a one-time link token (for a phone). The
// token is stored only as a SHA-256 hash, is single use, and expires at the auto-void deadline.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { authorizationDiffs, expectationFor, fromCents, threeWayMatch, type ResolvedCart } from "@witness/core";
import { QUEUES, enqueue, recordChecks, recordDecision, schema, transition, withTx, dbOf, type PurchaseRow } from "@witness/db";
import { PayPalHttpError, PayPalNetworkError } from "@witness/paypal";
import { nowOf, type EngineDeps } from "./deps.ts";
import { issueApproval } from "./purchase.ts";

const { purchases, holds, intents, tenants } = schema;

export type HoldResult<T> = { kind: "ok"; value: T } | { kind: "error"; status: 400 | 403 | 404 | 409 | 410 | 502; title: string; detail?: string };
const bad = (status: 400 | 403 | 404 | 409 | 410 | 502, title: string, detail?: string): HoldResult<never> => ({ kind: "error", status, title, ...(detail ? { detail } : {}) });

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export type HoldActor = { shopperId: string } | { token: string } | { admin: true };

export interface HoldView {
  purchase_id: string;
  state: string;
  reasons: string[];
  amount: { currency_code: string; value: string } | null;
  items: { product_id: string; name: string; quantity: number }[];
  retailer: string | null;
  auto_void_at: string | null;
  resolution: string | null;
}

async function load(d: EngineDeps, purchaseId: string) {
  const db = dbOf(d.pool);
  const p = (await db.select().from(purchases).where(eq(purchases.id, purchaseId)).limit(1))[0];
  if (!p) return null;
  const h = (await db.select().from(holds).where(eq(holds.purchaseId, purchaseId)).limit(1))[0] ?? null;
  const i = (await db.select().from(intents).where(eq(intents.id, p.intentId)).limit(1))[0]!;
  return { p, h, i };
}

function view(p: PurchaseRow, h: typeof holds.$inferSelect | null): HoldView {
  const cart = p.cart as ResolvedCart | null;
  return {
    purchase_id: p.id,
    state: p.state,
    reasons: p.reasons ?? [],
    amount: p.amountCents != null && p.currency ? { currency_code: p.currency, value: fromCents(p.amountCents) } : null,
    items: (cart?.lines ?? []).map((l) => ({ product_id: l.product_id, name: l.name, quantity: l.quantity })),
    retailer: p.retailer,
    auto_void_at: h?.autoVoidAt.toISOString() ?? null,
    resolution: h?.resolution ?? null,
  };
}

/** Check the actor may act on this hold. Tenant scoping is done by the caller for shopper/admin. */
function authorize(actor: HoldActor, ctx: NonNullable<Awaited<ReturnType<typeof load>>>, now: Date): HoldResult<string> {
  if ("admin" in actor) return { kind: "ok", value: "admin" };
  if ("shopperId" in actor) return ctx.i.shopperId === actor.shopperId ? { kind: "ok", value: `shopper:${actor.shopperId}` } : bad(404, "Hold not found");
  const h = ctx.h;
  if (!h?.tokenHash || !h.tokenExpiresAt) return bad(410, "This link is no longer valid");
  const a = Buffer.from(sha(actor.token), "hex");
  const b = Buffer.from(h.tokenHash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return bad(403, "Invalid link");
  if (h.tokenExpiresAt.getTime() < now.getTime() || h.resolvedAt) return bad(410, "This link has expired or was already used");
  return { kind: "ok", value: `shopper:${ctx.i.shopperId}(link)` };
}

export async function getHold(d: EngineDeps, purchaseId: string, actor: HoldActor, tenantId?: string): Promise<HoldResult<HoldView>> {
  const ctx = await load(d, purchaseId);
  if (!ctx || (tenantId && ctx.p.tenantId !== tenantId) || !ctx.h) return bad(404, "Hold not found");
  const ok = authorize(actor, ctx, nowOf(d));
  if (ok.kind === "error") return ok;
  return { kind: "ok", value: view(ctx.p, ctx.h) };
}

/** Create (or replace) the one-time link token. Returned once; only its hash is stored. */
export async function issueHoldLink(d: EngineDeps, tenantId: string, purchaseId: string, actor: { shopperId: string } | { admin: true }): Promise<HoldResult<{ token: string; expires_at: string }>> {
  const ctx = await load(d, purchaseId);
  if (!ctx || ctx.p.tenantId !== tenantId || !ctx.h) return bad(404, "Hold not found");
  const ok = authorize(actor, ctx, nowOf(d));
  if (ok.kind === "error") return ok;
  if (ctx.p.state !== "HELD") return bad(409, `Purchase is ${ctx.p.state}`);
  const token = randomBytes(24).toString("base64url");
  await dbOf(d.pool).update(holds).set({ tokenHash: sha(token), tokenExpiresAt: ctx.h.autoVoidAt, notifiedAt: nowOf(d) }).where(eq(holds.purchaseId, purchaseId));
  return { kind: "ok", value: { token, expires_at: ctx.h.autoVoidAt.toISOString() } };
}

export async function resolveHold(d: EngineDeps, purchaseId: string, decision: "approve" | "deny", actor: HoldActor, tenantId?: string): Promise<HoldResult<HoldView>> {
  const ctx = await load(d, purchaseId);
  if (!ctx || (tenantId && ctx.p.tenantId !== tenantId) || !ctx.h) return bad(404, "Hold not found");
  const who = authorize(actor, ctx, nowOf(d));
  if (who.kind === "error") return who;
  if (ctx.p.state !== "HELD") return bad(409, `Purchase is ${ctx.p.state}`);
  const p0 = ctx.p;

  // Approval: PayPal's order must still match exactly (it may have changed while held).
  let diffs: string[] = [];
  if (decision === "approve") {
    const tenant = (await dbOf(d.pool).select().from(tenants).where(eq(tenants.id, p0.tenantId)).limit(1))[0]!;
    try {
      const order = (await d.paypal.getOrder(p0.paypalOrderId!)).data;
      const exp = expectationFor(p0.cart as ResolvedCart, p0.paypalOrderId!, tenant.paypalMerchantId);
      diffs = [...threeWayMatch(exp, order), ...authorizationDiffs(exp, order, p0.paypalAuthorizationId!)];
    } catch (e) {
      if (e instanceof PayPalNetworkError || e instanceof PayPalHttpError) return bad(502, "Couldn't reach PayPal to re-check the order; try again");
      throw e;
    }
  }

  await withTx(d.pool, async (tx) => {
    const p = (await tx.db.select().from(purchases).where(and(eq(purchases.id, purchaseId), eq(purchases.state, "HELD"))).for("update").limit(1))[0];
    if (!p) return;
    const intent = (await tx.db.select().from(intents).where(eq(intents.id, p.intentId)).limit(1))[0]!;
    const stale = intent.status !== "CONFIRMED" || intent.policyDigest !== p.policyDigest;
    const now = nowOf(d);
    const voidWith = async (reasons: string[], resolution: "APPROVED" | "DENIED") => {
      await tx.db.update(holds).set({ resolvedAt: now, resolution, tokenHash: null }).where(eq(holds.purchaseId, p.id));
      await recordDecision(tx, p.id, "VOID", reasons, who.value);
      await transition(tx, { tenantId: p.tenantId, purchaseId: p.id, from: "HELD", to: "VOIDING", event: "purchase.void_decided", payload: { reasons, decided_by: who.value }, patch: { outcome: "VOID", reasons } });
      await enqueue(d.boss, tx, QUEUES.void, { tenantId: p.tenantId, purchaseId: p.id }, { singletonKey: `void:${p.id}` });
    };

    if (decision === "deny") return voidWith(["the shopper declined the held purchase"], "DENIED");
    if (diffs.length) {
      await recordChecks(tx, p.id, "RECHECK", diffs.map((detail) => ({ id: "three_way_match", result: "fail" as const, detail })));
      return voidWith(diffs, "APPROVED");
    }
    if (stale) return voidWith([`intent ${intent.id} is ${intent.status}; approval refused`], "APPROVED");
    await tx.db.update(holds).set({ resolvedAt: now, resolution: "APPROVED", tokenHash: null }).where(eq(holds.purchaseId, p.id));
    const tenant = (await tx.db.select().from(tenants).where(eq(tenants.id, p.tenantId)).limit(1))[0]!;
    await issueApproval(d, tx, p, tenant.paypalMerchantId, "HELD", who.value);
  });

  const after = await load(d, purchaseId);
  return { kind: "ok", value: view(after!.p, after!.h) };
}
