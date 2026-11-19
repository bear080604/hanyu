// Service Worker — WenQing Chinese
const CACHE_NAME = 'wenqing-v19';
const STATIC_ASSETS = [
  '/hanyu/',
  '/hanyu/index.html',
  '/hanyu/styles.css',
  '/hanyu/profile.js',
  '/hanyu/logo.png',
  '/hanyu/logo-light.png',
  '/hanyu/logo-dark.png',
  '/hanyu/manifest.json',
  '/hanyu/data/data.js',
  '/hanyu/js/layout.js',
  '/hanyu/js/shared.js',
  '/hanyu/js/flash.js',
  '/hanyu/js/quiz.js',
  '/hanyu/js/sentence.js',
  '/hanyu/js/write.js',
  '/hanyu/js/arena.js',
  '/hanyu/js/stats.js',
  '/hanyu/js/favorites.js',
  '/hanyu/js/custom.js',
  '/hanyu/js/settings.js',
  '/hanyu/pages/flash.html',
  '/hanyu/pages/quiz.html',
  '/hanyu/pages/sentence.html',
  '/hanyu/pages/write.html',
  '/hanyu/pages/arena.html',
  '/hanyu/pages/stats.html',
  '/hanyu/pages/favorites.html',
  '/hanyu/pages/custom.html',
  '/hanyu/pages/settings.html',
];

// Install — cache static assets
self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_NAME; })
          .map(function (k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

// Fetch — network first (always fresh), fallback to cache when offline
self.addEventListener('fetch', function (e) {
  // Skip non-GET and API/CDN calls
  if (e.request.method !== 'GET' || e.request.url.includes('workers.dev') || e.request.url.includes('cdn.jsdelivr')) {
    return;
  }
  e.respondWith(
    fetch(e.request).then(function (networkRes) {
      if (networkRes && networkRes.status === 200) {
        var clone = networkRes.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(e.request, clone);
        });
      }
      return networkRes;
    }).catch(function () {
      return caches.match(e.request).then(function (cached) {
        if (cached) return cached;
        if (e.request.mode === 'navigate') {
          return caches.match('/hanyu/index.html');
        }
      });
    })
  );
});
