// Demo rehearsal: drives the real Second Key UI (local web + API + worker, PayPal SANDBOX) through
// the three-minute story with a headless browser and saves screenshots. It clicks what a presenter
// clicks; every state it captures comes from the backend. Never prints the console password.
//
//   SK_WEB=http://127.0.0.1:3100 SK_CONSOLE_PASSWORD_FILE=<file> npx tsx secondkey/spikes/ui/rehearse.ts
// Writes docs/secondkey/screens/*.png and secondkey/reports/ui-rehearsal.json.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import puppeteer, { type Page } from "puppeteer-core";
import { ROOT } from "@witness/config";

const WEB = process.env.SK_WEB ?? "http://127.0.0.1:3100";
const EDGE = process.env.EDGE_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const OUT = join(ROOT, "docs", "secondkey", "screens");
mkdirSync(OUT, { recursive: true });
const steps: { step: string; ok: boolean; detail?: string }[] = [];
const rec = (step: string, ok: boolean, detail?: string) => {
  steps.push({ step, ok, ...(detail ? { detail } : {}) });
  console.log(`${ok ? "PASS" : "FAIL"} ${step}${detail ? ` (${detail})` : ""}`);
};

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, protocolTimeout: 180_000 });
const desktop = async () => {
  const p = await browser.newPage();
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
  return p;
};
const phone = async () => {
  const p = await browser.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
  return p;
};
const text = (p: Page) => p.evaluate(() => document.querySelector("main")?.innerText ?? "");
async function clickText(p: Page, label: string) {
  const ok = await p.evaluate((l) => {
    const el = [...document.querySelectorAll("button, a")].find((b) => (b as HTMLElement).innerText.trim() === l) as HTMLElement | undefined;
    el?.click();
    return Boolean(el);
  }, label);
  if (!ok) throw new Error(`no button "${label}"`);
}
async function waitText(p: Page, needle: string, ms = 30_000) {
  await p.waitForFunction((n) => document.querySelector("main")?.textContent?.includes(n), { timeout: ms, polling: 500 }, needle);
}
const shot = (p: Page, name: string, fullPage = false) => p.screenshot({ path: join(OUT, `${name}.png`), fullPage });

try {
  // 0. Home
  const home = await desktop();
  await home.goto(`${WEB}/`, { waitUntil: "networkidle0" });
  await shot(home, "01-home");
  rec("home renders the promise and the honesty legend", (await text(home)).includes("someone you trust") && (await text(home)).includes("not a PayPal Friends"));

  // 1. Payer: scam call → paused with evidence, PayPal shows reserved
  const pay = await desktop();
  await pay.goto(`${WEB}/pay`, { waitUntil: "networkidle0" });
  await shot(pay, "02-payer-compose");
  await clickText(pay, "Send $1,800.00");
  // ADR-0019: nothing shared; Rose's own rule pauses it. Then she chooses to share for a second opinion.
  await waitText(pay, "Paused by your rule", 60_000);
  await waitText(pay, "reserved, nothing taken yet");
  await shot(pay, "03-payer-paused");
  rec("payer: paused by the payer's own rule with no evidence shared; PayPal authorization reserved (live read)", true);
  await clickText(pay, "Share the conversation");
  await waitText(pay, "In what you shared", 60_000);
  await shot(pay, "03b-payer-second-opinion");
  rec("payer: shared the conversation after the pause; quoted findings added, still paused", (await text(pay)).includes("Paused for review") || (await text(pay)).includes("paused"));

  // 2. Ask the trusted contact; open the one-time link on a phone
  await clickText(pay, "Ask Sarah to check");
  await pay.waitForSelector('a[href^="/holds/"]');
  const href = await pay.$eval('a[href^="/holds/"]', (a) => a.getAttribute("href")!);
  const sarah = await phone();
  await sarah.goto(`${WEB}${href}`, { waitUntil: "networkidle0" });
  await waitText(sarah, "asked you to check a payment");
  rec("reviewer: token removed from the address bar", !sarah.url().includes("t="));
  await shot(sarah, "04-reviewer-evidence", true);

  // 3. Don't send → confirm → recorded → PayPal confirms voided
  await clickText(sarah, "Don't send");
  await waitText(sarah, "PayPal will release the money");
  await shot(sarah, "05-reviewer-confirm");
  await clickText(sarah, "Yes, don't send");
  await waitText(sarah, "Decision recorded");
  await waitText(sarah, "authorization voided", 60_000);
  await shot(sarah, "06-reviewer-cancelled");
  rec("reviewer: decision recorded, then PayPal shows the authorization voided", true);

  // 4. The payer's phone follows on its own
  await waitText(pay, "Cancelled. Nothing was taken.", 30_000);
  await waitText(pay, "authorization voided");
  await shot(pay, "07-payer-cancelled");
  rec("payer: shows the verified cancellation without a refresh", true);

  // 5. Benign invoice goes straight through, capture verified
  await clickText(pay, "Start over");
  await clickText(pay, "A contractor's invoice");
  await clickText(pay, "Send $1,800.00");
  await waitText(pay, "Nothing unusual was found", 90_000);
  await waitText(pay, "captured: the payment is complete");
  await waitText(pay, "PayPal shows $1,800.00 paid out to", 150_000); // the live payout read, not explanatory copy
  await shot(pay, "08-payer-benign-sent");
  rec("payer: contractor invoice completed without review, capture verified, then the payout to the recipient shown as paid by PayPal", true);

  // 6. Agent: instruction in the product page → paused; listing quote shown
  const agent = await desktop();
  await agent.goto(`${WEB}/agent`, { waitUntil: "networkidle0" });
  await clickText(agent, "Let the agent buy");
  await waitText(agent, "purchase needs Rose", 60_000);
  await waitText(agent, "SYSTEM NOTE");
  await shot(agent, "09-agent-paused");
  rec("agent: purchase paused, the instruction quoted from the page", true);

  // 7. Desk: trace the cancelled scam transfer
  const pwFile = process.env.SK_CONSOLE_PASSWORD_FILE;
  if (pwFile) {
    const desk = await desktop();
    await desk.goto(`${WEB}/desk?signin=1`, { waitUntil: "networkidle0" }); // the Desk is public by default
    await desk.type('input[type="password"]', readFileSync(pwFile, "utf8").trim());
    await Promise.all([desk.waitForNavigation(), desk.click("button.sk-btn.primary")]);
    const id = href.split("/")[2]!.split("?")[0]!;
    await desk.goto(`${WEB}/desk?incident=${id}`, { waitUntil: "networkidle0" });
    await waitText(desk, "Audit chain verified");
    await waitText(desk, "authorization voided");
    await shot(desk, "10-desk-incident");
    const t = await text(desk);
    rec("desk: evidence, trusted-contact decision, PayPal voided and verified timeline agree", t.includes("Trusted contact, via one-time link") && t.includes("Decision: don't send") && t.includes("PayPal authorization voided"));
  } else rec("desk", false, "SK_CONSOLE_PASSWORD_FILE not set; skipped");
} catch (e) {
  rec("rehearsal", false, (e as Error).message.slice(0, 200));
} finally {
  await browser.close();
}
writeFileSync(join(ROOT, "secondkey", "reports", "ui-rehearsal.json"), JSON.stringify({ ran_at: new Date().toISOString(), web: WEB, environment: "local web + API + worker, PayPal SANDBOX, synthetic data", steps }, null, 2) + "\n");
const failed = steps.filter((s) => !s.ok).length;
console.log(failed ? `${failed} FAILED` : "rehearsal passed");
