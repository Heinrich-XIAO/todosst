"use client";

import { useEffect, useState } from "react";
import { Authenticated } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import Link from "next/link";
import { api } from "../../convex/_generated/api";
import { useEncryption, clearRecoverySession } from "./EncryptionContext";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { disablePush, enablePush, getPushState, type PushState } from "@/lib/push";

function NotifyToggle() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const saveSubscription = useMutation(api.push.saveSubscription);
  const removeSubscription = useMutation(api.push.removeSubscription);

  useEffect(() => {
    void getPushState().then(setState);
  }, []);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      if (state?.subscribed) {
        const endpoint = await disablePush();
        if (endpoint) await removeSubscription({ endpoint });
      } else {
        if (!state?.supported) {
          window.alert(
            "push notifications are not available in this browser — on iOS, add todosst to the home screen first"
          );
          return;
        }
        const sub = await enablePush();
        if (!sub) {
          if (Notification.permission === "denied") {
            window.alert("notifications are blocked for this site — allow them in browser settings to get reminders");
          } else if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
            window.alert("push is not configured on this deployment");
          }
          return;
        }
        await saveSubscription(sub);
      }
      setState(await getPushState());
    } finally {
      setBusy(false);
    }
  }

  if (state && !state.supported) return null;
  return (
    <button
      onClick={() => void toggle()}
      disabled={busy || !state}
      title={state?.subscribed ? "notifications on — click to disable" : "get reminders via notifications"}
      className={`underline underline-offset-4 ${busy || !state ? "opacity-20" : state?.subscribed ? "opacity-100" : "opacity-60 hover:opacity-100"}`}
    >
      {state?.subscribed ? "notify on" : "notify"}
    </button>
  );
}

export function Header() {
  const { signOut } = useAuthActions();
  const { clearKey } = useEncryption();

  return (
    <header className="border-b border-foreground bg-background">
      <div className="mx-auto flex max-w-[640px] items-center justify-between px-4 py-4 sm:px-0">
        <Link href="/" className="flex items-center gap-2 text-[15px] font-medium tracking-tight text-foreground">
          <Logo className="h-[18px] w-[18px]" />
          <span className="font-mono">todosst</span>
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <ThemeToggle />
          <Authenticated>
            <NotifyToggle />
            <button
              onClick={() => {
                clearKey();
                clearRecoverySession();
                void signOut();
              }}
              className="opacity-60 hover:opacity-100"
            >
              sign out
            </button>
          </Authenticated>
        </div>
      </div>
    </header>
  );
}
