"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import React, { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deriveKey,
  deriveRecoveryKey,
  exportKeyB64,
  importKeyB64,
  generateSaltB64,
  unwrapKeyB64,
  wrapKeyB64,
} from "@/lib/crypto";
import { clearNotifKey, generateNotifKeyB64, storeNotifKey } from "@/lib/notifKey";
import { useConvex, useQuery, type ConvexReactClient } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useOnline } from "@/lib/useOnline";

type EncryptedState = {
  key: CryptoKey | null;
  salt: string | null;
  isLocked: boolean;
  isReady: boolean; // has salt fetch finished
  /** Raw notification key (b64) for push copy blobs — null until ensured. */
  notifKeyB64: string | null;
  /** Set the vault key directly from raw key material (b64). */
  setKeyFromRaw: (keyB64: string, saltB64: string) => Promise<void>;
  /** Resolve the vault master key with the sign-in password (post-auth). */
  resolveVaultPassword: (password: string, saltB64: string, storeLocally: boolean) => Promise<void>;
  /** Resolve the vault master key with a recovery code (post-auth). */
  resolveVaultRecovery: (code: string, saltB64: string, storeLocally: boolean) => Promise<void>;
  lock: () => void;
  clearKey: () => void;
  clearStoredKey: () => void;
};

const Ctx = createContext<EncryptedState | null>(null);

// sessionStorage key for salt cache (salt is public, ok to cache)
const SALT_STORAGE_PREFIX = "todosst:salt:";

// localStorage key for remembered vault key (when "store locally" is checked)
// Stores { salt, keyB64 } — key is the vault master key, raw AES-GCM-256 as base64.
// Salt is public; keyB64 is secret but user explicitly opted into local persistence.
const REMEMBER_STORAGE_KEY = "todosst:rememberedKey";

// sessionStorage flag marking a session signed in via recovery code — allows one
// password change without the current password (backed by a server-side grant).
export const RECOVERY_SESSION_KEY = "todosst:recoverySession";

export function hasRecoverySession(): boolean {
  try {
    return typeof window !== "undefined" && sessionStorage.getItem(RECOVERY_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

// After signIn() resolves, the auth token can still be propagating to the convex
// client (the backend logs `auth:store` signIn → calls → refreshSession). Calls
// fired in that window run unauthenticated: `vault:getKeyRecord` then returns
// null (pushing an existing account down the wrong "adopt key" path) and
// mutations throw "not authenticated". Poll until the token is actually applied.
export async function waitForAuth(convex: ConvexReactClient, attempts = 24): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      if (await convex.query(api.auth.isAuthenticated)) return;
    } catch {
      // transient — token swap or dev hot reload; keep waiting
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("sign-in is taking longer than expected — please try again.");
}

export function clearRecoverySession() {
  try {
    sessionStorage.removeItem(RECOVERY_SESSION_KEY);
  } catch {}
}

export type RememberedKey = { salt: string; keyB64: string };

export function getRememberedKey(): RememberedKey | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const raw = localStorage.getItem(REMEMBER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RememberedKey;
    if (!parsed || typeof parsed.salt !== "string" || typeof parsed.keyB64 !== "string") return null;
    if (parsed.salt.length < 10 || parsed.keyB64.length < 10) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setRememberedKey(rem: RememberedKey) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    localStorage.setItem(REMEMBER_STORAGE_KEY, JSON.stringify(rem));
  } catch {}
}

export function clearRememberedKey() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    localStorage.removeItem(REMEMBER_STORAGE_KEY);
  } catch {}
}

function getCachedSalt(username: string): string | null {
  try {
    return sessionStorage.getItem(SALT_STORAGE_PREFIX + username.toLowerCase());
  } catch {
    return null;
  }
}
function setCachedSalt(username: string, salt: string) {
  try {
    sessionStorage.setItem(SALT_STORAGE_PREFIX + username.toLowerCase(), salt);
  } catch {}
}

// navigator.onLine is the only signal that a stuck query is offline rather
// than merely slow — with cached credentials the app can proceed without the
// server (offline capture, unlock from the remembered key)

export function EncryptionProvider({ children }: { children: React.ReactNode }) {
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [notifKeyB64, setNotifKeyB64] = useState<string | null>(null);
  const online = useOnline();
  // Set when the user locks manually — suppresses auto-unlock from the
  // remembered key until they explicitly unlock again (password/recovery).
  const [manualLock, setManualLock] = useState(false);
  const [salt, setSalt] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const convex = useConvex();

  // mySalt is fetched when authenticated to know current user's salt
  const mySalt = useQuery(api.encryption.getMySalt);

  // Set when an offline unlock trusted the remembered key before the server
  // salt could be checked — verified against the server salt on reconnect.
  const offlineUnlockSaltRef = useRef<string | null>(null);

  // When mySalt loads, cache it and mark ready. Re-runs on connectivity
  // flips: offline, the salt query can never resolve — cached credentials
  // decide readiness instead of hanging on "preparing vault…"
  useEffect(() => {
    if (mySalt === undefined) {
      if (!online) setIsReady(true);
      return;
    }
    // an offline unlock trusted the device key before the server salt
    // arrived — verify it still belongs to this account, and lock before any
    // wrong-key ciphertext can be written if it doesn't
    const offlineSalt = offlineUnlockSaltRef.current;
    if (offlineSalt !== null) {
      offlineUnlockSaltRef.current = null;
      if (mySalt !== offlineSalt) {
        setManualLock(true);
        setKey(null);
        return;
      }
    }
    if (mySalt) setSalt(mySalt);
    setIsReady(true);
  }, [mySalt, online]);

  const setKeyFromRaw = useCallback(
    async (keyB64: string, saltB64: string) => {
      setManualLock(false); // explicit key set clears a manual lock
      const k = await importKeyB64(keyB64);
      setKey(k);
      setSalt(saltB64);
    },
    []
  );

  // Resolve the vault master key using the sign-in password.
  // The master key M is stored wrapped under PBKDF2(password, salt); users from
  // before the master-key design simply adopt their password-derived key as M.
  const resolveVaultPassword = useCallback(
    async (password: string, saltB64: string, storeLocally: boolean) => {
      await waitForAuth(convex);
      const kpw = await deriveKey(password, saltB64);
      const rec = (await convex.query(api.vault.getKeyRecord, { kind: "password" })) as {
        iv: string;
        ciphertext: string;
      } | null;
      if (rec) {
        // throws on wrong password (GCM auth failure) — caller shows the error
        const master = await unwrapKeyB64(kpw, rec.iv, rec.ciphertext);
        const masterB64 = await exportKeyB64(master);
        if (storeLocally) setRememberedKey({ salt: saltB64, keyB64: masterB64 });
        else clearRememberedKey();
        setManualLock(false);
        setKey(master);
        setSalt(saltB64);
        return;
      }
      // no wrapper record yet — adopt the password-derived key as the master key
      const masterB64 = await exportKeyB64(kpw);
      try {
        const wrapped = await wrapKeyB64(kpw, masterB64);
        await convex.mutation(api.vault.putKeyRecord, { kind: "password", ...wrapped });
      } catch {
        // record insert failed — key still works this session; next unlock re-adopts
      }
      if (storeLocally) setRememberedKey({ salt: saltB64, keyB64: masterB64 });
      else clearRememberedKey();
      setManualLock(false);
      setKey(kpw);
      setSalt(saltB64);
    },
    [convex]
  );

  // Resolve the vault master key using a recovery code.
  const resolveVaultRecovery = useCallback(
    async (code: string, saltB64: string, storeLocally: boolean) => {
      await waitForAuth(convex);
      const kr = await deriveRecoveryKey(code, saltB64);
      const rec = (await convex.query(api.vault.getKeyRecord, { kind: "recovery" })) as {
        iv: string;
        ciphertext: string;
      } | null;
      if (!rec) throw new Error("no recovery key is set up for this account");
      const master = await unwrapKeyB64(kr, rec.iv, rec.ciphertext); // throws on wrong code
      const masterB64 = await exportKeyB64(master);
      if (storeLocally) setRememberedKey({ salt: saltB64, keyB64: masterB64 });
      else clearRememberedKey();
      setManualLock(false);
      setKey(master);
      setSalt(saltB64);
    },
    [convex]
  );

  const lock = useCallback(() => {
    setManualLock(true);
    setKey(null);
  }, []);

  const clearKey = useCallback(() => {
    setManualLock(false); // sign-out / fresh state — allow auto-unlock again on next sign-in
    setKey(null);
    setSalt(null);
    setNotifKeyB64(null);
    void clearNotifKey(); // the service worker's key must not outlive the account
  }, []);

  const clearStoredKey = useCallback(() => {
    clearRememberedKey();
  }, []);

  // Auto-unlock from localStorage when "store locally" was checked.
  // If a remembered key exists and its salt matches the server salt, import it.
  // Skipped while manualLock is set — lock() must keep the vault locked even
  // though the remembered key is still in localStorage.
  // Offline (salt query unresolvable), a remembered key unlocks on its own —
  // it carries the salt it was saved with; re-verified on reconnect above.
  useEffect(() => {
    if (key) return;
    if (manualLock) return; // user locked manually — stay locked until explicit unlock
    const stored = getRememberedKey();
    if (!stored) return;
    if (mySalt === undefined) {
      if (online) return; // still loading
      // offline fresh open: the server salt is unreachable — the remembered
      // key carries the salt it was saved with, so unlock from it alone
      let cancelled = false;
      (async () => {
        try {
          const k = await importKeyB64(stored.keyB64);
          if (cancelled) return;
          offlineUnlockSaltRef.current = stored.salt;
          setKey(k);
          setSalt(stored.salt);
        } catch {
          // corrupted or invalid stored key -> clear it
          clearRememberedKey();
        }
      })();
      return () => {
        cancelled = true;
      };
    }
    if (!mySalt) return; // no server salt yet
    if (stored.salt !== mySalt) return; // salt mismatch -> belongs to different user or rotated
    let cancelled = false;
    (async () => {
      try {
        const k = await importKeyB64(stored.keyB64);
        if (cancelled) return;
        setKey(k);
        setSalt(stored.salt);
      } catch {
        // corrupted or invalid stored key -> clear it
        clearRememberedKey();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, mySalt, manualLock, online]);

  // Notification key lifecycle (see src/lib/notifKey.ts): ensure a key wrapped
  // under the vault master key exists server-side, unwrap it for in-app blob
  // encryption, and mirror the raw key into IndexedDB so the service worker can
  // decrypt reminder copy while the app is closed. Runs on every unlock and
  // retries on reconnect (an offline unlock can't reach the server yet).
  // lock() only clears the in-memory copy — the IDB mirror keeps push copy
  // decryptable while the vault is locked, and clearKey (sign-out) removes it.
  const ensureNotifKey = useCallback(async () => {
    if (!key) return;
    try {
      type Wrapped = { iv: string; ciphertext: string } | null;
      const rec = (await convex.query(api.vault.getKeyRecord, { kind: "notification" })) as Wrapped;
      let rawB64: string | null = null;
      if (rec) {
        try {
          rawB64 = await exportKeyB64(await unwrapKeyB64(key, rec.iv, rec.ciphertext));
        } catch {
          // unreadable wrapper (corrupt / rotated under a different master) — rotate below
          rawB64 = null;
        }
      }
      if (!rawB64) {
        rawB64 = generateNotifKeyB64();
        const wrapped = await wrapKeyB64(key, rawB64);
        await convex.mutation(api.vault.putKeyRecord, { kind: "notification", ...wrapped });
        // concurrent first unlocks on two devices: the server's row wins, so
        // re-read and adopt it (falls back to our copy if the row vanished)
        const rec2 = (await convex.query(api.vault.getKeyRecord, { kind: "notification" })) as Wrapped;
        if (rec2) {
          try {
            rawB64 = await exportKeyB64(await unwrapKeyB64(key, rec2.iv, rec2.ciphertext));
          } catch {}
        }
      }
      setNotifKeyB64(rawB64);
      const userId = await convex.query(api.encryption.getMyId);
      if (userId) await storeNotifKey(userId, rawB64);
    } catch {
      // offline or the server write failed — pushes stay generic until retry
    }
  }, [key, convex]);

  useEffect(() => {
    if (!key) {
      setNotifKeyB64(null);
      return;
    }
    void ensureNotifKey();
  }, [key, online, ensureNotifKey]);

  const value = useMemo<EncryptedState>(
    () => ({
      key,
      salt,
      isLocked: !key,
      isReady,
      notifKeyB64,
      setKeyFromRaw,
      resolveVaultPassword,
      resolveVaultRecovery,
      lock,
      clearKey,
      clearStoredKey,
    }),
    [key, salt, isReady, notifKeyB64, setKeyFromRaw, resolveVaultPassword, resolveVaultRecovery, lock, clearKey, clearStoredKey]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useEncryption() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useEncryption must be used within EncryptionProvider");
  return ctx;
}

// Helpers for AuthForm to manage salt cache without hooks
export { getCachedSalt, setCachedSalt, generateSaltB64 };
