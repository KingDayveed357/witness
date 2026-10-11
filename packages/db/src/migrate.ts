// Applies migrations/*.sql in name order, each in its own transaction, at most once.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type pg from "pg";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const MIGRATE_LOCK = 0x4d_49_47_52; // "MIGR"

export async function migrate(pool: pg.Pool, log: (msg: string) => void = () => {}): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATE_LOCK]);
    await client.query("CREATE TABLE IF NOT EXISTS witness_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    const done = new Set((await client.query<{ name: string }>("SELECT name FROM witness_migrations")).rows.map((r) => r.name));
    for (const name of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) {
      if (done.has(name)) continue;
      await client.query("BEGIN");
      try {
        await client.query(readFileSync(join(DIR, name), "utf8"));
        await client.query("INSERT INTO witness_migrations (name) VALUES ($1)", [name]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`migration ${name} failed: ${(err as Error).message}`);
      }
      applied.push(name);
      log(`applied ${name}`);
    }
    return applied;
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATE_LOCK]).catch(() => {});
    client.release();
  }
}
