// Console sign-in: one shared ops password (WITNESS_CONSOLE_PASSWORD) and an HMAC-signed, httpOnly
// cookie (WITNESS_SESSION_SECRET). If either is unset the console is closed: fail closed.
import "server-only";
import { createHmac, timingSafeEqual, createHash } from "node:crypto";

export const SESSION_COOKIE = "witness_console";
const TTL_MS = 8 * 3600_000;

const secret = () => process.env.WITNESS_SESSION_SECRET ?? "";
export const consoleConfigured = () => Boolean(process.env.WITNESS_CONSOLE_PASSWORD && secret().length >= 16);

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");
const same = (a: string, b: string) => {
  const x = createHash("sha256").update(a).digest();
  const y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
};

export function checkPassword(candidate: string): boolean {
  const expected = process.env.WITNESS_CONSOLE_PASSWORD;
  return consoleConfigured() && typeof candidate === "string" && same(candidate, expected!);
}

export function issueSession(now = Date.now()): { value: string; maxAge: number } {
  const exp = String(now + TTL_MS);
  return { value: `${exp}.${sign(exp)}`, maxAge: TTL_MS / 1000 };
}

export function validSession(value: string | undefined, now = Date.now()): boolean {
  if (!consoleConfigured() || !value) return false;
  const [exp, mac] = value.split(".");
  if (!exp || !mac || !/^\d+$/.test(exp) || Number(exp) < now) return false;
  return same(mac, sign(exp));
}
