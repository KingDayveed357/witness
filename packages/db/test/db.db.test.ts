import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type pg from "pg";
import { IllegalTransition, PolicyV1 } from "@witness/core";
import { appendAudit, getPurchase, dbOf, StaleTransition, startEpoch, transition, verifyChain, withTx } from "../src/index.ts";
import { freshDatabase } from "../../../test-support/db.ts";
import { seedPurchase, seedTenant } from "../../../test-support/seed.ts";

const POLICY = PolicyV1.parse({
  version: 1,
  category: "trail-running shoes",
  retailers: ["rei.com"],
  max_total_cents: 9000,
  currency: "USD",
  quantity: 1,
  substitution: "deny",
  expires_at: "2026-12-31T23:59:59Z",
});

let pool: pg.Pool;
let drop: () => Promise<void>;
let t: Awaited<ReturnType<typeof seedTenant>>;

beforeAll(async () => {
  ({ pool, drop } = await freshDatabase());
  t = await seedTenant(pool, POLICY);
});
afterAll(async () => drop());

describe("audit chain", () => {
  test("appends link into a valid chain", async () => {
    for (let i = 0; i < 3; i++) {
      await withTx(pool, (tx) => appendAudit(tx, { tenantId: t.tenantId, purchaseId: null, eventType: "test.event", payload: { i, note: "ünïcode ✓" } }));
    }
    const c = await pool.connect();
    try {
      const proof = await verifyChain(c);
      expect(proof.valid).toBe(true);
      expect(proof.events.map((e) => e.seq)).toEqual([1, 2, 3]);
      expect(proof.events[1]!.prev_hash).toBe(proof.events[0]!.hash);
    } finally {
      c.release();
    }
  });

  test("concurrent appends never fork the chain", async () => {
    await Promise.all(
      Array.from({ length: 12 }, (_, i) => withTx(pool, (tx) => appendAudit(tx, { tenantId: t.tenantId, purchaseId: null, eventType: "concurrent", payload: { i } }))),
    );
    const c = await pool.connect();
    try {
      const proof = await verifyChain(c);
      expect(proof.valid).toBe(true);
      expect(proof.count).toBe(15);
    } finally {
      c.release();
    }
  });

  test("UPDATE, DELETE and TRUNCATE are blocked by the database", async () => {
    await expect(pool.query("UPDATE audit_log SET payload = '{}' WHERE seq = 1")).rejects.toThrow(/append-only/);
    await expect(pool.query("DELETE FROM audit_log WHERE seq = 1")).rejects.toThrow(/append-only/);
    await expect(pool.query("TRUNCATE audit_log")).rejects.toThrow(/append-only/);
  });

  test("tampering by a superuser who disables the trigger is detected by /verify", async () => {
    // Documents the honest limit: a DB superuser can rewrite rows, but not without breaking the chain.
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_update");
      await c.query(`UPDATE audit_log SET payload = '{"i": 999}' WHERE seq = 2 AND epoch = 1`);
      const proof = await verifyChain(c);
      expect(proof.valid).toBe(false);
      expect(proof.first_invalid_seq).toBe(2);
      await c.query("ROLLBACK");
    } finally {
      c.release();
    }
  });

  test("a new epoch starts a fresh, valid chain", async () => {
    const epoch = await withTx(pool, (tx) => startEpoch(tx, "demo reset"));
    await withTx(pool, (tx) => appendAudit(tx, { tenantId: null, purchaseId: null, eventType: "epoch.started", payload: {} }));
    const c = await pool.connect();
    try {
      const proof = await verifyChain(c);
      expect(proof.epoch).toBe(epoch);
      expect(proof.valid).toBe(true);
      expect(proof.count).toBe(1);
      expect((await verifyChain(c, { epoch: 1 })).valid).toBe(true);
    } finally {
      c.release();
    }
  });
});

describe("purchase transitions", () => {
  test("legal transition updates state, bumps version and writes an audit event", async () => {
    const id = await seedPurchase(pool, t);
    const row = await withTx(pool, (tx) => transition(tx, { tenantId: t.tenantId, purchaseId: id, from: "SCREENING", to: "REJECTED", event: "purchase.rejected", patch: { outcome: "REJECT", reasons: ["max_total"] } }));
    expect(row.state).toBe("REJECTED");
    expect(row.version).toBe(1);
    const { rows } = await pool.query("SELECT event_type, payload FROM audit_log WHERE purchase_id = $1", [id]);
    expect(rows).toEqual([{ event_type: "purchase.rejected", payload: { from: "SCREENING", to: "REJECTED" } }]);
  });

  test("illegal transitions throw before touching the database", async () => {
    const id = await seedPurchase(pool, t);
    await expect(withTx(pool, (tx) => transition(tx, { tenantId: t.tenantId, purchaseId: id, from: "SCREENING", to: "CAPTURED", event: "x" }))).rejects.toThrow(IllegalTransition);
    expect((await getPurchase(dbOf(pool), t.tenantId, id))?.state).toBe("SCREENING");
  });

  test("a stale 'from' state is refused (optimistic lock)", async () => {
    const id = await seedPurchase(pool, t);
    await withTx(pool, (tx) => transition(tx, { tenantId: t.tenantId, purchaseId: id, from: "SCREENING", to: "AUTHORIZING", event: "x" }));
    await expect(withTx(pool, (tx) => transition(tx, { tenantId: t.tenantId, purchaseId: id, from: "SCREENING", to: "REJECTED", event: "x" }))).rejects.toThrow(StaleTransition);
  });

  test("T11: another tenant cannot transition or read the purchase", async () => {
    const other = await seedTenant(pool, POLICY);
    const id = await seedPurchase(pool, t);
    await expect(withTx(pool, (tx) => transition(tx, { tenantId: other.tenantId, purchaseId: id, from: "SCREENING", to: "REJECTED", event: "x" }))).rejects.toThrow(StaleTransition);
    expect(await getPurchase(dbOf(pool), other.tenantId, id)).toBeNull();
  });

  test("a failed transaction leaves no audit event behind", async () => {
    const id = await seedPurchase(pool, t);
    await expect(
      withTx(pool, async (tx) => {
        await transition(tx, { tenantId: t.tenantId, purchaseId: id, from: "SCREENING", to: "AUTHORIZING", event: "x" });
        throw new Error("boom after transition");
      }),
    ).rejects.toThrow("boom");
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM audit_log WHERE purchase_id = $1", [id]);
    expect(rows[0].n).toBe(0);
    expect((await getPurchase(dbOf(pool), t.tenantId, id))?.state).toBe("SCREENING");
  });
});

describe("intents", () => {
  test("a confirmed intent's policy cannot be edited", async () => {
    await expect(pool.query(`UPDATE intents SET policy = '{"version":1}' WHERE id = $1`, [t.intentId])).rejects.toThrow(/immutable/);
  });

  test("a confirmed intent can still be revoked", async () => {
    const other = await seedTenant(pool, POLICY);
    await pool.query("UPDATE intents SET status = 'REVOKED', revoked_at = now() WHERE id = $1", [other.intentId]);
    const { rows } = await pool.query("SELECT status FROM intents WHERE id = $1", [other.intentId]);
    expect(rows[0].status).toBe("REVOKED");
  });
});
