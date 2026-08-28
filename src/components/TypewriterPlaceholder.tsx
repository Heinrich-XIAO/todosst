"use client";

import { useEffect, useRef, useState } from "react";

export const PLACEHOLDER_PHRASES = [
  "/host hackathon/outreach write email template",
  "!cd host hackathon",
  "/side-quests finally learn how vim exits",
  "/taxes reconcile the horror spreadsheet",
  "/reading if anyone builds it, everyone dies ch. 3",
  "/groceries coffee beans (the good ones)",
  "!help",
];

export function TypewriterPlaceholder({ phrases, active }: { phrases: string[]; active: boolean }) {
  const [text, setText] = useState("");
  const phraseIdx = useRef(0);
  const charIdx = useRef(0);
  const deleting = useRef(false);

  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const phrase = phrases[phraseIdx.current % phrases.length];
      if (!deleting.current) {
        charIdx.current += 1;
        setText(phrase.slice(0, charIdx.current));
        if (charIdx.current >= phrase.length) {
          deleting.current = true;
          timer = setTimeout(tick, 1700);
        } else {
          timer = setTimeout(tick, 38 + Math.random() * 36);
        }
      } else {
        charIdx.current -= 1;
        setText(phrase.slice(0, charIdx.current));
        if (charIdx.current <= 0) {
          deleting.current = false;
          phraseIdx.current += 1;
          timer = setTimeout(tick, 420);
        } else {
          timer = setTimeout(tick, 24);
        }
      }
    };
    timer = setTimeout(tick, 350);
    return () => clearTimeout(timer);
  }, [active, phrases]);

  return <>{text}</>;
}
