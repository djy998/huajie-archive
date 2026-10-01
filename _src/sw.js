/* 花舞之街 · 离线缓存
   页面：网络优先，超时用缓存；带 ?v= 的脚本与样式：缓存优先；图片与字体：缓存优先，定期后台更新。
   停用：换成只含 install 时 skipWaiting、activate 时清空缓存并 unregister 的版本 */
const VERSION = new URL(self.location.href).searchParams.get("v") || "0";
const SHELL_CACHE = "hj-shell-" + VERSION;
const MEDIA_CACHE = "hj-media";
const MEDIA_MAX = 500;
const NAV_TIMEOUT = 3500;
const RECHECK_MS = 6 * 3600 * 1000;

const SHELL = [new Request("./", { cache: "reload" }), `style.css?v=${VERSION}`,
  ...["boot", "verify", "config", "main", "ticket", "venue", "survey"].map((n) => `${n}.js?v=${VERSION}`)];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

/* 保留上一版脚本，供超时时返回的旧页面使用 */
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => {
        const shells = keys.filter((k) => k.startsWith("hj-shell-") && k !== SHELL_CACHE);
        return Promise.all(shells.slice(0, -1).map((k) => caches.delete(k)));
      })
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || req.headers.has("range")) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  let handler = null;
  if (req.mode === "navigate") handler = navigate;
  else if (/\.(?:js|css)$/.test(url.pathname) && url.searchParams.has("v")) handler = shellFirst;
  else if (/\.(?:webp|jpe?g|png|gif|svg|ico|woff2?)$/i.test(url.pathname)) handler = mediaFirst;
  if (!handler) return;
  e.respondWith(handler(e, req, url).catch(() => fetch(req)));
});

const cacheable = (res) => res && res.ok && res.status === 200 && res.type === "basic";

function keep(e, promise) {
  const p = promise.catch(() => {});
  try { e.waitUntil(p); } catch (err) {}
  return p;
}

async function navigate(e, req, url) {
  const key = url.origin + url.pathname;
  const cache = await caches.open(SHELL_CACHE);
  const network = fetch(req).then((res) => {
    if (cacheable(res)) keep(e, cache.put(key, res.clone()));
    return res;
  });
  const cached = (await cache.match(key)) || (await caches.match(key));
  if (!cached) return network;
  keep(e, network);
  const late = new Promise((resolve) => setTimeout(() => resolve(cached), NAV_TIMEOUT));
  const fresh = network.then((res) => (res.ok ? res : cached), () => cached);
  return Promise.race([fresh, late]);
}

async function shellFirst(e, req) {
  const cache = await caches.open(SHELL_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (cacheable(res)) keep(e, cache.put(req, res.clone()));
  return res;
}

async function mediaFirst(e, req) {
  const cache = await caches.open(MEDIA_CACHE);
  const hit = await cache.match(req);
  const refresh = () => fetch(req).then((res) => {
    if (cacheable(res)) keep(e, cache.put(req, res.clone()).then(() => trim(cache)));
    return res;
  });
  if (!hit) return refresh();
  const checkedAt = Date.parse(hit.headers.get("date") || "") || 0;
  if (Date.now() - checkedAt > RECHECK_MS) keep(e, refresh());
  return hit;
}

let trimming = false;
async function trim(cache) {
  if (trimming) return;
  trimming = true;
  try {
    const keys = await cache.keys();
    for (let i = 0; i < keys.length - MEDIA_MAX; i++) await cache.delete(keys[i]);
  } finally {
    trimming = false;
  }
}
