"use client";

import { useEffect, useState } from "react";
import { api, errText, settle, tone } from "../../lib/client";

/** Phone-first approval page for a held purchase, opened from the one-time link. */
export function HoldApproval({ id, token }: { id: string; token: string }) {
  const [hold, setHold] = useState<any>(null);
  const [state, setState] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    // Remove the one-time token from the address bar and history once it is in memory.
    if (token) window.history.replaceState(null, "", `/holds/${encodeURIComponent(id)}`);
    if (!token) {
      setErr("This page needs the one-time link you were sent.");
      return;
    }
    api(`/v1/holds/${id}?t=${encodeURIComponent(token)}`).then(setHold, (e) => setErr(errText(e)));
  }, [id, token]);

  async function decide(decision: "approve" | "deny") {
    setBusy(true);
    setErr("");
    try {
      const r = await api(`/v1/holds/${id}/${decision}`, { method: "POST", body: { token } });
      setState(r.state);
      // The purchase then settles in the worker (capture or void); show the final state.
      try {
        await settle(id, (p) => setState(p.state), 45_000);
      } catch {
        // demo key may not be configured for polling; the decision itself succeeded
      }
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 480, margin: "0 auto" }}>
      <h1>A purchase needs your decision</h1>
      {err && <p className="error">{err}</p>}
      {hold && (
        <div className="card stack">
          {hold.items?.map((i: any) => <div key={i.product_id}><strong>{i.name}</strong> × {i.quantity}</div>)}
          <div className="small muted">{hold.retailer}</div>
          {hold.amount && <div style={{ fontSize: 22, fontWeight: 700 }}>{hold.amount.value} {hold.amount.currency_code}</div>}
          <div className="small">
            <strong>Why Witness held it:</strong>
            <ul style={{ margin: "4px 0", paddingLeft: 18 }}>{hold.reasons.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul>
          </div>
          <p className="small muted">
            The money is authorized but not taken. Approving captures exactly this amount after Witness re-checks PayPal&apos;s order. Denying releases it.
            {hold.auto_void_at && <> If you do nothing, it is released automatically at {new Date(hold.auto_void_at).toLocaleString()}.</>}
          </p>
          {!state && hold.state === "HELD" && (
            <div className="row">
              <button className="primary" disabled={busy} onClick={() => decide("approve")} style={{ flex: 1, padding: 12 }}>Approve</button>
              <button className="danger" disabled={busy} onClick={() => decide("deny")} style={{ flex: 1, padding: 12 }}>Deny</button>
            </div>
          )}
          {(state || hold.state !== "HELD") && (
            <p>Status: <span className={`badge ${tone(state || hold.state)}`}>{state || hold.state}</span></p>
          )}
        </div>
      )}
    </div>
  );
}
