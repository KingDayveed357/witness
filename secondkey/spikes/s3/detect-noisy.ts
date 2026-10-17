// Does detection survive a noisy machine transcript? Runs the S1 detector on the offline recognizer's
// output for the synthetic call (single speaker label: diarisation is not available offline).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AnthropicProvider, DEFAULT_MODEL, UsageMeter } from "@witness/ai";
import { ROOT, loadDotEnv } from "@witness/config";
import { assess } from "../detector.ts";
loadDotEnv();
// source: "offline" (Windows System.Speech) or "ondevice" (Chrome on-device, start(track))
const source = process.argv[2] === "ondevice" ? "ondevice" : "offline";
const segs =
  source === "ondevice"
    ? ((JSON.parse(readFileSync(join(ROOT, "secondkey", "reports", "s3-chrome-ondevice.json"), "utf8")).start_with_track.finals as { text: string }[]).map((f) => ({ speaker: "Caller (machine transcript)", text: f.text.trim() })).filter((l) => l.text))
    : (JSON.parse(readFileSync(join(ROOT, "secondkey", "reports", "s3-local-recognizer.json"), "utf8").replace(/^﻿/, "")).segments as { text: string }[]).map((s) => ({ speaker: "Caller (machine transcript)", text: s.text }));
const meter = new UsageMeter({ maxCalls: 5, maxSpendUsd: 0.02 });
const a = await assess(new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY!, model: DEFAULT_MODEL, meter }), { context: "Rose, 78, is on a phone call asking her to send money. Transcript is automatic and may contain recognition errors.", lines: segs });
const out = { source, lines: segs.length, risk: a.risk, intervention: a.intervention, confidence: a.confidence, evidence: a.grounded.map((g) => `${g.tactic}: "${g.quote}"`), ungrounded: a.ungrounded_quotes, cost_usd: meter.summary().estimated_cost_usd };
writeFileSync(join(ROOT, "secondkey", "reports", source === "ondevice" ? "s3-detect-ondevice.json" : "s3-detect-noisy.json"), JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify(out, null, 2));
