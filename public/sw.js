const CACHE_NAME = "monapp-v2";

const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/script.js",
  "/manifest.webmanifest",

  // ✅ mets ici tes vrais fichiers d'icônes
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-144.png"
];




self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // ✅ 1) On ne cache JAMAIS l'API (sinon login cassé)
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) {
    return; // laisse le navigateur faire le fetch normal
  }

  // ✅ 2) On ne cache jamais les requêtes non-GET (POST login etc.)
  if (req.method !== "GET") {
    return;
  }

  // ✅ 3) Pour le reste : stratégie simple cache-first
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((resp) => {
        // Optionnel : tu peux décider quoi mettre en cache ici
        return resp;
      });
    })
  );
});

