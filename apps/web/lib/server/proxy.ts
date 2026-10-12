// The browser's only door to the Witness API. NOT an open proxy: each forwarded route is listed
// below with the role whose API key is attached server-side. Keys never leave this process.
//
//   public  - no key (public API routes)
//   demo    - WITNESS_DEMO_KEY (judge scenarios, judge screen, aggregate stats)
//   shopper - WITNESS_SHOPPER_KEY (the shared demo shopper: intents, receipts, hold links)
//   token   - no key; the one-time hold token travels in the query/body (phone approval)
//   console - WITNESS_OPS_KEY, and only with a valid console session cookie
import "server-only";

export type Role = "public" | "demo" | "shopper" | "token" | "console";

interface Rule {
  method: "GET" | "POST";
  pattern: RegExp;
  role: Role;
  /** Requests that cost a model call are rate limited per client. */
  costly?: boolean;
}

const ID = "[A-Za-z0-9_-]{1,64}";
export const RULES: Rule[] = [
  { method: "GET", pattern: /^\/v1\/demo\/scenarios$/, role: "public" },
  { method: "POST", pattern: new RegExp(`^/v1/demo/scenarios/${ID}$`), role: "demo", costly: true },
  { method: "GET", pattern: /^\/v1\/demo\/stats$/, role: "demo" },
  { method: "POST", pattern: /^\/v1\/demo\/screen$/, role: "demo", costly: true },
  { method: "GET", pattern: new RegExp(`^/v1/purchases/${ID}$`), role: "demo" },
  { method: "GET", pattern: new RegExp(`^/v1/purchases/${ID}/paypal$`), role: "demo" },
  { method: "GET", pattern: new RegExp(`^/v1/purchases/${ID}/evidence$`), role: "demo" },
  { method: "GET", pattern: /^\/v1\/verify\/chain$/, role: "public" },
  { method: "GET", pattern: new RegExp(`^/v1/verify/purchases/${ID}$`), role: "public" },

  { method: "POST", pattern: /^\/v1\/intents$/, role: "shopper", costly: true },
  { method: "GET", pattern: new RegExp(`^/v1/intents/${ID}$`), role: "shopper" },
  { method: "POST", pattern: new RegExp(`^/v1/intents/${ID}/(confirm|revoke)$`), role: "shopper" },
  { method: "GET", pattern: /^\/v1\/me\/purchases$/, role: "shopper" },
  { method: "POST", pattern: new RegExp(`^/v1/purchases/${ID}/hold-link$`), role: "shopper" },

  { method: "GET", pattern: new RegExp(`^/v1/holds/${ID}$`), role: "token" },
  { method: "POST", pattern: new RegExp(`^/v1/holds/${ID}/(approve|deny)$`), role: "token" },

  { method: "GET", pattern: /^\/v1\/console\/(purchases|holds|stats|webhooks)$/, role: "console" },
  { method: "GET", pattern: new RegExp(`^/v1/console/purchases/${ID}/checks$`), role: "console" },
  { method: "GET", pattern: new RegExp(`^/v1/console/disputes$`), role: "console" },
  { method: "POST", pattern: /^\/v1\/console\/disputes$/, role: "console" },
  { method: "POST", pattern: new RegExp(`^/v1/console/disputes/${ID}/(refresh|submit|sandbox-step)$`), role: "console" },
  { method: "POST", pattern: new RegExp(`^/v1/purchases/${ID}/dispute-evidence/draft$`), role: "console", costly: true },
];

/** Same path read by ops in the console uses the ops key instead of the demo key. */
const CONSOLE_READS = [new RegExp(`^/v1/purchases/${ID}(/paypal|/evidence)?$`)];

export function match(method: string, path: string, inConsole: boolean): Rule | null {
  if (inConsole && method === "GET" && CONSOLE_READS.some((p) => p.test(path))) return { method: "GET", pattern: /./, role: "console" };
  return RULES.find((r) => r.method === method && r.pattern.test(path)) ?? null;
}

export function apiBase(): string {
  const raw = process.env.WITNESS_API_URL ?? "http://127.0.0.1:4000";
  // Render's private-network `hostport` has no scheme.
  return /^https?:\/\//.test(raw) ? raw.replace(/\/$/, "") : `http://${raw}`;
}

export function keyFor(role: Role): string | null | undefined {
  switch (role) {
    case "demo":
      return process.env.WITNESS_DEMO_KEY;
    case "shopper":
      return process.env.WITNESS_SHOPPER_KEY;
    case "console":
      return process.env.WITNESS_OPS_KEY;
    default:
      return null; // public and token routes carry no key
  }
}

// Simple per-client limiter for routes that spend model calls (in-memory, per process).
const WINDOW_MS = 60_000;
const COSTLY_PER_WINDOW = Number(process.env.WITNESS_WEB_COSTLY_PER_MINUTE ?? 12);
const hits = new Map<string, { start: number; n: number }>();
export function allowCostly(client: string, now = Date.now()): { ok: boolean; retryAfter: number } {
  const h = hits.get(client);
  if (!h || now - h.start >= WINDOW_MS) {
    hits.set(client, { start: now, n: 1 });
    if (hits.size > 10_000) hits.clear();
    return { ok: true, retryAfter: 0 };
  }
  if (h.n >= COSTLY_PER_WINDOW) return { ok: false, retryAfter: Math.ceil((h.start + WINDOW_MS - now) / 1000) };
  h.n++;
  return { ok: true, retryAfter: 0 };
}
