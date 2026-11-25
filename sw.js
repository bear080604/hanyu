// Service Worker — WenQing Chinese
const CACHE_NAME = 'wenqing-v41';
const RELATIVE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './storage.js',
  './api-client.js',
  './profile.js',
  './logo-light.png',
  './logo-dark.png',
  './manifest.json',
  './data/data.js',
  './js/layout.js',
  './js/shared.js',
  './js/flash.js',
  './js/quiz.js',
  './js/sentence.js',
  './js/write.js',
  './js/arena.js',
  './js/stats.js',
  './js/favorites.js',
  './js/custom.js',
  './js/settings.js',
  './pages/flash.html',
  './pages/quiz.html',
  './pages/sentence.html',
  './pages/write.html',
  './pages/arena.html',
  './pages/stats.html',
  './pages/favorites.html',
  './pages/custom.html',
  './pages/settings.html',
];

function getStaticAssetUrls() {
  var scope = (self.registration && self.registration.scope) || self.location.href;
  return RELATIVE_ASSETS.map(function (rel) {
    return new URL(rel, scope).toString();
  });
}

// Install — cache static assets
self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(getStaticAssetUrls());
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
      return caches.match(e.request, { ignoreSearch: true }).then(function (cached) {
        if (cached) return cached;
        if (e.request.mode === 'navigate') {
          var scope = (self.registration && self.registration.scope) || self.location.href;
          return caches.match(new URL('./index.html', scope).toString());
        }
      });
    })
  );
});
