import { cookies } from "next/headers";
import { SESSION_COOKIE, checkPassword, consoleConfigured, issueSession } from "../../../../lib/server/session";

// Relative redirects: the browser stays on the host it used, so the cookie it just received applies.
const seeOther = (location: string) => new Response(null, { status: 303, headers: { location } });

export async function POST(req: Request) {
  if (!consoleConfigured()) return Response.json({ title: "Console not configured" }, { status: 503 });
  const form = await req.formData().catch(() => null);
  const password = form?.get("password");
  const next = form?.get("next") === "/desk" ? "/desk" : "/console";
  // Constant-time check; a short delay blunts online guessing.
  await new Promise((r) => setTimeout(r, 300));
  if (typeof password !== "string" || !checkPassword(password)) return seeOther(`${next}?error=1`);
  const s = issueSession();
  // Secure whenever the request really arrived over HTTPS (Render terminates TLS and sets x-forwarded-proto).
  const https = req.headers.get("x-forwarded-proto") === "https" || new URL(req.url).protocol === "https:";
  (await cookies()).set(SESSION_COOKIE, s.value, { httpOnly: true, secure: https, sameSite: "lax", path: "/", maxAge: s.maxAge });
  return seeOther(next);
}
