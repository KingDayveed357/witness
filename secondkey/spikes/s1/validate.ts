// Dataset sanity checks (no model calls): ids unique, key quotes verbatim, balance per split.
import { CASES as BASE } from "./cases.ts";
import { HARD_CASES } from "./hard-cases.ts";
const CASES = [...BASE, ...HARD_CASES];
import { locate } from "../detector.ts";
const problems: string[] = [];
const ids = new Set<string>();
for (const c of CASES) {
  if (ids.has(c.id)) problems.push(`duplicate id ${c.id}`);
  ids.add(c.id);
  for (const q of c.key_quotes) if (locate(c, q) < 0) problems.push(`${c.id}: key quote not found verbatim: ${q}`);
  if (c.label === "scam" && (!c.tactics.length || !c.key_quotes.length)) problems.push(`${c.id}: scam without tactics/quotes`);
  if (c.label === "benign" && (c.tactics.length || c.key_quotes.length)) problems.push(`${c.id}: benign with tactics`);
}
const count = (f: (c: (typeof CASES)[number]) => boolean) => CASES.filter(f).length;
console.log(JSON.stringify({ total: CASES.length, scam: count((c) => c.label === "scam"), benign: count((c) => c.label === "benign"), dev_scam: count((c) => c.split === "dev" && c.label === "scam"), dev_benign: count((c) => c.split === "dev" && c.label === "benign"), holdout_scam: count((c) => c.split === "holdout" && c.label === "scam"), holdout_benign: count((c) => c.split === "holdout" && c.label === "benign"), key_quotes: CASES.reduce((s, c) => s + c.key_quotes.length, 0) }));
console.log(problems.length ? problems.join("\n") : "dataset OK");
process.exit(problems.length ? 1 : 0);
