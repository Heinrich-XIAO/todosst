"use client";

import { Authenticated, Unauthenticated, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import Link from "next/link";
import { useEncryption } from "./EncryptionContext";
import { Logo } from "./Logo";

export function Header() {
  const { signOut } = useAuthActions();
  const { clearKey } = useEncryption();
  const viewer = useQuery(api.users.viewer);

  return (
    <header className="border-b border-foreground bg-background">
      <div className="mx-auto flex max-w-[640px] items-center justify-between px-4 py-4 sm:px-0">
        <Link href="/" className="flex items-center gap-2 text-[15px] font-medium tracking-tight text-foreground">
          <Logo className="h-[18px] w-[18px]" />
          <span className="font-mono">todosst</span>
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <Unauthenticated>
            <Link href="/signin" className="underline underline-offset-4 hover:opacity-60">
              sign in
            </Link>
          </Unauthenticated>
          <Authenticated>
            <span className="hidden max-w-[180px] truncate opacity-60 sm:inline">{viewer?.email}</span>
            <button
              onClick={() => {
                clearKey();
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
