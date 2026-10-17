// S3/Milestone D: why did browser speech recognition fail under automation? Launches the installed
// Chrome with an ISOLATED temporary profile (never the user's), feeds call.wav as the microphone and
// records every event, including the error type and message. Reuses the page from run.ts.
//   npx tsx secondkey/spikes/s3/chrome-probe.ts
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { ROOT } from "@witness/config";

const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const DIR = join(ROOT, "secondkey", "spikes", "s3");
const WAV = (process.env.SK_WAV ?? join(DIR, "call.wav")).replace(/\\/g, "/");
const PAGE = `<!doctype html><html><body><script>
window.probe = (ms) => new Promise(async (resolve) => {
  const R = window.SpeechRecognition || window.webkitSpeechRecognition;
  const out = { supported: !!R, events: [], finals: [], first_word_ms: null };
  if (!R) return resolve(out);
  try { out.on_device = R.available ? await R.available({ langs: ["en-US"], processLocally: true }) : "api-absent"; } catch (e) { out.on_device = "threw:" + e.message; }
  const r = new R(); r.lang = "en-US"; r.continuous = true; r.interimResults = true;
  const t0 = performance.now(); const at = () => Math.round(performance.now() - t0);
  for (const ev of ["start","audiostart","soundstart","speechstart","speechend","soundend","audioend","end","nomatch"]) r.addEventListener(ev, () => out.events.push(ev + "@" + at()));
  r.onresult = (e) => { for (let i = e.resultIndex; i < e.results.length; i++) { if (out.first_word_ms === null) out.first_word_ms = at(); if (e.results[i].isFinal) out.finals.push(e.results[i][0].transcript); } };
  r.onerror = (e) => out.events.push("error:" + e.error + ":" + (e.message || "") + "@" + at());
  try { r.start(); } catch (err) { out.events.push("start-threw:" + err.message); return resolve(out); }
  setTimeout(() => { try { r.stop(); } catch {} setTimeout(() => resolve(out), 2500); }, ms);
});
</script></body></html>`;
const server = createServer((_q, res) => res.writeHead(200, { "content-type": "text/html" }).end(PAGE)).listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;

const results: Record<string, unknown> = {};
for (const [name, flags] of [
  ["fake_mic_file", ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${WAV}%noloop`]],
  ["fake_mic_file_no_automation_flag", ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${WAV}%noloop`, "--disable-blink-features=AutomationControlled"]],
] as const) {
  const profile = mkdtempSync(join(tmpdir(), "sk-chrome-"));
  try {
    const browser = await puppeteer.launch({ executablePath: CHROME, headless: false, userDataDir: profile, ignoreDefaultArgs: ["--enable-automation"], args: ["--autoplay-policy=no-user-gesture-required", "--no-first-run", "--no-default-browser-check", ...flags] });
    const version = await browser.version();
    const page = await browser.newPage();
    const consoleErrors: string[] = [];
    page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 200)));
    await page.goto(url);
    const out = await page.evaluate((ms) => (window as any).probe(ms), 36_000);
    await browser.close();
    results[name] = { version, ...out, transcript: (out.finals ?? []).join(" "), consoleErrors };
  } catch (e) {
    results[name] = { error: (e as Error).message.slice(0, 300) };
  }
  console.log(name, JSON.stringify(results[name]).slice(0, 600));
}
server.close();
writeFileSync(join(ROOT, "secondkey", "reports", process.env.SK_WAV ? "s3-chrome-probe-48k.json" : "s3-chrome-probe.json"), JSON.stringify({ ran_at: new Date().toISOString(), wav: process.env.SK_WAV ? "48 kHz stereo re-render of the same synthetic script" : "call.wav (16 kHz mono)", note: "isolated temporary Chrome profile; synthetic disclosed audio as fake microphone", results }, null, 2) + "\n");
