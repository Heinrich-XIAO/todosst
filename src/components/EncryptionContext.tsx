"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import React, { createContext, useContext, useCallback, useEffect, useMemo, useState } from "react";
import { deriveKey, generateSaltB64, encryptTodo, decryptTodo, type PlainTodo } from "@/lib/crypto";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

type EncryptedState = {
  key: CryptoKey | null;
  salt: string | null;
  isLocked: boolean;
  isReady: boolean; // has salt + key attempt finished
  deriveAndSetKey: (password: string, saltB64: string) => Promise<void>;
  unlock: (password: string) => Promise<void>;
  lock: () => void;
  clearKey: () => void;
  encryptTodo: (todo: PlainTodo) => Promise<{ ciphertext: string; iv: string }>;
  decryptTodo: (iv: string, ciphertext: string) => Promise<PlainTodo>;
  pendingPassword: string | null;
  setPendingPassword: (p: string | null) => void;
  pendingSalt: string | null;
  setPendingSalt: (s: string | null) => void;
};

const Ctx = createContext<EncryptedState | null>(null);

// sessionStorage key for salt cache (salt is public, ok to cache)
const SALT_STORAGE_PREFIX = "todosst:salt:";

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
  const [pendingPassword, setPendingPassword] = useState<string | null>(null);
  const [pendingSalt, setPendingSalt] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  // mySalt is fetched when authenticated to know current user's salt
  const mySalt = useQuery(api.encryption.getMySalt);
  const ensureSalt = useMutation(api.encryption.ensureSalt);

  // When mySalt loads, cache it and mark ready
  useEffect(() => {
    if (mySalt === undefined) return; // loading
    if (mySalt) setSalt(mySalt);
    setIsReady(true);
  }, [mySalt]);

  const deriveAndSetKey = useCallback(async (password: string, saltB64: string) => {
    const k = await deriveKey(password, saltB64);
    setKey(k);
    setSalt(saltB64);
  }, []);

  // Unlock: called from UnlockScreen or after sign-in.
  // Tries mySalt first, then falls back to cached/pending.
  const unlock = useCallback(
    async (password: string) => {
      // Prefer server salt if available
      const s = mySalt ?? salt ?? pendingSalt;
      // Also try to fetch via pendingSalt state (set by AuthForm)
      if (!s) throw new Error("no salt available — sign in again");
      const k = await deriveKey(password, s);
      // Verify we can decrypt at least one todo later? We optimistically set key.
      // To detect wrong password, try to decrypt a probe if we have todos — caller will handle errors.
      setKey(k);
      setSalt(s);
    },
    [mySalt, salt, pendingSalt]
  );

  const lock = useCallback(() => {
    setKey(null);
  }, []);

  const clearKey = useCallback(() => {
    setKey(null);
    setSalt(null);
    setPendingPassword(null);
    setPendingSalt(null);
  }, []);

  const encrypt = useCallback(
    async (todo: PlainTodo) => {
      if (!key) throw new Error("locked — no encryption key");
      return await encryptTodo(key, todo);
    },
    [key]
  );

  const decrypt = useCallback(
    async (iv: string, ciphertext: string) => {
      if (!key) throw new Error("locked — no encryption key");
      return await decryptTodo(key, iv, ciphertext);
    },
    [key]
  );

  // When we have a pendingPassword + pendingSalt (set by AuthForm during sign-up/in)
  // auto-derive key and ensureSalt on server.
  useEffect(() => {
    if (!pendingPassword || !pendingSalt) return;
    // If already have key, skip
    if (key) return;
    let cancelled = false;
    (async () => {
      try {
        const k = await deriveKey(pendingPassword, pendingSalt);
        if (cancelled) return;
        setKey(k);
        setSalt(pendingSalt);
        // ensure salt persisted (only if authenticated)
        if (mySalt === null) {
          try {
            await ensureSalt({ salt: pendingSalt });
          } catch {
            // ignore — maybe already exists
          }
        }
      } finally {
        // keep pendingPassword briefly? clear after derivation to avoid keeping in memory
        // but keep pendingSalt for unlock
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pendingPassword, pendingSalt, key, mySalt, ensureSalt]);

  const value = useMemo<EncryptedState>(
    () => ({
      key,
      salt,
      isLocked: !key,
      isReady,
      deriveAndSetKey,
      unlock,
      lock,
      clearKey,
      encryptTodo: encrypt,
      decryptTodo: decrypt,
      pendingPassword,
      setPendingPassword,
      pendingSalt,
      setPendingSalt,
    }),
    [key, salt, isReady, deriveAndSetKey, unlock, lock, clearKey, encrypt, decrypt, pendingPassword, pendingSalt]
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
