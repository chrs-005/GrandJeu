// Grand Jeu – Custom Service Worker
// Handles Web Push notifications and notification clicks.
// vite-plugin-pwa (injectManifest strategy) replaces self.__WB_MANIFEST
// at build time with the precache asset list.

// Precache placeholder (required by vite-plugin-pwa injectManifest)
const _precacheManifest = self.__WB_MANIFEST; // eslint-disable-line no-unused-vars

const BROADCAST_CHANNEL = 'push-channel';

self.addEventListener('push', (event) => {
  let data = { title: 'Grand Jeu', body: 'You have a new notification.', url: '/app' };
  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch {
      data.body = event.data.text();
    }
  }

  // Forward to any open app windows via BroadcastChannel
  const bc = new BroadcastChannel(BROADCAST_CHANNEL);
  bc.postMessage(data);
  bc.close();

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon.svg',
      badge: '/icons/icon.svg',
      data: { url: data.url || '/app' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/app';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(clients.claim()));
