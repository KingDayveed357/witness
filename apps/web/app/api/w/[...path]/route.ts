// Allowlisted proxy to the Witness API (see lib/server/proxy.ts for the rules).
import { cookies, headers } from "next/headers";
import { allowCostly, apiBase, keyFor, match } from "../../../../lib/server/proxy";
import { SESSION_COOKIE, validSession } from "../../../../lib/server/session";

export const dynamic = "force-dynamic";

const problem = (status: number, title: string, detail?: string, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify({ title, status, ...(detail ? { detail } : {}) }), { status, headers: { "content-type": "application/problem+json", ...extra } });

async function forward(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await ctx.params;
  const path = "/" + segments.map(encodeURIComponent).join("/");
  const signedIn = validSession((await cookies()).get(SESSION_COOKIE)?.value);
  const inConsole = signedIn && req.headers.get("x-witness-console") === "1";
  const rule = match(req.method, path, inConsole);
  if (!rule) return problem(404, "Not found");
  if (rule.role === "console" && !signedIn) return problem(401, "Sign in to the console");

  if (rule.costly) {
    const h = await headers();
    const client = (h.get("x-forwarded-for") ?? "").split(",")[0]!.trim() || "local";
    const gate = allowCostly(client);
    if (!gate.ok) return problem(429, "Slow down", `Try again in ${gate.retryAfter}s`, { "retry-after": String(gate.retryAfter) });
  }

  const key = keyFor(rule.role);
  if (key === undefined || key === "") return problem(503, "Not configured", `This deployment has no ${rule.role} key`);

  const url = new URL(req.url);
  const target = `${apiBase()}${path}${url.search}`;
  const body = req.method === "POST" ? await req.text() : undefined;
  if (body && body.length > 16_384) return problem(413, "Request too large");
  let res: Response;
  try {
    res = await fetch(target, {
      method: req.method,
      headers: {
        ...(key ? { authorization: `Bearer ${key}` } : {}),
        ...(body ? { "content-type": "application/json" } : {}),
        ...(req.headers.get("idempotency-key") ? { "idempotency-key": req.headers.get("idempotency-key")! } : {}),
      },
      ...(body ? { body } : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return problem(502, "Witness API unreachable");
  }
  const text = await res.text();
  return new Response(text, { status: res.status, headers: { "content-type": res.headers.get("content-type") ?? "application/json", "cache-control": "no-store", ...(res.headers.get("retry-after") ? { "retry-after": res.headers.get("retry-after")! } : {}) } });
}

export const GET = forward;
export const POST = forward;
