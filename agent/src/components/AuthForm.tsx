"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";

const USERNAME_PATTERN = /^[a-z0-9._-]{3,64}$/;

export function AuthForm() {
  const { signIn } = useAuthActions();
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const name = username.trim().toLowerCase();
    if (!USERNAME_PATTERN.test(name)) return setError("Username: 3 to 64 letters, digits, . _ or -.");
    if (password.length < 8 || password.length > 128) return setError("Password: 8 to 128 characters.");
    setLoading(true);
    try {
      const form = new FormData();
      form.set("username", name);
      form.set("password", password);
      form.set("flow", mode);
      await signIn("password", form);
    } catch {
      setError(mode === "signIn" ? "Wrong username or password." : "That username is taken.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-full flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="font-mono text-sm text-accent mb-3">todosst / agent</div>
        <h1 className="text-3xl font-semibold tracking-tight leading-tight mb-2">Your todo list is a program.</h1>
        <p className="text-muted mb-8">Say what you want in plain words. An agent writes the code that runs your day.</p>
        <form onSubmit={submit} className="space-y-3">
          <input
            className="w-full rounded-lg border border-line bg-panel px-3 py-2.5 outline-none focus:border-accent"
            placeholder="username"
            autoComplete="username"
            autoCapitalize="none"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            className="w-full rounded-lg border border-line bg-panel px-3 py-2.5 outline-none focus:border-accent"
            placeholder="password"
            type="password"
            autoComplete={mode === "signIn" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-sm text-late">{error}</p>}
          <button
            disabled={loading}
            className="w-full rounded-lg bg-ink text-bg py-2.5 font-medium disabled:opacity-60"
          >
            {loading ? "…" : mode === "signIn" ? "Sign in" : "Create account"}
          </button>
        </form>
        <button
          className="mt-4 text-sm text-muted hover:text-ink"
          onClick={() => {
            setMode(mode === "signIn" ? "signUp" : "signIn");
            setError(null);
          }}
        >
          {mode === "signIn" ? "New here? Create an account" : "Have an account? Sign in"}
        </button>
      </div>
    </main>
  );
}
