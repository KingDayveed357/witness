// S3/Milestone D: Chrome's ON-DEVICE speech recognition on the disclosed synthetic call. Uses an
// ISOLATED temporary Chrome profile. Installing the en-US language pack was approved by the user
// (Chrome downloads it from Google). The call audio is fed as the microphone (fake capture device).
//   npx tsx secondkey/spikes/s3/ondevice-probe.ts
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { ROOT } from "@witness/config";

const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const DIR = join(ROOT, "secondkey", "spikes", "s3");
const WAV = join(DIR, "call.wav").replace(/\\/g, "/");
const script = JSON.parse(readFileSync(join(DIR, "call-script.json"), "utf8").replace(/^\uFEFF/, "")) as { text: string }[];
const PAGE = `<!doctype html><html><body><button id="install">install</button><script>
const R = window.SpeechRecognition || window.webkitSpeechRecognition;
window.installResult = null;
document.getElementById("install").onclick = async () => {
  try { window.installResult = String(await R.install({ langs: ["en-US"], processLocally: true })); } catch (e) { window.installResult = "threw:" + e.message; }
};
window.availability = async () => { try { return await R.available({ langs: ["en-US"], processLocally: true }); } catch (e) { return "threw:" + e.message; } };
window.probe = (ms, useTrack) => new Promise(async (resolve) => {
  const out = { events: [], finals: [], first_word_ms: null, last_final_ms: null };
  const r = new R(); r.lang = "en-US"; r.continuous = true; r.interimResults = true; r.processLocally = true;
  const t0 = performance.now(); const at = () => Math.round(performance.now() - t0);
  for (const ev of ["start","audiostart","speechstart","speechend","audioend","end"]) r.addEventListener(ev, () => out.events.push(ev + "@" + at()));
  r.onresult = (e) => { for (let i = e.resultIndex; i < e.results.length; i++) { if (out.first_word_ms === null) out.first_word_ms = at(); if (e.results[i].isFinal) { out.finals.push({ ms: at(), text: e.results[i][0].transcript }); out.last_final_ms = at(); } } };
  r.onerror = (e) => out.events.push("error:" + e.error + ":" + (e.message || "") + "@" + at());
  try {
    if (useTrack) {
      const buf = await (await fetch("/call.wav")).arrayBuffer();
      const ctx = new AudioContext(); const audio = await ctx.decodeAudioData(buf);
      const src = ctx.createBufferSource(); src.buffer = audio; const dest = ctx.createMediaStreamDestination(); src.connect(dest);
      r.start(dest.stream.getAudioTracks()[0]); out.events.push("start(track)-accepted"); src.start();
    } else r.start();
  } catch (err) { out.events.push("start-threw:" + err.message); return resolve(out); }
  setTimeout(() => { try { r.stop(); } catch {} setTimeout(() => resolve(out), 3000); }, ms);
});
</script></body></html>`;
const server = createServer((q, res) => (q.url === "/call.wav" ? res.writeHead(200, { "content-type": "audio/wav" }).end(readFileSync(join(DIR, "call.wav"))) : res.writeHead(200, { "content-type": "text/html" }).end(PAGE))).listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;

const words = (s: string) => s.toLowerCase().replace(/\$?1,?800|eighteen hundred( dollars)?/g, " eighteenhundred ").replace(/[^a-z' ]+/g, " ").split(/\s+/).filter(Boolean);
function wer(ref: string, hyp: string) {
  const r = words(ref), h = words(hyp);
  const d = Array.from({ length: r.length + 1 }, (_, i) => [i, ...Array(h.length).fill(0)]);
  for (let j = 1; j <= h.length; j++) d[0]![j] = j;
  for (let i = 1; i <= r.length; i++) for (let j = 1; j <= h.length; j++) d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (r[i - 1] === h[j - 1] ? 0 : 1));
  return Number((d[r.length]![h.length]! / r.length).toFixed(3));
}

const profile = mkdtempSync(join(tmpdir(), "sk-chrome-ondevice-"));
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: false,
  userDataDir: profile,
  ignoreDefaultArgs: ["--enable-automation"],
  args: ["--autoplay-policy=no-user-gesture-required", "--no-first-run", "--no-default-browser-check", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${WAV}%noloop`],
});
const out: Record<string, unknown> = { version: await browser.version() };
const page = await browser.newPage();
await page.goto(url);
out.before = await page.evaluate(() => (window as any).availability());
await page.click("#install"); // a real click, so install() has a user gesture
const t0 = Date.now();
let avail = out.before;
while (Date.now() - t0 < 180_000) {
  await new Promise((r) => setTimeout(r, 3000));
  avail = await page.evaluate(() => (window as any).availability());
  const ir = await page.evaluate(() => (window as any).installResult);
  if (avail === "available" || (ir && ir !== "true" && ir !== "null")) break;
}
out.install_result = await page.evaluate(() => (window as any).installResult);
out.after = avail;
out.install_seconds = Math.round((Date.now() - t0) / 1000);
if (avail === "available") {
  // fresh page so the fake microphone starts the file from the beginning
  const reference = script.map((l) => l.text).join(" ");
  const critical = ["bail", "right now", "don't tell", "promise you won't tell", "eighteen hundred"];
  for (const [name, useTrack] of [["fake_microphone", false], ["start_with_track", true]] as const) {
    const p2 = await browser.newPage(); // fresh page so the fake microphone starts the file from the beginning
    await p2.goto(url);
    const r = (await p2.evaluate((ms, t) => (window as any).probe(ms, t), 36_000, useTrack)) as any;
    await p2.close();
    const transcript = r.finals.map((f: any) => f.text).join(" ");
    out[name] = { ...r, transcript, wer: transcript ? wer(reference, transcript) : null, critical_phrases_found: critical.filter((c) => transcript.toLowerCase().includes(c) || (c === "eighteen hundred" && /1,?800|eighteen hundred/i.test(transcript))) };
    console.log(name, JSON.stringify(out[name]).slice(0, 900));
  }
}
await browser.close();
server.close();
writeFileSync(join(ROOT, "secondkey", "reports", "s3-chrome-ondevice.json"), JSON.stringify({ ran_at: new Date().toISOString(), note: "isolated temporary Chrome profile; on-device recognition; synthetic disclosed audio as fake microphone", ...out }, null, 2) + "\n");
console.log(JSON.stringify(out).slice(0, 1500));
