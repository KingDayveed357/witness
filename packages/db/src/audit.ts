// Append-only, hash-chained audit log (architecture §7).
// hash = sha256(prev_hash + "\n" + JCS({epoch, seq, tenant_id, purchase_id, event_type, payload, at}))
// Appends are serialised with a transaction-scoped advisory lock so the chain never forks.

import type pg from "pg";
import { canonicalJson, sha256Hex } from "@witness/core";
import type { Tx } from "./tx.ts";

const AUDIT_LOCK = 0x57_49_54_4e; // "WITN"

export interface AuditInput {
  tenantId: string | null;
  purchaseId: string | null;
  eventType: string;
  payload: Record<string, unknown>;
}

export interface AuditRow {
  epoch: number;
  seq: number;
  tenant_id: string | null;
  purchase_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  at: string;
  prev_hash: string;
  hash: string;
}

export const genesisHash = (epoch: number) => "sha256:" + sha256Hex(`witness-genesis:${epoch}`);

function hashOf(prev: string, e: Omit<AuditRow, "prev_hash" | "hash">): string {
  return "sha256:" + sha256Hex(`${prev}\n${canonicalJson(e)}`);
}

export async function currentEpoch(client: pg.ClientBase): Promise<number> {
  const { rows } = await client.query<{ epoch: number }>("SELECT max(epoch)::int AS epoch FROM audit_epochs");
  return rows[0]!.epoch;
}

export async function appendAudit(tx: Tx, input: AuditInput): Promise<AuditRow> {
  const c = tx.client;
  await c.query("SELECT pg_advisory_xact_lock($1)", [AUDIT_LOCK]);
  const epoch = await currentEpoch(c);
  const { rows } = await c.query<{ seq: string; hash: string }>(
    "SELECT seq, hash FROM audit_log WHERE epoch = $1 ORDER BY seq DESC LIMIT 1",
    [epoch],
  );
  const head = rows[0];
  const seq = head ? Number(head.seq) + 1 : 1;
  const prev_hash = head ? head.hash : genesisHash(epoch);
  // JSON round-trip normalises the payload exactly as jsonb will store it.
  const payload = JSON.parse(JSON.stringify(input.payload)) as Record<string, unknown>;
  const event = {
    epoch,
    seq,
    tenant_id: input.tenantId,
    purchase_id: input.purchaseId,
    event_type: input.eventType,
    payload,
    at: new Date().toISOString(),
  };
  const hash = hashOf(prev_hash, event);
  await c.query(
    `INSERT INTO audit_log (epoch, seq, tenant_id, purchase_id, event_type, payload, at, prev_hash, hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [epoch, seq, event.tenant_id, event.purchase_id, event.event_type, payload, event.at, prev_hash, hash],
  );
  return { ...event, prev_hash, hash };
}

export async function startEpoch(tx: Tx, reason: string): Promise<number> {
  await tx.client.query("SELECT pg_advisory_xact_lock($1)", [AUDIT_LOCK]);
  const next = (await currentEpoch(tx.client)) + 1;
  await tx.client.query("INSERT INTO audit_epochs (epoch, reason) VALUES ($1, $2)", [next, reason]);
  return next;
}

export interface ChainProof {
  epoch: number;
  valid: boolean;
  count: number;
  head_hash: string;
  first_invalid_seq: number | null;
  events: AuditRow[];
}

/** Recompute the whole chain for an epoch; optionally return only one purchase's events. */
export async function verifyChain(client: pg.ClientBase, opts: { epoch?: number; purchaseId?: string } = {}): Promise<ChainProof> {
  const epoch = opts.epoch ?? (await currentEpoch(client));
  const { rows } = await client.query(
    // Order by the numeric column, not the text alias (text ordering puts 10 before 2).
    `SELECT epoch, seq::text AS seq, tenant_id, purchase_id, event_type, payload, at, prev_hash, hash
       FROM audit_log WHERE epoch = $1 ORDER BY audit_log.seq`,
    [epoch],
  );
  let prev = genesisHash(epoch);
  let expectedSeq = 1;
  let firstInvalid: number | null = null;
  const all: AuditRow[] = rows.map((r) => ({ ...r, seq: Number(r.seq), at: (r.at as Date).toISOString() }));
  for (const r of all) {
    const { prev_hash, hash, ...event } = r;
    const ok = r.seq === expectedSeq && prev_hash === prev && hashOf(prev, event) === hash;
    if (!ok && firstInvalid === null) firstInvalid = r.seq;
    prev = hash;
    expectedSeq++;
  }
  return {
    epoch,
    valid: firstInvalid === null,
    count: all.length,
    head_hash: prev,
    first_invalid_seq: firstInvalid,
    events: opts.purchaseId ? all.filter((e) => e.purchase_id === opts.purchaseId) : all,
  };
}
