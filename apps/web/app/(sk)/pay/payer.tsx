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
  transfer?: { payee: { id: string; name: string; first_payment: boolean; email?: string }; payout_configured: boolean; amount_cents: number; currency: string; purpose: string | null; conversation: Conversation; review_threshold_cents: number | null };
}
interface PurchaseView {
  id: string;
  state: string;
  reasons: string[];
  amount: { currency_code: string; value: string } | null;
  paypal: { order_id: string | null; authorization_id: string | null; capture_id: string | null };
}
interface EvidenceView {
  checks: { check_id: string; result: string; evidence: Evidence[] | null; phase: string; detail: string }[];
  decisions: { outcome: string; decided_by: string; at: string }[];
  request: { conversation: Conversation | null; conversation_source: "submitted" | "shared_after_pause" | null };
  feedback: { quote: string; note: string; at: string }[];
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
  const [shareWith, setShareWith] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [disputing, setDisputing] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [cancelAsk, setCancelAsk] = useState(false);
  const [cancelling, setCancelling] = useState(false);
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
      // Sharing the conversation is the payer's choice (ADR-0019); the payer's rule applies either way.
      const r = await api<{ purchase: PurchaseView }>(`/v1/demo/scenarios/${choice}${shareWith ? "" : "?evidence=none"}`, { method: "POST" });
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

  async function shareNow() {
    if (!purchase || !info) return;
    setSharing(true);
    setErr("");
    try {
      await api(`/v1/me/purchases/${purchase.id}/context`, { method: "POST", body: { conversation: info.conversation } });
      await loadEvidence(purchase.id);
    } catch (e) {
      setErr(errText(e));
    } finally {
      setSharing(false);
    }
  }

  async function sendFeedback(quote: string) {
    if (!purchase || !note.trim()) return;
    try {
      await api(`/v1/me/purchases/${purchase.id}/feedback`, { method: "POST", body: { quote, note } });
      setDisputing(null);
      setNote("");
      await loadEvidence(purchase.id);
    } catch (e) {
      setErr(errText(e));
    }
  }

  async function cancelMyself() {
    if (!purchase) return;
    setCancelling(true);
    setErr("");
    try {
      const v = await api<{ state: string }>(`/v1/me/holds/${purchase.id}/cancel`, { method: "POST" });
      setPurchase({ ...purchase, state: v.state });
      setCancelAsk(false);
    } catch (e) {
      setErr(errText(e));
    } finally {
      setCancelling(false);
    }
  }

  function reset() {
    setPhase("compose");
    setPurchase(null);
    setEvidence(null);
    setLink(null);
    setShowAll(false);
    setErr("");
    setDisputing(null);
    setCancelAsk(false);
  }

  const aiChecks = evidence?.checks.filter((c) => c.check_id === "ai.manipulation" && (c.phase === "SCREEN" || c.phase === "CONTEXT")) ?? [];
  const concern = aiChecks[0];
  const quotes = rankEvidence(aiChecks.flatMap((c) => c.evidence ?? []));
  const ruleCheck = evidence?.checks.find((c) => c.check_id === "transfer.review_rule" && c.result === "unknown");
  const shared = evidence?.request.conversation ?? null;
  const disputed = new Map((evidence?.feedback ?? []).map((f) => [f.quote, f.note]));
  const threshold = info?.review_threshold_cents ? usd(info.review_threshold_cents) : null;
  const lastDecision = evidence?.decisions.at(-1);
  const stage = stageOf(state);

  const reviewed = Boolean(ruleCheck) || (concern ? concern.result !== "pass" : false);
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
              {threshold && (
                <div className="sk-card tint stack-sm" style={{ padding: 14 }}>
                  <span className="sk-section-title">Your rule, set in advance</span>
                  <span className="small">
                    First payments of <strong>{threshold}</strong> or more to someone new get a second look from {TRUSTED} before any money moves.
                  </span>
                  <span className="xs muted">
                    {info.payee.first_payment && info.amount_cents >= (info.review_threshold_cents ?? Infinity) ? "This payment matches your rule." : "This payment doesn't match your rule."}
                  </span>
                </div>
              )}
              <div className="stack-sm">
                <label className="row" style={{ gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
                  <input type="checkbox" checked={shareWith} onChange={(e) => setShareWith(e.target.checked)} style={{ width: 20, height: 20, marginTop: 2 }} />
                  <span className="small">
                    <strong>Also share what prompted this payment</strong> <span className="muted">(optional)</span>
                    <br />
                    <span className="soft">Second Key reads it for signs of pressure. It can add to your rule, never override it.</span>
                  </span>
                </label>
                {shareWith ? (
                  <div className="stack-sm">
                    <div className="row between">
                      <span className="sk-section-title">{choice === "scam_transfer" ? "The phone call" : "The text conversation"}</span>
                      <Demo>{choice === "scam_transfer" ? "Prepared transcript" : "Synthetic messages"}</Demo>
                    </div>
                    <div className="sk-card tint" style={{ padding: "12px 8px" }}>
                      <Transcript conv={info.conversation} quotes={[]} self={PAYER} />
                    </div>
                  </div>
                ) : (
                  <p className="xs muted">Nothing is shared. You can still share it later if the payment is paused.</p>
                )}
              </div>
              <Button block onClick={send} busy={phase === "checking"}>
                {phase === "checking" ? "Checking this payment…" : `Send ${amount}`}
              </Button>
              {phase === "checking" && (
                <p className="small soft" role="status">
                  Second Key is checking this payment against your rule{shareWith ? " and reading what you shared" : ""}, and asking PayPal to reserve the money. Nothing is sent until the check finishes.
                </p>
              )}
            </div>
          )}

          {info && phase === "result" && purchase && (
            <div className="stack-lg">
              <div className="stack-sm" aria-live="polite">
                <h1 ref={headingRef} tabIndex={-1} style={{ fontSize: "var(--text-xl)" }}>
                  {headline(state, lastDecision?.decided_by, Boolean(ruleCheck) && quotes.length === 0)}
                </h1>
                <p className="soft">{body(state, amount, info.payee.name, lastDecision?.decided_by)}</p>
              </div>

              {purchase.paypal.order_id && <PayPalCheck path={`/v1/purchases/${purchase.id}/paypal`} amount={amount} refreshKey={state} transfer={{ payee: info.payee.name, configured: info.payout_configured }} />}

              {state === "HELD" && (
                <>
                  <section className="stack" aria-labelledby="why">
                    <h2 id="why" className="sk-section-title">Why it&apos;s paused</h2>
                    {ruleCheck && (
                      <div className="sk-quote" style={{ paddingLeft: 24 }}>
                        <div className="tactic">Your rule</div>
                        <p style={{ marginTop: 4 }}>
                          A first payment of {amount} to {info.payee.name}, someone you haven&apos;t paid before. You asked for a second look on first payments of {threshold ?? "this size"} or more.
                        </p>
                        <p className="why">This is a rule you chose. It doesn&apos;t mean anything is wrong.</p>
                      </div>
                    )}
                    {quotes.length > 0 && (
                      <p className="small">
                        {ruleCheck ? "And in the conversation you shared, " : "The conversation has "}patterns that are common in scams. That doesn&apos;t mean the person isn&apos;t who they say; it means one more check is worth it.
                      </p>
                    )}
                    {(showAll ? quotes : quotes.slice(0, 3)).map((e, i) => (
                      <div key={i} className="stack-sm">
                        <QuoteCard e={e} sourceLabel={evidence?.request.conversation_source === "shared_after_pause" ? "In what you shared" : meta.source} active={focus === e.line} onFocus={() => setFocus(e.line ?? null)} />
                        {disputed.has(e.quote) ? (
                          <span className="xs muted" style={{ paddingLeft: 8 }}>You said “{disputed.get(e.quote)}” {TRUSTED} will see your note.</span>
                        ) : disputing === e.quote ? (
                          <div className="row" style={{ gap: 8, paddingLeft: 8 }}>
                            <input value={note} onChange={(ev) => setNote(ev.target.value)} maxLength={500} placeholder="What's wrong about this?" aria-label="Your note" style={{ flex: "1 1 200px", minHeight: 38, padding: "0 10px", borderRadius: 8, border: "1px solid var(--line-strong)", font: "inherit", fontSize: "var(--text-sm)", background: "var(--surface)", color: "var(--ink)" }} />
                            <Button size="sm" variant="secondary" onClick={() => sendFeedback(e.quote)} disabled={!note.trim()}>
                              Save note
                            </Button>
                            <Button size="sm" variant="quiet" onClick={() => setDisputing(null)}>
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="quiet" onClick={() => (setDisputing(e.quote), setNote(""))} style={{ alignSelf: "flex-start" }}>
                            This isn&apos;t right
                          </Button>
                        )}
                      </div>
                    ))}
                    {quotes.length > 3 && (
                      <Button variant="quiet" size="sm" onClick={() => setShowAll(!showAll)}>
                        {showAll ? "Show fewer" : `Show all ${quotes.length} patterns`}
                      </Button>
                    )}
                    {shared && concern?.result === "pass" && <p className="small soft">No pressure patterns found in what you shared. Your rule still asks for a second look.</p>}
                    {!shared && (
                      <div className="sk-card stack-sm" style={{ padding: 14 }}>
                        <span className="small">
                          <strong>Want a second opinion on the conversation?</strong> Share it and Second Key will point out anything that looks like pressure. It can add to your rule, never lift it.
                        </span>
                        <div className="row between">
                          <Button size="sm" variant="secondary" onClick={shareNow} busy={sharing}>
                            Share the conversation
                          </Button>
                          <Demo>Shares the synthetic transcript</Demo>
                        </div>
                      </div>
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
                      <p className="xs muted">{TRUSTED} is your trusted contact. She sees this payment and the reasons above, and decides whether it goes ahead.</p>
                    </div>
                  ) : (
                    <Notice tone="held" title={`Waiting for ${TRUSTED}`} role="status">
                      We&apos;ve asked {TRUSTED} to look at this. Her link works until {clock(link.expires_at)}. While you wait, you could call the person on a number you already have for them.
                    </Notice>
                  )}
                  {!cancelAsk ? (
                    <Button variant="quiet" onClick={() => setCancelAsk(true)} style={{ alignSelf: "center" }}>
                      Cancel this payment myself
                    </Button>
                  ) : (
                    <div className="sk-sheet stack-sm" role="dialog" aria-labelledby="cancel-title">
                      <strong id="cancel-title">Cancel the {amount} payment?</strong>
                      <span className="small soft">PayPal releases the reserved money and nothing is paid. You can start a new payment any time.</span>
                      <div className="row">
                        <Button onClick={cancelMyself} busy={cancelling}>
                          Yes, cancel it
                        </Button>
                        <Button variant="quiet" onClick={() => setCancelAsk(false)} disabled={cancelling}>
                          Keep it paused
                        </Button>
                      </div>
                    </div>
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
              Pick a scenario and tap Send. The payment goes through the real Second Key engine and the PayPal sandbox: Rose&apos;s own rule and any conversation she chooses to share are checked, PayPal reserves the money, and nothing completes without either a clean check or a person&apos;s decision.
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

        {state === "HELD" && shared && (
          <div className="sk-card stack">
            <h2 className="sk-section-title">{evidence?.request.conversation_source === "shared_after_pause" ? "What you shared after the pause" : "What you shared with the payment"}</h2>
            <Transcript conv={shared} quotes={quotes.map((q) => q.quote)} focusLine={focus} self={PAYER} />
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

function headline(state: string | undefined, decidedBy: string | undefined, byRuleOnly = false) {
  const byContact = decidedBy?.endsWith("(link)");
  switch (state) {
    case "HELD":
      return byRuleOnly ? "Paused by your rule" : "We've paused this payment";
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
      return byContact
        ? `${TRUSTED} chose not to send it, and PayPal released the reserved money.`
        : decidedBy?.startsWith("shopper:")
          ? "You cancelled it, and PayPal released the reserved money."
          : "PayPal released the reserved money.";
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
    { label: s === "HELD" ? (asked ? "Waiting for review" : "Paused") : !s ? "Reviewed if needed" : needsReview ? "Decided" : "No review needed", status: decided ? "done" : s === "HELD" ? "now" : "todo", moving: false },
    { label: confirmed ? (s === "VOIDED" ? "Cancelled" : "Completed") : "PayPal confirms", status: confirmed ? "done" : decided ? "now" : "todo", moving: true },
  ];
}
