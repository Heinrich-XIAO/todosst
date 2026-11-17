import { v } from "convex/values";
import { action } from "./_generated/server";
import { requireUserId } from "./userScope";
import { assembleAiRecur, parseAiRecurAnswer } from "../src/lib/aiRecur";

// Reads a free-form recurring task ("journal every day", "I want to meditate
// every other morning") into {title, RRULE} via Hack Club AI (OpenAI-compatible
// proxy, https://docs.ai.hackclub.com). The model answers a fixed JSON shape;
// parseAiRecurAnswer validates it and assembleAiRecur builds the rule. Returns
// null when unconfigured, when the model hears no recurrence, or on any
// failure — the caller then creates the task exactly as typed.

const ENDPOINT = "https://ai.hackclub.com/proxy/v1/chat/completions";
const MODEL = "qwen/qwen3-32b";

const SYSTEM = `You turn a to-do list entry into a recurring task. Reply with ONLY a JSON object, no prose:
{"title": string, "freq": "none"|"daily"|"weekly"|"monthly"|"yearly", "interval": integer, "weekdays": ("MO"|"TU"|"WE"|"TH"|"FR"|"SA"|"SU")[]}
- title: the activity as a short task, lowercase unless a proper noun, with every schedule word removed ("I want to journal every day" -> "journal").
- freq: how often it repeats; "none" if the entry does not describe something repeating. Times of day ("every morning", "nightly") mean daily.
- interval: 1 normally, 2 for "every other", N for "every N".
- weekdays: only for weekly rules on specific days ("every weekday" -> MO..FR, "weekends" -> SA,SU); otherwise [].`;

export const parseRecurringTask = action({
  args: { text: v.string() },
  handler: async (ctx, { text }): Promise<{ title: string; recur: string } | null> => {
    await requireUserId(ctx);
    const key = process.env.HACKCLUB_AI_API_KEY;
    if (!key || text.length > 300) return null;
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0,
          max_tokens: 1024,
          messages: [
            { role: "system", content: SYSTEM },
            // "/no_think" turns off qwen3's reasoning preamble — this is a lookup, not a puzzle
            { role: "user", content: `${text} /no_think` },
          ],
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        console.error("parseRecurringTask: hack club ai", res.status, await res.text().catch(() => ""));
        return null;
      }
      const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const answer = parseAiRecurAnswer(body.choices?.[0]?.message?.content ?? "");
      return answer ? assembleAiRecur(answer) : null;
    } catch (err) {
      console.error("parseRecurringTask failed", err);
      return null;
    }
  },
});
