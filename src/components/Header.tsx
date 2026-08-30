"use client";

import { Authenticated } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import Link from "next/link";
import { useEncryption, clearRecoverySession } from "./EncryptionContext";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

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
