// Environment configuration, validated once at startup. Values are never logged.

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** Load witness/.env for local development; real environments set variables directly. */
export function loadDotEnv(): void {
  const file = join(ROOT, ".env");
  if (existsSync(file)) process.loadEnvFile(file);
}

const Base = z.object({
  DATABASE_URL: z.string().min(1),
  PAYPAL_CLIENT_ID: z.string().min(1),
  PAYPAL_CLIENT_SECRET: z.string().min(1),
  PAYPAL_BASE_URL: z.string().default("https://api-m.sandbox.paypal.com"),
  CHANNEL3_API_KEY: z.string().optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export const ApiConfig = Base.extend({
  PORT: z.coerce.number().int().default(4000),
  HOST: z.string().default("0.0.0.0"),
  PAYPAL_WEBHOOK_ID: z.string().optional(),
  WITNESS_DEMO_SHOPPER_ID: z.string().optional(),
});
export type ApiConfig = z.infer<typeof ApiConfig>;

export const WorkerConfig = Base.extend({
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(4),
});
export type WorkerConfig = z.infer<typeof WorkerConfig>;

/** Parse, and on failure name the missing variables without echoing any values. */
export function parseConfig<T extends z.ZodType>(schema: T, env: NodeJS.ProcessEnv = process.env): z.infer<T> {
  const r = schema.safeParse(env);
  if (!r.success) {
    const names = [...new Set(r.error.issues.map((i) => i.path.join(".")))].join(", ");
    throw new Error(`Invalid configuration: check ${names} (see .env.example)`);
  }
  return r.data;
}

export { ROOT };
