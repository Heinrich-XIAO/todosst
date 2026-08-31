"use client";

import { useState } from "react";
import { Authenticated } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import Link from "next/link";
import { clearRecoverySession, useEncryption } from "./EncryptionContext";
import { Logo } from "./Logo";
import { ThemeToggle } from "./useTheme";
import { VaultPanel } from "./VaultPanel";

export function Header() {
  const { signOut } = useAuthActions();
  const { clearKey, key } = useEncryption();
  const [settingsOpen, setSettingsOpen] = useState(false);

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
            {/* vault settings need the unlocked vault — hidden while locked */}
            {key && (
              <button
                onClick={() => setSettingsOpen(true)}
                className="opacity-60 hover:opacity-100"
                title="change password, recovery key, export / import"
              >
                settings
              </button>
            )}
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
      {settingsOpen && key && <VaultPanel onClose={() => setSettingsOpen(false)} />}
    </header>
  );
}
