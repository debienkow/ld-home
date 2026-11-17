/* WombiCoon service worker v5 */
const CACHE = 'wombicoon-v4';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const sameOrigin = (url) => { try { return new URL(url).origin === location.origin; } catch (e) { return false; } };

const fill = (c, urls) => Promise.all(urls.map((u) => c.match(u).then((hit) => hit || fetch(u).then((res) => (res.ok ? c.put(u, res) : null)).catch(() => null))));

/* Programmdateien des aktuellen Stands vollständig vorhalten, ältere entfernen */
async function tidy(c) {
  const res = await fetch(new URL('assets.json', self.registration.scope), { cache: 'no-store' });
  if (!res.ok) return;
  const names = await res.json();
  if (!Array.isArray(names) || !names.length) return;
  const base = new URL('assets/', self.registration.scope).href;
  const keep = new Set(names.filter((n) => typeof n === 'string').map((n) => new URL(n, self.registration.scope).href).filter((u) => u.startsWith(base)));
  if (!keep.size) return;
  for (const req of await c.keys()) if (req.url.startsWith(base) && !keep.has(req.url)) await c.delete(req);
  await fill(c, [...keep]);
}

self.addEventListener('message', (e) => {
  const list = e.data && Array.isArray(e.data.precache) ? e.data.precache.filter(sameOrigin).slice(0, 80) : [];
  if (!list.length) return;
  e.waitUntil(caches.open(CACHE).then((c) => fill(c, list).then(() => tidy(c))).catch(() => {}));
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
