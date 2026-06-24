// Bookshelf service worker — app-shell offline support
// Strategy:
//   - HTML navigations: network-first, fall back to cached index.html
//   - Same-origin /assets/* (hashed Vite output): cache-first (immutable)
//   - Other same-origin GETs: stale-while-revalidate
//   - Cross-origin (Supabase, fonts, etc.): pass through

const VERSION = 'v3';
const SHELL_CACHE = `shell-${VERSION}`;
const ASSETS_CACHE = `assets-${VERSION}`;
const RUNTIME_CACHE = `runtime-${VERSION}`;

const SHELL_URLS = ['/', '/index.html', '/manifest.json', '/favicon.ico'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      cache.addAll(SHELL_URLS).catch(() => undefined),
    ),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => ![SHELL_CACHE, ASSETS_CACHE, RUNTIME_CACHE].includes(n))
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

const isAssetPath = (url) =>
  url.pathname.startsWith('/assets/') ||
  /\.(?:js|css|woff2?|ttf|otf|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname);

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Cross-origin: don't intercept (lets Supabase etc. work normally)
  if (url.origin !== location.origin) return;

  // Navigation: network-first → cached index.html fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(SHELL_CACHE);
          cache.put('/index.html', fresh.clone()).catch(() => undefined);
          return fresh;
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          return (
            (await cache.match('/index.html')) ||
            (await cache.match('/')) ||
            new Response('Offline', { status: 503 })
          );
        }
      })(),
    );
    return;
  }

  // Hashed assets: cache-first
  if (isAssetPath(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSETS_CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const res = await fetch(request);
          if (res.ok) cache.put(request, res.clone()).catch(() => undefined);
          return res;
        } catch {
          return cached || new Response('Offline', { status: 503 });
        }
      })(),
    );
    return;
  }

  // Everything else same-origin: stale-while-revalidate
  event.respondWith(
    (async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(request);
      const fetchPromise = fetch(request)
        .then((res) => {
          if (res.ok) cache.put(request, res.clone()).catch(() => undefined);
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })(),
  );
});
