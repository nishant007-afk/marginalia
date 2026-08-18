'use strict';

/* Cache-first service worker so the app opens and works offline. */

const CACHE = 'marginalia-v2';
const ASSETS = [
  './',
  './index.html',
  './library.css',
  './app.css',
  './library.js',
  './categories.js',
  './export-formats.js',
  './store.js',
  './web-bridge.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './favicon.png',
  './install.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => {
      if (hit) return hit;
      return fetch(e.request).then((res) => {
        if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(e.request, copy));
        }
        return res;
      });
    })
  );
});
