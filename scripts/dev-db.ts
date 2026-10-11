// Local development Postgres (embedded binary, persistent in .pgdata/dev, UTF-8).
// Prints the DATABASE_URL to use. Local-only credentials; never used outside this machine.
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), ".pgdata", "dev");
const port = Number(process.env.DEV_DB_PORT ?? 54330);
const pg = new EmbeddedPostgres({
  databaseDir: dir,
  port,
  user: "witness",
  password: "witness-dev-only",
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: () => {},
});
if (!existsSync(join(dir, "PG_VERSION"))) await pg.initialise();
await pg.start();
try {
  await pg.createDatabase("witness");
} catch {
  // already exists
}
console.log(`dev Postgres ready: DATABASE_URL=postgres://witness:witness-dev-only@127.0.0.1:${port}/witness`);
const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
