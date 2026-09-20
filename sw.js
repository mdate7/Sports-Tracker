const CACHE_NAME = "clubhouse-v6";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./Clubhouse-tokens.css",
  "./script.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const url = event.request.url;
  if (url.includes("supabase.co")) return;

  // Always fetch app code fresh from the network — never serve a stale copy.
  //
  // This used to name script.js explicitly, from when it was the only JS file.
  // Once the code was split across auth/football/golf/gym/teams.js, those all
  // fell through to the cache-first branch below and went stale independently
  // of script.js — so a fix could land in one file and not another, which is
  // maddening to debug. Match on extension instead of filename so new files
  // are covered automatically.
  const isAppCode = /\.(js|css)(\?|$)/.test(url) && url.startsWith(self.location.origin);

  if (isAppCode || url.includes("index.html") || event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
