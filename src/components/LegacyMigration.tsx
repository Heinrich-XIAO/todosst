"use client";

// LegacyMigration — one-time upgrade prompt.
//
// Accounts created before todosst moved to plaintext storage still have rows
// stored as AES-GCM ciphertext under a key derived from their old account
// password. This banner asks for that password once, on a device that can
// still decrypt, rewrites every row as plaintext, and then never appears again.
//
// Nothing here runs for accounts with no legacy rows (the common case) — the
// legacyCount query gates it. Delete this component together with
// src/lib/legacyDecrypt.ts, convex/vault.ts, convex/encryption.ts and the
// userSalts + vaultKeys tables once every account has migrated.

import { useState } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { migrateAccount, migrationDone, resolveLegacyKey } from "@/lib/legacyDecrypt";

export function LegacyMigration({ username }: { username?: string }) {
  const convex = useConvex();
  const legacyCount = useQuery(api.todos.legacyCount);
  const todos = useQuery(api.todos.list);
  const history = useQuery(api.history.list);
  const migrateTodoMut = useMutation(api.todos.migrate);
  const migrateHistoryMut = useMutation(api.history.migrate);

  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  if (migrationDone()) return null;
  if (legacyCount === undefined || legacyCount === 0 || ok) return null;

  async function run() {
    setBusy(true);
    setErr(null);
    try {
      const rawKey = await resolveLegacyKey({
        password,
        username,
        saltApi: {
          getMySalt: () => convex.query(api.encryption.getMySalt, {}) as Promise<string | null>,
          getSalt: (a: { username: string }) => convex.query(api.encryption.getSalt, a) as Promise<string | null>,
        },
        keyApi: {
          getKeyRecord: (a) =>
            convex.query(api.vault.getKeyRecord, a) as Promise<{ ciphertext: string; iv: string } | null>,
        },
      });
      if (!rawKey) {
        setErr("could not decrypt — enter this account's password and try again.");
        return;
      }
      const result = await migrateAccount({
        rawKeyB64: rawKey,
        todos: (todos ?? []) as Parameters<typeof migrateAccount>[0]["todos"],
        history: (history ?? []) as Parameters<typeof migrateAccount>[0]["history"],
        migrateTodo: (a) => migrateTodoMut(a),
        migrateHistory: (a) => migrateHistoryMut(a),
      });
      if (result.failed > 0) {
        setErr(`${result.failed} row(s) could not be decrypted — check the password and try again.`);
        return;
      }
      setOk(`upgraded ${result.todos} tasks and ${result.history} history records.`);
      setPassword("");
    } catch {
      setErr("migration failed — wrong password, or the server is unreachable.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="border-b border-foreground/30 bg-foreground/5 px-3 py-2 text-xs">
        <p>
          {legacyCount} task{legacyCount === 1 ? "" : "s"} still stored in the old encrypted format.
        </p>
        <button onClick={() => setOpen(true)} className="mt-1 underline underline-offset-4">
          upgrade them now
        </button>
      </div>
    );
  }

  return (
    <div className="border-b border-foreground/30 bg-foreground/5 px-3 py-3 text-xs">
      <p className="font-medium">upgrade your old encrypted tasks</p>
      <p className="mt-1 leading-tight opacity-60">
        decrypt {legacyCount} legacy task{legacyCount === 1 ? "" : "s"} on this device and rewrite
        them in the current format. if this browser still remembers the old key it happens
        automatically; otherwise enter this account&apos;s password. it is never stored.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="account password (if needed)"
          className="flex-1 border-b border-foreground bg-transparent py-1 text-sm focus:outline-none"
        />
        <button
          onClick={() => void run()}
          disabled={busy}
          className="border border-foreground px-2 py-1 hover:bg-foreground/10 disabled:opacity-40"
        >
          {busy ? "upgrading…" : "upgrade"}
        </button>
        <button onClick={() => setOpen(false)} className="px-1 opacity-60 hover:opacity-100">
          later
        </button>
      </div>
      {err && <p className="mt-1 border border-foreground px-2 py-1">{err}</p>}
      {todos === undefined || history === undefined ? (
        <p className="mt-1 opacity-40">loading rows…</p>
      ) : null}
    </div>
  );
}