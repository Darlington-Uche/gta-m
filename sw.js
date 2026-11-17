// Retires the old service worker from earlier versions of the site: clears its caches and unregisters.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => { try { for (const k of await caches.keys()) await caches.delete(k); } catch (_) {} await self.registration.unregister(); const cs = await self.clients.matchAll(); cs.forEach((c) => c.navigate(c.url)); })()));
