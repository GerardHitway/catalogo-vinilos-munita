// ==========================================================================
// HITWAY MUSIC & BOOKS - SERVICE WORKER PARA TABLET PWA (OFFLINE FIRST)
// ==========================================================================

const CACHE_NAME = 'hitway-music-books-v9';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/icons.js',
  './js/db.js',
  './js/app.js',
  './assets/icon-192.svg',
  './assets/icon-512.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  // Ignorar peticiones no HTTP/HTTPS o esquemas especiales
  if (!e.request.url.startsWith('http')) return;

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(e.request).then((networkResponse) => {
        // Cachear dinámicamente recursos estáticos
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Si no hay red y es un documento HTML, devolver index.html cacheado
        if (e.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
