"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import { useConvex } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useEncryption, generateSaltB64, setCachedSalt } from "./EncryptionContext";
import { deriveKey } from "@/lib/crypto";

type Mode = "signIn" | "signUp";

export function AuthForm({ defaultMode = "signIn" }: { defaultMode?: Mode }) {
  const { signIn } = useAuthActions();
  const convex = useConvex();
  const { deriveAndSetKey, setPendingPassword, setPendingSalt, clearKey } = useEncryption();
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const raw = email.trim().toLowerCase();
    if (raw.length < 3) {
      setError("enter at least 3 characters.");
      return;
    }
    if (raw.length > 64) {
      setError("too long.");
      return;
    }
    // allow username or email — if no @, treat as username and map to <username>@todosst.local
    const normalizedEmail = raw.includes("@") ? raw : `${raw}@todosst.local`;
    if (password.length < 8) {
      setError("password must be at least 8 characters.");
      return;
    }
    if (password.length > 128) {
      setError("password is too long.");
      return;
    }
    setLoading(true);
    try {
      // --- E2E key preparation ---
      // Derive encryption key from password + per-user salt (PBKDF2 310k -> AES-GCM-256).
      // Salt is public and stored in userSalts table.
      let salt: string | null = null;
      let derivedBeforeSignIn = false;
      if (mode === "signUp") {
        // New account: generate fresh salt, derive before sign-in so key is ready
        salt = generateSaltB64();
        try {
          const k = await deriveKey(password, salt);
          // quick sanity: ensure we can encrypt/decrypt (implicit)
          void k;
        } catch {
          throw new Error("failed to derive encryption key");
        }
        setPendingSalt(salt);
        setPendingPassword(password);
        // cache locally; will be persisted via ensureSalt after auth
        setCachedSalt(normalizedEmail, salt);
        // derive visible key immediately
        await deriveAndSetKey(password, salt);
        derivedBeforeSignIn = true;
      } else {
        // Sign-in: fetch existing salt if any
        try {
          const fetched = (await convex.query(api.encryption.getSalt, {
            email: normalizedEmail,
          })) as string | null;
          if (fetched) {
            salt = fetched;
            setPendingSalt(salt);
            setPendingPassword(password);
            setCachedSalt(normalizedEmail, salt);
            await deriveAndSetKey(password, salt);
            derivedBeforeSignIn = true;
          } else {
            // Legacy user with no salt yet — will generate after successful sign-in
            setPendingPassword(password);
          }
        } catch {
          // If salt fetch fails, continue to auth — key will be established after auth
          setPendingPassword(password);
        }
      }

      const formData = new FormData();
      formData.set("email", normalizedEmail);
      formData.set("password", password);
      formData.set("flow", mode);
      await signIn("password", formData);

      // Post-auth: if we didn't derive before (legacy user on sign-in), generate salt now
      if (!derivedBeforeSignIn && mode === "signIn") {
        // After auth, mySalt may be null (legacy). Generate and ensure.
        // Use pendingPassword already set; create salt if still null
        if (!salt) {
          const newSalt = generateSaltB64();
          setPendingSalt(newSalt);
          setCachedSalt(normalizedEmail, newSalt);
          try {
            await deriveAndSetKey(password, newSalt);
          } catch {}
          // persist via convex — we need auth; call directly with convex
          try {
            await convex.mutation(api.encryption.ensureSalt, { salt: newSalt });
          } catch {}
        }
      }
      // For signUp case, ensure salt persisted (EncryptionProvider effect also does it, but do it here too)
      if (mode === "signUp" && salt) {
        try {
          await convex.mutation(api.encryption.ensureSalt, { salt });
        } catch {}
      }
    } catch (err) {
      // Clear derived key if auth failed (wrong password etc.)
      try { clearKey(); } catch {}
      setPendingPassword(null);
      const msg = err instanceof Error ? err.message : "authentication failed";
      if (msg.toLowerCase().includes("invalid") || msg.toLowerCase().includes("not found") || msg.toLowerCase().includes("already")) {
        setError(mode === "signIn" ? "invalid username or password." : "account already exists. try signing in.");
      } else {
        setError(msg.toLowerCase());
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-[420px] border border-foreground bg-background">
      <div className="flex border-b border-foreground text-sm">
        <button
          onClick={() => setMode("signIn")}
          className={`flex-1 py-3 text-center ${mode === "signIn" ? "bg-foreground text-background" : "bg-background text-foreground opacity-60 hover:opacity-100"}`}
        >
          sign in
        </button>
        <button
          onClick={() => setMode("signUp")}
          className={`flex-1 py-3 text-center border-l border-foreground ${mode === "signUp" ? "bg-foreground text-background" : "bg-background text-foreground opacity-60 hover:opacity-100"}`}
        >
          create account
        </button>
      </div>

      <div className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="text-sm">username</span>
            <input
              type="text"
              autoComplete="username"
              required
              minLength={3}
              maxLength={64}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your name"
              className="mt-1 w-full border-b border-foreground bg-transparent py-2 text-sm placeholder:text-foreground/40 focus:outline-none"
            />
          </label>
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

          {error && <p className="border border-foreground bg-background px-3 py-2 text-sm">{error}</p>}

          <button type="submit" disabled={loading} className="w-full border border-foreground bg-foreground py-2.5 text-sm text-background hover:opacity-90 disabled:opacity-40">
            {loading ? "please wait…" : mode === "signIn" ? "sign in" : "create account"}
          </button>
        </form>
      </div>
    </div>
  );
}
