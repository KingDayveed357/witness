// Explicit transactions on one pooled connection. The same client serves Drizzle queries,
// raw SQL and pg-boss job inserts, so a state change and its follow-up job commit together.

import pg from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema.ts";

export type Db = NodePgDatabase<typeof schema>;

export interface Tx {
  client: pg.PoolClient;
  db: Db;
  /** Adapter for pg-boss `send(..., { db })` so jobs enqueue inside this transaction. */
  executeSql(text: string, values?: unknown[]): Promise<{ rows: any[] }>;
}

export function createPool(connectionString: string, max = 10): pg.Pool {
  const pool = new pg.Pool({ connectionString, max });
  // An idle client erroring must not crash the process; the next checkout gets a fresh one.
  pool.on("error", () => {});
  return pool;
}

export function txOf(client: pg.PoolClient): Tx {
  return {
    client,
    db: drizzle(client, { schema }),
    executeSql: (text, values) => client.query(text, values as unknown[]),
  };
}

export async function withTx<T>(pool: pg.Pool, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(txOf(client));
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Read-only helper outside an explicit transaction. */
export const dbOf = (pool: pg.Pool): Db => drizzle(pool, { schema });
