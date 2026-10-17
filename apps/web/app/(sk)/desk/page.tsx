import { cookies } from "next/headers";
import { Suspense } from "react";
import { SESSION_COOKIE, consoleConfigured, validSession } from "../../../lib/server/session";
import { Desk } from "./desk";

export const dynamic = "force-dynamic";
export const metadata = { title: "Protection Desk · Second Key" };

// The investigator's workspace. Reads with the ops key, server-side, only inside a console session.
export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const header = (
    <header className="stack-sm" style={{ maxWidth: 760 }}>
      <span className="sk-section-title">Experience C · Protection Desk</span>
      <h1 style={{ fontSize: "var(--text-2xl)" }}>What happened, why, and what PayPal says.</h1>
    </header>
  );
  if (!consoleConfigured())
    return (
      <div className="stack-lg">
        {header}
        <div className="sk-card">The Desk isn&apos;t configured on this deployment (it needs WITNESS_CONSOLE_PASSWORD and WITNESS_SESSION_SECRET), so it stays closed.</div>
      </div>
    );
  if (!validSession((await cookies()).get(SESSION_COOKIE)?.value)) {
    const { error } = await searchParams;
    return (
      <div className="stack-lg">
        {header}
        <form method="post" action="/api/console/login" className="sk-card stack" style={{ maxWidth: 400 }}>
          <input type="hidden" name="next" value="/desk" />
          <p className="small soft">For investigators and platform reviewers. Read-only: the Desk can&apos;t approve, capture or cancel a payment.</p>
          <label className="stack-sm small">
            Password
            <input type="password" name="password" autoComplete="current-password" required style={{ minHeight: 44, padding: "0 12px", borderRadius: 10, border: "1px solid var(--line-strong)", font: "inherit", background: "var(--surface)", color: "var(--ink)" }} />
          </label>
          {error && <p className="small" style={{ color: "var(--brick)" }} role="alert">That password didn&apos;t match.</p>}
          <button className="sk-btn primary">Sign in</button>
        </form>
      </div>
    );
  }
  return (
    <div className="stack-lg">
      {header}
      <Suspense>
        <Desk />
      </Suspense>
    </div>
  );
}
