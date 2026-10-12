import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// `server-only` throws outside React Server Components; in tests it is a no-op.
const serverOnlyStub = fileURLToPath(new URL("./test-support/server-only-stub.ts", import.meta.url));

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias: { "server-only": serverOnlyStub } },
        test: {
          name: "unit",
          include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts", "test-support/**/*.test.ts", "evals/**/*.test.ts"],
          exclude: ["**/*.db.test.ts", "**/node_modules/**"],
        },
      },
      {
        test: {
          name: "db",
          include: ["packages/*/test/**/*.db.test.ts", "apps/*/test/**/*.db.test.ts"],
          globalSetup: ["./test-support/global-db.ts"],
          // One embedded Postgres; tests use separate databases, but keep files serial for clarity.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
