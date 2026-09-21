const CACHE_NAME = "bapo-shell-v9";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./style.css?v=5",
  "./app.js?v=5",
  "./firebase-config.js",
  "./gif-config.js",
  "./manifest.json",
  "./icons/bapo-mark.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_FILES))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Rede primeiro: o navegador sempre recebe a versão publicada mais nova, e o
// cache serve só quando está sem internet. (Antes era o contrário, e dava pra
// acabar com o HTML novo e o CSS velho ao mesmo tempo — layout quebrado.)
// Tudo que é de outro domínio (Firestore, Firebase Auth, avatares do DiceBear)
// passa direto pela rede, sem cache.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.mode === "navigate") return caches.match("./index.html");
          return Response.error();
        })
      )
  );
});
