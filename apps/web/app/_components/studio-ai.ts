"use client";

// Browser half of the Studio agent: an AG Studio LLM adapter that sends each turn to this site's
// /api/studio-ai route (which holds the key and calls Haiku) and replays the result as Studio events.
import { createAiHarness, directLlmRunner, type AgLlmAdapter, type AgLlmRequest, type AgLlmResponse } from "ag-studio";

export function witnessAdapter(): AgLlmAdapter {
  return {
    executeTurn(request: AgLlmRequest, options) {
      const complete: Promise<AgLlmResponse> = fetch("/api/studio-ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: request.input, instructions: request.instructions, tools: request.tools, toolChoice: request.toolChoice, responseFormat: request.responseFormat }),
        ...(options?.signal ? { signal: options.signal } : {}),
      }).then(async (r) => {
        const body = await r.json().catch(() => null);
        if (!r.ok) {
          return { id: `err_${Date.now()}`, createdAt: Math.floor(Date.now() / 1000), status: "failed", output: [], error: { code: String(r.status), message: body?.detail ?? body?.title ?? "Studio agent unavailable" } } as AgLlmResponse;
        }
        return body as AgLlmResponse;
      });
      async function* events() {
        const res = await complete;
        if (res.error) {
          yield { type: "RUN_ERROR" as const, message: res.error.message, code: res.error.code };
          return;
        }
        for (const item of res.output as any[]) {
          if (item.type === "message") {
            const text = (item.content ?? []).map((c: any) => c.text ?? "").join("");
            yield { type: "TEXT_MESSAGE_START" as const, messageId: item.id, role: "assistant" as const };
            if (text) yield { type: "TEXT_MESSAGE_CONTENT" as const, messageId: item.id, delta: text };
            yield { type: "TEXT_MESSAGE_END" as const, messageId: item.id };
          } else if (item.type === "function_call") {
            yield { type: "TOOL_CALL_START" as const, toolCallId: item.callId, toolCallName: item.name };
            yield { type: "TOOL_CALL_ARGS" as const, toolCallId: item.callId, delta: item.arguments };
            yield { type: "TOOL_CALL_END" as const, toolCallId: item.callId };
          }
        }
      }
      return { stream: { [Symbol.asyncIterator]: () => events() }, complete };
    },
  };
}

export const PROMPT_STARTERS = [
  { label: "Blocked value by reason", prompt: "Build a widget showing the total value blocked, by reason, from the blocked data source." },
  { label: "Decisions by state", prompt: "Show how many purchases ended in each state, as a chart." },
  { label: "Why were purchases blocked?", prompt: "Which checks blocked the most value, and how much did each block?" },
  { label: "What is held right now?", prompt: "Which purchases are held for the shopper, and when does each auto-void?" },
];

// ---- custom agents on top of Studio's built-in ones (Studio Agent Framework) ------------------
// A Witness lead fronts the chat. It delegates questions about payment decisions to a Witness
// analyst (a custom agent that queries the ledger and knows what Witness's checks mean), and
// delegates building or editing widgets to Studio's built-in page, widget, data and planning agents.
// Every agent runs on Haiku through the same server route.

const WITNESS_CONTEXT = `Witness screens AI shopping agents' carts before PayPal moves money. Data sources:
- ledger: one row per purchase. state is CAPTURED (paid), REJECTED (blocked before PayPal), VOIDED (authorization released), HELD (waiting for the shopper) or in progress. amount is USD. reason is the first check that did not pass.
- holds: purchases waiting for the shopper, with the time Witness auto-voids them.
- blocked: value and count of rejected or voided purchases by reason.
"Blocked value" means REJECTED plus VOIDED amounts. Witness never captures without a consumed single-use approval. You only read this data; you cannot approve, capture, void or change anything.`;


export const witnessHarness = ({ api }: { api: any }) =>
  createAiHarness(api, ({ tools, builtIn }: any) => {
    const adapter = witnessAdapter();
    const builtins = (["data", "page", "widget", "planning"] as const).map((id) => directLlmRunner({ ...builtIn[id], adapter }));
    const analyst = directLlmRunner({
      id: "witness-analyst",
      name: "Witness analyst",
      adapter,
      description: "Answers questions about Witness payment decisions from the ledger: why purchases were rejected, held or voided, how much value each check blocked, and what is waiting for shoppers. Use for any question about decisions, reasons or amounts.",
      schema: builtIn.data.schema,
      instructions: () => `${WITNESS_CONTEXT}\nAnswer with numbers from queries, in two to four short sentences. Name the check (for example colour, size, market price, prompt injection, PayPal order match) in plain words.`,
      tools: () => [tools.studio.viewSchema(), tools.studio.executeQuery()],
    } as any);
    const lead = directLlmRunner({
      id: "witness-lead",
      name: "Witness",
      adapter,
      description: "Front agent for the Witness ops console.",
      schema: (s: any) => s.undefined(),
      instructions: () =>
        `${WITNESS_CONTEXT}\nYou coordinate. Delegate questions about decisions, reasons or amounts to witness-analyst. Delegate creating or changing widgets and pages to the page agent (it adds widgets) and the widget agent (it configures them). Keep replies short.`,
      tools: () => [tools.studio.viewSchema(), tools.delegateTo(["witness-analyst", "page", "widget", "data", "planning"])],
    } as any);
    return { agents: [lead, analyst, ...builtins], primary: "witness-lead", promptStarters: PROMPT_STARTERS };
  });
