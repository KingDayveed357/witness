// Vitest global setup for the "db" project: one real Postgres (embedded binary) per test run.
// Each test file creates its own fresh database from it (test-support/db.ts).

import EmbeddedPostgres from "embedded-postgres";
import { rmSync } from "node:fs";
import { join } from "node:path";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    pgAdminUrl: string;
  }
}

const PORT = 54_329;
const DIR = join(process.cwd(), ".pgdata", "test");

export default async function setup(project: TestProject) {
  rmSync(DIR, { recursive: true, force: true });
  const pg = new EmbeddedPostgres({
    databaseDir: DIR,
    port: PORT,
    user: "witness",
    password: "witness-test-only",
    persistent: false,
    // Match production (Render Postgres is UTF-8); Windows initdb would otherwise pick WIN1252.
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    onLog: () => {},
  });
  await pg.initialise();
  await pg.start();
  project.provide("pgAdminUrl", `postgres://witness:witness-test-only@127.0.0.1:${PORT}/postgres`);
  return async () => {
    await pg.stop();
  };
}
