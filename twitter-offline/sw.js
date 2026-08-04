const SHELL_CACHE = "shell-v1";
const MEDIA_CACHE = "media-v1";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./app.js",
  "./db.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== MEDIA_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isMediaHost = /twimg\.com$/.test(url.hostname);

  if (isSameOrigin) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req)
            .then((res) => {
              const copy = res.clone();
              caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
              return res;
            })
            .catch(() => caches.match("./index.html"))
      )
    );
    return;
  }

  if (isMediaHost) {
    event.respondWith(
      caches.open(MEDIA_CACHE).then((cache) =>
        cache.match(req).then(
          (cached) =>
            cached ||
            fetch(req)
              .then((res) => {
                if (res.ok) cache.put(req, res.clone());
                return res;
              })
              .catch(() => cached)
        )
      )
    );
  }
});
