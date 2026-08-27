"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";

type Mode = "signIn" | "signUp";

export function AuthForm({ defaultMode = "signIn" }: { defaultMode?: Mode }) {
  const { signIn } = useAuthActions();
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("enter a valid email.");
      return;
    }
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
      const formData = new FormData();
      formData.set("email", normalizedEmail);
      formData.set("password", password);
      formData.set("flow", mode);
      await signIn("password", formData);
      if (mode === "signUp") {
        setPendingEmail(normalizedEmail);
        setError(null);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "authentication failed";
      if (msg.toLowerCase().includes("invalid") || msg.toLowerCase().includes("not found") || msg.toLowerCase().includes("already")) {
        setError(mode === "signIn" ? "invalid email or password." : "account already exists. try signing in.");
      } else {
        setError(msg.toLowerCase());
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleVerification(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const c = code.trim();
    if (!/^\d{8}$/.test(c)) {
      setError("code must be 8 digits.");
      return;
    }
    if (!pendingEmail) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.set("email", pendingEmail);
      formData.set("code", c);
      formData.set("flow", "email-verification");
      await signIn("password", formData);
      // on success, Authenticated will take over and show queue
    } catch (err) {
      const msg = err instanceof Error ? err.message : "verification failed";
      setError(msg.toLowerCase().includes("invalid") || msg.toLowerCase().includes("expired") ? "invalid or expired code." : msg.toLowerCase());
    } finally {
      setLoading(false);
    }
  }

  if (pendingEmail) {
    return (
      <div className="w-full max-w-[420px] border border-foreground bg-background p-6">
        <p className="text-sm">check your email.</p>
        <p className="mt-1 text-sm opacity-60">we sent an 8-digit code to {pendingEmail}.</p>
        <form onSubmit={handleVerification} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-sm">code</span>
            <input
              autoFocus
              type="text"
              inputMode="numeric"
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
              placeholder="00000000"
              className="mt-1 w-full border-b border-foreground bg-transparent py-2 text-sm tracking-widest placeholder:text-foreground/40 focus:outline-none"
            />
          </label>
          {error && <p className="border border-foreground bg-background px-3 py-2 text-sm">{error}</p>}
          <button type="submit" disabled={loading} className="w-full border border-foreground bg-foreground py-2.5 text-sm text-background hover:opacity-90 disabled:opacity-40">
            {loading ? "please wait…" : "verify"}
          </button>
          <button type="button" onClick={() => setPendingEmail(null)} className="w-full py-2 text-sm opacity-60 hover:opacity-100">
            back
          </button>
        </form>
      </div>
    );
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
            <span className="text-sm">email</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
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
