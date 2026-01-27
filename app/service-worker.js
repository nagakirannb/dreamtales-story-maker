/* app/service-worker.js */

const CACHE_NAME = "dreamtales-cache-v7";

// Cache only STATIC assets (never cache /.netlify/functions/*)
const URLS_TO_CACHE = [
  "/app/",
  "/app/index.html",
  "/app/manifest.webmanifest",

  // Music (static)
  "/Music/dreamtales-night.mp3",
  "/Music/TwinkleTLS-lullaby-baby-sleep-music.mp3",
  "/Music/soft-piano-music-432727.mp3",
  "/Music/krishna_flute.mp3",

  // Icons (only if these files actually exist at these paths)
  // If you don’t have them, either add the files or remove these lines.
  "/app/icon-192.png",
  "/app/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(async (cache) => {
        // Optional (D): don’t fail install if any asset 404s
        const results = await Promise.allSettled(
          URLS_TO_CACHE.map((url) => cache.add(url))
        );

        const failed = results.filter((r) => r.status === "rejected");
        if (failed.length) {
          console.warn("SW precache: some assets failed (safe to ignore).", failed);
        }
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.map((n) => (n !== CACHE_NAME ? caches.delete(n) : null)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // ✅ CRITICAL: never cache/proxy serverless functions
  if (url.pathname.startsWith("/.netlify/functions/")) {
    event.respondWith(fetch(req));
    return;
  }

  // Only GET requests should be cached
  if (req.method !== "GET") {
    event.respondWith(fetch(req));
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;

      return fetch(req)
        .then((res) => {
          // Cache successful same-origin responses
          if (res && res.ok && url.origin === location.origin) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});
