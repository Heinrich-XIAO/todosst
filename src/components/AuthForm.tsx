"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";

type Mode = "signIn" | "signUp";

export function AuthForm({ defaultMode = "signIn" }: { defaultMode?: Mode }) {
  const { signIn } = useAuthActions();
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("Enter a valid email.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password.length > 128) {
      setError("Password is too long.");
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.set("email", normalizedEmail);
      formData.set("password", password);
      formData.set("flow", mode);
      await signIn("password", formData);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Authentication failed";
      if (msg.toLowerCase().includes("invalid") || msg.toLowerCase().includes("not found") || msg.toLowerCase().includes("already")) {
        setError(mode === "signIn" ? "Invalid email or password." : "Account already exists. Try signing in.");
      } else {
        setError(msg);
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
        <p className="text-sm opacity-60">{mode === "signIn" ? "Welcome back." : "Works on any .vercel.app domain."}</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
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

        <p className="mt-4 text-xs opacity-40">HttpOnly · SameSite=Lax · scrypt</p>
      </div>
    </div>
  );
}
