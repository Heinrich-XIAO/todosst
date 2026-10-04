"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRef, useState } from "react";

type Mode = "signIn" | "signUp";

// 3-64 chars, lowercased, letters/digits/dot/underscore/hyphen — mirrors the
// server-side username check in convex/auth.ts.
const USERNAME_PATTERN = /^[a-z0-9._-]{3,64}$/;

export function AuthForm({ defaultMode = "signIn" }: { defaultMode?: Mode }) {
  const { signIn } = useAuthActions();
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const captureFrameRef = useRef<HTMLIFrameElement>(null);

  // The browser's password manager only offers to save credentials on a real
  // form submission — the React handler calls preventDefault(), so nothing is
  // ever "submitted". After a successful password sign-in/sign-up, submit the
  // form for real into a hidden same-origin iframe to trigger the save prompt
  // without navigating away.
  function captureCredentials() {
    const form = formRef.current;
    const frame = captureFrameRef.current;
    if (!form || !frame) return;
    const prevTarget = form.target;
    form.target = frame.name;
    form.submit();
    form.target = prevTarget;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const name = username.trim().toLowerCase();
    if (!USERNAME_PATTERN.test(name)) {
      setError("username must be 3-64 characters (letters, digits, . _ -).");
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
    if (mode === "signUp" && password !== confirmPassword) {
      setError("passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.set("username", name);
      formData.set("password", password);
      formData.set("flow", mode);
      await signIn("password", formData);
      captureCredentials();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "authentication failed";
      const lower = msg.toLowerCase();
      if (lower.includes("already")) {
        setError("account already exists. try signing in.");
      } else if (lower.includes("invalid") || lower.includes("not found")) {
        setError(mode === "signIn" ? "user doesn't exist or password is incorrect." : "could not create that account.");
      } else {
        setError(lower);
      }
    } finally {
      setLoading(false);
    }
  }

  const tabs: { id: Mode; label: string }[] = [
    { id: "signIn", label: "sign in" },
    { id: "signUp", label: "create account" },
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
        <form ref={formRef} onSubmit={handleSubmit} method="post" className="space-y-4">
          <label className="block">
            <span className="text-sm">username</span>
            <input
              type="text"
              name="username"
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
          <label className="block">
            <span className="text-sm">password</span>
            <input
              type="password"
              name="password"
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
                name="confirmPassword"
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

          {error && <p className="border border-foreground bg-background px-3 py-2 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full border border-foreground bg-foreground py-2.5 text-sm text-background hover:opacity-90 disabled:opacity-40"
          >
            {loading ? "please wait…" : mode === "signIn" ? "sign in" : "create account"}
          </button>
        </form>
      </div>

      {/* submission target for captureCredentials() */}
      <iframe ref={captureFrameRef} name="password-capture" title="password capture" hidden />
    </div>
  );
}