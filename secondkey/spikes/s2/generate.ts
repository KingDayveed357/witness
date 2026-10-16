// S2: render 20 SYNTHETIC phone screenshots of conversations from the S1 set, in varied chat styles,
// using the locally installed Microsoft Edge (puppeteer-core downloads no browser). Ground truth (the
// exact source lines, including filler) is written next to the images.
//   npx tsx secondkey/spikes/s2/generate.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { ROOT } from "@witness/config";
import { CASES } from "../s1/cases.ts";
import { HARD_CASES } from "../s1/hard-cases.ts";

const EDGE = process.env.EDGE_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const OUT = join(ROOT, "secondkey", "spikes", "s2", "screens");
mkdirSync(OUT, { recursive: true });

type Style = "imessage" | "imessage-dark" | "whatsapp" | "sms" | "email" | "telegram-dark";
const PLAN: { id: string; style: Style; font: number; filler: number }[] = [
  { id: "fam-01", style: "imessage", font: 16, filler: 0 },
  { id: "fam-02", style: "whatsapp", font: 15, filler: 3 },
  { id: "fam-05", style: "imessage-dark", font: 15, filler: 2 },
  { id: "tech-01", style: "sms", font: 14, filler: 0 },
  { id: "tech-04", style: "sms", font: 13, filler: 1 },
  { id: "rom-01", style: "whatsapp", font: 14, filler: 4 },
  { id: "rom-04", style: "telegram-dark", font: 15, filler: 2 },
  { id: "gov-01", style: "imessage", font: 13, filler: 0 },
  { id: "gov-03", style: "sms", font: 16, filler: 0 },
  { id: "safe-01", style: "whatsapp", font: 13, filler: 1 },
  { id: "safe-05", style: "sms", font: 15, filler: 0 },
  { id: "inv-01", style: "telegram-dark", font: 14, filler: 3 },
  { id: "pay-02", style: "imessage-dark", font: 16, filler: 1 },
  { id: "h-bec-01", style: "email", font: 14, filler: 0 },
  { id: "ben-01", style: "imessage", font: 15, filler: 2 },
  { id: "ben-09", style: "whatsapp", font: 16, filler: 1 },
  { id: "ben-11", style: "sms", font: 14, filler: 0 },
  { id: "ben-14", style: "imessage-dark", font: 14, filler: 2 },
  { id: "ben-20", style: "email", font: 15, filler: 0 },
  { id: "h-ben-closing-01", style: "telegram-dark", font: 11, filler: 0 }, // deliberately tiny font
];
const FILLER = ["Hey, are you free later?", "Sure, after lunch works.", "Did you see the game last night?", "Haha yes, unbelievable ending", "Ok talk soon", "Thanks!"];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const THEMES: Record<Style, { bg: string; them: string; me: string; text: string; meText: string; header: string; sub: string }> = {
  imessage: { bg: "#ffffff", them: "#e9e9eb", me: "#0a84ff", text: "#000", meText: "#fff", header: "#f6f6f6", sub: "#8e8e93" },
  "imessage-dark": { bg: "#000000", them: "#26252a", me: "#0a84ff", text: "#fff", meText: "#fff", header: "#1c1c1e", sub: "#8e8e93" },
  whatsapp: { bg: "#efe7de", them: "#ffffff", me: "#d9fdd3", text: "#111b21", meText: "#111b21", header: "#075e54", sub: "#667781" },
  sms: { bg: "#fafafa", them: "#ececf1", me: "#c2e7ff", text: "#1f1f1f", meText: "#1f1f1f", header: "#ffffff", sub: "#5f6368" },
  email: { bg: "#ffffff", them: "#ffffff", me: "#ffffff", text: "#202124", meText: "#202124", header: "#ffffff", sub: "#5f6368" },
  "telegram-dark": { bg: "#0e1621", them: "#182533", me: "#2b5278", text: "#f5f5f5", meText: "#f5f5f5", header: "#17212b", sub: "#7f91a4" },
};

function html(caseLines: { speaker: string; text: string }[], style: Style, font: number, filler: number, title: string) {
  const t = THEMES[style];
  const self = caseLines.find((l) => /^(Rose|Walter|Dad|Linda|Mom)$/i.test(l.speaker))?.speaker;
  const fill = Array.from({ length: filler }, (_, i) => ({ speaker: i % 2 ? "Me" : caseLines[0]!.speaker, text: FILLER[i % FILLER.length]! }));
  const all = [...fill, ...caseLines];
  const time = (i: number) => `${9 + Math.floor(i / 3)}:${String((i * 7) % 60).padStart(2, "0")} AM`;
  if (style === "email") {
    const body = caseLines.map((l) => `<p style="margin:0 0 14px">${esc(l.text)}</p>`).join("");
    return { all: caseLines, page: `<html><body style="margin:0;background:${t.bg};font:${font}px/1.45 -apple-system,Segoe UI,Roboto,sans-serif;color:${t.text}">
<div style="padding:18px 18px 8px;border-bottom:1px solid #e0e0e0"><div style="font-size:${font + 4}px;font-weight:600">${esc(title)}</div>
<div style="color:${t.sub};margin-top:6px">From: ${esc(caseLines[0]!.speaker)} · Today ${time(2)}</div></div>
<div style="padding:18px">${body}</div></body></html>` };
  }
  const bubbles = all
    .map((l, i) => {
      const mine = l.speaker === "Me" || l.speaker === self;
      return `<div style="display:flex;justify-content:${mine ? "flex-end" : "flex-start"};margin:6px 10px">
<div style="max-width:76%;background:${mine ? t.me : t.them};color:${mine ? t.meText : t.text};padding:8px 12px;border-radius:18px;box-shadow:${style === "whatsapp" ? "0 1px 0.5px rgba(0,0,0,.13)" : "none"}">
${!mine && style !== "imessage" && style !== "imessage-dark" ? `<div style="font-size:${font - 2}px;font-weight:600;color:${style === "whatsapp" ? "#1f7aec" : "#6ab3f3"};margin-bottom:2px">${esc(l.speaker)}</div>` : ""}
<div>${esc(l.text)}</div><div style="font-size:${font - 4}px;opacity:.6;text-align:right;margin-top:2px">${time(i)}</div></div></div>`;
    })
    .join("");
  const headerText = style === "whatsapp" ? "#fff" : t.text;
  return { all, page: `<html><body style="margin:0;background:${t.bg};font:${font}px/1.35 -apple-system,Segoe UI,Roboto,sans-serif">
<div style="background:${t.header};color:${headerText};padding:14px 16px;font-weight:600;font-size:${font + 1}px;border-bottom:1px solid rgba(127,127,127,.2)">${esc(caseLines.find((l) => l.speaker !== self)!.speaker)}<div style="font-weight:400;font-size:${font - 3}px;opacity:.7">${style.includes("imessage") ? "iMessage" : style === "sms" ? "Text message" : "online"}</div></div>
<div style="padding:8px 0 24px">${bubbles}</div></body></html>` };
}

const pool = [...CASES, ...HARD_CASES];
const browser = await puppeteer.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
const truth: Record<string, unknown>[] = [];
for (const p of PLAN) {
  const c = pool.find((x) => x.id === p.id)!;
  const { all, page: doc } = html(c.lines, p.style, p.font, p.filler, c.context.slice(0, 60));
  await page.setContent(doc, { waitUntil: "load" });
  const file = `${p.id}.png`;
  await page.screenshot({ path: join(OUT, file), fullPage: true });
  truth.push({ id: p.id, file, style: p.style, font_px: p.font, filler_lines: p.filler, label: c.label, context: c.context, lines: all, key_quotes: c.key_quotes, tactics: c.tactics });
}
await browser.close();
writeFileSync(join(OUT, "truth.json"), JSON.stringify(truth, null, 2) + "\n");
console.log(`rendered ${truth.length} screenshots to secondkey/spikes/s2/screens`);
