"use client";

import { useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { enablePush, getPushState, registerServiceWorker } from "@/lib/push";

// Push reminders are on by default: subscribe this browser whenever the OS
// permission allows. If permission is still undetermined, the request rides
// the first user gesture (Chrome gates the prompt on activation); a "denied"
// browser setting is respected — nothing is asked again.
export function PushAutoEnable() {
  const saveSubscription = useMutation(api.push.saveSubscription);
  useEffect(() => {
    let cancelled = false;
    const onGesture = () => {
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
      void subscribe();
    };
    async function subscribe() {
      if (cancelled) return;
      try {
        const sub = await enablePush();
        if (sub && !cancelled) await saveSubscription(sub);
      } catch {}
    }
    (async () => {
      await registerServiceWorker();
      if (cancelled) return;
      const state = await getPushState();
      if (cancelled) return;
      if (state.permission === "granted") return subscribe();
      if (state.permission === "default") {
        const perm = await Notification.requestPermission();
        if (perm === "granted") return subscribe();
        if (cancelled) return;
        window.addEventListener("pointerdown", onGesture);
        window.addEventListener("keydown", onGesture);
      }
    })();
    return () => {
      cancelled = true;
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
    };
  }, [saveSubscription]);
  return null;
}
