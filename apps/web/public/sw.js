/* Service worker. Caches ONLY same-origin static build assets + the offline page.
   /api/* and every non-GET request always go to the network and are never stored,
   so grades, finance data and private attachments are never cached. */
const CACHE = 'ayandeh-static-v1';
const PRECACHE = ['/offline.html', '/manifest.webmanifest', '/icons/icon-192.png'];

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request; const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return; // network only
  if (req.mode === 'navigate') { e.respondWith(fetch(req).catch(() => caches.match('/offline.html'))); return; }
  if (url.pathname.startsWith('/assets/')) { // hashed, immutable build files
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; })));
  }
});

self.addEventListener('push', e => {
  let d = { title: 'مدرسه آینده', body: 'اعلان جدید', url: '/' };
  try { d = { ...d, ...e.data.json() }; } catch (_) {}
  e.waitUntil(self.registration.showNotification(d.title, { body: d.body, tag: d.tag, icon: '/icons/icon-192.png', dir: 'rtl', lang: 'fa', data: { url: '/' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(ws => ws.length ? ws[0].focus() : self.clients.openWindow('/')));
});
