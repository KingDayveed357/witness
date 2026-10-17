// HOLD resolution (docs/architecture.md §6.2). Funds stay genuinely authorized while the shopper
// decides. Approval re-reads PayPal's order and re-runs the three-way match before issuing the
// single-use approval: a human can resolve an ambiguity, but never a mismatch with PayPal.
//
// Two ways to decide: as the signed-in shopper, or with a one-time link token (for a phone). The
// token is stored only as a SHA-256 hash and is bound to one purchase. Two separate clocks:
//   - the HOLD lasts until auto_void_at (default 72 h after authorization), then the money is released;
//   - a LINK lasts holdLinkMs (default 30 min, never past auto_void_at). Re-issuing replaces it.
// A link decides once. Retrying the same decision returns the recorded result (idempotent); the
// opposite decision gets 409. The spent link can still show the outcome until it expires.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { authorizationDiffs, expectationFor, fromCents, threeWayMatch, type EvidenceItem, type ResolvedCart } from "@witness/core";
import { QUEUES, enqueue, recordChecks, recordDecision, schema, transition, withTx, dbOf, type PurchaseRow } from "@witness/db";
import { PayPalHttpError, PayPalNetworkError } from "@witness/paypal";
import { nowOf, type EngineDeps } from "./deps.ts";
import { issueApproval } from "./purchase.ts";
import { getPayout, livePayout, maskEmail, type LivePayout, type PayoutView } from "./payouts.ts";

const { purchases, holds, intents, tenants, shoppers, checks: checksT } = schema;

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
  /** When the link used for this request stops working (null for signed-in actors). */
  link_expires_at: string | null;
  /** True when this response replays a decision already recorded for the same choice. */
  replayed?: boolean;
  /** What the reviewer needs to decide (Second Key): who, to whom, why, and the evidence. */
  kind: "shopping" | "transfer";
  payer_name: string | null;
  payee: { name: string; first_payment: boolean; email?: string } | null;
  purpose: string | null;
  conversation: { context: string; lines: { speaker: string; text: string }[] } | null;
  concerns: { check_id: string; kind: string; detail: string; evidence: EvidenceItem[] }[];
  /** Recipient payout after an approved, captured transfer (null if none was made or configured). */
  payout: PayoutView | null;
  payout_configured: boolean;
}

async function load(d: EngineDeps, purchaseId: string) {
  const db = dbOf(d.pool);
  const p = (await db.select().from(purchases).where(eq(purchases.id, purchaseId)).limit(1))[0];
  if (!p) return null;
  const h = (await db.select().from(holds).where(eq(holds.purchaseId, purchaseId)).limit(1))[0] ?? null;
  const i = (await db.select().from(intents).where(eq(intents.id, p.intentId)).limit(1))[0]!;
  const shopper = (await db.select({ name: shoppers.displayName }).from(shoppers).where(eq(shoppers.id, i.shopperId)).limit(1))[0];
  const concerns = await db
    .select()
    .from(checksT)
    .where(and(eq(checksT.purchaseId, purchaseId), eq(checksT.phase, "SCREEN"), eq(checksT.result, "unknown")))
    .orderBy(asc(checksT.id));
  return { p, h, i, payerName: shopper?.name ?? null, concerns, payout: await getPayout(d, purchaseId) };
}
type Ctx = NonNullable<Awaited<ReturnType<typeof load>>>;

function view(ctx: Ctx, viaLink = false): HoldView {
  const { p, h, i } = ctx;
  const cart = p.cart as ResolvedCart | null;
  const req = (p.request ?? {}) as { kind?: string; conversation?: HoldView["conversation"] };
  const policy = (i.policy ?? {}) as { kind?: string; payee?: { name: string; first_payment: boolean; email?: string }; purpose?: string };
  return {
    purchase_id: p.id,
    state: p.state,
    reasons: p.reasons ?? [],
    amount: p.amountCents != null && p.currency ? { currency_code: p.currency, value: fromCents(p.amountCents) } : null,
    items: (cart?.lines ?? []).map((l) => ({ product_id: l.product_id, name: l.name, quantity: l.quantity })),
    retailer: p.retailer,
    auto_void_at: h?.autoVoidAt.toISOString() ?? null,
    resolution: h?.resolution ?? null,
    link_expires_at: viaLink ? (h?.tokenExpiresAt?.toISOString() ?? null) : null,
    kind: req.kind === "transfer" ? "transfer" : "shopping",
    payer_name: ctx.payerName,
    payee: policy.kind === "transfer" && policy.payee ? { name: policy.payee.name, first_payment: policy.payee.first_payment, ...(policy.payee.email ? { email: maskEmail(policy.payee.email) } : {}) } : null,
    purpose: policy.kind === "transfer" ? (policy.purpose ?? null) : null,
    conversation: req.conversation ?? null,
    concerns: ctx.concerns.map((c) => ({ check_id: c.checkId, kind: c.kind, detail: c.detail, evidence: (c.evidence as EvidenceItem[] | null) ?? [] })),
    payout: ctx.payout,
    payout_configured: policy.kind === "transfer" && Boolean(policy.payee?.email),
  };
}

const RESOLUTION_OF = { approve: "APPROVED", deny: "DENIED" } as const;
const DEFAULT_LINK_MS = 30 * 60_000;

/** Check the actor may act on this hold. Tenant scoping is done by the caller for shopper/admin. */
function authorize(actor: HoldActor, ctx: Ctx, now: Date): HoldResult<string> {
  if ("admin" in actor) return { kind: "ok", value: "admin" };
  if ("shopperId" in actor) return ctx.i.shopperId === actor.shopperId ? { kind: "ok", value: `shopper:${actor.shopperId}` } : bad(404, "Hold not found");
  const h = ctx.h;
  if (!h?.tokenHash || !h.tokenExpiresAt) return bad(410, "This link is no longer valid");
  const a = Buffer.from(sha(actor.token), "hex");
  const b = Buffer.from(h.tokenHash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return bad(403, "Invalid link");
  if (h.tokenExpiresAt.getTime() <= now.getTime()) return bad(410, "This link has expired", "Ask for a new link; the payment stays held until it is released automatically");
  return { kind: "ok", value: `shopper:${ctx.i.shopperId}(link)` };
}

export async function getHold(d: EngineDeps, purchaseId: string, actor: HoldActor, tenantId?: string): Promise<HoldResult<HoldView>> {
  const ctx = await load(d, purchaseId);
  if (!ctx || (tenantId && ctx.p.tenantId !== tenantId) || !ctx.h) return bad(404, "Hold not found");
  const ok = authorize(actor, ctx, nowOf(d));
  if (ok.kind === "error") return ok;
  return { kind: "ok", value: view(ctx, "token" in actor) };
}

/** Create (or replace) the one-time link token. Returned once; only its hash is stored. */
export async function issueHoldLink(d: EngineDeps, tenantId: string, purchaseId: string, actor: { shopperId: string } | { admin: true }): Promise<HoldResult<{ token: string; expires_at: string }>> {
  const ctx = await load(d, purchaseId);
  if (!ctx || ctx.p.tenantId !== tenantId || !ctx.h) return bad(404, "Hold not found");
  const ok = authorize(actor, ctx, nowOf(d));
  if (ok.kind === "error") return ok;
  if (ctx.p.state !== "HELD" || ctx.h.resolvedAt) return bad(409, `Purchase is ${ctx.p.state}`);
  const token = randomBytes(24).toString("base64url");
  const now = nowOf(d);
  const expires = new Date(Math.min(now.getTime() + (d.holdLinkMs ?? DEFAULT_LINK_MS), ctx.h.autoVoidAt.getTime()));
  await dbOf(d.pool).update(holds).set({ tokenHash: sha(token), tokenExpiresAt: expires, notifiedAt: now }).where(eq(holds.purchaseId, purchaseId));
  return { kind: "ok", value: { token, expires_at: expires.toISOString() } };
}

export async function resolveHold(d: EngineDeps, purchaseId: string, decision: "approve" | "deny", actor: HoldActor, tenantId?: string): Promise<HoldResult<HoldView>> {
  const ctx = await load(d, purchaseId);
  if (!ctx || (tenantId && ctx.p.tenantId !== tenantId) || !ctx.h) return bad(404, "Hold not found");
  const who = authorize(actor, ctx, nowOf(d));
  if (who.kind === "error") return who;
  const viaLink = "token" in actor;
  // Already decided: a retry of the same choice gets the recorded result; anything else is a conflict.
  if (ctx.h.resolvedAt || ctx.p.state !== "HELD") {
    if (ctx.h.resolution === RESOLUTION_OF[decision]) return { kind: "ok", value: { ...view(ctx, viaLink), replayed: true } };
    return bad(409, "Already decided", `The hold was resolved as ${ctx.h.resolution ?? ctx.p.state}; the purchase is ${ctx.p.state}`);
  }
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

  // Set only when this request's decision is the one that took effect, so a request that lost a race
  // with a concurrent decision gets 409 instead of a 200 that looks like its own success.
  let applied = false;
  await withTx(d.pool, async (tx) => {
    const p = (await tx.db.select().from(purchases).where(and(eq(purchases.id, purchaseId), eq(purchases.state, "HELD"))).for("update").limit(1))[0];
    if (!p) return;
    applied = true;
    const intent = (await tx.db.select().from(intents).where(eq(intents.id, p.intentId)).limit(1))[0]!;
    const stale = intent.status !== "CONFIRMED" || intent.policyDigest !== p.policyDigest;
    const now = nowOf(d);
    const voidWith = async (reasons: string[], resolution: "APPROVED" | "DENIED") => {
      await tx.db.update(holds).set({ resolvedAt: now, resolution }).where(eq(holds.purchaseId, p.id));
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
    await tx.db.update(holds).set({ resolvedAt: now, resolution: "APPROVED" }).where(eq(holds.purchaseId, p.id));
    const tenant = (await tx.db.select().from(tenants).where(eq(tenants.id, p.tenantId)).limit(1))[0]!;
    await issueApproval(d, tx, p, tenant.paypalMerchantId, "HELD", who.value);
  });

  const after = await load(d, purchaseId);
  if (!applied) {
    // Lost a race. Same choice as the winner (a double tap) → the recorded result; otherwise 409.
    if (after!.h?.resolution === RESOLUTION_OF[decision]) return { kind: "ok", value: { ...view(after!, viaLink), replayed: true } };
    return bad(409, "Already decided", `Another decision was recorded first; the purchase is ${after!.p.state}`);
  }
  return { kind: "ok", value: view(after!, viaLink) };
}

export interface HoldVerification {
  fetched_at: string;
  debug_id: string | null;
  order_status: string | null;
  authorizations: { id: string; status: string; value: string }[];
  captures: { id: string; status: string; value: string }[];
  payout: LivePayout | null;
}

/**
 * PayPal's own record of this held payment, read live (no money moves). Lets a reviewer check the
 * outcome themselves instead of trusting Witness's state. Same access rules as viewing the hold.
 */
export async function verifyHold(d: EngineDeps, purchaseId: string, actor: HoldActor, tenantId?: string): Promise<HoldResult<HoldVerification>> {
  const ctx = await load(d, purchaseId);
  if (!ctx || (tenantId && ctx.p.tenantId !== tenantId) || !ctx.h) return bad(404, "Hold not found");
  const ok = authorize(actor, ctx, nowOf(d));
  if (ok.kind === "error") return ok;
  if (!ctx.p.paypalOrderId) return bad(409, "No PayPal order exists for this payment");
  try {
    const r = await d.paypal.getOrder(ctx.p.paypalOrderId);
    const pu = r.data?.purchase_units?.[0] ?? {};
    const row = (x: { id?: unknown; status?: unknown; amount?: { value?: unknown } }) => ({ id: String(x.id), status: String(x.status), value: String(x.amount?.value ?? "") });
    return {
      kind: "ok",
      value: {
        fetched_at: nowOf(d).toISOString(),
        debug_id: r.debugId ?? null,
        order_status: r.data?.status ?? null,
        authorizations: (pu.payments?.authorizations ?? []).map(row),
        captures: (pu.payments?.captures ?? []).map(row),
        payout: await livePayout(d, ctx.payout),
      },
    };
  } catch (e) {
    if (e instanceof PayPalNetworkError || e instanceof PayPalHttpError) return bad(502, "Couldn't reach PayPal to verify; try again");
    throw e;
  }
}
