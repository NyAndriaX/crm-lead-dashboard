/* Service Worker — notifications Web Push CRM */
self.addEventListener("push", (event) => {
  let data = { title: "CRM", body: "", link: null };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    data.body = event.data?.text() ?? "";
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body || undefined,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      data: { link: data.link },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link;
  if (link) {
    const url = link.startsWith("http") ? link : `${self.location.origin}${link.startsWith("/") ? link : `/${link}`}`;
    event.waitUntil(clients.openWindow(url));
  }
});
