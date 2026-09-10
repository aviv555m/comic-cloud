// Bookshelf service worker — app-shell offline support
// Strategy:
//   - HTML navigations: network-first, fall back to cached index.html
//   - Same-origin /assets/* (hashed Vite output): cache-first (immutable)
//   - /db/ + /uploads/ (secure file server): network-first, cached image fallback
//   - Other same-origin GETs: stale-while-revalidate
//   - Cross-origin (Supabase, fonts, etc.): pass through

const VERSION = 'v4';
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

// /db/ and /uploads/ are the secure file server (covers, avatars, book files).
const isFileServerPath = (url) =>
  url.pathname.startsWith('/db/') || url.pathname.startsWith('/uploads/');

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

  // File-server files are mutable (a replaced cover is re-uploaded to the same path),
  // so network-first: the server sends ETag + must-revalidate, making the refetch a
  // cheap 304. Only image responses are kept as an offline fallback - book files are
  // huge and their URLs carry a rotating ?token=, so a cached copy never matches again.
  if (isFileServerPath(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(RUNTIME_CACHE);
        try {
          const res = await fetch(request);
          if (res.ok && isAssetPath(url)) cache.put(request, res.clone()).catch(() => undefined);
          return res;
        } catch {
          return (
            (await cache.match(request)) || new Response('Offline', { status: 503 })
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
        .catch(() => undefined);
      // Keep the worker alive for the revalidation, or it can be killed once the
      // cached response is returned and the entry never refreshes.
      if (cached) {
        event.waitUntil(fetchPromise);
        return cached;
      }
      return (await fetchPromise) || new Response('Offline', { status: 503 });
    })(),
  );
});
