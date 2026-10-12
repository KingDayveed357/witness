"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, errText, money, tone } from "../../lib/client";

const toList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export function ShopPage() {
  const [text, setText] = useState("Trail running shoes, men's size 10, under $90, not white, from rei.com");
  const [draft, setDraft] = useState<any>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    try {
      const t = sessionStorage.getItem("witness.intentText");
      if (t) {
        setText(t);
        sessionStorage.removeItem("witness.intentText");
      }
    } catch {}
  }, []);

  function load(d: any) {
    setDraft(d);
    const p = d.policy ?? {};
    setForm({
      category: p.category ?? "",
      max_total: p.max_total_cents != null ? String(p.max_total_cents / 100) : "",
      currency: p.currency ?? "USD",
      retailers: (p.retailers ?? []).join(", "),
      size: p.hard?.size ?? "",
      excluded_colors: (p.hard?.excluded_colors ?? []).join(", "),
      brand: p.hard?.brand ?? "",
      quantity: String(p.quantity ?? 1),
    });
  }

  async function compile(e: React.FormEvent) {
    e.preventDefault();
    setBusy("compile");
    setErr("");
    try {
      load(await api("/v1/intents", { method: "POST", body: { text } }));
    } catch (e2) {
      setErr(errText(e2));
    } finally {
      setBusy("");
    }
  }

  async function confirm() {
    setBusy("confirm");
    setErr("");
    const p = draft.policy ?? {};
    const policy = {
      ...p,
      category: form.category || undefined,
      max_total_cents: form.max_total ? Math.round(Number(form.max_total) * 100) : undefined,
      currency: form.currency || "USD",
      retailers: toList(form.retailers ?? ""),
      quantity: Number(form.quantity || 1),
      hard: { ...(p.hard ?? {}), excluded_colors: toList(form.excluded_colors ?? ""), ...(form.size ? { size: form.size } : { size: undefined }), ...(form.brand ? { brand: form.brand } : { brand: undefined }) },
    };
    try {
      load(await api(`/v1/intents/${draft.id}/confirm`, { method: "POST", body: { policy } }));
    } catch (e2) {
      setErr(errText(e2));
    } finally {
      setBusy("");
    }
  }

  async function revoke() {
    setBusy("revoke");
    try {
      load(await api(`/v1/intents/${draft.id}/revoke`, { method: "POST" }));
    } catch (e2) {
      setErr(errText(e2));
    } finally {
      setBusy("");
    }
  }

  const f = (k: string, label: string, hint?: string) => (
    <label>
      {label}
      <input value={form[k] ?? ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} disabled={draft?.status !== "DRAFT"} />
      {hint && <span className="small muted">{hint}</span>}
    </label>
  );

  return (
    <>
      <h1>Shopper</h1>
      <p className="lede">You are the demo shopper. Say what you want, check what Witness understood, and confirm. An agent can then buy only within what you confirmed.</p>

      <form className="card row" onSubmit={compile}>
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} style={{ flex: 1, minWidth: 220 }} aria-label="What do you want to buy?" />
        <button className="primary" disabled={busy === "compile"}>{busy === "compile" ? "Compiling…" : "Compile"}</button>
      </form>
      {err && <p className="error">{err}</p>}

      {draft && (
        <div className="card stack" style={{ marginTop: 12 }}>
          <div className="row">
            <strong>Intent</strong> <code className="small">{draft.id}</code>
            <span className={`badge ${draft.status === "CONFIRMED" ? "ok" : draft.status === "REVOKED" ? "bad" : "warn"}`}>{draft.status}</span>
            {draft.compiler && <span className="small muted">compiled by {draft.compiler.model} ({draft.compiler.prompt_version})</span>}
          </div>
          {draft.ambiguities?.length > 0 && draft.status === "DRAFT" && (
            <div className="small">
              <strong>Witness needs you to decide:</strong>
              <ul style={{ margin: "4px 0", paddingLeft: 18 }}>{draft.ambiguities.map((a: any, i: number) => <li key={i}>{a.question}{a.options?.length ? ` (${a.options.join(" / ")})` : ""}</li>)}</ul>
            </div>
          )}
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
            {f("category", "Category")}
            {f("max_total", "Maximum total", "the most the agent may spend")}
            {f("currency", "Currency")}
            {f("retailers", "Retailers", "comma separated, e.g. rei.com")}
            {f("size", "Size")}
            {f("excluded_colors", "Never these colours", "comma separated")}
            {f("brand", "Brand (optional)")}
            {f("quantity", "Quantity")}
          </div>
          <div className="row">
            {draft.status === "DRAFT" && <button className="primary" onClick={confirm} disabled={busy === "confirm"}>{busy === "confirm" ? "Confirming…" : "Confirm this intent"}</button>}
            {draft.status === "CONFIRMED" && <button className="danger" onClick={revoke} disabled={busy === "revoke"}>Revoke (voids any held payment)</button>}
          </div>
          {draft.status === "CONFIRMED" && (
            <p className="small muted">
              Confirmed. An agent can now shop under intent <code>{draft.id}</code> through the Witness API, for example the reference agent:{" "}
              <code>pnpm --filter @witness/agent start -- --intent {draft.id}</code>
            </p>
          )}
        </div>
      )}
      <Receipts />
    </>
  );
}

function Receipts() {
  const router = useRouter();
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(() => api("/v1/me/purchases").then((r) => setRows(r.purchases), (e) => setErr(errText(e))), []);
  useEffect(() => {
    load();
  }, [load]);

  async function decide(id: string) {
    try {
      const l = await api(`/v1/purchases/${id}/hold-link`, { method: "POST" });
      router.push(l.path);
    } catch (e) {
      setErr(errText(e));
    }
  }

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", marginTop: 28 }}>
        <h2 style={{ margin: 0 }}>Receipts</h2>
        <button onClick={load}>Refresh</button>
      </div>
      {err && <p className="error">{err}</p>}
      {rows && rows.length === 0 && <p className="muted">No purchases yet. Run a scenario on the home page, or let an agent shop.</p>}
      {rows && rows.length > 0 && (
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table className="plain">
            <thead><tr><th>When</th><th>Product</th><th>Amount</th><th>State</th><th className="hide-sm">Why</th><th /></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className="small">{new Date(p.created_at).toLocaleString()}</td>
                  <td>{p.product ?? "—"}<div className="small muted">{p.retailer}</div></td>
                  <td>{money(p.amount_cents, p.currency ?? "USD")}</td>
                  <td><span className={`badge ${tone(p.state)}`}>{p.state}</span></td>
                  <td className="small hide-sm">{p.reasons.slice(0, 2).join("; ")}</td>
                  <td>{p.state === "HELD" && <button className="primary" onClick={() => decide(p.id)}>Decide</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
