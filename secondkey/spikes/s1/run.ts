// S1 runner: evaluates the manipulation detector on the synthetic set with live Haiku.
//   npx tsx secondkey/spikes/s1/run.ts [--tag v1] [--split all|dev|holdout] [--max-spend 0.25]
// Writes secondkey/reports/s1-<tag>.json and .md. Never prints secrets.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AnthropicProvider, DEFAULT_MODEL, UsageMeter } from "@witness/ai";
import { ROOT, loadDotEnv } from "@witness/config";
import { CASES, type Case } from "./cases.ts";
import { HARD_CASES } from "./hard-cases.ts";
import { MANIPULATION_V1, assess, type Assessment } from "../detector.ts";
import { PROMPTS_BY_TAG } from "./prompts.ts";

loadDotEnv();
const args = process.argv.slice(2);
const opt = (n: string, d: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1]! : d);
const tag = opt("tag", "v1");
const split = opt("split", "all");
const maxSpend = Number(opt("max-spend", "0.25"));
const prompt = PROMPTS_BY_TAG[tag] ?? MANIPULATION_V1;

if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
const meter = new UsageMeter({ maxCalls: 200, maxSpendUsd: maxSpend });
const ai = new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY, model: DEFAULT_MODEL, meter, maxRetries: 1, timeoutMs: 30_000 });

const set = opt("set", "base");
const pool = set === "hard" ? HARD_CASES : CASES;
const cases = pool.filter((c) => split === "all" || c.split === split);
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const overlaps = (a: string, b: string) => {
  const x = norm(a), y = norm(b);
  if (x.includes(y) || y.includes(x)) return true;
  const wa = new Set(x.split(/\W+/).filter((w) => w.length > 2)), wb = y.split(/\W+/).filter((w) => w.length > 2);
  const hit = wb.filter((w) => wa.has(w)).length;
  return wb.length > 0 && hit / wb.length >= 0.6;
};

const results: { c: Case; a: Assessment; ms: number }[] = [];
const queue = [...cases];
const t0 = Date.now();
await Promise.all(
  Array.from({ length: 3 }, async () => {
    for (;;) {
      const c = queue.shift();
      if (!c) return;
      const s = Date.now();
      const a = await assess(ai, { context: c.context, lines: c.lines }, prompt);
      results.push({ c, a, ms: Date.now() - s });
      process.stdout.write(".");
    }
  }),
);
process.stdout.write("\n");
results.sort((x, y) => cases.indexOf(x.c) - cases.indexOf(y.c));

// ---- metrics ----------------------------------------------------------------------------------
const wilson = (k: number, n: number) => {
  if (!n) return [0, 0];
  const z = 1.96, p = k / n, d = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / d, half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
};
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
function metrics(rs: typeof results) {
  const flagged = (r: (typeof results)[number]) => r.a.intervention !== "PROCEED";
  const tp = rs.filter((r) => r.c.label === "scam" && flagged(r)).length;
  const fn = rs.filter((r) => r.c.label === "scam" && !flagged(r)).length;
  const fp = rs.filter((r) => r.c.label === "benign" && flagged(r)).length;
  const tn = rs.filter((r) => r.c.label === "benign" && !flagged(r)).length;
  const strictTp = rs.filter((r) => r.c.label === "scam" && r.a.intervention === "HOLD_FOR_TRUSTED_CONTACT").length;
  const strictFp = rs.filter((r) => r.c.label === "benign" && r.a.intervention === "HOLD_FOR_TRUSTED_CONTACT").length;
  const scams = rs.filter((r) => r.c.label === "scam");
  let expT = 0, gotT = 0, expQ = 0, gotQ = 0, grounded = 0, ungrounded = 0, attrib = 0, attribN = 0;
  for (const r of rs) {
    grounded += r.a.grounded.length;
    ungrounded += r.a.ungrounded_quotes.length;
    for (const g of r.a.grounded) {
      attribN++;
      if (norm(g.model_speaker).startsWith(norm(g.speaker).split(" (")[0]!) || norm(g.speaker).startsWith(norm(g.model_speaker))) attrib++;
    }
  }
  for (const r of scams) {
    const found = new Set(r.a.grounded.map((g) => g.tactic));
    expT += r.c.tactics.length;
    gotT += r.c.tactics.filter((t) => found.has(t)).length;
    expQ += r.c.key_quotes.length;
    gotQ += r.c.key_quotes.filter((k) => r.a.grounded.some((g) => overlaps(g.quote, k))).length;
  }
  const recall = tp / Math.max(1, tp + fn), fpr = fp / Math.max(1, fp + tn), precision = tp / Math.max(1, tp + fp);
  return {
    n: rs.length, tp, fn, fp, tn,
    recall, recall_ci95: wilson(tp, tp + fn), fpr, fpr_ci95: wilson(fp, fp + tn), precision,
    strict_hold_recall: strictTp / Math.max(1, tp + fn), strict_hold_fpr: strictFp / Math.max(1, fp + tn),
    tactic_recall: gotT / Math.max(1, expT), key_quote_recall: gotQ / Math.max(1, expQ),
    quote_grounding_rate: grounded / Math.max(1, grounded + ungrounded), grounded, ungrounded,
    speaker_attribution: attrib / Math.max(1, attribN),
    failures: rs.filter((r) => !r.a.ok).map((r) => ({ id: r.c.id, failure: r.a.failure })),
  };
}
const all = metrics(results);
const bySplit = Object.fromEntries(["dev", "holdout"].map((s) => [s, metrics(results.filter((r) => r.c.split === s))]));
const byCategory = [...new Set(results.map((r) => r.c.category))].map((cat) => {
  const rs = results.filter((r) => r.c.category === cat);
  return { category: cat, label: rs[0]!.c.label, n: rs.length, flagged: rs.filter((r) => r.a.intervention !== "PROCEED").length, hold: rs.filter((r) => r.a.intervention === "HOLD_FOR_TRUSTED_CONTACT").length };
});
const cost = meter.summary();
const lat = results.map((r) => r.ms).sort((a, b) => a - b);
const q = (p: number) => lat[Math.min(lat.length - 1, Math.floor(p * lat.length))];

const report = {
  tag, prompt: `${prompt.id}@${prompt.version}`, model: DEFAULT_MODEL, split, generated_at: new Date().toISOString(), duration_s: Math.round((Date.now() - t0) / 1000),
  definition: "flagged = intervention is not PROCEED (HOLD_FOR_TRUSTED_CONTACT or VERIFY_BEFORE_PAYING). Strict = HOLD_FOR_TRUSTED_CONTACT only.",
  metrics: all, by_split: bySplit, by_category: byCategory,
  latency_ms: { p50: q(0.5), p95: q(0.95) }, cost,
  cases: results.map((r) => ({ id: r.c.id, category: r.c.category, label: r.c.label, split: r.c.split, risk: r.a.risk, intervention: r.a.intervention, confidence: r.a.confidence, tactics: r.a.grounded.map((g) => `${g.tactic}: "${g.quote}" (${g.speaker})`), ungrounded: r.a.ungrounded_quotes, expected_tactics: r.c.tactics, failure: r.a.failure ?? null, ms: r.ms })),
};
const dir = join(ROOT, "secondkey", "reports");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, `s1-${tag}${set === "hard" ? "-hard" : ""}.json`), JSON.stringify(report, null, 2) + "\n");

const m = all;
const errors = report.cases.filter((x) => (x.label === "scam") !== (x.intervention !== "PROCEED"));
const md = [
  `# S1 detection evaluation, ${report.prompt} (${tag}, ${set} set)`,
  "",
  `Model \`${DEFAULT_MODEL}\` · ${results.length} cases (${results.filter((r) => r.c.label === "scam").length} scam / ${results.filter((r) => r.c.label === "benign").length} benign) · ${report.generated_at} · ${report.definition}`,
  "",
  "| Metric | All | Dev | Holdout |",
  "|---|---|---|---|",
  `| Confusion (TP/FN/FP/TN) | ${m.tp}/${m.fn}/${m.fp}/${m.tn} | ${bySplit.dev!.tp}/${bySplit.dev!.fn}/${bySplit.dev!.fp}/${bySplit.dev!.tn} | ${bySplit.holdout!.tp}/${bySplit.holdout!.fn}/${bySplit.holdout!.fp}/${bySplit.holdout!.tn} |`,
  `| Scam recall | ${pct(m.recall)} (${m.tp}/${m.tp + m.fn}; 95% CI ${pct(m.recall_ci95[0]!)}–${pct(m.recall_ci95[1]!)}) | ${pct(bySplit.dev!.recall)} | ${pct(bySplit.holdout!.recall)} |`,
  `| False-positive rate (benign) | ${pct(m.fpr)} (${m.fp}/${m.fp + m.tn}; 95% CI ${pct(m.fpr_ci95[0]!)}–${pct(m.fpr_ci95[1]!)}) | ${pct(bySplit.dev!.fpr)} | ${pct(bySplit.holdout!.fpr)} |`,
  `| Precision | ${pct(m.precision)} | ${pct(bySplit.dev!.precision)} | ${pct(bySplit.holdout!.precision)} |`,
  `| Strict HOLD recall / FPR | ${pct(m.strict_hold_recall)} / ${pct(m.strict_hold_fpr)} | | |`,
  `| Tactic recall (scam cases) | ${pct(m.tactic_recall)} | | |`,
  `| Key-quote recall (scam cases) | ${pct(m.key_quote_recall)} | | |`,
  `| Quotes grounded in the source | ${pct(m.quote_grounding_rate)} (${m.grounded} kept, ${m.ungrounded} discarded) | | |`,
  `| Speaker attribution of kept quotes | ${pct(m.speaker_attribution)} | | |`,
  `| Model failures (all HOLD) | ${m.failures.length} | | |`,
  `| Latency p50 / p95 | ${report.latency_ms.p50} / ${report.latency_ms.p95} ms | | |`,
  `| Cost | $${cost.estimated_cost_usd.toFixed(4)} (${cost.requests} requests; tokens in ${cost.tokens.input}, out ${cost.tokens.output}, cache read ${cost.tokens.cache_read}, cache write ${cost.tokens.cache_write}) | | |`,
  "",
  "## By category",
  "",
  "| Category | Label | n | Flagged | Strict HOLD |",
  "|---|---|---|---|---|",
  ...byCategory.map((b) => `| ${b.category} | ${b.label} | ${b.n} | ${b.flagged} | ${b.hold} |`),
  "",
  "## Errors",
  "",
  ...(errors.length ? errors.map((e) => `- **${e.id}** (${e.label}, ${e.split}) → ${e.intervention}, risk ${e.risk}, confidence ${e.confidence}; tactics: ${e.tactics.join("; ") || "none"}`) : ["None."]),
  "",
].join("\n");
writeFileSync(join(dir, `s1-${tag}${set === "hard" ? "-hard" : ""}.md`), md);
console.log(md.split("\n").slice(0, 22).join("\n"));
