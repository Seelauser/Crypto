// Service worker for OrderFlow push notifications

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'OrderFlow Signal', body: event.data.text() };
  }

  const title = payload.title ?? 'OrderFlow Signal';
  const options = {
    body: payload.body ?? '',
    icon: payload.icon ?? '/favicon.ico',
    badge: payload.badge ?? '/favicon.ico',
    data: { url: payload.url ?? '/' },
    vibrate: [100, 50, 100],
    requireInteraction: false,
    tag: 'orderflow-signal',
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/dashboard';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
