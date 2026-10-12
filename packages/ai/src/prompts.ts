// Versioned prompts live as Markdown files in packages/ai/prompts/<id>.<version>.md so they can be
// reviewed and diffed like code. Front-matter: id, version, max_tokens (output cap; thinking counts
// toward it). Every AI check records the prompt id@version that produced it.
//
// Structure (v2+): stable security rules, rubric and worked examples in the system prompt (cacheable,
// identical for every request); all purchase-specific and untrusted text goes in the user turn.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PromptDef } from "./llm.ts";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "prompts");

export function loadPrompt(file: string): PromptDef {
  const raw = readFileSync(join(DIR, file), "utf8").replace(/\r\n/g, "\n");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`prompt ${file} has no front-matter`);
  const meta = Object.fromEntries(
    m[1]!.split("\n").map((l) => {
      const i = l.indexOf(":");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
  );
  const maxTokens = Number(meta.max_tokens);
  if (!meta.id || !meta.version || !Number.isInteger(maxTokens) || maxTokens < 256) throw new Error(`prompt ${file} needs id, version and max_tokens >= 256`);
  return { id: meta.id, version: meta.version, system: m[2]!.trim(), maxTokens };
}

export const PROMPTS = {
  intent: loadPrompt("intent.v1.md"),
  injection: loadPrompt("injection.v2.md"),
  semantic: loadPrompt("semantic.v3.md"),
  evidence: loadPrompt("evidence.v1.md"),
} as const;
