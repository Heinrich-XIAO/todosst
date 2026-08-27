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

    // Client-side validation — never trust client alone, server validates via Password provider
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("Please enter a valid email address.");
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
      // Convex Auth Password provider: flow distinguishes sign-in vs sign-up
      // Uses FormData under the hood via useAuthActions().signIn
      const formData = new FormData();
      formData.set("email", normalizedEmail);
      formData.set("password", password);
      formData.set("flow", mode);

      await signIn("password", formData);
      // On success, ConvexAuthNextjsProvider will redirect / update state automatically
    } catch (err) {
      // Generic error to avoid user enumeration — don't reveal if email exists
      const msg = err instanceof Error ? err.message : "Authentication failed";
      // Map common Convex Auth errors to generic message
      if (msg.toLowerCase().includes("invalid") || msg.toLowerCase().includes("not found") || msg.toLowerCase().includes("already")) {
        setError(mode === "signIn" ? "Invalid email or password." : "Unable to create account. Try signing in instead.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-[420px] rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex gap-2 rounded-full bg-zinc-100 p-1">
        <button
          onClick={() => setMode("signIn")}
          className={`flex-1 rounded-full py-2 text-sm font-medium transition ${mode === "signIn" ? "bg-white shadow text-zinc-900" : "text-zinc-600 hover:text-zinc-900"}`}
        >
          Sign in
        </button>
        <button
          onClick={() => setMode("signUp")}
          className={`flex-1 rounded-full py-2 text-sm font-medium transition ${mode === "signUp" ? "bg-white shadow text-zinc-900" : "text-zinc-600 hover:text-zinc-900"}`}
        >
          Create account
        </button>
      </div>

      <h2 className="mt-6 text-lg font-semibold tracking-tight text-zinc-900">
        {mode === "signIn" ? "Welcome back" : "Create your account"}
      </h2>
      <p className="mt-1 text-sm text-zinc-500">
        {mode === "signIn" ? "Sign in with your email and password." : "Use any email — works on *.vercel.app, no custom domain required."}
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="email" className="text-sm font-medium text-zinc-700">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/10"
          />
        </div>
        <div>
          <label htmlFor="password" className="text-sm font-medium text-zinc-700">Password</label>
          <input
            id="password"
            type="password"
            autoComplete={mode === "signIn" ? "current-password" : "new-password"}
            required
            minLength={8}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/10"
          />
          <p className="mt-1.5 text-xs text-zinc-400">Passwords are hashed with scrypt — never stored in plain text.</p>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-zinc-900 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50"
        >
          {loading ? "Please wait…" : mode === "signIn" ? "Sign in" : "Create account"}
        </button>
      </form>

      <p className="mt-6 text-center text-xs leading-5 text-zinc-400">
        Secure • HttpOnly cookies • Works on any Vercel domain
      </p>
    </div>
  );
}
