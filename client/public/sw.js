const CACHE_NAME = 'ecogreen-support-v264';
const STATIC_ASSETS = [
  '/manifest.json',
  '/support-icon-192.png',
  '/support-icon-512.png',
  '/support-icon-maskable-512.png',
  '/company-logo.png',
  '/company-logo-white.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, icon, badge, data, tag } = event.data;
    self.registration.showNotification(title || 'Eco Green Support', {
      body: body || 'New service update received.',
      icon: icon || '/support-icon-192.png',
      badge: badge || '/support-icon-192.png',
      tag: tag || (data?.ticketId ? `ticket-${data.ticketId}` : `egs-alert-${Date.now()}`),
      renotify: true,
      data: data || { url: '/complaints' }
    });
  }
});

// PWA Background Push Event (Handles incoming push notifications when app is closed)
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (_) {
      data = { title: 'Eco Green Support Alert', body: event.data.text() };
    }
  }

  const title = data.title || 'Eco Green Support Alert';
  const targetUrl = data.url || (data.ticketId ? `/complaints?ticket=${data.ticketId}` : '/complaints');

  const options = {
    body: data.body || 'New complaint or service update received.',
    icon: data.icon || '/support-icon-192.png',
    badge: data.badge || '/support-icon-192.png',
    tag: data.tag || (data.ticketId ? `ticket-${data.ticketId}` : `egs-push-${Date.now()}`),
    renotify: true,
    data: {
      url: targetUrl,
      ticketId: data.ticketId || null
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options).catch((err) => {
      console.warn('[SW] showNotification failed:', err);
    })
  );
});

// Auto-renew push subscription if refreshed by mobile OS/browser
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager.subscribe(event.oldSubscription?.options || { userVisibleOnly: true })
      .then((newSub) => {
        const subJson = newSub.toJSON();
        return fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: subJson.endpoint,
            keys: subJson.keys
          })
        });
      })
      .catch((err) => console.warn('[SW] Push subscription renewal failed:', err))
  );
});

// User taps on the notification in the phone lock screen or notification drawer
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'close') return;

  const targetUrl = event.notification.data?.url || '/complaints';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus existing open tab if available
      for (const client of windowClients) {
        if ('focus' in client) {
          if (client.url && client.url.includes(self.origin)) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
      }
      // Otherwise open new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Pass non-GET, API calls, uploads, and version checks straight to network
  if (
    event.request.method !== 'GET' || 
    url.includes('/api') || 
    url.includes('/uploads') || 
    url.includes('/version.json')
  ) {
    return;
  }

  // 1. Manifest check: NETWORK-FIRST so app name and icons apply immediately
  if (url.includes('/manifest.json')) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 2. Navigation requests (HTML page): NETWORK-FIRST
  // Guarantees user always gets fresh HTML with latest JS bundle hashes on deploy
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/', clone));
          }
          return networkResponse;
        })
        .catch(async () => {
          // If network is completely offline, fall back to cached shell safely
          const cached = await caches.match('/');
          if (cached) return cached;
          const indexCached = await caches.match('/index.html');
          if (indexCached) return indexCached;
          return new Response('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Eco Green Support - Offline</title></head><body style="font-family:sans-serif;text-align:center;padding:40px;"><h2>Eco Green Solar Support</h2><p>You appear to be offline. Please reconnect to the internet.</p></body></html>', {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
            status: 200
          });
        })
    );
    return;
  }

  // 3. Static icons & images: Cache-first with background revalidation
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }
      return fetch(event.request);
    })
  );
});
