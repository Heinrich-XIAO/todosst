"use client";

import type { ReactNode } from "react";

// Small shared pieces for the loop screens. They follow the rest of the app:
// black/white, mono, hairline borders, no color — state is carried by text.

export function Btn({
  children,
  onClick,
  disabled,
  solid,
  title,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  solid?: boolean;
  title?: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`border border-foreground px-2.5 py-1 font-mono text-xs disabled:opacity-30 ${
        solid ? "bg-foreground text-background hover:opacity-90" : "hover:bg-foreground hover:text-background"
      }`}
    >
      {children}
    </button>
  );
}

export function Chip({ children, on, onClick }: { children: ReactNode; on?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap px-2 py-0.5 font-mono text-[11px] ${
        on ? "border border-foreground bg-foreground text-background" : "border border-foreground/30 opacity-70 hover:opacity-100"
      }`}
    >
      {children}
    </button>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  return <span className="border border-foreground/30 px-1.5 py-px font-mono text-[10px] opacity-70">{children}</span>;
}

export function Label({ children }: { children: ReactNode }) {
  return <p className="px-3 pb-1 pt-3 font-mono text-[10px] uppercase tracking-wide opacity-40">{children}</p>;
}

/** Tiny weekly bar chart: height = count, the newest week is rightmost. */
export function Bars({ values, label }: { values: number[]; label?: string }) {
  const max = Math.max(1, ...values);
  return (
    <span className="inline-flex h-4 items-end gap-px" role="img" aria-label={label ?? "weekly occurrences"}>
      {values.map((n, i) => (
        <span
          key={i}
          className="w-1.5 bg-foreground"
          style={{ height: `${n === 0 ? 1 : Math.max(3, Math.round((n / max) * 16))}px`, opacity: n === 0 ? 0.2 : 1 }}
        />
      ))}
    </span>
  );
}

export const inputCls =
  "w-full border border-foreground/40 bg-transparent px-2 py-1.5 font-mono text-xs placeholder:text-foreground/40 focus:border-foreground focus:outline-none";
