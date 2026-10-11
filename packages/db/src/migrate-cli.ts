// `pnpm db:migrate`: apply pending migrations (Render runs this as the pre-deploy command).
import { loadDotEnv } from "@witness/config";
import { createPool } from "./tx.ts";
import { migrate } from "./migrate.ts";

loadDotEnv();
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const pool = createPool(process.env.DATABASE_URL, 2);
const applied = await migrate(pool, console.log);
console.log(applied.length ? `applied ${applied.length} migration(s)` : "database is up to date");
await pool.end();
