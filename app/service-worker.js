const CACHE_NAME = "dreamtales-cache-v3";

// Only cache truly static assets (NO HTML)
// NOTE: use relative paths because the app is hosted under /app/
const URLS_TO_CACHE = [
  "./manifest.webmanifest",
  "./favicon.ico",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // "Optional D": Don't let a single missing file break service-worker install.
      // addAll() fails the whole install if any request fails.
      const results = await Promise.allSettled(
        URLS_TO_CACHE.map(async (url) => {
          try {
            await cache.add(url);
          } catch (e) {
            // Keep install successful; we'll just skip this asset.
            console.warn("SW cache skip:", url, String(e));
          }
        })
      );

      // Prevent unused var lint in some bundlers
      void results;
    })()
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => (key !== CACHE_NAME ? caches.delete(key) : null)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // ✅ Always go network-first for HTML navigations (index pages, routes, etc.)
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    event.respondWith(
      fetch(req).catch(() => caches.match(req))
    );
    return;
  }

  // ✅ Never cache Netlify Identity widget / auth endpoints
  if (url.hostname.includes("netlify") && url.pathname.includes("identity")) {
    event.respondWith(fetch(req));
    return;
  }

  // ✅ Cache-first for everything else
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});
