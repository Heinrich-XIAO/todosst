"use client";

// Help panel for the command input. Rows are generated from the GRAMMAR
// registry (src/lib/grammar.ts), so this panel can never drift from what the
// input actually parses.

import { useEffect } from "react";
import { GRAMMAR, type CommandEntry, type GrammarDoc, type ModifierEntry, type SyntaxEntry } from "@/lib/grammar";

function DocRows({ docs }: { docs: GrammarDoc[] }) {
  return docs.map((doc) => (
    <div key={doc.example} className="flex flex-col gap-0.5 px-3 py-1.5 sm:flex-row sm:items-baseline sm:gap-3">
      <code className="shrink-0 text-xs">{doc.example}</code>
      <span className="text-xs opacity-60">{doc.note}</span>
    </div>
  ));
}

export function HelpPanel({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sections: { label: string; entries: (SyntaxEntry | CommandEntry | ModifierEntry)[] }[] = [
    { label: "create", entries: GRAMMAR.filter((g): g is SyntaxEntry => g.kind === "syntax") },
    { label: "commands", entries: GRAMMAR.filter((g): g is CommandEntry => g.kind === "command") },
    { label: "modifiers", entries: GRAMMAR.filter((g): g is ModifierEntry => g.kind === "modifier") },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-background/80 p-4" onClick={onClose}>
      <div
        className="mt-16 w-full max-w-lg border border-foreground bg-background shadow-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-foreground px-3 py-2">
          <span className="text-[10px] uppercase opacity-40">input grammar</span>
          <button onClick={onClose} className="text-xs underline underline-offset-4 hover:opacity-60">
            close
          </button>
        </div>
        {sections.map((section) => (
          <div key={section.label} className="border-b border-foreground/10 py-1 last:border-b-0">
            <div className="px-3 pt-1 text-[10px] uppercase opacity-40">{section.label}</div>
            {section.entries.map((entry) => (
              <DocRows key={entry.kind === "command" ? entry.name : entry.id} docs={entry.docs} />
            ))}
          </div>
        ))}
        <div className="px-3 py-2 text-[10px] opacity-40">esc to close</div>
      </div>
    </div>
  );
}
