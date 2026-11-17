/* WombiCoon service worker v3 */
const CACHE = 'wombicoon-v3';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const sameOrigin = (url) => { try { return new URL(url).origin === location.origin; } catch (e) { return false; } };

self.addEventListener('message', (e) => {
  const list = e.data && Array.isArray(e.data.precache) ? e.data.precache.filter(sameOrigin).slice(0, 80) : [];
  if (!list.length) return;
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(list.map((u) => c.match(u).then((hit) => hit || fetch(u).then((res) => (res.ok ? c.put(u, res) : null)).catch(() => null))))));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || !sameOrigin(req.url)) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || (req.mode === 'navigate' ? caches.match('./') : Response.error())))
  );
});
