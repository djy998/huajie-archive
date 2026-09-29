/* =============================================================================
   花舞之街 · 薰风花语町 —— 离线缓存 sw.js（Service Worker）
   -----------------------------------------------------------------------------
   访客第一次进站后由 main.js 的 initOfflineCache() 注册（sw.js?v=HJ_VERSION），之后：
     · 页面（index.html）：先走网络；网络慢过 NAV_TIMEOUT 或连不上时，先用缓存里的上一份顶上，
       网络那份到了存起来，下次打开就是新的
     · 带 ?v= 的脚本和样式表：版本号变了就是新文件，缓存里有就直接用
     · 图片、字体：缓存里有就直接用；距上次向服务器确认超过 RECHECK_MS 时，在后台确认一次有没有更新
     · /api/、B 站 / 字体 / 验证码 / 统计等其它网站、音频视频的分段请求：不经过这里
   发布新版本（改 HJ_VERSION）时注册地址跟着变，浏览器会重新安装，并清掉更早版本的脚本缓存。
   万一需要停用：把本文件换成只有下面这几行的版本上传即可（访客下次打开时自动卸载）：
     self.addEventListener("install", () => self.skipWaiting());
     self.addEventListener("activate", (e) => e.waitUntil(caches.keys()
       .then((ks) => Promise.all(ks.map((k) => caches.delete(k))))
       .then(() => self.registration.unregister())));
   ============================================================================= */

const VERSION = new URL(self.location.href).searchParams.get("v") || "0";
const SHELL_CACHE = "hj-shell-" + VERSION;   // 页面、脚本、样式表（按版本）
const MEDIA_CACHE = "hj-media";              // 图片、字体（不分版本，按需更新）
const MEDIA_MAX = 500;                       // 图片最多存这么多张，超过从最早的删起
const NAV_TIMEOUT = 3500;
const RECHECK_MS = 6 * 3600 * 1000;

const SHELL = ["./", `style.css?v=${VERSION}`,
  ...["verify", "config", "main", "ticket", "venue", "survey"].map((n) => `${n}.js?v=${VERSION}`)];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

/* 脚本缓存只留当前和上一个版本：网络慢时顶上的旧页面还能配上它那一版的脚本 */
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
  /* 缓存出任何问题（隐私模式、空间不足…）都退回普通的网络请求，不让页面坏掉 */
  e.respondWith(handler(e, req, url).catch(() => fetch(req)));
});

const cacheable = (res) => res && res.ok && res.status === 200 && res.type === "basic";

/* 让浏览器等后台的写缓存 / 更新做完；事件已经结束时直接跳过 */
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
