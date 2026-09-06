"use client";
/* eslint-disable react-hooks/set-state-in-effect -- eligibility depends on
   localStorage + UA state that cannot be read during render (SSR/hydration
   mismatch); one-shot sync then stable, same tradeoff as TodoApp.tsx */

// iOS install nudge: web push on iOS only works in the installed PWA, so
// without "Add to Home Screen" no reminder or daily nudge ever arrives there.
// Detect iOS Safari-not-standalone and show a one-time dismissible hint.

import { useEffect, useState } from "react";

const DISMISS_KEY = "todosst:iosInstallHintDismissed";

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const ios = /iP(hone|ad|od)/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!ios) return false;
  // third-party iOS browsers can't install the PWA — the hint would be wrong
  return !/CriOS|FxiOS|EdgiOS|OPiOS|OPT\//.test(ua);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  } catch {
    return true;
  }
}

export function InstallHint() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY)) return;
    } catch {}
    if (!isIosSafari() || isStandalone()) return;
    setShow(true);
  }, []);
  if (!show) return null;
  return (
    <div className="flex items-center justify-between gap-2 border-b border-foreground bg-foreground/[0.03] px-3 py-1.5 text-xs">
      <span className="opacity-80">install for reminders: tap share → “add to home screen”</span>
      <button
        onClick={() => {
          try {
            localStorage.setItem(DISMISS_KEY, "1");
          } catch {}
          setShow(false);
        }}
        className="shrink-0 px-1 opacity-40 hover:opacity-100"
        aria-label="dismiss install hint"
      >
        ×
      </button>
    </div>
  );
}
