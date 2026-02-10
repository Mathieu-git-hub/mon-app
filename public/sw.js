const CACHE_NAME = "monapp-v3";

const ASSETS_TO_CACHE = [
  "/manifest.webmanifest",
  "/icons/icon-home-144.png",
  "/icons/icon-home-192.png",
  "/icons/icon-home-512.png"
];






self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
});


self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});


self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1) Ne touche jamais à l'API
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) return;

  // 2) Ne touche pas aux non-GET
  if (req.method !== "GET") return;

  // 3) Network-first pour index.html + script.js (évite les vieux fichiers)
  const isAppShell =
    url.origin === self.location.origin &&
    (url.pathname === "/" || url.pathname === "/index.html" || url.pathname === "/script.js");

  if (isAppShell) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req, { cache: "no-store" });
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, fresh.clone());
          return fresh;
        } catch (e) {
          const cached = await caches.match(req);
          if (cached) return cached;
          // dernier recours : si "/" ou index indispo, tente index en cache
          return (await caches.match("/index.html")) || Response.error();
        }
      })()
    );
    return;
  }

  // 4) Cache-first pour le reste (icônes, manifest, etc.)
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});


