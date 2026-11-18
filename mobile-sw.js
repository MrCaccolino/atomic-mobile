const CACHE = 'atomic-mobile-files-1.0.70-20261118';
const ASSETS = ['./', './index.html', './FamilyWellnessMobile.html', './mobile.js', './mobile.css',
  './mobile-manifest.webmanifest', './atomic-mobile-icon.svg', './atomic-mobile-192.png',
  './atomic-mobile-512.png', './sync/config.js', './sync/categories.js', './sync/core.js', './sync/transport.js',
  './sync/qr-mobile.js', './sync/qr.js', './sync/transfer.js'];
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  // Reload each asset so an HTTP cache from a previous release cannot enter this cache.
  await cache.addAll(ASSETS.map(asset => new Request(new URL(asset, self.registration.scope), { cache: 'reload' })));
  await self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter(key => key.startsWith('atomic-mobile-') && key !== CACHE).map(key => caches.delete(key)));
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  const asset = ASSETS.find(asset => new URL(asset, self.registration.scope).pathname === url.pathname);
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(new Request(event.request, { cache: 'no-cache' })).then(async response => {
      if (response.ok) return response;
      return (await caches.open(CACHE)).match('./FamilyWellnessMobile.html').then(cached => cached || response);
    }).catch(async () => (await caches.open(CACHE)).match('./FamilyWellnessMobile.html')));
    return;
  }
  if (asset) event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(asset)) || fetch(event.request)));
});
