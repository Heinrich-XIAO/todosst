"use client";

import { useEffect } from "react";
import { THEMES, setTheme, useTheme, type Theme } from "./useTheme";

// Page-level settings, opened from the nav bar. Theme is the only setting that
// lives outside the vault — stored per device in localStorage.
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const theme = useTheme();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-background/80 p-4 py-10" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="settings"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[460px] border border-foreground bg-background p-6"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">settings</h2>
          <button onClick={onClose} className="opacity-60 hover:opacity-100" aria-label="close settings">
            close
          </button>
        </div>

        <div className="mt-4 border border-foreground/20 p-3">
          <p className="text-xs font-medium">theme</p>
          <p className="mt-1 text-[11px] leading-tight opacity-40">
            stored per device — auto follows your system preference.
          </p>
          <div className="mt-2 flex gap-2">
            {THEMES.map((t: Theme) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                aria-pressed={theme === t}
                className={
                  "border px-2 py-1 text-[11px] " +
                  (theme === t
                    ? "border-foreground bg-foreground text-background"
                    : "border-foreground opacity-60 hover:opacity-100")
                }
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
