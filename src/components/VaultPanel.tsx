"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useEncryption, hasRecoverySession, clearRecoverySession } from "./EncryptionContext";
import {
  deriveKey,
  deriveRecoveryKey,
  exportKeyB64,
  generateRecoveryCode,
  recoveryVerifier,
  wrapKeyB64,
} from "@/lib/crypto";

// In-vault settings: change the sign-in password and manage the recovery key.
// The vault master key never changes — only its wrappers are re-keyed, so no
// data re-encryption is needed and other devices keep working.
export function VaultPanel({ onClose }: { onClose: () => void }) {
  const { key, salt } = useEncryption();
  const recovery = useQuery(api.vault.getRecovery);
  const changePasswordAction = useAction(api.vault.changePassword);
  const putKeyRecord = useMutation(api.vault.putKeyRecord);
  const setRecoveryMut = useMutation(api.vault.setRecovery);
  const clearRecoveryMut = useMutation(api.vault.clearRecovery);

  const recoverySession = hasRecoverySession();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [recoveryBusy, setRecoveryBusy] = useState(false);

  async function submitChange(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    if (!key || !salt) return;
    if (!recoverySession && current.length < 8) {
      setErr("enter your current password.");
      return;
    }
    if (next.length < 8) {
      setErr("new password must be at least 8 characters.");
      return;
    }
    if (next.length > 128) {
      setErr("password is too long.");
      return;
    }
    if (next !== confirm) {
      setErr("passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      // pre-compute the new wrapper BEFORE touching auth credentials — if the
      // server call succeeds we must be able to persist the matching wrapper
      const kpwNew = await deriveKey(next, salt);
      const wrapped = await wrapKeyB64(kpwNew, await exportKeyB64(key));
      await changePasswordAction({
        newPassword: next,
        ...(recoverySession ? {} : { currentPassword: current }),
      });
      let persisted = false;
      for (let i = 0; i < 3; i++) {
        try {
          await putKeyRecord({ kind: "password", ...wrapped });
          persisted = true;
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 1200));
        }
      }
      if (!persisted) {
        setErr("password changed, but the vault wrapper update failed — press save again to retry.");
        return;
      }
      clearRecoverySession();
      setCurrent("");
      setNext("");
      setConfirm("");
      setMsg("password changed.");
    } catch (e) {
      setErr(e instanceof Error ? e.message.toLowerCase() : "failed to change password");
    } finally {
      setBusy(false);
    }
  }

  async function generateRecovery() {
    if (!key || !salt) return;
    setRecoveryBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const code = generateRecoveryCode();
      const kr = await deriveRecoveryKey(code, salt);
      const verifier = await recoveryVerifier(kr);
      const wrapped = await wrapKeyB64(kr, await exportKeyB64(key));
      await setRecoveryMut({ verifier, ...wrapped });
      setRecoveryCode(code);
    } catch (e) {
      setErr(e instanceof Error ? e.message.toLowerCase() : "failed to generate recovery key");
    } finally {
      setRecoveryBusy(false);
    }
  }

  async function removeRecovery() {
    setRecoveryBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await clearRecoveryMut({});
      setRecoveryCode(null);
      setMsg("recovery key removed.");
    } catch (e) {
      setErr(e instanceof Error ? e.message.toLowerCase() : "failed to remove recovery key");
    } finally {
      setRecoveryBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-background/80 p-4 py-10" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="vault settings"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[460px] border border-foreground bg-background p-6"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">vault settings</h2>
          <button onClick={onClose} className="opacity-60 hover:opacity-100" aria-label="close vault settings">
            close
          </button>
        </div>

        {msg && <p className="mt-3 border border-foreground/30 bg-foreground/5 px-3 py-2 text-xs">{msg}</p>}
        {err && <p className="mt-3 border border-foreground bg-background px-3 py-2 text-xs">{err}</p>}

        {/* ---- change password ---- */}
        <form onSubmit={submitChange} className="mt-4 border border-foreground/20 p-3">
          <p className="text-xs font-medium">change password</p>
          <p className="mt-1 text-[11px] leading-tight opacity-40">
            only the vault wrapper is re-keyed — tasks, history, and other devices are unaffected.
          </p>
          {recoverySession && (
            <p className="mt-1 text-[11px] leading-tight opacity-60">
              recovery session — no current password needed.
            </p>
          )}
          {!recoverySession && (
            <label className="mt-2 block">
              <span className="text-xs opacity-60">current password</span>
              <input
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                className="mt-1 w-full border-b border-foreground bg-transparent py-1 text-sm focus:outline-none"
              />
            </label>
          )}
          <label className="mt-2 block">
            <span className="text-xs opacity-60">new password</span>
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className="mt-1 w-full border-b border-foreground bg-transparent py-1 text-sm focus:outline-none"
            />
          </label>
          <label className="mt-2 block">
            <span className="text-xs opacity-60">confirm new password</span>
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-1 w-full border-b border-foreground bg-transparent py-1 text-sm focus:outline-none"
            />
          </label>
          <button
            type="submit"
            disabled={busy || !key}
            className="mt-3 border border-foreground bg-foreground px-3 py-1.5 text-xs text-background hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "saving…" : "change password"}
          </button>
        </form>

        {/* ---- recovery key ---- */}
        <div className="mt-3 border border-foreground/20 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium">recovery key</p>
            {recovery !== undefined && (
              <span className="text-[11px] opacity-40">
                {recovery ? `set ${new Date(recovery.createdAt).toLocaleDateString()}` : "not set"}
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] leading-tight opacity-40">
            lets you sign in and unlock the vault if you forget your password. shown once — store it somewhere safe.
          </p>
          {recoveryCode ? (
            <div className="mt-2">
              <div className="border border-foreground bg-foreground/5 p-3 text-center font-mono text-sm tracking-wider">
                {recoveryCode}
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => void navigator.clipboard?.writeText(recoveryCode).catch(() => {})}
                  className="border border-foreground px-2 py-1 text-[11px] hover:bg-foreground/10"
                >
                  copy
                </button>
                <button
                  onClick={() => setRecoveryCode(null)}
                  className="border border-foreground px-2 py-1 text-[11px] hover:bg-foreground/10"
                >
                  done — i saved it
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-2 flex gap-2">
              <button
                onClick={generateRecovery}
                disabled={recoveryBusy || !key}
                className="border border-foreground px-2 py-1 text-[11px] hover:bg-foreground/10 disabled:opacity-40"
              >
                {recoveryBusy ? "working…" : recovery ? "replace key" : "generate recovery key"}
              </button>
              {recovery && (
                <button
                  onClick={removeRecovery}
                  disabled={recoveryBusy}
                  className="border border-foreground px-2 py-1 text-[11px] opacity-60 hover:opacity-100 disabled:opacity-40"
                >
                  remove
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
