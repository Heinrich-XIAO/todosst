"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { daysLeft } from "../../../convex/loopLogic";

// One quiet line on the today screen: what the loop is waiting on. Hidden when
// there is nothing to say, so it never becomes another thing to clear.
export function LoopStrip({ nowTs, onOpen }: { nowTs: number; onOpen: () => void }) {
  const s = useQuery(api.loop.summary);
  if (!s) return null;
  const bits: string[] = [];
  if (s.inbox > 0) bits.push(`${s.inbox} to sort`);
  if (s.working > 0) bits.push(`${s.working} fix${s.working === 1 ? "" : "es"} in progress`);
  if (s.verifying > 0) {
    const d = s.nextVerifyUntil !== null ? daysLeft(s.nextVerifyUntil, nowTs) : null;
    bits.push(`${s.verifying} verifying${d !== null ? ` (${d}d left)` : ""}`);
  }
  if (bits.length === 0) return null;
  return (
    <button
      onClick={onOpen}
      className="w-full shrink-0 border-b border-foreground/10 bg-foreground/[0.06] px-3 py-1.5 text-left font-mono text-[11px] hover:bg-foreground/10"
    >
      loop · {bits.join(" · ")} →
    </button>
  );
}
