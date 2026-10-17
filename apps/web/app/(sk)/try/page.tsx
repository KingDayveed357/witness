import { Playground } from "./playground";

export const metadata = { title: "Try the analysis · Second Key" };

export default function Page() {
  return (
    <div className="stack-lg">
      <header className="stack-sm" style={{ maxWidth: 760 }}>
        <span className="sk-section-title">Try it yourself</span>
        <h1 style={{ fontSize: "var(--text-2xl)" }}>Test the evidence analysis on your own text.</h1>
        <p className="soft">
          The same analysis that runs before a payment, live. You see what the AI observed, with the exact words, and, separately, what the fixed policy would do. No payment is made.
        </p>
      </header>
      <Playground />
    </div>
  );
}
