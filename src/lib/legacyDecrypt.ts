"use client";

// One-time migration: legacy ciphertext rows -> plaintext.
//
// Rows written before the move to plaintext storage are AES-GCM ciphertext
// under a vault key derived from the account's old password (PBKDF2-SHA-256,
// 310k iterations, per-user salt) and stored wrapped under kind "password" (or
// "recovery"). This module runs in the signed-in client, where the user can
// supply that old password once:
//
//   1. fetch the per-user salt + the wrapped key record
//   2. derive the vault key and unwrap it
//   3. decrypt every todo + history row, write it back as plaintext via
//      todos.migrate / history.migrate (which clears the ciphertext)
//   4. stamp a local flag so the prompt never appears again
//
// It is deliberately the only remaining reader of the legacy columns. Delete
// this file (plus convex/vault.ts, convex/encryption.ts and the userSalts +
// vaultKeys tables) once every account has migrated.

import { deriveLegacyKey, decryptLegacyNode, decryptString, exportKeyB64, encodeNode, unwrapKeyB64 } from "./crypto";
import { decodeHistoryPayload, encodeHistoryPayload } from "./recur";

const DONE_KEY = "todosst:legacyMigrated";
const CACHE_KEY = "todosst:legacyKey";
// the retired vault's "remember this device" entry — {salt, keyB64} of the
// master key. When it is still on the device the migration needs no password.
const OLD_REMEMBERED_KEY = "todosst:rememberedKey";

/** Has this device already migrated the account? */
export function migrationDone(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markMigrationDone(): void {
  try {
    localStorage.setItem(DONE_KEY, "1");
    localStorage.removeItem(CACHE_KEY);
  } catch {}
}

/** Cache the unwrapped vault key for this device so the prompt happens once. */
export function cacheLegacyKey(rawKeyB64: string): void {
  try {
    localStorage.setItem(CACHE_KEY, rawKeyB64);
  } catch {}
}

export function readCachedLegacyKey(): string | null {
  try {
    return localStorage.getItem(CACHE_KEY);
  } catch {
    return null;
  }
}

/** The old client's remembered master key, if this device still has it. */
function readOldRememberedKey(): string | null {
  try {
    const raw = localStorage.getItem(OLD_REMEMBERED_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { salt?: unknown; keyB64?: unknown };
    if (typeof parsed?.keyB64 !== "string" || parsed.keyB64.length < 10) return null;
    return parsed.keyB64;
  } catch {
    return null;
  }
}

type SaltApi = { getMySalt: () => Promise<string | null>; getSalt: (a: { username: string }) => Promise<string | null> };
type KeyApi = { getKeyRecord: (a: { kind: "password" | "recovery" | "notification" }) => Promise<{ ciphertext: string; iv: string } | null> };
type TodoRow = { _id: string; node?: string; ciphertext?: string; iv?: string };
type HistoryRow = { _id: string; payload?: string; ciphertext?: string; iv?: string };

/**
 * Resolve the legacy vault key for an account. Tries the device cache first,
 * then derives it from `password` (sign-in password, or the recovery code when
 * `viaRecovery` is set). Returns the raw key base64 or null when it fails.
 */
export async function resolveLegacyKey(args: {
  password: string;
  username?: string;
  viaRecovery?: boolean;
  saltApi: SaltApi;
  keyApi: KeyApi;
}): Promise<string | null> {
  const cached = readCachedLegacyKey() ?? readOldRememberedKey();
  if (cached) {
    cacheLegacyKey(cached);
    return cached;
  }
  const kind = args.viaRecovery ? "recovery" : "password";
  try {
    const rec = await args.keyApi.getKeyRecord({ kind });
    if (!rec) return null;
    const salt =
      (await args.saltApi.getMySalt()) ??
      (args.username ? await args.saltApi.getSalt({ username: args.username }) : null);
    if (!salt) return null;
    const derived = await deriveLegacyKey(args.password, salt);
    const master = await unwrapKeyB64(derived, rec.iv, rec.ciphertext);
    const raw = await exportKeyB64(master);
    cacheLegacyKey(raw);
    return raw;
  } catch {
    return null;
  }
}

/**
 * Rewrite every legacy row for this account as plaintext. Safe to call when
 * there is nothing to do — it reports what it did.
 */
export async function migrateAccount(args: {
  rawKeyB64: string;
  todos: TodoRow[];
  history: HistoryRow[];
  migrateTodo: (a: { id: never; node: string }) => Promise<unknown>;
  migrateHistory: (a: { id: never; payload: string }) => Promise<unknown>;
}): Promise<{ todos: number; history: number; failed: number }> {
  const { importKeyB64 } = await import("./crypto");
  const key = await importKeyB64(args.rawKeyB64);
  let todos = 0;
  let history = 0;
  let failed = 0;

  for (const row of args.todos) {
    if (row.node || !row.ciphertext || !row.iv) continue;
    try {
      const node = await decryptLegacyNode(key, row.iv, row.ciphertext);
      await args.migrateTodo({ id: row._id as never, node: encodeNode(node) });
      todos++;
    } catch {
      failed++;
    }
  }
  for (const row of args.history) {
    if (row.payload || !row.ciphertext || !row.iv) continue;
    try {
      const data = decodeHistoryPayload(await decryptString(key, row.iv, row.ciphertext));
      if (!data) {
        failed++;
        continue;
      }
      await args.migrateHistory({ id: row._id as never, payload: encodeHistoryPayload(data) });
      history++;
    } catch {
      failed++;
    }
  }
  if (failed === 0) markMigrationDone();
  return { todos, history, failed };
}