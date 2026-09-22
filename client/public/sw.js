const CACHE_NAME = 'ecogreen-cms-v5';
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
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Pass non-GET, API calls, and uploads straight to network
  if (event.request.method !== 'GET' || url.includes('/api') || url.includes('/uploads')) {
    return;
  }

  // 1. Navigation requests (HTML page): NETWORK-FIRST
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
        .catch(() => {
          // If network is completely offline, fall back to cached shell
          return caches.match('/');
        })
    );
    return;
  }

  // 2. Static icons & images: Cache-first with background revalidation
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
