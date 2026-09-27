/* ═══════════════════════════════════════════
   RYAN OS — Service Worker
   Cache strategy:
   - App shell (index.html, icons) → Cache First
   - Firebase Realtime DB           → Network Only  (live data)
   - Gemini API                     → Network Only  (AI calls)
   - Google Fonts                   → Cache First w/ network fallback
   - Everything else                → Network First w/ cache fallback
   ═══════════════════════════════════════════ */

const CACHE_NAME   = 'ryanos-v1';
const SHELL_ASSETS = [
  './index.html',
  './icon.png',
  './icon-192.png',
  './icon-512.png'
];

/* URLs that must always go to the network — no caching */
const NETWORK_ONLY = [
  'firebasedatabase.app',
  'generativelanguage.googleapis.com'
];

/* URLs to cache aggressively (Google Fonts) */
const CACHE_FIRST_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

/* ── INSTALL: pre-cache the app shell ── */
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(SHELL_ASSETS.map(function(url) {
        return new Request(url, { cache: 'reload' });
      }));
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

/* ── ACTIVATE: clear old caches ── */
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys
          .filter(function(key) { return key !== CACHE_NAME; })
          .map(function(key) { return caches.delete(key); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

/* ── FETCH: route by strategy ── */
self.addEventListener('fetch', function(event) {
  var url = event.request.url;

  /* 1 — Network Only (Firebase, Gemini) */
  if (NETWORK_ONLY.some(function(h) { return url.includes(h); })) {
    event.respondWith(fetch(event.request));
    return;
  }

  /* 2 — Cache First (Google Fonts) */
  if (CACHE_FIRST_HOSTS.some(function(h) { return url.includes(h); })) {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        if (cached) return cached;
        return fetch(event.request).then(function(response) {
          if (!response || response.status !== 200) return response;
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
          return response;
        });
      })
    );
    return;
  }

  /* 3 — Cache First for the app shell (index.html + icons) */
  if (
    event.request.mode === 'navigate' ||
    SHELL_ASSETS.some(function(a) { return url.endsWith(a.replace('./', '')); })
  ) {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        /* Always try to update the cache in the background */
        var networkFetch = fetch(event.request).then(function(response) {
          if (response && response.status === 200) {
            var clone = response.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, clone);
            });
          }
          return response;
        }).catch(function() { return null; });

        /* Return cache immediately; update happens silently */
        return cached || networkFetch;
      })
    );
    return;
  }

  /* 4 — Network First with cache fallback for everything else */
  event.respondWith(
    fetch(event.request).then(function(response) {
      if (!response || response.status !== 200 || event.request.method !== 'GET') {
        return response;
      }
      var clone = response.clone();
      caches.open(CACHE_NAME).then(function(cache) {
        cache.put(event.request, clone);
      });
      return response;
    }).catch(function() {
      return caches.match(event.request);
    })
  );
});
