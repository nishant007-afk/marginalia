const CACHE = 'marginalia-v10';
const STATIC_ASSETS = [
  './', './index.html', './app.js', './store.js',
  './manifest.webmanifest', './favicon.png',
  './icon-192.png', './icon-512.png',
  './install.js', './supabase-config.js',
  '../assets/fa/css/all.min.css',
  '../assets/fa/webfonts/fa-solid-900.woff2',
  '../assets/fa/webfonts/fa-regular-400.woff2',
  '../assets/fa/webfonts/fa-brands-400.woff2'
];

// Files that change on every release. For these, always try the network first
// so the app picks up updates immediately when online, and only fall back to
// the cache when offline.
const ALWAYS_FRESH = (path) =>
  path === './' || path.endsWith('index.html') || path.endsWith('app.js') ||
  path.endsWith('store.js') || path.endsWith('install.js') || path.endsWith('supabase-config.js');

/* --- Install --- */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

/* --- Activate: clean old caches, take control --- */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* --- Listen for messages from clients --- */
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/* --- Fetch --- */
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // version.json / update.json: always network-first
  if (url.pathname.endsWith('version.json') || url.pathname.endsWith('update.json')) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // App code: network first, cache fallback, update cache in the background.
  if (ALWAYS_FRESH(url.pathname)) {
    e.respondWith(
      fetch(e.request).then(resp => {
        if (resp && resp.ok && e.request.method === 'GET') {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return resp;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Everything else (fonts, icons, css): cache-first, update in background.
  e.respondWith(
    caches.match(e.request).then(cached => {
      const networkFetch = fetch(e.request).then(resp => {
        if (resp && resp.ok && e.request.method === 'GET') {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return resp;
      }).catch(() => cached);

      return cached || networkFetch;
    })
  );
});
