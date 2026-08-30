// todosst service worker — web push reminders.
// Push bodies are empty by design (the server never learns task content);
// the notification is generic. Open/focused tabs also show in-app toasts.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  event.waitUntil(
    self.registration.showNotification("todosst", {
      body: "tasks due soon — open todosst to see them",
      tag: "todosst-reminders",
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
