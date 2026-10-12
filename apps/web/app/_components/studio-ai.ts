"use client";

// Browser half of the Studio agent: an AG Studio LLM adapter that sends each turn to this site's
// /api/studio-ai route (which holds the key and calls Haiku) and replays the result as Studio events.
import type { AgLlmAdapter, AgLlmRequest, AgLlmResponse } from "ag-studio";

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
  { label: "What is held right now?", prompt: "Which purchases are held for the shopper, and when does each auto-void?" },
];
