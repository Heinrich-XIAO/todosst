"use client";

import { useSyncExternalStore } from "react";

export type Theme = "auto" | "light" | "dark";

const KEY = "todosst-theme";
export const THEMES: readonly Theme[] = ["auto", "light", "dark"];

const listeners = new Set<() => void>();

export function subscribe(callback: () => void) {
  listeners.add(callback);
  // cross-tab sync: re-apply the <html> class, not just the label — the
  // storage event only notifies the OTHER tabs
  const onStorage = () => {
    apply(readTheme());
    callback();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", onStorage);
  };
}

export function readTheme(): Theme {
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

export function getServerTheme(): Theme {
  return "auto";
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, readTheme, getServerTheme);
}

export function setTheme(theme: Theme) {
  apply(theme);
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* private mode */
  }
  for (const listener of listeners) listener();
}
