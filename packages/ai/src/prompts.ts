// Versioned prompts live as Markdown files in packages/ai/prompts/<id>.<version>.md so they can be
// reviewed and diffed like code. Every AI check records the prompt id@version that produced it.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PromptDef } from "./llm.ts";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "prompts");

export function loadPrompt(file: string): PromptDef {
  const raw = readFileSync(join(DIR, file), "utf8").replace(/\r\n/g, "\n");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`prompt ${file} has no front-matter`);
  const meta = Object.fromEntries(m[1]!.split("\n").map((l) => l.split(":").map((s) => s.trim()) as [string, string]));
  if (!meta.id || !meta.version) throw new Error(`prompt ${file} needs id and version`);
  return { id: meta.id, version: meta.version, system: m[2]!.trim() };
}

export const PROMPTS = {
  intent: loadPrompt("intent.v1.md"),
  injection: loadPrompt("injection.v1.md"),
  semantic: loadPrompt("semantic.v1.md"),
  evidence: loadPrompt("evidence.v1.md"),
} as const;
