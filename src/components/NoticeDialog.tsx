"use client";

import { useEffect } from "react";

// In-app replacement for window.alert(): a minimal modal notice styled like
// the delete confirmation. Esc or clicking the backdrop dismisses it.
export function NoticeDialog({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4"
      onClick={onClose}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="notice-message"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] border border-foreground bg-background p-6"
      >
        <p className="font-mono text-[11px] opacity-40">root@vault:~$</p>
        <p id="notice-message" className="mt-1 font-mono text-sm leading-relaxed break-words">
          {message}
        </p>
        <div className="mt-6 flex justify-end font-mono text-xs">
          <button
            autoFocus
            onClick={onClose}
            className="border border-foreground bg-foreground px-4 py-2 text-background hover:opacity-90 focus:outline-none"
          >
            ok
          </button>
        </div>
      </div>
    </div>
  );
}
