// todosst service worker — web push reminders + offline shell cache.
// Push bodies are empty or a tiny encrypted JSON ({t:"nudge"}) by design (the
// server never learns task content); the notification is generic. Open/focused
// tabs also show in-app toasts.
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

self.addEventListener("push", (event) => {
  let nudge = false;
  try {
    if (event.data) {
      const d = event.data.json();
      nudge = !!d && d.t === "nudge";
    }
  } catch {}
  const body = nudge
    ? "today's windows are open — clear them"
    : "tasks due soon — open todosst to see them";
  event.waitUntil(
    self.registration.showNotification("todosst", {
      body,
      tag: nudge ? "todosst-nudge" : "todosst-reminders",
      renotify: true,
      data: { url: self.registration.scope },
    })
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
