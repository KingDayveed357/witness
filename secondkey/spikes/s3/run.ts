// S3: can the browser transcribe the synthetic demo call? Tests Microsoft Edge's Web Speech API
// (webkitSpeechRecognition) on the exact demo audio:
//   T1 audio fed as the microphone (Chromium's fake capture device plays call.wav into getUserMedia)
//   T2 SpeechRecognition.start(MediaStreamTrack) from the decoded file (newer API; may be unsupported)
//   T3 microphone permission denied
// Measures time to first words, time to the full transcript, and word error rate vs the script.
//   npx tsx secondkey/spikes/s3/run.ts
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { ROOT } from "@witness/config";

const EDGE = process.env.EDGE_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const DIR = join(ROOT, "secondkey", "spikes", "s3");
const WAV = join(DIR, "call.wav");
const script = JSON.parse(readFileSync(join(DIR, "call-script.json"), "utf8").replace(/^\uFEFF/, "")) as { speaker: string; text: string }[];
const reference = script.map((l) => l.text).join(" ");

const PAGE = `<!doctype html><html><body><script>
window.runRecognition = (ms, useTrack) => new Promise(async (resolve) => {
  const R = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!R) return resolve({ supported: false });
  const out = { supported: true, finals: [], interims: 0, first_word_ms: null, last_final_ms: null, errors: [], track_mode: useTrack };
  const r = new R(); r.lang = "en-US"; r.continuous = true; r.interimResults = true;
  const t0 = performance.now();
  r.onresult = (e) => { for (let i = e.resultIndex; i < e.results.length; i++) { const res = e.results[i]; const ms = Math.round(performance.now() - t0);
    if (out.first_word_ms === null) out.first_word_ms = ms;
    if (res.isFinal) { out.finals.push({ ms, text: res[0].transcript, confidence: res[0].confidence }); out.last_final_ms = ms; } else out.interims++; } };
  r.onerror = (e) => out.errors.push(e.error);
  r.onend = () => out.ended_ms = Math.round(performance.now() - t0);
  try {
    if (useTrack) {
      const buf = await (await fetch("/call.wav")).arrayBuffer();
      const ctx = new AudioContext(); const audio = await ctx.decodeAudioData(buf);
      const src = ctx.createBufferSource(); src.buffer = audio; const dest = ctx.createMediaStreamDestination(); src.connect(dest);
      const track = dest.stream.getAudioTracks()[0];
      try { r.start(track); out.start_with_track = "accepted"; } catch (err) { out.start_with_track = "threw: " + err.message; return resolve(out); }
      src.start();
    } else {
      r.start();
    }
  } catch (err) { out.errors.push("start: " + err.message); return resolve(out); }
  setTimeout(() => { try { r.stop(); } catch {} setTimeout(() => resolve(out), 2500); }, ms);
});
</script></body></html>`;

const server = createServer((req, res) => {
  if (req.url === "/call.wav") return res.writeHead(200, { "content-type": "audio/wav" }).end(readFileSync(WAV));
  res.writeHead(200, { "content-type": "text/html" }).end(PAGE);
}).listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;

const words = (s: string) => s.toLowerCase().replace(/\$1,800|1800|\$1800/g, "eighteen hundred dollars").replace(/[^a-z' ]+/g, " ").split(/\s+/).filter(Boolean);
function wer(ref: string, hyp: string) {
  const r = words(ref), h = words(hyp);
  const d = Array.from({ length: r.length + 1 }, (_, i) => [i, ...Array(h.length).fill(0)]);
  for (let j = 1; j <= h.length; j++) d[0]![j] = j;
  for (let i = 1; i <= r.length; i++) for (let j = 1; j <= h.length; j++) d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (r[i - 1] === h[j - 1] ? 0 : 1));
  return { wer: d[r.length]![h.length]! / r.length, ref_words: r.length, hyp_words: h.length };
}

const results: Record<string, unknown> = { browser: null, audio: { file: "secondkey/spikes/s3/call.wav", seconds: 29.7, synthetic: true } };
async function run(name: string, flags: string[], useTrack: boolean, headless: boolean) {
  const browser = await puppeteer.launch({ executablePath: EDGE, headless, args: ["--autoplay-policy=no-user-gesture-required", ...flags] });
  results.browser = await browser.version();
  const page = await browser.newPage();
  await page.goto(url);
  const out = (await page.evaluate((ms, t) => (window as any).runRecognition(ms, t), 36_000, useTrack)) as any;
  await browser.close();
  const text = (out.finals ?? []).map((f: any) => f.text).join(" ");
  results[name] = { ...out, transcript: text, ...(text ? wer(reference, text) : {}) };
  console.log(name, JSON.stringify({ supported: out.supported, errors: out.errors, first_word_ms: out.first_word_ms, last_final_ms: out.last_final_ms, finals: out.finals?.length, start_with_track: out.start_with_track, wer: text ? wer(reference, text).wer.toFixed(3) : null }));
}

const fake = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${WAV.replace(/\\/g, "/")}%noloop`];
await run("T1_fake_microphone_headful", fake, false, false);
await run("T2_start_with_track_headful", ["--use-fake-ui-for-media-stream"], true, false);
await run("T3_permission_denied", ["--deny-permission-prompts"], false, false);
server.close();
mkdirSync(join(ROOT, "secondkey", "reports"), { recursive: true });
writeFileSync(join(ROOT, "secondkey", "reports", "s3-transcription.json"), JSON.stringify({ ran_at: new Date().toISOString(), reference, ...results }, null, 2) + "\n");
console.log("written secondkey/reports/s3-transcription.json");
