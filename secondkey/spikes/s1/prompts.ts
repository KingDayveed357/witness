// Prompt versions evaluated in S1. v1 is the baseline; any revision is added here with the hypothesis
// that motivated it, and is judged on the holdout split it was not tuned on.
import type { PromptDef } from "@witness/ai";
import { MANIPULATION_V1 } from "../detector.ts";

export const PROMPTS_BY_TAG: Record<string, PromptDef> = {
  v1: MANIPULATION_V1,
};
