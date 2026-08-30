"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import { useConvex } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  useEncryption,
  generateSaltB64,
  setCachedSalt,
  RECOVERY_SESSION_KEY,
} from "./EncryptionContext";
import { deriveRecoveryKey, recoveryVerifier } from "@/lib/crypto";

type Mode = "signIn" | "signUp" | "recover";

// 3-64 chars, lowercased, letters/digits/dot/underscore/hyphen — mirrors the
// server-side username check in convex/auth.ts.
const USERNAME_PATTERN = /^[a-z0-9._-]{3,64}$/;

export function AuthForm({ defaultMode = "signIn" }: { defaultMode?: Mode }) {
  const { signIn } = useAuthActions();
  const convex = useConvex();
  const { resolveVaultPassword, resolveVaultRecovery, clearKey } = useEncryption();
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function fetchSalt(name: string): Promise<string | null> {
    try {
      return (await convex.query(api.encryption.getSalt, { username: name })) as string | null;
    } catch {
      return null;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const name = username.trim().toLowerCase();
    if (!USERNAME_PATTERN.test(name)) {
      setError("username must be 3-64 characters (letters, digits, . _ -).");
      return;
    }

    setLoading(true);
    try {
      if (mode === "recover") {
        // ---- recovery sign-in: username + recovery code ----
        if (code.trim().length < 10) {
          setError("enter your recovery key.");
          setLoading(false);
          return;
        }
        const salt = await fetchSalt(name);
        if (!salt) throw new Error("no vault found for this account.");
        // verifier = sha256(PBKDF2(code, salt)) — the raw key never leaves the client
        const kr = await deriveRecoveryKey(code, salt);
        const verifier = await recoveryVerifier(kr);
        const formData = new FormData();
        formData.set("username", name);
        formData.set("verifier", verifier);
        formData.set("flow", "signIn");
        await signIn("recovery", formData);
        await resolveVaultRecovery(code, salt, false);
        try {
          sessionStorage.setItem(RECOVERY_SESSION_KEY, "1");
        } catch {}
        return;
      }

      // ---- password sign-in / sign-up ----
      if (password.length < 8) {
        setError("password must be at least 8 characters.");
        setLoading(false);
        return;
      }
      if (password.length > 128) {
        setError("password is too long.");
        setLoading(false);
        return;
      }
      if (mode === "signUp" && password !== confirmPassword) {
        setError("passwords do not match.");
        setLoading(false);
        return;
      }
      let salt = await fetchSalt(name);
      if (salt) setCachedSalt(name, salt);

      const formData = new FormData();
      formData.set("username", name);
      formData.set("password", password);
      formData.set("flow", mode);
      await signIn("password", formData);

      // Post-auth: legacy accounts may not have a salt yet — create one.
      // The auth token can take a moment to propagate to the convex client,
      // so retry — a vault whose salt was never persisted is unrecoverable.
      if (!salt) {
        salt = generateSaltB64();
        let ensured = false;
        for (let attempt = 0; attempt < 3 && !ensured; attempt++) {
          try {
            // ensureSalt returns the canonical stored salt when one already
            // exists (another device won the race, or our pre-auth getSalt
            // lookup failed transiently). Deriving the vault key from the
            // locally generated salt instead would make all data unreadable.
            const canonical = (await convex.mutation(api.encryption.ensureSalt, { salt })) as unknown;
            if (typeof canonical === "string" && canonical.length >= 10) salt = canonical;
            ensured = true;
          } catch {
            await new Promise((r) => setTimeout(r, 800));
          }
        }
        if (!ensured) {
          throw new Error("could not initialize your vault encryption — please try signing in again.");
        }
        setCachedSalt(name, salt);
      }
      // Resolve (or adopt) the vault master key and persist its wrapper.
      await resolveVaultPassword(password, salt, false);
    } catch (err) {
      // Clear any derived key if auth/unlock failed
      try {
        clearKey();
      } catch {}
      const msg = err instanceof Error ? err.message : "authentication failed";
      if (msg.toLowerCase().includes("invalid") || msg.toLowerCase().includes("not found")) {
        setError(
          mode === "recover"
            ? "invalid username or recovery key."
            : mode === "signIn"
              ? "invalid username or password."
              : "account already exists. try signing in."
        );
      } else if (msg.toLowerCase().includes("already")) {
        setError("account already exists. try signing in.");
      } else {
        setError(msg.toLowerCase());
      }
    } finally {
      setLoading(false);
    }
  }

  const tabs: { id: Mode; label: string }[] = [
    { id: "signIn", label: "sign in" },
    { id: "signUp", label: "create account" },
    { id: "recover", label: "recover" },
  ];

  return (
    <div className="w-full max-w-[420px] border border-foreground bg-background">
      <div className="flex border-b border-foreground text-sm">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            onClick={() => {
              setMode(t.id);
              setConfirmPassword("");
            }}
            className={`flex-1 py-3 text-center ${i > 0 ? "border-l border-foreground" : ""} ${
              mode === t.id ? "bg-foreground text-background" : "bg-background text-foreground opacity-60 hover:opacity-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "recover" && (
            <p className="text-xs leading-relaxed opacity-60">
              forgot your password? sign in with your username and the recovery key you generated while unlocked. the
              recovery key also unlocks the vault.
            </p>
          )}
          <label className="block">
            <span className="text-sm">username</span>
            <input
              type="text"
              autoComplete="username"
              required
              minLength={3}
              maxLength={64}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
              className="mt-1 w-full border-b border-foreground bg-transparent py-2 text-sm placeholder:text-foreground/40 focus:outline-none"
            />
          </label>
          {mode === "recover" ? (
            <label className="block">
              <span className="text-sm">recovery key</span>
              <input
                type="text"
                required
                spellCheck={false}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
                className="mt-1 w-full border-b border-foreground bg-transparent py-2 font-mono text-sm placeholder:text-foreground/40 focus:outline-none"
              />
            </label>
          ) : (
            <>
              <label className="block">
                <span className="text-sm">password</span>
                <input
                  type="password"
                  autoComplete={mode === "signIn" ? "current-password" : "new-password"}
                  required
                  minLength={8}
                  maxLength={128}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="at least 8 characters"
                  className="mt-1 w-full border-b border-foreground bg-transparent py-2 text-sm placeholder:text-foreground/40 focus:outline-none"
                />
              </label>
              {mode === "signUp" && (
                <label className="block">
                  <span className="text-sm">confirm password</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    maxLength={128}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="repeat your password"
                    className="mt-1 w-full border-b border-foreground bg-transparent py-2 text-sm placeholder:text-foreground/40 focus:outline-none"
                  />
                </label>
              )}
            </>
          )}

          {error && <p className="border border-foreground bg-background px-3 py-2 text-sm">{error}</p>}

          <button type="submit" disabled={loading} className="w-full border border-foreground bg-foreground py-2.5 text-sm text-background hover:opacity-90 disabled:opacity-40">
            {loading
              ? "please wait…"
              : mode === "signIn"
                ? "sign in"
                : mode === "signUp"
                  ? "create account"
                  : "recover account"}
          </button>
        </form>
      </div>
    </div>
  );
}
