import type { Metadata } from "next";
import Link from "next/link";
import "../globals.css";

export const metadata: Metadata = {
  title: "Witness",
  description: "Intent verification and payment control for AI shopping agents, on the PayPal sandbox.",
};

// The original Witness surfaces (judge page, shopper, ops console), kept working under their own chrome.
export default function WitnessLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="witness">
      <header className="top">
        <div className="wrap">
          <Link href="/witness" className="brand">Witness</Link>
          <nav>
            <Link href="/witness">Try it</Link>
            <Link href="/shop">Shopper</Link>
            <Link href="/console">Ops console</Link>
            <Link href="/">Second Key</Link>
          </nav>
          <span className="sandbox">PayPal sandbox · no real money</span>
        </div>
      </header>
      <main>
        <div className="wrap">{children}</div>
      </main>
    </div>
  );
}
