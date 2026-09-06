"use client";

import { useEffect, useState } from "react";

// navigator.onLine + the online/offline events. Coarse (a captive portal or
// dead upstream still reports online) but the right first-line signal for
// parking captures locally instead of firing mutations into a dead socket;
// failed syncs are retried with attempt caps on every later trigger.
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => {
    try {
      return typeof navigator !== "undefined" ? navigator.onLine !== false : true;
    } catch {
      return true;
    }
  });
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}