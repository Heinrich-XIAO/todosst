// todosst service worker — web push reminders + offline shell cache.
// Reminder pushes carry client-encrypted copy blobs ({name, min} under a
// dedicated notification key mirrored into IndexedDB) so the worker renders
// "[name] — [X]m reminder"; nudge pushes carry a tiny encrypted
// ({t:"nudge"}) tag; anything else (or undecryptable) renders generic copy.
// The server can't read any of it. Open/focused tabs also show in-app toasts.
//
// Offline: the catch-all route means one HTML document serves every path, so
// that document is precached on install and refreshed opportunistically;
// immutable /_next/static chunks are cached at runtime. An offline navigation
// falls back to the cached shell so the PWA can open without network —
// captures made then park in the client-side IndexedDB outbox (src/lib/outbox)
// and replay on the next online open. Convex traffic is cross-origin and is
// never intercepted.

const SHELL_CACHE = "todosst-shell-v1";
const ASSET_CACHE = "todosst-assets-v1";
const SHELL_URL = "/";
// navigations cached per-URL (revisit offline = byte-exact shell); trimmed to
// the newest few so long breadcrumb histories don't grow the cache unbounded
const MAX_NAV_ENTRIES = 8;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      try {
        const res = await fetch(SHELL_URL, { cache: "reload" });
        if (res.ok) await cache.put(SHELL_URL, res);
      } catch {}
      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // navigation preload keeps skipWaiting() from stalling in-flight page
      // loads with a dead worker
      if (self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.enable();
        } catch {}
      }
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n !== SHELL_CACHE && n !== ASSET_CACHE)
          .map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

function isDevOrigin(url) {
  const host = url.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/apple-touch-icon.png" ||
    url.pathname === "/favicon.ico" ||
    url.pathname === "/icon.svg"
  );
}

// keep at most MAX_NAV_ENTRIES document responses per cache, never evicting
// the precached root shell
async function trimNavigations(cache) {
  try {
    const keys = await cache.keys();
    const docs = keys.filter((k) => new URL(k.url).pathname !== SHELL_URL);
    const excess = docs.length - (MAX_NAV_ENTRIES - 1);
    for (let i = 0; i < excess; i++) await cache.delete(docs[i]);
  } catch {}
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  // cross-origin (convex websocket/polling, auth endpoints) — never intercept
  if (url.origin !== self.location.origin) return;
  const dev = isDevOrigin(url);

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const preload = event.preloadResponse ? await event.preloadResponse.catch(() => null) : null;
          const res = preload || (await fetch(req));
          if (res && res.ok) {
            try {
              const cache = await caches.open(SHELL_CACHE);
              await cache.put(req, res.clone());
              await trimNavigations(cache);
            } catch {}
          }
          return res;
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          const cached =
            (await cache.match(req, { ignoreSearch: true })) || (await cache.match(SHELL_URL));
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        // prod chunks are content-hashed and immutable — cache-first; dev
        // chunks churn under the same URLs, so dev stays network-first
        if (!dev) {
          const hit = await caches.match(req);
          if (hit) return hit;
        }
        try {
          const res = await fetch(req);
          if (res.ok) {
            try {
              const cache = await caches.open(ASSET_CACHE);
              await cache.put(req, res.clone());
            } catch {}
          }
          return res;
        } catch {
          const hit = await caches.match(req);
          if (hit) return hit;
          return Response.error();
        }
      })()
    );
  }
});

// ---- push ----

// Must match src/lib/notifKey.ts — the page mirrors the raw notification key
// here on unlock so this worker can decrypt reminder copy.
const NOTIF_DB = "todosst-sw";

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Raw notification key (base64) for the account a push came in for; null when
// absent (fresh device, signed out) — the caller falls back to generic copy.
function loadNotifKeyB64(userId) {
  return new Promise((resolve) => {
    if (!self.indexedDB) return resolve(null);
    let open;
    try {
      open = self.indexedDB.open(NOTIF_DB, 1);
    } catch {
      return resolve(null);
    }
    open.onupgradeneeded = () => {
      open.result.createObjectStore("notifKey", { keyPath: "userId" });
    };
    open.onerror = () => resolve(null);
    open.onsuccess = () => {
      const db = open.result;
      let tx;
      try {
        tx = db.transaction("notifKey", "readonly");
      } catch {
        db.close();
        return resolve(null);
      }
      const get = tx.objectStore("notifKey").get(userId);
      get.onsuccess = () => {
        db.close();
        const row = get.result;
        resolve(row && typeof row.rawB64 === "string" ? row.rawB64 : null);
      };
      get.onerror = () => {
        db.close();
        resolve(null);
      };
    };
  });
}

async function decryptReminderItems(rawB64, items) {
  const out = [];
  try {
    const key = await crypto.subtle.importKey("raw", b64ToBytes(rawB64), { name: "AES-GCM" }, false, ["decrypt"]);
    for (const it of items) {
      try {
        const pt = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: b64ToBytes(it.iv) },
          key,
          b64ToBytes(it.ct)
        );
        const d = JSON.parse(new TextDecoder().decode(pt));
        if (d && typeof d.name === "string" && typeof d.min === "number") {
          out.push({ name: d.name, min: d.min, todoId: typeof it.todoId === "string" ? it.todoId : "" });
        }
      } catch {}
    }
  } catch {}
  return out;
}

function showGeneric() {
  return self.registration.showNotification("todosst", {
    body: "tasks due soon — open todosst to see them",
    tag: "todosst-reminders",
    renotify: true,
    data: { url: self.registration.scope },
  });
}

// Duolingo-flavored nudge copy — 10 phrases across three families (risk /
// missed / comeback), rotated by UTC day so the same day never repeats.
// Values come from the client-encrypted blob; missing numbers render as 0.
const NUDGE_COPY = {
  risk: [
    "your streak is still alive — clear {open} task{s} to keep it",
    "don't lose the streak — {open} task{s} left today",
    "the day isn't over — {open} task{s} to stay in the groove",
    "{streak} days and counting — {open} task{s} to clear",
  ],
  missed: [
    "1 day missed — get back today before it becomes 2",
    "the streak already broke — start a new one today ({open} task{s})",
    "{missed} day{s} gone — show up today to stop the slide",
  ],
  comeback: [
    "fresh start: clear {open} task{s} today and day 1 begins",
    "todosst misses you — {open} task{s} waiting",
    "a new streak starts with today — {open} task{s} to clear",
  ],
};

function nudgeBody(s) {
  try {
    const list = NUDGE_COPY[s.k];
    if (!Array.isArray(list) || list.length === 0) throw new Error("no copy");
    const open = typeof s.open === "number" && s.open >= 0 ? s.open : 0;
    const streak = typeof s.streak === "number" ? s.streak : 0;
    const missed = typeof s.missed === "number" ? s.missed : 0;
    const day = Math.floor(Date.now() / 86400000);
    return list[day % list.length]
      .replaceAll("{s}", open === 1 ? "" : "s")
      .replaceAll("{open}", String(open))
      .replaceAll("{streak}", String(streak))
      .replaceAll("{missed}", String(missed));
  } catch {
    return null;
  }
}

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let d = null;
      try {
        if (event.data) d = event.data.json();
      } catch {}
      if (d && d.t === "nudge") {
        let body = "today's windows are open — clear them";
        if (typeof d.u === "string" && d.nb) {
          const rawB64 = await loadNotifKeyB64(d.u);
          if (rawB64) {
            try {
              const key = await crypto.subtle.importKey("raw", b64ToBytes(rawB64), { name: "AES-GCM" }, false, ["decrypt"]);
              const pt = await crypto.subtle.decrypt(
                { name: "AES-GCM", iv: b64ToBytes(d.nb.iv) },
                key,
                b64ToBytes(d.nb.ct)
              );
              const s = JSON.parse(new TextDecoder().decode(pt));
              body = nudgeBody(s) ?? body;
            } catch {}
          }
        }
        await self.registration.showNotification("todosst", {
          body,
          tag: "todosst-nudge",
          renotify: true,
          data: { url: self.registration.scope },
        });
        return;
      }
      if (d && d.t === "reminder" && typeof d.u === "string" && Array.isArray(d.items) && d.items.length > 0) {
        const rawB64 = await loadNotifKeyB64(d.u);
        const named = rawB64 ? await decryptReminderItems(rawB64, d.items) : [];
        for (const n of named) {
          await self.registration.showNotification("todosst", {
            body: n.min > 0 ? `${n.name} — ${n.min}m reminder` : `${n.name} — due now`,
            tag: n.todoId ? `todosst-rem-${n.todoId}` : "todosst-reminders",
            renotify: true,
            data: { url: self.registration.scope },
          });
        }
        const more = Number(d.more) || 0;
        if (named.length === 0) return showGeneric();
        if (more > 0) {
          await self.registration.showNotification("todosst", {
            body: `${more} more tasks due soon — open todosst to see them`,
            tag: "todosst-reminders",
            renotify: true,
            data: { url: self.registration.scope },
          });
        }
        return;
      }
      await showGeneric();
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of all) {
        if ("focus" in client) return client.focus();
      }
      return self.clients.openWindow(event.notification.data?.url || "/");
    })()
  );
});
