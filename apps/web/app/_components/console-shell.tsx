"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Disputes } from "./disputes";

// AG Studio touches the DOM on import, so it loads only in the browser.
const Studio = dynamic(() => import("./studio").then((m) => m.ConsoleStudio), { ssr: false, loading: () => <p className="muted">Loading console…</p> });

export function ConsoleShell({ licenseKey }: { licenseKey: string }) {
  const [tab, setTab] = useState<"dashboard" | "disputes">("dashboard");
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <div className="row">
          <h1 style={{ margin: 0 }}>Ops console</h1>
          <button className={tab === "dashboard" ? "primary" : ""} onClick={() => setTab("dashboard")}>Ledger and holds</button>
          <button className={tab === "disputes" ? "primary" : ""} onClick={() => setTab("disputes")}>Disputes</button>
        </div>
        <form method="post" action="/api/console/logout"><button>Sign out</button></form>
      </div>
      {tab === "dashboard" ? <Studio licenseKey={licenseKey} /> : <Disputes />}
    </>
  );
}
