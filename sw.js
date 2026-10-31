/* Image cache: images show instantly after the first visit and refresh quietly in the background.
   Pages, scripts and API calls always go to the network, so nothing here can serve stale code or data. */
const CACHE = 'gta-img-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('gta-img-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || r.destination !== 'image') return;
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const hit = await cache.match(r);
    const net = fetch(r).then((res) => { if (res && (res.ok || res.type === 'opaque')) cache.put(r, res.clone()).catch(() => {}); return res; }).catch(() => hit);
    return hit || net;
  }));
});
