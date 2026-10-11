import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts", "test-support/**/*.test.ts"],
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
