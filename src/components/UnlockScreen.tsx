"use client";

import { useEffect, useRef, useState } from "react";
import { useConvex, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useEncryption, getRememberedKey, generateSaltB64 } from "./EncryptionContext";

export function UnlockScreen() {
  const { resolveVaultPassword, resolveVaultRecovery, isReady, clearStoredKey } = useEncryption();
  const viewer = useQuery(api.users.viewer);
  const [mode, setMode] = useState<"password" | "recovery">("password");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [storeLocally, setStoreLocally] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return !!getRememberedKey();
    } catch {
      return false;
    }
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const convex = useConvex();
  const secretInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isReady) secretInputRef.current?.focus();
  }, [isReady]);

  async function fetchSalt(): Promise<string | null> {
    try {
      const mine = (await convex.query(api.encryption.getMySalt, {})) as string | null;
      if (mine) return mine;
    } catch {}
    if (viewer?.email) {
      try {
        const byEmail = (await convex.query(api.encryption.getSalt, { email: viewer.email })) as string | null;
        if (byEmail) return byEmail;
      } catch {}
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      let salt = await fetchSalt();
      if (!salt && mode === "password") {
        // Self-heal a fresh account whose salt write failed after sign-up:
        // with no password wrapper there is no vault data tied to a lost salt,
        // so a new salt is safe and the password re-adopts as the master key.
        const wrapper = (await convex.query(api.vault.getKeyRecord, { kind: "password" })) as unknown;
        if (!wrapper) {
          salt = generateSaltB64();
          await convex.mutation(api.encryption.ensureSalt, { salt });
        }
      }
      if (!salt) {
        setError("no encryption salt found — try signing out and back in.");
        return;
      }
      if (mode === "password") {
        if (password.length < 8) {
          setError("password must be at least 8 characters.");
          return;
        }
        await resolveVaultPassword(password, salt, storeLocally);
      } else {
        if (code.trim().length < 10) {
          setError("enter your recovery key.");
          return;
        }
        await resolveVaultRecovery(code, salt, storeLocally);
      }
      setPassword("");
      setCode("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message.toLowerCase().includes("decrypt") || err.message.toLowerCase().includes("gcm")
            ? mode === "password"
              ? "wrong password."
              : "invalid recovery key."
            : err.message.toLowerCase()
          : mode === "password"
            ? "failed to unlock"
            : "failed to unlock with recovery key"
      );
    } finally {
      setLoading(false);
    }
  }

  if (!isReady) return <p className="text-sm opacity-60">preparing vault…</p>;

  return (
    <div className="w-full max-w-[420px] border border-foreground bg-background p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">{mode === "password" ? "unlock vault" : "unlock with recovery key"}</h2>
        <button
          onClick={() => {
            setMode(mode === "password" ? "recovery" : "password");
            setError(null);
          }}
          className="text-xs underline underline-offset-2 opacity-60 hover:opacity-100"
        >
          {mode === "password" ? "use recovery key" : "use password"}
        </button>
      </div>
      <p className="mt-1 text-xs opacity-60">
        {mode === "password"
          ? "your tasks are end-to-end encrypted — structure, titles, and metadata are opaque to the server. enter password to derive the key."
          : "enter the recovery key you generated while unlocked. it unlocks both your account and the vault."}
      </p>
      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        {mode === "password" ? (
          <input
            ref={secretInputRef}
            autoFocus
            type="password"
            autoComplete="current-password"
            placeholder="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border-b border-foreground bg-transparent py-2 text-sm placeholder:text-foreground/40 focus:outline-none"
          />
        ) : (
          <input
            ref={secretInputRef}
            autoFocus
            type="text"
            spellCheck={false}
            placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full border-b border-foreground bg-transparent py-2 font-mono text-sm placeholder:text-foreground/40 focus:outline-none"
          />
        )}
        <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
          <input
            type="checkbox"
            checked={storeLocally}
            onChange={(e) => {
              const checked = e.target.checked;
              setStoreLocally(checked);
              if (!checked) clearStoredKey();
            }}
            className="h-3.5 w-3.5 border border-foreground bg-background accent-foreground"
          />
          <span className="opacity-80">store locally</span>
          <span className="opacity-40 hidden sm:inline">— automatically unlock on this device</span>
        </label>
        {storeLocally && (
          <p className="text-[11px] opacity-40 leading-tight">
            stores the vault key in localStorage on this device. anyone with access to this browser can open your vault
            without the password. only use on a trusted device.
          </p>
        )}
        {error && <p className="border border-foreground bg-background px-3 py-2 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full border border-foreground bg-foreground py-2.5 text-sm text-background hover:opacity-90 disabled:opacity-40"
        >
          {loading ? "unlocking…" : "unlock"}
        </button>
      </form>
    </div>
  );
}
