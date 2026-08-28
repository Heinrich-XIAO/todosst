"use client";

import { useCallback, useSyncExternalStore } from "react";

type Theme = "auto" | "light" | "dark";

const KEY = "todosst-theme";
const NEXT: Record<Theme, Theme> = { auto: "light", light: "dark", dark: "auto" };
const THEMES: readonly Theme[] = ["auto", "light", "dark"];

const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored && (THEMES as readonly string[]).includes(stored)) {
      return stored as Theme;
    }
  } catch {
    /* private mode */
  }
  return "auto";
}

function apply(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  if (theme !== "auto") root.classList.add(theme);
}

function getServerTheme(): Theme {
  return "auto";
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, readTheme, getServerTheme);

  const cycle = useCallback(() => {
    const next = NEXT[readTheme()];
    apply(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* private mode */
    }
    for (const listener of listeners) listener();
  }, []);

  return (
    <button
      onClick={cycle}
      aria-label={`Color theme: ${theme}`}
      title="Cycle color theme"
      className="opacity-60 hover:opacity-100"
    >
      theme: {theme}
    </button>
  );
}
