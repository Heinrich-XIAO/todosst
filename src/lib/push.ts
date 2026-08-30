"use client";

// Web Push subscription management (client side).
// The VAPID public key is public by design; the subscription endpoint+keys are
// stored server-side so the cron can wake this browser. Push bodies are empty —
// the service worker renders a generic notification.

const SW_PATH = "/sw.js";

function vapidPublicKey(): string {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
}

export type PushState = {
  supported: boolean; // this browser can do web push (iOS needs the installed PWA)
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
};

export type SubJson = { endpoint: string; p256dh: string; auth: string };

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register(SW_PATH);
  } catch {
    return null;
  }
}

export async function getPushState(): Promise<PushState> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { supported: false, permission: "unsupported", subscribed: false };
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    return { supported: true, permission: Notification.permission, subscribed: !!sub };
  } catch {
    return { supported: true, permission: Notification.permission, subscribed: false };
  }
}

function urlB64ToUint8(b64: string): Uint8Array {
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const std = (b64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(std);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Ask permission, register the SW and subscribe. Returns the sub to persist. */
export async function enablePush(): Promise<SubJson | null> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;
  await registerServiceWorker();
  // ready() guarantees an activated worker — subscribing on the registration
  // returned by register() races first-visit activation ("no active Service Worker")
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const key = vapidPublicKey();
    if (!key) return null;
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8(key) as unknown as BufferSource,
    });
  }
  const j = sub.toJSON();
  const keys = (j.keys ?? {}) as { p256dh?: string; auth?: string };
  if (!j.endpoint || !keys.p256dh || !keys.auth) return null;
  return { endpoint: j.endpoint, p256dh: keys.p256dh, auth: keys.auth };
}

/** Unsubscribe this browser. Returns the endpoint to delete server-side. */
export async function disablePush(): Promise<string | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (!sub) return null;
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    return endpoint;
  } catch {
    return null;
  }
}
