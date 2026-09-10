"use client";

// Notification copy crypto. Reminder pushes carry the task name so the service
// worker can render "[name] — [X]m reminder" while the app is closed. The name
// is AES-GCM'd with a dedicated notification key — never the vault master key —
// so a leaked device key reveals notification copy only. The key lives wrapped
// server-side (vaultKeys kind "notification") and raw in this device's
// IndexedDB under the same db/store the service worker reads.

export const NOTIF_DB_NAME = "todosst-sw";
export const NOTIF_STORE = "notifKey";

export type NotifBlob = { iv: string; ct: string };

function bufToBase64(buf: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
  return btoa(binary);
}

function base64ToBuf(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Random 256-bit notification key, base64. */
export function generateNotifKeyB64(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bufToBase64(bytes);
}

function importRawKey(rawKeyB64: string, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", base64ToBuf(rawKeyB64) as unknown as BufferSource, { name: "AES-GCM" }, false, usages);
}

/** Encrypt the push copy for one reminder: {name, min} as an opaque blob. */
export async function encryptNotifBlob(rawKeyB64: string, name: string, min: number): Promise<NotifBlob> {
  const key = await importRawKey(rawKeyB64, ["encrypt"]);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const pt = new TextEncoder().encode(JSON.stringify({ name, min }));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as unknown as BufferSource }, key, pt as unknown as BufferSource);
  return { iv: bufToBase64(iv), ct: bufToBase64(new Uint8Array(ct)) };
}

/** Inverse of encryptNotifBlob — null when the blob/key is bad or tampered. */
export async function decryptNotifBlob(
  rawKeyB64: string,
  blob: NotifBlob
): Promise<{ name: string; min: number } | null> {
  try {
    const key = await importRawKey(rawKeyB64, ["decrypt"]);
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBuf(blob.iv) as unknown as BufferSource },
      key,
      base64ToBuf(blob.ct) as unknown as BufferSource
    );
    const d = JSON.parse(new TextDecoder().decode(pt)) as unknown;
    if (!d || typeof d !== "object") return null;
    const { name, min } = d as { name?: unknown; min?: unknown };
    if (typeof name !== "string" || typeof min !== "number") return null;
    return { name, min };
  } catch {
    return null;
  }
}

function openNotifDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(NOTIF_DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(NOTIF_STORE, { keyPath: "userId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB unavailable"));
  });
}

/** Mirror the raw key for the service worker (keyed by account). */
export async function storeNotifKey(userId: string, rawKeyB64: string): Promise<void> {
  const db = await openNotifDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(NOTIF_STORE, "readwrite");
      tx.objectStore(NOTIF_STORE).put({ userId, rawB64: rawKeyB64 });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("indexedDB write failed"));
      tx.onabort = () => reject(tx.error ?? new Error("indexedDB write failed"));
    });
  } finally {
    db.close();
  }
}

/** Remove the mirrored key (sign-out) — best effort, never throws. */
export async function clearNotifKey(): Promise<void> {
  try {
    const db = await openNotifDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(NOTIF_STORE, "readwrite");
        tx.objectStore(NOTIF_STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("indexedDB write failed"));
        tx.onabort = () => reject(tx.error ?? new Error("indexedDB write failed"));
      });
    } finally {
      db.close();
    }
  } catch {}
}
