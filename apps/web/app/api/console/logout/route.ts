import { cookies } from "next/headers";
import { SESSION_COOKIE } from "../../../../lib/server/session";

export async function POST() {
  (await cookies()).delete(SESSION_COOKIE);
  return new Response(null, { status: 303, headers: { location: "/console" } });
}
