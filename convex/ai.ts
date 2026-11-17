import Anthropic from "@anthropic-ai/sdk";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { requireUserId } from "./userScope";
import { AI_FREQS, AI_WEEKDAYS, assembleAiRecur, type AiRecurAnswer } from "../src/lib/aiRecur";

// Reads a free-form recurring task ("journal every day", "I want to meditate
// every other morning") into {title, RRULE}. The model answers a fixed schema;
// assembleAiRecur builds the rule. Returns null when unconfigured, when the
// model hears no recurrence, or on any failure — the caller then creates the
// task exactly as typed.

const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "the task itself, short, without any schedule words" },
    freq: { type: "string", enum: [...AI_FREQS] },
    interval: { type: "integer", description: "1 = every period, 2 = every other period, ..." },
    weekdays: { type: "array", items: { type: "string", enum: [...AI_WEEKDAYS] } },
  },
  required: ["title", "freq", "interval", "weekdays"],
  additionalProperties: false,
} as const;

const SYSTEM = `You turn a to-do list entry into a recurring task.
- title: the activity as a short imperative task, lowercase unless a proper noun, with every schedule word removed ("I want to journal every day" -> "journal").
- freq: how often it repeats. "none" if the entry does not describe something repeating.
- interval: 1 normally, 2 for "every other", N for "every N".
- weekdays: only for weekly rules on specific days ("every weekday" -> MO..FR, "weekends" -> SA,SU); otherwise [].
Times of day ("every morning", "nightly") mean daily.`;

export const parseRecurringTask = action({
  args: { text: v.string() },
  handler: async (ctx, { text }): Promise<{ title: string; recur: string } | null> => {
    await requireUserId(ctx);
    if (!process.env.ANTHROPIC_API_KEY || text.length > 300) return null;
    try {
      const client = new Anthropic({ timeout: 15_000, maxRetries: 1 });
      const res = await client.beta.messages.create({
        model: "claude-opus-5-5",
        max_tokens: 1024,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
        system: SYSTEM,
        messages: [{ role: "user", content: text }],
      });
      if (res.stop_reason !== "end_turn") return null;
      const block = res.content.find((b) => b.type === "text");
      if (!block || block.type !== "text") return null;
      return assembleAiRecur(JSON.parse(block.text) as AiRecurAnswer);
    } catch (err) {
      console.error("parseRecurringTask failed", err);
      return null;
    }
  },
});
