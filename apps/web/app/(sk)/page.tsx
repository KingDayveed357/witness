import Link from "next/link";
import { Demo, Live } from "./_ui/ui";

export const metadata = { title: "Second Key: a second key for payments made under pressure" };

export default function Home() {
  return (
    <div className="stack-lg" style={{ gap: "var(--s8)" }}>
      <section className="sk-hero">
        <div className="stack" style={{ gap: "var(--s5)" }}>
          <span className="sk-section-title">Manipulation-aware payment safety</span>
          <h1>
            When someone is pressuring you to pay, <em>someone you trust</em> holds the second key.
          </h1>
          <p className="sk-lede">
            Second Key reads the conversation behind a payment, pauses it when it shows the patterns of a scam, and lets a person you trust decide. Nothing moves until PayPal confirms it.
          </p>
          <div className="row">
            <Link href="/pay" className="sk-btn primary">
              See it protect a payment
            </Link>
            <Link href="/desk" className="sk-btn secondary">
              Open the Protection Desk
            </Link>
          </div>
          <div className="row" style={{ gap: "var(--s4)" }}>
            <Live>Real engine and PayPal sandbox</Live>
            <Demo>Synthetic people and conversations</Demo>
          </div>
        </div>

        <figure className="sk-card stack" style={{ padding: "var(--s6)" }} aria-label="Example from the demo conversation">
          <span className="sk-section-title">From the demo call · synthetic</span>
          <blockquote className="serif" style={{ fontSize: "1.75rem", lineHeight: 1.3, letterSpacing: "-0.01em" }}>
            “Please, I need eighteen hundred dollars for bail <mark style={{ background: "var(--brass-soft)", color: "inherit", padding: "0 3px" }}>right now</mark>… <mark style={{ background: "var(--brass-soft)", color: "inherit", padding: "0 3px" }}>Promise you won&apos;t tell her.</mark>”
          </blockquote>
          <hr className="sk-hr" />
          <div className="row between small">
            <span>
              <strong style={{ color: "var(--brass)" }}>Pressure to act right now</strong> · <strong style={{ color: "var(--brass)" }}>Asked to keep it secret</strong>
            </span>
          </div>
          <p className="small soft">The payment is paused, not refused. $1,800 stays reserved in PayPal until Rose&apos;s daughter decides.</p>
        </figure>
      </section>

      <section className="stack" aria-labelledby="how">
        <h2 id="how" style={{ fontSize: "var(--text-xl)" }}>How it works</h2>
        <ol className="sk-steps" style={{ padding: 0, margin: 0 }}>
          <li>
            <h3>It reads the context</h3>
            <p>The call, chat or screenshot behind a payment, or the web page an AI agent acted on. All of it is treated as untrusted input.</p>
          </li>
          <li>
            <h3>It shows the evidence</h3>
            <p>Patterns like urgency, secrecy or impersonation, each with the exact words, checked by code to really appear in the source.</p>
          </li>
          <li>
            <h3>A person decides</h3>
            <p>PayPal reserves the money; nothing is taken. A trusted contact reviews the evidence and chooses. The AI can pause a payment, never approve one.</p>
          </li>
          <li>
            <h3>PayPal confirms</h3>
            <p>Cancelled or completed, the result is read back from PayPal itself, and every step lands in a tamper-evident audit trail.</p>
          </li>
        </ol>
      </section>

      <section className="sk-demos" aria-label="Live demos">
        <Link href="/pay" className="sk-card stack" style={{ textDecoration: "none" }}>
          <span className="sk-section-title">Live demo · people</span>
          <h3 style={{ fontSize: "var(--text-lg)" }}>Rose gets an urgent call from “Danny”</h3>
          <p className="small soft">Send $1,800, watch it pause with the evidence, then play Rose&apos;s daughter and decide. Compare with a contractor&apos;s invoice that goes straight through.</p>
          <span className="small" style={{ color: "var(--brand)", fontWeight: 600 }}>Open the payer demo →</span>
        </Link>
        <Link href="/agent" className="sk-card stack" style={{ textDecoration: "none" }}>
          <span className="sk-section-title">Live demo · AI agents</span>
          <h3 style={{ fontSize: "var(--text-lg)" }}>A shopping agent reads a booby-trapped product page</h3>
          <p className="small soft">Hidden text tells the agent to buy something else. The same engine pauses the purchase and asks the person it works for.</p>
          <span className="small" style={{ color: "var(--brand)", fontWeight: 600 }}>Open the agent demo →</span>
        </Link>
      </section>

      <section className="sk-card tint stack" aria-labelledby="honest">
        <h2 id="honest" style={{ fontSize: "var(--text-lg)" }}>What this demo is, exactly</h2>
        <ul className="small soft" style={{ paddingLeft: 18, display: "grid", gap: 6 }}>
          <li>Payments run through the real Second Key engine against the PayPal <strong>sandbox</strong>. Statuses marked “Live” are read from the backend or from PayPal.</li>
          <li>A transfer here is platform-mediated: PayPal holds an authorization to the Second Key demo merchant, which is then voided or captured. It is not a PayPal Friends &amp; Family payment, and Second Key can&apos;t cancel arbitrary PayPal transfers.</li>
          <li>Paying a captured transfer on to the recipient is a separate payout step that is not part of this flow yet.</li>
          <li>People, calls and messages are synthetic. The reviewer link is shown on screen instead of being sent by text message.</li>
        </ul>
      </section>
    </div>
  );
}
