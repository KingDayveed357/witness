// One Studio-agent turn: console session required; Haiku only; spend-capped; key never leaves here.
import { cookies } from "next/headers";
import { SESSION_COOKIE, validSession } from "../../../lib/server/session";
import { STUDIO_MODEL, costOf, fromAnthropic, studioMeter, toAnthropic, type StudioTurn } from "../../../lib/server/studio-ai";

export const dynamic = "force-dynamic";
// One prompt fans out into several turns across Studio's agents, so this has its own per-minute limit.
const PER_MINUTE = Number(process.env.WITNESS_STUDIO_AI_PER_MINUTE ?? 60);
let windowStart = 0;
let used = 0;
const problem = (status: number, title: string, detail?: string) => Response.json({ title, status, ...(detail ? { detail } : {}) }, { status });

export async function POST(req: Request) {
  if (!validSession((await cookies()).get(SESSION_COOKIE)?.value)) return problem(401, "Sign in to the console");
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return problem(503, "Studio agent not configured", "ANTHROPIC_API_KEY is not set on the web service");
  if (studioMeter.spent >= studioMeter.limit()) return problem(429, "Studio agent budget reached", `This process has used its $${studioMeter.limit()} limit`);
  const now = Date.now();
  if (now - windowStart >= 60_000) {
    windowStart = now;
    used = 0;
  }
  if (++used > PER_MINUTE) return problem(429, "Slow down");

  const raw = await req.text();
  if (raw.length > 600_000) return problem(413, "Turn too large");
  let turn: StudioTurn;
  try {
    turn = JSON.parse(raw);
  } catch {
    return problem(400, "Invalid JSON");
  }
  if (!Array.isArray(turn.input)) return problem(400, "input must be an array");

  const body = toAnthropic(turn);
  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return problem(502, "Model unreachable");
  }
  const data = await res.json().catch(() => null);
  studioMeter.calls++;
  if (!res.ok || !data) return problem(502, "Model error", data?.error?.type ?? `HTTP ${res.status}`); // never echo provider details or keys
  if (data.model && data.model !== STUDIO_MODEL) return problem(502, "Unexpected model", String(data.model));
  studioMeter.spent += costOf(data.usage ?? {});
  return Response.json(fromAnthropic(data), { headers: { "x-witness-studio-spent-usd": studioMeter.spent.toFixed(5) } });
}
