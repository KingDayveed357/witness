// A fresh, migrated database per test file, on the embedded Postgres from global-db.ts.

import { randomBytes } from "node:crypto";
import pg from "pg";
import { inject } from "vitest";
import { createPool, migrate } from "@witness/db";

export async function freshDatabase(): Promise<{ pool: pg.Pool; url: string; drop: () => Promise<void> }> {
  const admin = inject("pgAdminUrl");
  const name = `t_${randomBytes(6).toString("hex")}`;
  const c = new pg.Client({ connectionString: admin });
  await c.connect();
  await c.query(`CREATE DATABASE ${name}`);
  await c.end();
  const url = admin.replace(/\/postgres$/, `/${name}`);
  const pool = createPool(url);
  await migrate(pool);
  return {
    pool,
    url,
    drop: async () => {
      await pool.end();
      const d = new pg.Client({ connectionString: admin });
      await d.connect();
      await d.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await d.end();
    },
  };
}
