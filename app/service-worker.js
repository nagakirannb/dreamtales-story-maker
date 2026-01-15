const CACHE_NAME = "dreamtales-cache-v2";

// Only cache truly static assets (NO HTML)
const URLS_TO_CACHE = [
  "./manifest.webmanifest",
  "./favicon.ico"
  // add music/mp3/css/js only if they are versioned or rarely change
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(URLS_TO_CACHE))
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
