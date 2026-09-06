// todosst service worker — web push reminders.
// Push bodies are empty or a tiny encrypted JSON ({t:"nudge"}) by design (the
// server never learns task content); the notification is generic. Open/focused
// tabs also show in-app toasts.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
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
