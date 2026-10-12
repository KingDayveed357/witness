// Read-only console and demo routes (Stage 5). Nothing here moves money or calls PayPal's money
// paths. Console routes are tenant-scoped (ops); demo routes return aggregates only, plus the
// "try to beat it" screen, which runs the real screening logic on a judge-written listing without
// creating a purchase, an order or any PayPal call.

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { UnavailableLlm, evaluateScreen, type LlmClient } from "@witness/ai";
import type { ProductFacts } from "@witness/core";
import { demoPolicy, nowOf, type EngineDeps, type Principal } from "@witness/engine";

type Auth = (...scopes: string[]) => (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
type Problem = (reply: FastifyReply, status: number, title: string, detail?: string) => FastifyReply;

export interface ConsoleOptions {
  /** Model client for the public "try to beat it" screen, with its own spend cap, so judge traffic can't exhaust the budget real purchases use. */
  demoAi?: LlmClient | undefined;
  /** Max judge screens per minute for this process (default 30). */
  demoScreensPerMinute?: number | undefined;
}

const cents = (n: unknown) => (n == null ? null : Number(n));

/** Purchase ledger rows, flat for grids. The primary reason is the first non-passing check. */
async function ledger(d: EngineDeps, tenantId: string, limit: number) {
  const { rows } = await d.pool.query(
    `SELECT p.id, p.state, p.outcome, p.retailer, p.amount_cents, p.currency, p.reasons, p.intent_id,
            p.paypal_order_id, p.paypal_capture_id, p.created_at, p.updated_at,
            p.cart->'lines'->0->>'name' AS product,
            (SELECT c.check_id FROM checks c WHERE c.purchase_id = p.id AND c.result <> 'pass' ORDER BY c.id LIMIT 1) AS primary_check
       FROM purchases p
      WHERE p.tenant_id = $1
      ORDER BY p.created_at DESC
      LIMIT $2`,
    [tenantId, limit],
  );
  return rows.map((r) => ({
    id: r.id as string,
    state: r.state as string,
    outcome: (r.outcome as string | null) ?? null,
    product: (r.product as string | null) ?? null,
    retailer: (r.retailer as string | null) ?? null,
    amount_cents: cents(r.amount_cents),
    currency: (r.currency as string | null) ?? null,
    primary_check: (r.primary_check as string | null) ?? null,
    reasons: (r.reasons as string[]) ?? [],
    intent_id: r.intent_id as string,
    paypal_order_id: (r.paypal_order_id as string | null) ?? null,
    paypal_capture_id: (r.paypal_capture_id as string | null) ?? null,
    created_at: (r.created_at as Date).toISOString(),
    updated_at: (r.updated_at as Date).toISOString(),
  }));
}

/**
 * Aggregates for the console and the judge page. "Unauthorized captures" counts CAPTURED purchases
 * with no consumed single-use approval: the BRIEF's success metric, computed from the database
 * rather than asserted.
 */
export async function stats(d: EngineDeps, tenantId: string | null) {
  const scope = tenantId ? "WHERE p.tenant_id = $1" : "";
  const args = tenantId ? [tenantId] : [];
  const byState = await d.pool.query(`SELECT p.state, count(*)::int AS n, coalesce(sum(p.amount_cents), 0)::bigint AS cents FROM purchases p ${scope} GROUP BY p.state`, args);
  const blocked = await d.pool.query(
    `SELECT coalesce(pc.check_id, 'other') AS reason, count(*)::int AS n, coalesce(sum(p.amount_cents), 0)::bigint AS cents
       FROM purchases p
       LEFT JOIN LATERAL (SELECT c.check_id FROM checks c WHERE c.purchase_id = p.id AND c.result <> 'pass' ORDER BY c.id LIMIT 1) pc ON true
       ${scope ? `${scope} AND` : "WHERE"} p.state IN ('REJECTED', 'VOIDED')
      GROUP BY 1 ORDER BY 3 DESC, 2 DESC`,
    args,
  );
  const unauthorized = await d.pool.query(
    `SELECT count(*)::int AS n FROM purchases p ${scope ? `${scope} AND` : "WHERE"} p.state = 'CAPTURED'
        AND NOT EXISTS (SELECT 1 FROM approvals a WHERE a.purchase_id = p.id AND a.used_at IS NOT NULL)`,
    args,
  );
  const states = Object.fromEntries(byState.rows.map((r) => [r.state as string, { count: r.n as number, amount_cents: Number(r.cents) }]));
  const sum = (names: string[], k: "count" | "amount_cents") => names.reduce((s, n) => s + (states[n]?.[k] ?? 0), 0);
  return {
    purchases: byState.rows.reduce((s, r) => s + (r.n as number), 0),
    captured: { count: sum(["CAPTURED"], "count"), amount_cents: sum(["CAPTURED"], "amount_cents") },
    rejected: { count: sum(["REJECTED"], "count"), amount_cents: sum(["REJECTED"], "amount_cents") },
    voided: { count: sum(["VOIDED"], "count"), amount_cents: sum(["VOIDED"], "amount_cents") },
    held: { count: sum(["HELD"], "count"), amount_cents: sum(["HELD"], "amount_cents") },
    blocked_by_reason: blocked.rows.map((r) => ({ reason: r.reason as string, count: r.n as number, amount_cents: Number(r.cents) })),
    unauthorized_captures: unauthorized.rows[0]!.n as number,
    by_state: states,
  };
}

const JudgeListing = z.strictObject({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  brand: z.string().max(80).optional(),
  category: z.string().max(120).optional(),
  color: z.string().max(40).optional(),
  size: z.string().max(20).optional(),
  price: z.number().positive().max(100_000),
  attributes: z.record(z.string().max(40), z.string().max(200)).refine((a) => Object.keys(a).length <= 10, "at most 10 attributes").optional(),
});

export function registerConsole(app: FastifyInstance, d: EngineDeps, auth: Auth, problem: Problem, o: ConsoleOptions = {}) {
  const tenantOf = (req: FastifyRequest) => (req.principal as Principal).tenantId;

  app.get<{ Querystring: { limit?: string } }>("/v1/console/purchases", { preHandler: auth("ops", "admin") }, async (req) => {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit ?? 200) || 200));
    return { purchases: await ledger(d, tenantOf(req), limit) };
  });

  app.get("/v1/console/holds", { preHandler: auth("ops", "admin") }, async (req) => {
    const { rows } = await d.pool.query(
      `SELECT p.id, p.amount_cents, p.currency, p.retailer, p.reasons, p.created_at, p.cart->'lines'->0->>'name' AS product,
              h.auto_void_at, h.notified_at
         FROM purchases p JOIN holds h ON h.purchase_id = p.id
        WHERE p.tenant_id = $1 AND p.state = 'HELD' AND h.resolved_at IS NULL
        ORDER BY h.auto_void_at ASC`,
      [tenantOf(req)],
    );
    return {
      holds: rows.map((r) => ({
        id: r.id as string,
        product: (r.product as string | null) ?? null,
        retailer: (r.retailer as string | null) ?? null,
        amount_cents: cents(r.amount_cents),
        currency: (r.currency as string | null) ?? null,
        reasons: (r.reasons as string[]) ?? [],
        created_at: (r.created_at as Date).toISOString(),
        auto_void_at: (r.auto_void_at as Date).toISOString(),
        shopper_notified: r.notified_at != null,
      })),
    };
  });

  app.get("/v1/console/stats", { preHandler: auth("ops", "admin") }, async (req) => stats(d, tenantOf(req)));

  /** Checks for one purchase, in order, for the evidence-chain widget. */
  app.get<{ Params: { id: string } }>("/v1/console/purchases/:id/checks", { preHandler: auth("ops", "admin") }, async (req, reply) => {
    const owned = await d.pool.query(`SELECT 1 FROM purchases WHERE id = $1 AND tenant_id = $2`, [req.params.id, tenantOf(req)]);
    if (!owned.rowCount) return problem(reply, 404, "No such purchase");
    const { rows } = await d.pool.query(
      `SELECT phase, check_id, kind, result, detail, line, model, prompt_version, created_at FROM checks WHERE purchase_id = $1 ORDER BY id`,
      [req.params.id],
    );
    return { checks: rows.map((r) => ({ ...r, created_at: (r.created_at as Date).toISOString() })) };
  });

  // ---- shopper: receipts for the signed-in shopper's own intents ------------------------------
  app.get("/v1/me/purchases", { preHandler: auth("shopper") }, async (req, reply) => {
    const who = req.principal as Principal;
    const shopperId = who.principal.startsWith("shopper:") ? who.principal.slice("shopper:".length) : null;
    if (!shopperId) return problem(reply, 403, "Forbidden", "Not a shopper key");
    const { rows } = await d.pool.query(
      `SELECT p.id, p.state, p.outcome, p.retailer, p.amount_cents, p.currency, p.reasons, p.intent_id, p.created_at,
              p.cart->'lines'->0->>'name' AS product, i.source_text, h.auto_void_at
         FROM purchases p
         JOIN intents i ON i.id = p.intent_id AND i.tenant_id = p.tenant_id
         LEFT JOIN holds h ON h.purchase_id = p.id AND h.resolved_at IS NULL
        WHERE p.tenant_id = $1 AND i.shopper_id = $2
        ORDER BY p.created_at DESC
        LIMIT 50`,
      [who.tenantId, shopperId],
    );
    return {
      purchases: rows.map((r) => ({
        id: r.id as string,
        state: r.state as string,
        outcome: (r.outcome as string | null) ?? null,
        product: (r.product as string | null) ?? null,
        retailer: (r.retailer as string | null) ?? null,
        amount_cents: cents(r.amount_cents),
        currency: (r.currency as string | null) ?? null,
        reasons: (r.reasons as string[]) ?? [],
        intent_id: r.intent_id as string,
        intent_text: (r.source_text as string | null) ?? null,
        created_at: (r.created_at as Date).toISOString(),
        hold_auto_void_at: r.auto_void_at ? (r.auto_void_at as Date).toISOString() : null,
      })),
    };
  });

  // ---- demo: aggregates and the judge's own listing --------------------------------------------
  app.get("/v1/demo/stats", { preHandler: auth("demo", "admin") }, async (req) => {
    const s = await stats(d, tenantOf(req));
    const { by_state: _omit, ...publicStats } = s;
    return publicStats;
  });

  const perMinute = o.demoScreensPerMinute ?? 30;
  let windowStart = 0;
  let used = 0;
  app.post("/v1/demo/screen", { preHandler: auth("demo", "admin") }, async (req, reply) => {
    const now = Date.now();
    if (now - windowStart >= 60_000) {
      windowStart = now;
      used = 0;
    }
    if (used >= perMinute) {
      reply.header("retry-after", String(Math.ceil((windowStart + 60_000 - now) / 1000)));
      return problem(reply, 429, "Too many screens", `Try again in a minute (limit ${perMinute}/min)`);
    }
    const parsed = JudgeListing.safeParse(req.body);
    if (!parsed.success) return problem(reply, 400, "Invalid listing", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    used++;
    const l = parsed.data;
    const at = nowOf(d);
    const facts: ProductFacts = {
      product_id: "JUDGE-LISTING",
      title: l.title,
      ...(l.brand ? { brand: l.brand } : {}),
      ...(l.category ? { category: l.category } : {}),
      attributes: { ...(l.attributes ?? {}), ...(l.color ? { color: l.color } : {}), ...(l.size ? { size: l.size } : {}) },
      ...(l.description ? { description: l.description } : {}),
      offers: [{ retailer: "rei.com", price_cents: Math.round(l.price * 100), currency: "USD", availability: "InStock", condition: "new" }],
      source: "judge",
      fetched_at: at.toISOString(),
    };
    const policy = demoPolicy(at);
    const r = await evaluateScreen(o.demoAi ?? new UnavailableLlm(), policy, { intent_id: "int_judge", retailer: "rei.com", lines: [{ product_id: facts.product_id, quantity: 1 }] }, new Map([[facts.product_id, facts]]), { now: at });
    return {
      outcome: r.outcome,
      would_reach_paypal: r.outcome !== "REJECT",
      note: "Screening only: no purchase, order or PayPal call was made. CAPTURE means Witness would authorize and capture after the three-way match on PayPal's order.",
      policy: { category: policy.category, max_total: "90.00 USD", size: policy.hard.size, excluded_colors: policy.hard.excluded_colors, retailers: policy.retailers },
      checks: r.checks.map((c) => ({ id: c.id, result: c.result, detail: c.detail })),
      ai_ms: r.ai_ms,
    };
  });
}
