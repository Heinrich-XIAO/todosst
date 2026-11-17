import { ConvexError, v } from "convex/values";
import { action } from "./_generated/server";
import { requireUserId } from "./userScope";
import { SYSTEM_PROMPT, TOOLS, type ChatMessage } from "./agentSpec";

// One model turn. The browser drives the loop: it sends the conversation,
// runs whatever tools the model calls against its draft, and calls again.
// Hack Club AI is an OpenAI-compatible proxy (https://docs.ai.hackclub.com).

const ENDPOINT = "https://ai.hackclub.com/proxy/v1/chat/completions";
const MODEL = "anthropic/claude-opus-5.5";
const MAX_BODY = 600_000;

export const step = action({
  args: { messages: v.array(v.any()) },
  handler: async (ctx, { messages }): Promise<ChatMessage & { role: "assistant" }> => {
    await requireUserId(ctx);
    const key = process.env.HACKCLUB_AI_API_KEY;
    if (!key) throw new ConvexError("The agent is not configured (HACKCLUB_AI_API_KEY is missing).");
    const body = JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      tools: TOOLS,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...(messages as ChatMessage[])],
    });
    if (body.length > MAX_BODY) throw new ConvexError("This conversation is too long. Start a new one.");
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body,
      signal: AbortSignal.timeout(240_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("agent step failed", res.status, detail.slice(0, 2000));
      throw new ConvexError(`The model call failed (${res.status}). Try again.`);
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string | null; tool_calls?: unknown[] } }[] };
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new ConvexError("The model returned nothing. Try again.");
    return {
      role: "assistant",
      content: msg.content ?? null,
      tool_calls: Array.isArray(msg.tool_calls) && msg.tool_calls.length ? (msg.tool_calls as never) : undefined,
    };
  },
});
