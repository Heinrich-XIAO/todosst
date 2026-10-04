"use client";

// LegacyHistoryMigration — one-time cleanup for history rows that outlived the
// first migration pass.
//
// The original banner migrated todos and history in one go, but it could be
// clicked before `history.list` had resolved: the empty list looked like "no
// history rows", so those rows were skipped while the account was still marked
// done. Legacy rows therefore linger here, invisible to the app because
// nothing reads ciphertext any more.
//
// Renders ONLY while legacy history rows remain (server count is
// authoritative), and only after both row lists have loaded — the guard that
// was missing before. Once it reports success this component never returns.
//
// Delete together with src/lib/legacyDecrypt.ts, convex/vault.ts,
// convex/encryption.ts and the userSalts/vaultKeys/recoveryKeys tables once no
// account has legacy rows left.

import { useState } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { migrateAccount, resolveLegacyKey } from "@/lib/legacyDecrypt";

export function LegacyHistoryMigration({ username }: { username?: string }) {
  const convex = useConvex();
  const legacyCount = useQuery(api.history.legacyCount);
  const todos = useQuery(api.todos.list);
  const history = useQuery(api.history.list);
  const migrateTodoMut = useMutation(api.todos.migrate);
  const migrateHistoryMut = useMutation(api.history.migrate);

  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // wait for the authoritative count, and for both row lists, before offering
  // anything — a partially loaded list is what stranded these rows last time
  const listsLoaded = todos !== undefined && history !== undefined;
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
        todos: todos as Parameters<typeof migrateAccount>[0]["todos"],
        history: history as Parameters<typeof migrateAccount>[0]["history"],
        listsLoaded,
        migrateTodo: (a) => migrateTodoMut(a),
        migrateHistory: (a) => migrateHistoryMut(a),
      });
      if (result.failed > 0) {
        setErr(`${result.failed} row(s) could not be decrypted — check the password and try again.`);
        return;
      }
      setOk(`upgraded ${result.todos} tasks and ${result.history} history records.`);
    } catch {
      setErr("migration failed — wrong password, or the server is unreachable.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="border-b border-foreground/30 bg-foreground/5 px-3 py-2 text-xs">
        <p>{legacyCount} history record{legacyCount === 1 ? "" : "s"} still in the old format.</p>
        <button onClick={() => setOpen(true)} className="mt-1 underline underline-offset-4">
          finish the upgrade
        </button>
      </div>
    );
  }

  return (
    <div className="border-b border-foreground/30 bg-foreground/5 px-3 py-3 text-xs">
      <p className="font-medium">finish upgrading your history</p>
      <p className="mt-1 leading-tight opacity-60">
        decrypt {legacyCount} history record{legacyCount === 1 ? "" : "s"} — the completion counts behind
        your heatmaps and streaks. if this browser still remembers the old key it runs automatically;
        otherwise enter this account&apos;s password. it is never stored.
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
          disabled={busy || !listsLoaded}
          className="border border-foreground px-2 py-1 hover:bg-foreground/10 disabled:opacity-40"
        >
          {busy ? "upgrading…" : "upgrade"}
        </button>
        <button onClick={() => setOpen(false)} className="px-1 opacity-60 hover:opacity-100">
          later
        </button>
      </div>
      {!listsLoaded && <p className="mt-1 opacity-40">loading your tasks…</p>}
      {err && <p className="mt-1 border border-foreground px-2 py-1">{err}</p>}
    </div>
  );
}