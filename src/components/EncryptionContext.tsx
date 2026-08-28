"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import React, { createContext, useContext, useCallback, useEffect, useMemo, useState } from "react";
import {
  deriveKey,
  deriveRecoveryKey,
  exportKeyB64,
  importKeyB64,
  generateSaltB64,
  unwrapKeyB64,
  wrapKeyB64,
} from "@/lib/crypto";
import { useConvex, useQuery, type ConvexReactClient } from "convex/react";
import { api } from "../../convex/_generated/api";

type EncryptedState = {
  key: CryptoKey | null;
  salt: string | null;
  isLocked: boolean;
  isReady: boolean; // has salt fetch finished
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

function getCachedSalt(email: string): string | null {
  try {
    return sessionStorage.getItem(SALT_STORAGE_PREFIX + email.toLowerCase());
  } catch {
    return null;
  }
}
function setCachedSalt(email: string, salt: string) {
  try {
    sessionStorage.setItem(SALT_STORAGE_PREFIX + email.toLowerCase(), salt);
  } catch {}
}

export function EncryptionProvider({ children }: { children: React.ReactNode }) {
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [salt, setSalt] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const convex = useConvex();

  // mySalt is fetched when authenticated to know current user's salt
  const mySalt = useQuery(api.encryption.getMySalt);

  // When mySalt loads, cache it and mark ready
  useEffect(() => {
    if (mySalt === undefined) return; // loading
    if (mySalt) setSalt(mySalt);
    setIsReady(true);
  }, [mySalt]);

  const setKeyFromRaw = useCallback(
    async (keyB64: string, saltB64: string) => {
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
      setKey(master);
      setSalt(saltB64);
    },
    [convex]
  );

  const lock = useCallback(() => {
    setKey(null);
  }, []);

  const clearKey = useCallback(() => {
    setKey(null);
    setSalt(null);
  }, []);

  const clearStoredKey = useCallback(() => {
    clearRememberedKey();
  }, []);

  // Auto-unlock from localStorage when "store locally" was checked.
  // If a remembered key exists and its salt matches the server salt, import it.
  useEffect(() => {
    if (key) return;
    if (mySalt === undefined) return; // still loading
    if (!mySalt) return; // no server salt yet
    const stored = getRememberedKey();
    if (!stored) return;
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
  }, [key, mySalt]);

  const value = useMemo<EncryptedState>(
    () => ({
      key,
      salt,
      isLocked: !key,
      isReady,
      setKeyFromRaw,
      resolveVaultPassword,
      resolveVaultRecovery,
      lock,
      clearKey,
      clearStoredKey,
    }),
    [key, salt, isReady, setKeyFromRaw, resolveVaultPassword, resolveVaultRecovery, lock, clearKey, clearStoredKey]
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
