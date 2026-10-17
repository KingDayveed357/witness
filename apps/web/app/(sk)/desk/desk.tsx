"use client";

import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type GridApi, type RowClickedEvent } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, errText } from "../../../lib/client";
import { deciderOf, rankEvidence, stageOf, tacticOf, usd, when } from "../../../lib/sk";
import { QuoteCard, Transcript, type Conversation, type Evidence } from "../_ui/evidence";
import { Button, Live, Notice, Pill, StatePill } from "../_ui/ui";
import { PayPalCheck } from "../_ui/verify";

ModuleRegistry.registerModules([AllCommunityModule]);

// AG Grid Community (MIT) themed with Second Key tokens; CSS variables keep light/dark in sync.
const theme = themeQuartz.withParams({
  fontFamily: "var(--sans)",
  fontSize: 14,
  foregroundColor: "var(--ink)",
  backgroundColor: "var(--surface)",
  headerBackgroundColor: "var(--surface)",
  headerTextColor: "var(--ink-3)",
  borderColor: "var(--line)",
  rowBorder: { color: "var(--line)" },
  selectedRowBackgroundColor: "var(--brass-soft)",
  rowHoverColor: "var(--surface-2)",
  wrapperBorderRadius: 20,
  accentColor: "var(--brand)",
});

interface Incident {
  id: string;
  state: string;
  kind: "shopping" | "transfer";
  product: string | null;
  retailer: string | null;
  amount_cents: number | null;
  primary_check: string | null;
  decided_by: string | null;
  hold_resolution: string | null;
  created_at: string;
}

const FILTERS: { key: string; label: string; test: (i: Incident) => boolean }[] = [
  { key: "all", label: "All", test: () => true },
  { key: "review", label: "Needs review", test: (i) => i.state === "HELD" },
  { key: "cancelled", label: "Cancelled", test: (i) => ["VOIDED", "VOIDING"].includes(i.state) },
  { key: "completed", label: "Completed", test: (i) => ["CAPTURED", "CAPTURE_APPROVED", "CAPTURING", "CAPTURE_PENDING"].includes(i.state) },
  { key: "notsent", label: "Not sent", test: (i) => ["REJECTED", "AUTH_FAILED", "CAPTURE_DECLINED"].includes(i.state) },
];
const KINDS = [
  { key: "any", label: "Human and agent" },
  { key: "transfer", label: "Human transfers" },
  { key: "shopping", label: "Agent purchases" },
] as const;

const CHECK_LABELS: Record<string, string> = {
  "ai.manipulation": "Pressure patterns in the conversation",
  "ai.injection": "Instructions aimed at the agent",
  "transfer.amount": "Amount matches what was confirmed",
  "transfer.payee": "Recipient matches what was confirmed",
  "intent.kind": "Request type matches the intent",
  "intent.not_expired": "Intent still valid",
  "intent.purchases_left": "Uses left on the intent",
  currency: "Currency",
  max_total: "Within budget",
  size: "Size",
  color: "Colour",
  three_way_match: "PayPal order matches what was approved",
};
/** Time for today's incidents, date otherwise: the queue is about what just happened. */
const shortWhen = (iso: string) => {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString() ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString([], { month: "short", day: "numeric" });
};
const checkLabel = (id: string) => CHECK_LABELS[id] ?? id.replace(/^ai\.(soft|integrity):/, "Listing: ").replace(/[._]/g, " ");

export function Desk() {
  const params = useSearchParams();
  const router = useRouter();
  const [rows, setRows] = useState<Incident[] | null>(null);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("all");
  const [kind, setKind] = useState<(typeof KINDS)[number]["key"]>("any");
  const [selected, setSelected] = useState<string | null>(params.get("incident"));
  const [grid, setGrid] = useState<GridApi<Incident> | null>(null);
  const [scope, setScope] = useState<"session" | "all">("session");
  const [sessionStart, setSessionStart] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ purchases: Incident[]; session_started_at: string | null }>(`/v1/console/purchases?limit=300&scope=${scope}`, { console: true });
      setRows(r.purchases);
      setSessionStart(r.session_started_at);
      setErr("");
    } catch (e) {
      setErr(errText(e));
    }
  }, [scope]);
  useEffect(() => {
    void load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  const visible = useMemo(() => (rows ?? []).filter((r) => FILTERS.find((f) => f.key === filter)!.test(r) && (kind === "any" || r.kind === kind)), [rows, filter, kind]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.key, (rows ?? []).filter((r) => f.test(r) && (kind === "any" || r.kind === kind)).length])), [rows, kind]);

  const cols = useMemo<ColDef<Incident>[]>(
    () => [
      { field: "created_at", headerName: "When", width: 96, sort: "desc", valueFormatter: (p) => shortWhen(p.value) },
      { field: "kind", headerName: "Type", width: 88, valueFormatter: (p) => (p.value === "transfer" ? "Transfer" : "Agent") },
      {
        field: "product",
        headerName: "To / item · first concern",
        flex: 1,
        minWidth: 200,
        getQuickFilterText: (p) => `${p.data?.product ?? ""} ${p.data?.primary_check ? checkLabel(p.data.primary_check) : ""}`,
        cellRenderer: (p: { data?: Incident }) => (
          <div style={{ lineHeight: 1.3, paddingTop: 7 }}>
            <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(p.data?.product ?? "—").replace(/ \(simulated, platform-held\)$/, "")}</div>
            <div className="xs muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.data?.primary_check ? checkLabel(p.data.primary_check) : "No concerns"}</div>
          </div>
        ),
      },
      { field: "amount_cents", headerName: "Amount", width: 98, type: "rightAligned", valueFormatter: (p) => usd(p.value) },
      { field: "state", headerName: "Status", width: 168, cellStyle: { display: "flex", alignItems: "center" }, cellRenderer: (p: { value: string }) => <StatePill state={p.value} /> },
    ],
    [],
  );

  useEffect(() => {
    if (!grid || !selected) return;
    grid.forEachNode((n) => n.setSelected(n.data?.id === selected));
  }, [grid, selected, visible]);

  const select = (id: string) => {
    setSelected(id);
    router.replace(`/desk?incident=${encodeURIComponent(id)}`, { scroll: false });
  };

  return (
    <div className="stack">
      <div className="row between">
        <div className="sk-filters" role="group" aria-label="Status">
          {FILTERS.map((f) => (
            <button key={f.key} className="sk-chip" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label} <span className="muted">{counts[f.key] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="sk-filters" role="group" aria-label="Type and period">
          {KINDS.map((k) => (
            <button key={k.key} className="sk-chip" aria-pressed={kind === k.key} onClick={() => setKind(k.key)}>
              {k.label}
            </button>
          ))}
          <button className="sk-chip" aria-pressed={scope === "all"} onClick={() => setScope(scope === "all" ? "session" : "all")} title={sessionStart ? `This demo session started ${when(sessionStart)}` : undefined}>
            Include earlier sessions
          </button>
        </div>
      </div>
      {err && (
        <Notice tone="bad" title="Couldn't load incidents" role="alert">
          {err}
        </Notice>
      )}
      <div className="sk-desk">
        <div className="queue" aria-label="Incident queue">
          <AgGridReact<Incident>
            theme={theme}
            rowData={visible}
            columnDefs={cols}
            getRowId={(p) => p.data.id}
            rowSelection={{ mode: "singleRow", checkboxes: false, enableClickSelection: true }}
            onGridReady={(e) => setGrid(e.api)}
            onRowClicked={(e: RowClickedEvent<Incident>) => e.data && select(e.data.id)}
            onSelectionChanged={(e) => {
              // Keyboard selection (Space) opens the incident too.
              const row = e.api.getSelectedRows()[0];
              if (row && row.id !== selected) select(row.id);
            }}
            overlayNoRowsTemplate={rows ? "No incidents match these filters." : "Loading incidents…"}
            rowHeight={56}
          />
        </div>
        <div className="detail">{selected ? <Incident id={selected} key={selected} /> : <EmptyDetail />}</div>
      </div>
    </div>
  );
}

function EmptyDetail() {
  return (
    <div className="sk-card stack">
      <h2 style={{ fontSize: "var(--text-lg)" }}>Select an incident</h2>
      <p className="small soft">Each row is a payment Second Key screened. Open one to trace it from the original evidence, through the decision, to what PayPal reports and the hash-chained audit trail.</p>
    </div>
  );
}

interface EvidenceResp {
  purchase: { id: string; state: string; amount: { value: string; currency_code: string } | null; retailer: string | null; created_at: string; paypal: { order_id: string | null } };
  facts: Record<string, { title: string; description?: string }>;
  intent: { policy: { kind?: string; payee?: { name: string; first_payment: boolean; email?: string }; purpose?: string } } | null;
  payout: { status: string; receiver: string; amount: { value: string }; batch_id: string | null; last_error: string | null; updated_at: string } | null;
  request: { kind: "shopping" | "transfer"; conversation: Conversation | null };
  checks: { phase: string; check_id: string; kind: string; result: "pass" | "fail" | "unknown"; detail: string; evidence: Evidence[] | null; model: string | null; prompt_version: string | null; at: string }[];
  decisions: { outcome: string; reasons: string[]; decided_by: string; at: string }[];
  paypal_calls: { op: string; status: string; http_status: number | null; debug_id: string | null; at: string }[];
  chain: { valid: boolean; events: { seq: number; event_type: string; at: string; hash: string; payload?: Record<string, unknown> }[] };
}

const EVENT_COPY: Record<string, string> = {
  "purchase.submitted": "Payment request received",
  "purchase.screened": "Screening finished",
  "purchase.rejected": "Refused by policy (PayPal never called)",
  "purchase.authorized": "PayPal authorization created: money reserved",
  "purchase.held": "Paused for a person's review",
  "purchase.void_decided": "Decision: don't send",
  "purchase.voided": "PayPal authorization voided",
  "purchase.capture_approved": "Decision: complete the payment",
  "purchase.captured": "PayPal capture completed",
  "purchase.auth_failed": "PayPal couldn't authorize",
  "purchase.capture_declined": "PayPal declined the capture",
  "capture.started": "Capture sent to PayPal",
  "capture.pending": "PayPal reports the capture as pending",
  "capture.retry": "Capture retried with the same request ID",
  "capture.declined": "PayPal declined the capture",
  "capture.refused": "Executor refused to capture (approval missing or expired)",
  "capture.stalled": "Capture stalled; flagged for reconciliation",
  "capture.outcome_unknown": "Capture outcome unclear; reconciling with PayPal",
  "void.retry": "Void retried with the same request ID",
  "void.unconfirmed": "Void not yet confirmed by PayPal",
  "payout.requested": "Payout to the recipient requested",
  "payout.accepted": "PayPal accepted the payout batch",
  "payout.status": "Payout status changed",
  "payout.succeeded": "PayPal paid the recipient",
  "payout.unclaimed": "Payout unclaimed (recipient has no PayPal account yet)",
  "payout.failed": "Payout didn't go through",
  "payout.outcome_unknown": "Payout outcome unclear; retrying with the same request ID",
};

function Incident({ id }: { id: string }) {
  const [ev, setEv] = useState<EvidenceResp | null>(null);
  const [err, setErr] = useState("");
  const [focus, setFocus] = useState<number | null>(null);
  const load = useCallback(async () => {
    try {
      setEv(await api<EvidenceResp>(`/v1/purchases/${id}/evidence`, { console: true }));
    } catch (e) {
      setErr(errText(e));
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);
  // Keep following while the payment is still moving.
  useEffect(() => {
    if (!ev || !stageOf(ev.purchase.state).moving) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [ev, load]);

  if (err) return <Notice tone="bad" title="Couldn't load this incident">{err}</Notice>;
  if (!ev) return <div className="sk-card muted">Loading…</div>;

  const p = ev.purchase;
  const amount = p.amount ? usd(p.amount.value) : "—";
  const screen = ev.checks.filter((c) => c.phase === "SCREEN");
  const recheck = ev.checks.filter((c) => c.phase !== "SCREEN");
  const evidence = rankEvidence(screen.flatMap((c) => c.evidence ?? []));
  const listing = Object.values(ev.facts ?? {})[0];
  const isTransfer = ev.request.kind === "transfer";

  return (
    <div className="stack">
      <div className="sk-card stack">
        <div className="row between">
          <Pill tone="neutral">{isTransfer ? "Human transfer" : "Agent purchase"}</Pill>
          <StatePill state={p.state} />
        </div>
        <div className="row between" style={{ alignItems: "baseline" }}>
          <div className="sk-amount">{amount}</div>
          <span className="xs muted mono">{p.id}</span>
        </div>
        <p className="small soft">
          {isTransfer && ev.intent?.policy.payee
            ? `To ${ev.intent.policy.payee.name}${ev.intent.policy.payee.first_payment ? " (first payment)" : ""} · ${ev.intent.policy.purpose ?? ""}`
            : (Object.values(ev.facts ?? {})[0]?.title ?? "—")}
        </p>
        <p className="xs muted">
          Created {when(p.created_at)} · {p.retailer ?? "—"}
        </p>
      </div>

      <section className="sk-card stack" aria-labelledby="ev-h">
        <div className="row between">
          <h2 id="ev-h" style={{ fontSize: "var(--text-lg)" }}>Evidence, in its source</h2>
          <span className="xs muted">Quotes are verified by code to appear in the source</span>
        </div>
        {evidence.length === 0 && <p className="small soft">No pressure patterns or agent instructions were found.</p>}
        {evidence.map((e, i) => (
          <QuoteCard key={i} e={e} sourceLabel={e.source === "listing" ? "Product page the agent read" : "Conversation"} active={focus !== null && focus === e.line} onFocus={() => setFocus(e.line ?? null)} />
        ))}
        {ev.request.conversation && (
          <div className="sk-card tint" style={{ padding: 12 }}>
            <p className="xs muted" style={{ margin: "0 8px 8px" }}>{ev.request.conversation.context}</p>
            <Transcript conv={ev.request.conversation} quotes={evidence.filter((e) => e.source === "conversation").map((e) => e.quote)} focusLine={focus} />
          </div>
        )}
        {!isTransfer && listing?.description && (
          <div className="sk-card tint" style={{ padding: 12 }}>
            <p className="xs muted" style={{ marginBottom: 6 }}>Product page text: {listing.title}</p>
            <Transcript conv={{ context: "", lines: [{ speaker: "Listing", text: listing.description }] }} quotes={evidence.filter((e) => e.source === "listing").map((e) => e.quote)} />
          </div>
        )}
      </section>

      <section className="sk-card stack" aria-labelledby="as-h">
        <h2 id="as-h" style={{ fontSize: "var(--text-lg)" }}>Assessment</h2>
        <p className="xs muted">Rules decide; AI checks can only pause a payment, never approve or move money.</p>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
          {[...screen, ...recheck].map((c, i) => (
            <li key={i} className="stack-sm" style={{ borderTop: i ? "1px solid var(--line)" : 0, paddingTop: i ? 10 : 0 }}>
              <div className="row between">
                <span style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>{checkLabel(c.check_id)}</span>
                <Pill tone={c.result === "pass" ? "ok" : c.result === "fail" ? "bad" : "held"}>{c.result === "pass" ? "Passed" : c.result === "fail" ? "Failed" : "Needs review"}</Pill>
              </div>
              <span className="xs muted">
                {c.kind === "ai" ? `AI check · ${c.model ?? "model"} · ${c.prompt_version ?? ""}` : "Rule"}
                {c.phase !== "SCREEN" ? ` · ${c.phase.toLowerCase()}` : ""}
                {c.evidence?.length ? ` · ${[...new Set(c.evidence.map((e) => tacticOf(e.tactic).label))].join(", ")}` : ""}
              </span>
              {c.result !== "pass" && !c.evidence?.length && <span className="xs soft">{c.detail}</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="sk-card stack" aria-labelledby="dec-h">
        <h2 id="dec-h" style={{ fontSize: "var(--text-lg)" }}>Decisions</h2>
        {ev.decisions.length === 0 && <p className="small soft">No decision recorded yet.</p>}
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
          {ev.decisions.map((d, i) => (
            <li key={i} className="small">
              <strong>{d.outcome}</strong> · {deciderOf(d.decided_by)} · <span className="muted">{when(d.at)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="sk-card stack" aria-labelledby="pp-h">
        <h2 id="pp-h" style={{ fontSize: "var(--text-lg)" }}>The money, according to PayPal</h2>
        {p.paypal.order_id ? (
          <PayPalCheck
            path={`/v1/purchases/${p.id}/paypal`}
            amount={amount}
            refreshKey={p.state}
            console
            {...(isTransfer ? { transfer: { payee: ev.intent?.policy.payee?.name ?? "the recipient", configured: Boolean(ev.intent?.policy.payee?.email) } } : {})}
          />
        ) : (
          <p className="small soft">No PayPal order was created: the payment was refused before PayPal was called.</p>
        )}
        {ev.payout && (
          <p className="xs muted">
            Payout record: {ev.payout.status} · {usd(ev.payout.amount.value)} to {ev.payout.receiver}
            {ev.payout.batch_id ? <> · batch <span className="mono">{ev.payout.batch_id}</span></> : null}
            {ev.payout.last_error ? ` · ${ev.payout.last_error}` : ""}
          </p>
        )}
        {ev.paypal_calls.length > 0 && (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }} className="xs">
            {ev.paypal_calls.map((c, i) => (
              <li key={i} className="row between">
                <span>
                  <span className="mono">{c.op}</span> · {c.status} {c.http_status ? `(HTTP ${c.http_status})` : ""}
                </span>
                <span className="muted">{c.debug_id ? <span className="mono">{c.debug_id}</span> : null} · {when(c.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="sk-card stack" aria-labelledby="tl-h">
        <div className="row between">
          <h2 id="tl-h" style={{ fontSize: "var(--text-lg)" }}>Timeline</h2>
          {ev.chain.valid ? <Live>Audit chain verified</Live> : <Pill tone="bad">Audit chain broken</Pill>}
        </div>
        {ev.chain.events.length === 0 && <p className="small soft">No audit events found for this payment.</p>}
        <ol className="sk-timeline">
          {ev.chain.events.map((e) => {
            const money = ["purchase.authorized", "purchase.voided", "purchase.captured", "capture.started"].includes(e.event_type) || e.event_type.startsWith("payout.");
            const human = ["purchase.held", "purchase.void_decided", "purchase.capture_approved"].includes(e.event_type);
            const by = typeof e.payload?.decided_by === "string" ? deciderOf(e.payload.decided_by) : null;
            return (
              <li key={e.seq} className={money ? "money" : human ? "human" : ""}>
                <span className="t">{new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                <span className="dot" aria-hidden />
                <div className="body">
                  <div>{EVENT_COPY[e.event_type] ?? e.event_type}</div>
                  <div className="xs muted">
                    {by ? `${by} · ` : ""}
                    <span className="mono">#{e.seq} · {e.hash.replace(/^sha256:/, "").slice(0, 10)}…</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
        <Button variant="quiet" size="sm" onClick={load}>
          Refresh
        </Button>
      </section>
    </div>
  );
}
