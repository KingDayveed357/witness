// Witness API process. Holds the PayPal secret for creating and reading orders only; the
// transport refuses capture/void in this process (role "api").

import { catalogFromEnv } from "@witness/catalog";
import { ApiConfig, loadDotEnv, parseConfig } from "@witness/config";
import { createBoss, createPool, ensureQueues, migrate } from "@witness/db";
import { PayPalClient } from "@witness/paypal";
import { buildApp } from "./app.ts";

loadDotEnv();
const cfg = parseConfig(ApiConfig);
const pool = createPool(cfg.DATABASE_URL);
await migrate(pool);
const boss = createBoss(cfg.DATABASE_URL, "api");
boss.on("error", (e) => console.error("pg-boss:", e.message));
await boss.start();
await ensureQueues(boss);

const app = buildApp({
  deps: {
    pool,
    boss,
    paypal: new PayPalClient({ baseUrl: cfg.PAYPAL_BASE_URL, clientId: cfg.PAYPAL_CLIENT_ID, clientSecret: cfg.PAYPAL_CLIENT_SECRET, role: "api" }),
    catalog: catalogFromEnv(cfg),
  },
  webhookId: cfg.PAYPAL_WEBHOOK_ID,
  demoShopperId: cfg.WITNESS_DEMO_SHOPPER_ID,
  logger: { level: cfg.LOG_LEVEL, redact: ["req.headers.authorization"] },
});

const close = async () => {
  await app.close();
  await boss.stop({ graceful: true });
  await pool.end();
  process.exit(0);
};
process.on("SIGINT", close);
process.on("SIGTERM", close);

await app.listen({ port: cfg.PORT, host: cfg.HOST });
