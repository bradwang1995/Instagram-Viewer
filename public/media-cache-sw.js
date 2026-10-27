const MEDIA_CACHE = "instagram-viewer-media-v2";
const MAX_IMAGES = 80;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter(
              (name) =>
                name.startsWith("instagram-viewer-media-") &&
                name !== MEDIA_CACHE,
            )
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Opaque cross-origin responses hide HTTP errors (including 429). Never persist them.
  if (
    request.method !== "GET" ||
    request.destination !== "image" ||
    new URL(request.url).origin !== self.location.origin
  )
    return;

  event.respondWith(
    caches.open(MEDIA_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;

      const response = await fetch(request);
      if (
        response.ok &&
        response.headers.get("Content-Type")?.startsWith("image/")
      ) {
        try {
          await cache.put(request, response.clone());
          const keys = await cache.keys();
          await Promise.all(
            keys
              .slice(0, Math.max(0, keys.length - MAX_IMAGES))
              .map((key) => cache.delete(key)),
          );
        } catch {
          /* Storage pressure must not turn a successful image into a failed load. */
        }
      }
      return response;
    }),
  );
});
