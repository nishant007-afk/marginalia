const CACHE='marginalia-v5';
const STATIC_ASSETS=['./','./index.html','./app.js','./store.js','./manifest.webmanifest','./favicon.png','./icon-192.png','./icon-512.png','./sw-register.js','./install.js','./supabase-config.js'];

self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(STATIC_ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);

  // version.json: always fetch from network first (never cached)
  if(url.pathname.endsWith('version.json')){
    e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));
    return;
  }

  // Everything else: cache first, then network
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{
    if(res.ok&&e.request.method==='GET'){const c=res.clone();caches.open(CACHE).then(cache=>cache.put(e.request,c));}
    return res;
  }).catch(()=>caches.match('./index.html'))));
});
