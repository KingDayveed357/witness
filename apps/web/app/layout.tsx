import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Witness",
  description: "Intent verification and payment control for AI shopping agents, on the PayPal sandbox.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="top">
          <div className="wrap">
            <Link href="/" className="brand">Witness</Link>
            <nav>
              <Link href="/">Try it</Link>
              <Link href="/shop">Shopper</Link>
              <Link href="/console">Ops console</Link>
            </nav>
            <span className="sandbox">PayPal sandbox · no real money</span>
          </div>
        </header>
        <main>
          <div className="wrap">{children}</div>
        </main>
      </body>
    </html>
  );
}
