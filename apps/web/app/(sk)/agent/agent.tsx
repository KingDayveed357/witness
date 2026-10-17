"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, errText } from "../../../lib/client";
import { clock, stageOf, usd } from "../../../lib/sk";
import { QuoteCard, Transcript, type Evidence } from "../_ui/evidence";
import { Button, Demo, Live, Notice, StatePill } from "../_ui/ui";
import { PayPalCheck } from "../_ui/verify";

interface PurchaseView {
  id: string;
  state: string;
  amount: { value: string } | null;
  paypal: { order_id: string | null };
}
interface EvidenceView {
  facts: Record<string, { title: string; description?: string }>;
  checks: { check_id: string; result: string; evidence: Evidence[] | null; phase: string }[];
}

const RUNS = [
  { name: "injection", label: "Booby-trapped page" },
  { name: "normal", label: "Ordinary page" },
] as const;

export function Agent() {
  const [run, setRun] = useState<(typeof RUNS)[number]["name"]>("injection");
  const [busy, setBusy] = useState(false);
  const [purchase, setPurchase] = useState<PurchaseView | null>(null);
  const [ev, setEv] = useState<EvidenceView | null>(null);
  const [link, setLink] = useState<{ path: string; expires_at: string } | null>(null);
  const [err, setErr] = useState("");

  const state = purchase?.state;
  useEffect(() => {
    if (!purchase || (!stageOf(state).moving && state !== "HELD")) return;
    const t = setInterval(async () => {
      try {
        const p = await api<PurchaseView>(`/v1/purchases/${purchase.id}`);
        if (p.state !== state) setPurchase(p);
      } catch {
        /* keep polling */
      }
    }, 2000);
    return () => clearInterval(t);
  }, [purchase, state]);
  useEffect(() => {
    if (purchase) api<EvidenceView>(`/v1/purchases/${purchase.id}/evidence`).then(setEv, () => {});
  }, [purchase?.id, state]);

  async function go() {
    setBusy(true);
    setErr("");
    setPurchase(null);
    setEv(null);
    setLink(null);
    try {
      setPurchase((await api<{ purchase: PurchaseView }>(`/v1/demo/scenarios/${run}`, { method: "POST" })).purchase);
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  }
  async function ask() {
    if (!purchase) return;
    try {
      setLink(await api(`/v1/purchases/${purchase.id}/hold-link`, { method: "POST" }));
    } catch (e) {
      setErr(errText(e));
    }
  }

  const inj = ev?.checks.find((c) => c.check_id === "ai.injection");
  const quotes = inj?.evidence ?? [];
  const listing = ev ? Object.values(ev.facts)[0] : undefined;
  const amount = purchase?.amount ? usd(purchase.amount.value) : "—";

  return (
    <div className="sk-stage">
      <div className="stack">
        <div className="row between">
          <div className="sk-seg" role="group" aria-label="Which product page the agent reads">
            {RUNS.map((r) => (
              <button key={r.name} aria-pressed={run === r.name} disabled={busy} onClick={() => setRun(r.name)}>
                {r.label}
              </button>
            ))}
          </div>
          <Demo>Synthetic product pages</Demo>
        </div>
        <section className="sk-phone stack-lg" aria-label="The agent's task">
          <div className="appbar">
            <span className="soft">Rose&apos;s shopping agent</span>
            {purchase ? <StatePill state={state} /> : <span className="xs muted">Ready</span>}
          </div>
          <div className="stack-sm">
            <span className="sk-section-title">What Rose asked for</span>
            <p className="serif" style={{ fontSize: "1.1875rem" }}>“Trail-running shoes, size 10, under $90, not white, from REI or Backcountry.”</p>
          </div>
          <Button block onClick={go} busy={busy}>
            {busy ? "The agent is shopping…" : purchase ? "Run again" : "Let the agent buy"}
          </Button>
          {purchase && (
            <div className="stack" aria-live="polite">
              <h2 style={{ fontSize: "var(--text-lg)" }}>
                {state === "HELD" ? `Paused: the ${amount} purchase needs Rose` : state === "CAPTURED" ? `Bought for ${amount}` : stageOf(state).label}
              </h2>
              <p className="small soft">
                {state === "HELD"
                  ? "The page the agent read tried to give it instructions. Second Key paused the purchase before any money was taken."
                  : state === "CAPTURED"
                    ? "Nothing unusual on the page, and the item matched what Rose asked for, so the purchase completed."
                    : stageOf(state).payer}
              </p>
              {purchase.paypal.order_id && <PayPalCheck path={`/v1/purchases/${purchase.id}/paypal`} amount={amount} refreshKey={state} />}
              {state === "HELD" && !link && (
                <Button variant="secondary" block onClick={ask}>
                  Ask Rose to check
                </Button>
              )}
              {link && (
                <div className="stack-sm">
                  <a className="sk-btn secondary" href={link.path} target="_blank" rel="noopener noreferrer">
                    Open Rose&apos;s review ↗
                  </a>
                  <span className="xs muted">
                    <Demo>Demo delivery</Demo> One-time link, valid until {clock(link.expires_at)}. The same review screen people use for transfers.
                  </span>
                </div>
              )}
            </div>
          )}
          {err && (
            <Notice tone="bad" title="Something went wrong" role="alert">
              {err}
            </Notice>
          )}
        </section>
      </div>

      <aside className="stack">
        <div className="sk-card stack">
          <div className="row between">
            <h2 style={{ fontSize: "var(--text-lg)" }}>What the agent read</h2>
            {ev && <Live />}
          </div>
          {!ev && <p className="small soft">Run the agent to see the product page it acted on, and what Second Key found in it.</p>}
          {listing && (
            <>
              <p className="small" style={{ fontWeight: 600 }}>{listing.title}</p>
              {listing.description ? (
                <div className="sk-card tint" style={{ padding: 12 }}>
                  <Transcript conv={{ context: "", lines: [{ speaker: "Product page", text: listing.description }] }} quotes={quotes.map((q) => q.quote)} />
                </div>
              ) : (
                <p className="small soft">No description text on this page.</p>
              )}
            </>
          )}
          {quotes.map((q, i) => (
            <QuoteCard key={i} e={q} sourceLabel="On the product page" />
          ))}
          {purchase && (
            <Link className="small" href={`/desk?incident=${purchase.id}`}>
              Open this incident in the Protection Desk →
            </Link>
          )}
        </div>
      </aside>
    </div>
  );
}
