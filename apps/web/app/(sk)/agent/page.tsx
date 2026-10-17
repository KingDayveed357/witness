import { Agent } from "./agent";

export const metadata = { title: "Agent demo · Second Key" };

export default function Page() {
  return (
    <div className="stack-lg">
      <header className="stack-sm" style={{ maxWidth: 720 }}>
        <span className="sk-section-title">The same safety, for AI agents</span>
        <h1 style={{ fontSize: "var(--text-2xl)" }}>An agent shopping for Rose meets a page that gives it orders.</h1>
        <p className="soft">The same engine that pauses a pressured transfer pauses an agent&apos;s purchase when the content it read tries to steer it, and sends it to the same review.</p>
      </header>
      <Agent />
    </div>
  );
}
