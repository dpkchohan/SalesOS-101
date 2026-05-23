const CACHE = "salesos-v2";
const API_CACHE = "salesos-api-v2";

self.addEventListener("message", (event) => {
  if (event.data?.type === "CLEAR_API_CACHE") {
    caches.delete(API_CACHE).catch(() => {});
  }
});

const OFFLINE_API_PATHS = [
  "/api/dashboard/summary",
  "/api/contacts",
  "/api/leads",
];

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE && k !== API_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.pathname.includes("/__clerk")) return;

  if (url.pathname.startsWith("/api/")) {
    const isOfflineable = OFFLINE_API_PATHS.some((p) =>
      url.pathname.startsWith(p),
    );
    if (!isOfflineable) return;

    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(API_CACHE).then((c) => c.put(req, clone));
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then(
            (cached) => cached || new Response(JSON.stringify({ error: "offline" }), {
              status: 503,
              headers: { "Content-Type": "application/json" },
            }),
          ),
        ),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(req, clone));
          }
          return res;
        })
        .catch(() => cached || new Response("Offline", { status: 503 }));
      return cached || networkFetch;
    }),
  );
});
