"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, errText } from "../../../lib/client";
import { clock, deciderOf, rankEvidence, stageOf, usd, when } from "../../../lib/sk";
import { QuoteCard, Transcript, type Conversation, type Evidence } from "../_ui/evidence";
import { Button, Demo, Live, Notice, Pill, Rail, StatePill } from "../_ui/ui";
import { PayPalCheck } from "../_ui/verify";

interface ScenarioInfo {
  name: string;
  transfer?: { payee: { id: string; name: string; first_payment: boolean; email?: string }; payout_configured: boolean; amount_cents: number; currency: string; purpose: string | null; conversation: Conversation };
}
interface PurchaseView {
  id: string;
  state: string;
  reasons: string[];
  amount: { currency_code: string; value: string } | null;
  paypal: { order_id: string | null; authorization_id: string | null; capture_id: string | null };
}
interface EvidenceView {
  checks: { check_id: string; result: string; evidence: Evidence[] | null; phase: string }[];
  decisions: { outcome: string; decided_by: string; at: string }[];
}

const CHOICES = [
  { name: "scam_transfer", label: "An urgent call", source: "Phone call (prepared transcript)" },
  { name: "benign_transfer", label: "A contractor's invoice", source: "Text messages" },
] as const;
const TRUSTED = "Sarah";
const PAYER = "Rose";

export function Payer() {
  const [scenarios, setScenarios] = useState<ScenarioInfo[] | null>(null);
  const [choice, setChoice] = useState<(typeof CHOICES)[number]["name"]>("scam_transfer");
  const [phase, setPhase] = useState<"compose" | "checking" | "result">("compose");
  const [purchase, setPurchase] = useState<PurchaseView | null>(null);
  const [evidence, setEvidence] = useState<EvidenceView | null>(null);
  const [link, setLink] = useState<{ path: string; expires_at: string } | null>(null);
  const [asking, setAsking] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [focus, setFocus] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    api<ScenarioInfo[]>("/v1/demo/scenarios").then(setScenarios, (e) => setErr(errText(e)));
  }, []);
  const info = scenarios?.find((s) => s.name === choice)?.transfer;
  const meta = CHOICES.find((c) => c.name === choice)!;
  const amount = info ? usd(info.amount_cents) : "—";

  // Follow the payment while the backend is working or a reviewer may decide.
  const state = purchase?.state;
  useEffect(() => {
    if (!purchase || phase !== "result") return;
    const s = stageOf(state);
    if (!s.moving && state !== "HELD") return;
    const t = setInterval(async () => {
      try {
        const p = await api<PurchaseView>(`/v1/purchases/${purchase.id}`);
        if (p.state !== state) setPurchase(p);
      } catch {
        /* transient; keep polling */
      }
    }, 2000);
    return () => clearInterval(t);
  }, [purchase, state, phase]);

  const loadEvidence = useCallback(async (id: string) => {
    try {
      setEvidence(await api<EvidenceView>(`/v1/purchases/${id}/evidence`));
    } catch {
      /* evidence is supplementary; the state is shown regardless */
    }
  }, []);
  useEffect(() => {
    if (purchase?.id) void loadEvidence(purchase.id);
  }, [purchase?.id, state, loadEvidence]);

  async function send() {
    setErr("");
    setPhase("checking");
    try {
      const r = await api<{ purchase: PurchaseView }>(`/v1/demo/scenarios/${choice}`, { method: "POST" });
      setPurchase(r.purchase);
      setPhase("result");
      requestAnimationFrame(() => headingRef.current?.focus());
    } catch (e) {
      setErr(errText(e));
      setPhase("compose");
    }
  }

  async function askReviewer() {
    if (!purchase) return;
    setAsking(true);
    setErr("");
    try {
      setLink(await api<{ path: string; expires_at: string }>(`/v1/purchases/${purchase.id}/hold-link`, { method: "POST" }));
    } catch (e) {
      setErr(errText(e));
    } finally {
      setAsking(false);
    }
  }

  function reset() {
    setPhase("compose");
    setPurchase(null);
    setEvidence(null);
    setLink(null);
    setShowAll(false);
    setErr("");
  }

  const concern = evidence?.checks.find((c) => c.check_id === "ai.manipulation" && c.phase === "SCREEN");
  const quotes = rankEvidence(concern?.evidence ?? []);
  const lastDecision = evidence?.decisions.at(-1);
  const stage = stageOf(state);

  const reviewed = concern ? concern.result !== "pass" : true;
  const rail = useMemo(() => railFor(state, Boolean(link), reviewed), [state, link, reviewed]);

  return (
    <div className="sk-stage">
      <div className="stack">
        <div className="row between">
          <div className="sk-seg" role="group" aria-label="Demo scenario">
            {CHOICES.map((c) => (
              <button key={c.name} aria-pressed={choice === c.name} disabled={phase !== "compose"} onClick={() => setChoice(c.name)}>
                {c.label}
              </button>
            ))}
          </div>
          <Demo>Synthetic scenario</Demo>
        </div>

        <section className="sk-phone" aria-label={`${PAYER}'s phone`}>
          <div className="appbar">
            <span className="soft">{PAYER}&apos;s payments</span>
            {purchase ? <StatePill state={state} /> : <Pill tone="neutral">New payment</Pill>}
          </div>

          {!info && !err && <p className="muted">Loading…</p>}

          {info && phase !== "result" && (
            <div className="stack-lg">
              <Recipient info={info} amount={amount} />
              <div className="stack-sm">
                <div className="row between">
                  <span className="sk-section-title">{choice === "scam_transfer" ? "Right before this, a phone call" : "Right before this, a text conversation"}</span>
                  <Demo>{choice === "scam_transfer" ? "Prepared transcript" : "Synthetic messages"}</Demo>
                </div>
                <div className="sk-card tint" style={{ padding: "12px 8px" }}>
                  <Transcript conv={info.conversation} quotes={[]} self={PAYER} />
                </div>
              </div>
              <p className="small soft">
                Payments to people are protected by Second Key. If a conversation looks like pressure, someone you trust gets a say before any money moves.
              </p>
              <Button block onClick={send} busy={phase === "checking"}>
                {phase === "checking" ? "Checking this payment…" : `Send ${amount}`}
              </Button>
              {phase === "checking" && (
                <p className="small soft" role="status">
                  Second Key is reading the conversation and asking PayPal to reserve the money. Nothing is sent until the check finishes.
                </p>
              )}
            </div>
          )}

          {info && phase === "result" && purchase && (
            <div className="stack-lg">
              <div className="stack-sm" aria-live="polite">
                <h1 ref={headingRef} tabIndex={-1} style={{ fontSize: "var(--text-xl)" }}>
                  {headline(state, lastDecision?.decided_by)}
                </h1>
                <p className="soft">{body(state, amount, info.payee.name, lastDecision?.decided_by)}</p>
              </div>

              {purchase.paypal.order_id && <PayPalCheck path={`/v1/purchases/${purchase.id}/paypal`} amount={amount} refreshKey={state} transfer={{ payee: info.payee.name, configured: info.payout_configured }} />}

              {state === "HELD" && (
                <>
                  <section className="stack" aria-labelledby="why">
                    <h2 id="why" className="sk-section-title">Why we paused</h2>
                    <p className="small">
                      This call has patterns that are common in scams. That doesn&apos;t mean the caller isn&apos;t who they say. It means one more check is worth it before {amount} leaves.
                    </p>
                    {(showAll ? quotes : quotes.slice(0, 3)).map((e, i) => (
                      <QuoteCard key={i} e={e} sourceLabel={meta.source} active={focus === e.line} onFocus={() => setFocus(e.line ?? null)} />
                    ))}
                    {quotes.length > 3 && (
                      <Button variant="quiet" size="sm" onClick={() => setShowAll(!showAll)}>
                        {showAll ? "Show fewer" : `Show all ${quotes.length} patterns`}
                      </Button>
                    )}
                    <div className="sk-card tint" style={{ padding: 16 }}>
                      <div className="sk-section-title" style={{ marginBottom: 8 }}>What we know for certain</div>
                      <ul className="small" style={{ paddingLeft: 18, display: "grid", gap: 4 }}>
                        <li>You started this payment yourself.</li>
                        {info.payee.first_payment && <li>You haven&apos;t paid {info.payee.name} before.</li>}
                        <li>The amount is {amount}, for “{info.purpose}”.</li>
                      </ul>
                    </div>
                  </section>

                  {!link ? (
                    <div className="stack-sm">
                      <Button block onClick={askReviewer} busy={asking}>
                        Ask {TRUSTED} to check
                      </Button>
                      <p className="xs muted">{TRUSTED} is your trusted contact. She sees this payment and the patterns above, and decides whether it goes ahead.</p>
                    </div>
                  ) : (
                    <Notice tone="held" title={`Waiting for ${TRUSTED}`} role="status">
                      We&apos;ve asked {TRUSTED} to look at this. Her link works until {clock(link.expires_at)}. While you wait, you could call Danny on the number you already have for him.
                    </Notice>
                  )}
                </>
              )}

              {state === "CAPTURED" && (
                <p className="xs muted">
                  Two steps, each confirmed by PayPal: the payment is captured by the Second Key demo merchant, then paid out to {info.payee.name}
                  {info.payee.email ? `'s PayPal account (${info.payee.email})` : ""}.
                </p>
              )}
              {state === "VOIDED" && <p className="small soft">If this was a mistake, you can start a new payment at any time.</p>}

              {!stage.moving && state !== "HELD" && (
                <Button variant="secondary" block onClick={reset}>
                  Start over
                </Button>
              )}
            </div>
          )}

          {err && (
            <div style={{ marginTop: 16 }}>
              <Notice tone="bad" title="Something went wrong" role="alert">
                {err}. Nothing was sent.
              </Notice>
            </div>
          )}
        </section>
      </div>

      <aside className="stack">
        <div className="sk-card stack">
          <div className="row between">
            <h2 style={{ fontSize: "var(--text-lg)" }}>What&apos;s happening</h2>
            {purchase && <Live />}
          </div>
          <Rail label="Payment progress" steps={rail} />
          {!purchase && (
            <p className="small soft">
              Pick a scenario and tap Send. The payment goes through the real Second Key engine and the PayPal sandbox: the conversation is screened, PayPal reserves the money, and nothing completes without either a clean check or a person&apos;s decision.
            </p>
          )}
          {purchase && (
            <dl className="sk-kv">
              <dt>Payment</dt>
              <dd className="mono">{purchase.id}</dd>
              <dt>Status</dt>
              <dd>{stage.label}</dd>
              {concern && (
                <>
                  <dt>Screening</dt>
                  <dd>{concern.result === "pass" ? "No pressure patterns found" : `${quotes.length} pattern${quotes.length === 1 ? "" : "s"} found, held for review`}</dd>
                </>
              )}
              {lastDecision && (
                <>
                  <dt>Last decision</dt>
                  <dd>
                    {lastDecision.outcome} · {deciderOf(lastDecision.decided_by)} · {when(lastDecision.at)}
                  </dd>
                </>
              )}
            </dl>
          )}
          {purchase && (
            <Link className="small" href={`/desk?incident=${purchase.id}`}>
              Open this incident in the Protection Desk →
            </Link>
          )}
        </div>

        {link && purchase && state === "HELD" && (
          <div className="sk-card stack">
            <div className="row between">
              <h2 style={{ fontSize: "var(--text-lg)" }}>{TRUSTED}&apos;s phone</h2>
              <Demo>Demo delivery</Demo>
            </div>
            <p className="small soft">A real deployment sends this one-time link by text message. Here it opens in a new tab so you can play {TRUSTED}.</p>
            <a className="sk-btn secondary" href={link.path} target="_blank" rel="noopener noreferrer">
              Open {TRUSTED}&apos;s review ↗
            </a>
            <span className="xs muted">One-time link · valid until {clock(link.expires_at)} · the payment stays reserved until {TRUSTED} decides or it&apos;s released automatically.</span>
          </div>
        )}

        {state === "HELD" && info && (
          <div className="sk-card stack">
            <h2 className="sk-section-title">The conversation, as screened</h2>
            <Transcript conv={info.conversation} quotes={quotes.map((q) => q.quote)} focusLine={focus} self={PAYER} />
          </div>
        )}
      </aside>
    </div>
  );
}

function Recipient({ info, amount }: { info: NonNullable<ScenarioInfo["transfer"]>; amount: string }) {
  const initials = info.payee.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className="stack">
      <div className="row" style={{ gap: 14 }}>
        <span aria-hidden style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--brand-soft)", color: "var(--brand)", display: "grid", placeItems: "center", fontWeight: 650 }}>
          {initials}
        </span>
        <div>
          <div style={{ fontWeight: 600 }}>{info.payee.name}</div>
          <div className="small muted">{info.payee.first_payment ? "New recipient · you haven't paid them before" : "You've paid them before"}</div>
          {info.payee.email && <div className="xs muted">PayPal: {info.payee.email}</div>}
        </div>
      </div>
      <div>
        <div className="sk-amount">{amount}</div>
        <div className="small soft">For: {info.purpose}</div>
      </div>
    </div>
  );
}

function headline(state: string | undefined, decidedBy: string | undefined) {
  const byContact = decidedBy?.endsWith("(link)");
  switch (state) {
    case "HELD":
      return "We've paused this payment";
    case "VOIDING":
      return byContact ? `${TRUSTED} chose not to send it` : "Cancelling this payment";
    case "VOIDED":
      return "Cancelled. Nothing was taken.";
    case "CAPTURE_APPROVED":
    case "CAPTURE_PENDING":
      return byContact ? `${TRUSTED} approved it` : "Nothing unusual found";
    case "CAPTURED":
      return "Sent";
    case "REJECTED":
      return "This payment wasn't sent";
    default:
      return stageOf(state).label;
  }
}

function body(state: string | undefined, amount: string, payee: string, decidedBy: string | undefined) {
  const byContact = decidedBy?.endsWith("(link)");
  switch (state) {
    case "HELD":
      return `${amount} is reserved in your PayPal account, not sent to ${payee}.`;
    case "VOIDING":
      return "The decision is recorded. Cancelling with PayPal now; this page updates when PayPal confirms.";
    case "VOIDED":
      return byContact ? `${TRUSTED} chose not to send it, and PayPal released the reserved money.` : "PayPal released the reserved money.";
    case "CAPTURE_APPROVED":
    case "CAPTURE_PENDING":
      return "Completing the payment with PayPal; this page updates when PayPal confirms.";
    case "CAPTURED":
      return byContact ? `${TRUSTED} approved it, and PayPal completed the ${amount} payment.` : `Nothing unusual was found, and PayPal completed the ${amount} payment.`;
    default:
      return stageOf(state).payer;
  }
}

/** Steps derived only from backend states: check → reserved → decision → PayPal confirmed. */
function railFor(state: string | undefined, asked: boolean, needsReview: boolean): { label: string; status: "done" | "held" | "bad" | "now" | "todo"; moving?: boolean }[] {
  const s = state ?? "";
  const checked = !["", "SCREENING", "AUTHORIZING"].includes(s);
  const decided = ["VOIDING", "VOIDED", "CAPTURE_APPROVED", "CAPTURE_PENDING", "CAPTURED"].includes(s);
  const confirmed = ["VOIDED", "CAPTURED"].includes(s);
  if (s === "REJECTED" || s === "AUTH_FAILED")
    return [
      { label: "Checked", status: "done" },
      { label: s === "REJECTED" ? "Not sent" : "PayPal refused", status: "bad" },
    ];
  return [
    { label: "Checked", status: checked ? "done" : s ? "now" : "todo", moving: true },
    { label: s === "HELD" ? (asked ? "Waiting for review" : "Paused") : needsReview ? "Reviewed" : "No review needed", status: decided ? "done" : s === "HELD" ? "now" : "todo", moving: false },
    { label: confirmed ? (s === "VOIDED" ? "Cancelled" : "Completed") : "PayPal confirms", status: confirmed ? "done" : decided ? "now" : "todo", moving: true },
  ];
}
