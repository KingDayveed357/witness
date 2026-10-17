"use client";

import { useCallback, useEffect, useState } from "react";
import { api, errText } from "../../../lib/client";
import { clock, moneyTruth, type PayPalRead } from "../../../lib/sk";
import { Button, Live } from "./ui";

/**
 * PayPal's own record of the money, read live through the backend. `path` is the read endpoint the
 * viewer is allowed to use (/v1/purchases/:id/paypal or /v1/holds/:id/verification?t=…). Re-reads
 * whenever `refreshKey` changes, and on demand.
 */
export function PayPalCheck({ path, amount, refreshKey, console: inConsole }: { path: string; amount: string; refreshKey?: string; console?: boolean }) {
  const [read, setRead] = useState<PayPalRead | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    setBusy(true);
    setErr("");
    try {
      setRead(await api<PayPalRead>(path, { console: inConsole }));
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  }, [path, inConsole]);
  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const t = moneyTruth(read, amount);
  return (
    <div className="sk-verify" aria-live="polite">
      <div className="head">
        <Live>PayPal sandbox, read live</Live>
        <Button variant="quiet" size="sm" onClick={load} busy={busy}>
          Check again
        </Button>
      </div>
      {err ? (
        <span className="soft">Couldn&apos;t reach PayPal ({err}). This doesn&apos;t change the payment; try again.</span>
      ) : !read && busy ? (
        <span className="soft">Checking with PayPal…</span>
      ) : (
        <strong style={{ fontWeight: 600 }}>{t.text}</strong>
      )}
      {t.reference && (
        <span className="xs muted">
          Reference <span className="mono">{t.reference}</span>
          {read?.fetched_at ? ` · checked ${clock(read.fetched_at)}` : ""}
          {read?.debug_id ? <> · PayPal debug <span className="mono">{read.debug_id}</span></> : null}
        </span>
      )}
    </div>
  );
}
