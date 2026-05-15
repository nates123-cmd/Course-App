const CACHE_NAME = 'course-v19';
const STATIC_ASSETS = ['./', './index.html', './manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Cache API only handles http/https — skip chrome-extension://, blob:, data:, etc.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return;

  if (url.hostname.includes('anthropic.com') || url.hostname.includes('supabase.co')) {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
    return;
  }

  // Stale-while-revalidate: serve the cached copy instantly (fast launch,
  // works offline) AND fetch a fresh copy in the background to update the
  // cache for next launch. Net effect: one close-and-reopen picks up a
  // deploy, with no network wait on launch.
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      }).catch(() => cached);
      // Return cache immediately when present; otherwise wait on the network.
      return cached || networkFetch;
    })
  );
});
