const CACHE = 'marginalia-v7';
const STATIC_ASSETS = [
  './', './index.html', './app.js', './store.js',
  './manifest.webmanifest', './favicon.png',
  './icon-192.png', './icon-512.png',
  './install.js', './supabase-config.js'
];

/* --- Install --- */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

/* --- Activate: clean old caches, notify clients --- */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll())
      .then(clients => {
        clients.forEach(client => client.postMessage({ type: 'SW_UPDATED' }));
      })
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

  // version.json: always network-first
  if (url.pathname.endsWith('version.json')) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Everything else: cache-first, update in background
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
