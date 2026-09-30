/* =============================================================================
   花舞之街 · 薰风花语町 —— 页面主脚本 main.js
   -----------------------------------------------------------------------------
   目录
     1. 常量                      9. 人机验证（弹窗）
     2. 通用工具                  10. 视觉特效（昼夜、飘落、点击爆花）
     3. 视图切换与路由            11. 头部工具：音量、更多、日历、时间条、天气
     4. 首页 / 活动详情 / 相册    12. 点赞
     5. 站点开关、验证开关、星芒节 13. 闹铃与倒计时（纯本地）
     6. 花街介绍 / 活动群弹窗      14. 首页弹窗公告
     7. 网站说明（关于 / 反馈 / 分享） 15. 花语（听得花间语）
     8. 大图预览                  16. 圆角下拉与日期选择
                                  17. 无障碍与启动
   脚本加载顺序（index.html 底部）：verify.js → config.js → main.js → ticket.js → venue.js → survey.js → initApp()
     · config.js：站点常量与活动内容（平时改内容只改它）
     · ticket.js：访客购票；venue.js：场地使用登记；survey.js：活动问卷
     · admin.js：管理页，进入 #internal 时才按需加载
     · huayu.js：花语的压缩与换字（数据较大），打开「听得花间语」或管理页「花语加密」时才按需加载
   这些文件共用本脚本的全局函数 / 常量（$、callWorker、showToast…），顺序不能乱。
   后端是 Cloudflare Worker（config.js 的 WORKER_URL），密码、公告、订单都在 Worker + D1。
   ============================================================================= */

/* =============================================================================
   1. 常量
   ============================================================================= */
const TILE_IDS = Object.keys(TILE_BG.day);

const MUSIC_FADE_MS = 700;    // 淡入淡出时长
const MUSIC_VOLUME = 0.55;    // 默认音量 0~1

/* localStorage 键名汇总 */
const STORE = {
  fxLevel:     "hj_fx_level",      // 动画档位 full / lite / off（index.html 开头按同一个键读取默认值）
  volume:      "hj_volume",        // 音量百分比 0~100，0 = 静音
  soundOn:     "hj_sound_on",
  captchaOkAt: "hj_captcha_ok_at",
  // 手动验证偏好（方式 / 时间）由 verify.js 自己用 hj_captcha_mode、hj_captcha_manual_at 记录
  pwFails:     "hj_pw_fail_count",
  starlight:   "hj_starlight",
  calOpen:     "hj_cal_open",
  calZoom:     "hj_cal_zoom",
  calYm:       "hj_cal_ym",
  calXy:       "hj_cal_xy",
  alarmItems:  "hj_alarm_items",   // 闹铃 / 倒计时（纯本地，见第 13 节）
};


/* =============================================================================
   2. 通用工具
   ============================================================================= */

const $ = (id) => document.getElementById(id);

/* localStorage 读写：隐私模式等环境下可能抛错，统一吞掉 */
const storage = {
  get(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, String(value)); } catch (e) {}
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  },
};

const pad2 = (n) => (n < 10 ? "0" : "") + n;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const randomItem = (list) => list[Math.floor(Math.random() * list.length)];

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/* 国服时间（UTC+8，无夏令时）换算 -----------------------------------------------
   定时开关、刷新点、星芒节等时间一律按国服时间理解，和访客电脑的时区无关。
   datetime-local 控件给的是「本地时区」的字面时间，所以必须显式按 +08:00 解析 / 格式化 */
const CN_TZ_OFFSET_MS = 8 * 3600 * 1000;
/* "2026-09-20T12:00"（datetime-local 的值）→ epoch 毫秒；格式不对返回 0 */
function cnLocalToEpoch(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(value || ""));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - CN_TZ_OFFSET_MS : 0;
}
/* epoch 毫秒 → "2026-09-20T12:00"（填回 datetime-local）；0 → "" */
const epochToCnLocal = (ms) => (ms ? new Date(ms + CN_TZ_OFFSET_MS).toISOString().slice(0, 16) : "");
/* epoch 毫秒 → "2026-09-20 12:00" */
const formatCnTime = (ms) => (ms ? epochToCnLocal(ms).replace("T", " ") : "");
/* epoch 毫秒 → "2026年9月20日 12:00" */
function formatCnLabel(ms) {
  const d = new Date(ms + CN_TZ_OFFSET_MS);
  return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日 ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}
/* 国服日期 + N 天 → "YYYY-MM-DD" */
const cnDate = (days = 0) => new Date(Date.now() + CN_TZ_OFFSET_MS + days * 86400000).toISOString().slice(0, 10);

/* 缩小版图片 ----------------------------------------------------------------------
   _src/tools/make-thumbs.py 按原图路径生成 resized/720/…（缩略图、卡片）和 resized/1280/…（页面里直接显示的大图），
   一律 .webp。页面里先用缩小版，点开大图时再看原图；某张图还没生成缩小版（404）时自动换回原图：
   <img> 带 data-orig，背景图用 setBgResized / data-bg */
function resizedSrc(src, width) {
  const m = /^([^?#:]+)\.(?:jpe?g|png|webp)(\?[^#]*)?$/i.exec(src || "");
  if (!m || m[1].startsWith("/")) return src;
  return `resized/${width}/${m[1]}.webp${m[2] || ""}`;
}

function setBgResized(el, src, width) {
  if (!el) return;
  if (!src) { el.style.backgroundImage = ""; return; }
  const small = resizedSrc(src, width);
  el.style.backgroundImage = `url('${small}')`;
  if (small === src) return;
  const probe = new Image();
  probe.onerror = () => { if (el.style.backgroundImage.includes(small)) el.style.backgroundImage = `url('${src}')`; };
  probe.src = small;
}

/* 模板里写 data-bg="原图" data-bg-w="720"，插进页面后调用一次 */
function applyBgs(root) {
  (root || document).querySelectorAll("[data-bg]").forEach((el) => {
    setBgResized(el, el.dataset.bg, Number(el.dataset.bgW) || 720);
    el.removeAttribute("data-bg");
  });
}

/* <img data-orig="原图">：缩小版读不到时换回原图（error 事件不冒泡，在捕获阶段统一接住） */
function initResizedFallback() {
  document.addEventListener("error", (e) => {
    const img = e.target;
    if (!img || img.tagName !== "IMG" || !img.dataset.orig || img.dataset.fallback) return;
    img.dataset.fallback = "1";
    img.src = img.dataset.orig;
  }, true);
}

/* 表单提示语：传空串即隐藏 */
function setMsg(el, text) {
  if (!el) return;
  el.textContent = text || "";
  el.hidden = !text;
}

let toastTimer = 0;
function showToast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
}

/* Worker 的绝对地址（WORKER_URL 允许写成 "/api/" 这样的同源相对路径） */
const workerBase = () => new URL(WORKER_URL, location.href).href;

/* 公告配图地址：D1 里存的是完整地址，统一改写到当前 WORKER_URL 上，后端换域名也不影响显示 */
function workerImageUrl(url) {
  const m = /\/image\/(announcements\/[\w-]+\.(?:webp|jpg|png))$/.exec(url || "");
  return m ? new URL(`image/${m[1]}`, workerBase()).href : url;
}

/* 调用 Worker（POST JSON）。连不上或返回的不是 JSON 时得到 null；
   Worker 的业务错误（含限流 429）照常返回 { ok: false, error } */
async function callWorker(payload) {
  try {
    const res = await fetch(workerBase(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch (e) {
    return null;
  }
}

/* 服务器时间校准：访客电脑的时钟常有几秒误差，而 1 艾欧泽亚分钟只有现实 2.9 秒，
   差 3 秒时间条就慢 1 分钟。启动时用 Worker 回的服务器时间算出偏差，时钟、天气、闹铃、购票入口都用 hjNow() */
let hjClockOffset = 0;
const hjNow = () => Date.now() + hjClockOffset;

function syncServerClock(serverNow, sentAt, receivedAt) {
  const rtt = receivedAt - sentAt;
  if (!Number.isFinite(serverNow) || rtt < 0 || rtt > 5000) return;
  hjClockOffset = Math.round(serverNow + rtt / 2 - receivedAt);
}

/* 分享功能开关：siteLockdown = true 表示分享功能已关闭（纯静态展示），
   这时活动群、复制附言、场地登记、问卷、点赞都不可用 */
const STATIC_MODE_MSG = "功能未开放，敬请谅解~";
let siteLockdown = false;

async function isLockedDown() {
  const data = await callWorker({ action: "get_lockdown" });
  if (data) siteLockdown = !!data.value;
  return data ? !!data.value : siteLockdown;
}

/* 需要联网互动的功能在静态模式下一律拦掉；顺手刷新一次开关状态 */
async function blockedByStaticMode() {
  if (siteLockdown) {
    showToast(STATIC_MODE_MSG);
    isLockedDown();   // 后台再确认一次，管理员刚开启时下次点击即恢复
    return true;
  }
  if (await isLockedDown()) {
    showToast(STATIC_MODE_MSG);
    return true;
  }
  return false;
}

const isDayMode = () => document.body.classList.contains("day-mode");
const prefersReducedMotion = () =>
  !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);


/* =============================================================================
   3. 视图切换与路由
   每个视图对应一个 hash，前进 / 后退可正确还原：
     (空) 首页  #latest 最新活动  #previous 往期列表  #event-<id> 往期详情
     #mini-review 小型活动回顾  #internal 内部入口  #venue 场地使用登记
     #survey 最新活动详情页，直接打开「反馈与建议」（活动问卷）
   另有独立地址 /activity/：最新活动详情页，没有「← 返回」，地址栏保持 /activity/ 不变
   （activity/index.html 由 build.mjs 生成，和首页是同一个页面，<base> 指回站点根目录）
   ============================================================================= */

/* 页面进入动画 ------------------------------------------------------------- */

/* 动画结束后移除类名：否则 animation-fill-mode:both 会一直锁住 transform，
   导致之后 hover 上浮失效 */
function clearAnimClassOnEnd(el, className) {
  const handler = (e) => {
    if (e.target !== el || e.animationName !== "fxPageEnter") return;
    el.classList.remove(className);
    el.style.animationDelay = "";
    el.removeEventListener("animationend", handler);
  };
  el.addEventListener("animationend", handler);
}

/* 重播一次动画（移除类 → 强制回流 → 加回类）；特效关闭时只清理样式 */
function playFxAnim(el, className, delayMs, autoClean) {
  if (!el) return;
  el.classList.remove(className);
  if (delayMs === undefined) {
    if (!fxEnabled) el.style.animationDelay = "";
  } else {
    el.style.animationDelay = fxEnabled ? delayMs + "ms" : "";
  }
  if (!fxEnabled) return;
  void el.offsetWidth;
  el.classList.add(className);
  if (autoClean) clearAnimClassOnEnd(el, className);
}

function playEnterAnim(el) {
  playFxAnim(el, "fx-page-enter", undefined, true);
}

function playFadeOnly(el) {
  playFxAnim(el, "fx-fade-only");
}

/* 视图内元素依次入场：先是顶层元素，再是网格里的卡片 */
function playViewEnterStagger(viewId, gridId) {
  const view = $(viewId);
  if (!view) return;
  const topLevel = Array.from(view.children).filter((el) => el.id !== gridId);
  const grid = gridId ? $(gridId) : null;
  const gridItems = grid ? Array.from(grid.children) : [];
  topLevel.forEach((el, i) => playFxAnim(el, "fx-page-enter", i * 90, true));
  gridItems.forEach((el, i) => playFxAnim(el, "fx-page-enter", topLevel.length * 90 + i * 60, true));
}

/* 首屏各区块依次入场 */
function playPageEnterStagger() {
  const blocks = [
    document.querySelector(".site-header"),
    document.querySelector(".tile-hero:not([hidden])") || document.querySelector("#latestVideoBlock:not([hidden])"),
    document.querySelector("#view-home .tile-grid"),
    document.querySelector("#view-home .tile-grid.tile-grid-3"),
    document.querySelector("footer"),
  ].filter(Boolean);
  blocks.forEach((el, i) => playFxAnim(el, "fx-page-enter", fxEnabled ? i * 110 : undefined, true));
}

/* 路由 --------------------------------------------------------------------- */

/* /activity/ 独立入口：在这个地址上只显示最新活动；去别的视图时地址换回站点根目录下的 #…，
   浏览器后退回到 /activity/ 时再显示最新活动 */
const SITE_ROOT = new URL(".", document.baseURI).pathname;
const pagePath = () => location.pathname.replace(/index\.html$/, "");
const ACTIVITY_PATH = document.documentElement.dataset.page === "activity" ? pagePath() : null;
const onActivityPage = () => !!ACTIVITY_PATH && pagePath() === ACTIVITY_PATH;

/* 冷启动直达：通过分享链接或二维码直接打开某个子视图时，「← 返回」没有意义，先隐藏；
   之后在站内跳转到其它视图即恢复。 */
let coldEntryView = null;

function hideColdEntryBack() {
  if (!coldEntryView) return;
  const btn = $(coldEntryView)?.querySelector(".back-btn");
  if (btn) btn.style.display = "none";
}

/* 切换视图时直接跳回顶部：html 设了 scroll-behavior: smooth，临时关掉，免得每次换页都慢慢滚上去 */
function scrollToTopInstant() {
  const root = document.documentElement;
  const prev = root.style.scrollBehavior;
  root.style.scrollBehavior = "auto";
  window.scrollTo(0, 0);
  root.style.scrollBehavior = prev;
}

const PAGE_DOC_TITLE = document.title;
const BASE_DOC_TITLE = document.documentElement.dataset.siteTitle || PAGE_DOC_TITLE;
function showView(id) {
  if (id !== "view-ticket") {
    document.title = onActivityPage() ? PAGE_DOC_TITLE : BASE_DOC_TITLE;
    /* 离开购票页：恢复网站标题（购票页可能设了不显示），停掉停留时间计时（ticket.js） */
    document.documentElement.classList.remove("hj-ticket-bare");
    if (typeof stopTicketIdle === "function") stopTicketIdle();
  }
  if (id !== "view-home" && homeVideoOpen) setHomeVideoOpen(false);
  // 回到首页时：设成默认展开（LATEST_VIDEO.defaultOpen）且用户没有手动收起过，才恢复展开（不自动播放）
  if (id === "view-home" && LATEST_VIDEO.defaultOpen && !homeVideoOpen && !homeVideoUserClosed && hasHomeVideo()) setHomeVideoOpen(true);
  if (id !== "view-detail") stopTabVideos();   // 离开详情页：活动回顾里的视频停掉
  if (id === "view-home") setTimeout(maybeShowSitePopup, 0);   // 回到首页：弹窗公告（每次打开网站只弹一次）
  document.querySelectorAll(".view").forEach((v) => { v.hidden = v.id !== id; });
  if (coldEntryView && id !== coldEntryView) coldEntryView = null;
  else hideColdEntryBack();
  scrollToTopInstant();
  playEnterAnim($(id));
}

function setRoute(hash) {
  const target = hash || "";
  if (onActivityPage()) {
    if (target === "#latest") return;   // 本来就在最新活动页，地址不变
    /* 离开 /activity/：换成站点根目录下的地址，并照常走一遍 hashchange */
    history.pushState(null, "", SITE_ROOT + target);
    setTimeout(() => window.dispatchEvent(new HashChangeEvent("hashchange")), 0);
    return;
  }
  if (location.hash !== target) location.hash = target;
}

function goHome() {
  closeAllModals();
  setRoute("");
  showView("view-home");
}

let routedPath = null;

function routeFromHash() {
  closeAllModals();
  let hash = location.hash;
  if (onActivityPage() && hash && hash !== "#") {
    /* /activity/#latest → /activity/；/activity/#其它 → 站点根目录下的 #其它 */
    history.replaceState(null, "", hash === "#latest" ? ACTIVITY_PATH : SITE_ROOT + hash);
    if (hash === "#latest") hash = "";
  }
  routedPath = location.pathname;
  if (onActivityPage()) {
    openLatestEvent();
  } else if (hash === "#internal") {
    openInternalView();
  } else if (hash === TICKET_HASH) {
    openTicketViewSafe();
  } else if (hash === TICKET_HASH_LONG) {
    history.replaceState(null, "", TICKET_HASH);   // 换成短链接，不产生额外的历史记录
    openTicketViewSafe();
  } else if (hash === "#venue") {
    if (typeof openVenueView === "function") openVenueView();
    else { showView("view-home"); showToast("登记页没加载出来，刷新一下页面再试"); }
  } else if (hash === "#latest") {
    openLatestEvent();
  } else if (hash === SURVEY_HASH) {
    openLatestSurvey();
  } else if (hash === "#previous") {
    openArchiveList();
  } else if (hash === "#mini-review") {
    openMiniReview();
  } else if (hash.startsWith("#event-")) {
    const ev = ARCHIVE_EVENTS.find((e) => e.id === hash.slice("#event-".length));
    if (ev) openDetail(ev);
    else goHome();
  } else {
    showView("view-home");
  }
}

/* 购票页在 ticket.js：万一那个文件没传上去 / 被缓存挡住，给句人话，而不是整页报错 */
function openTicketViewSafe() {
  if (typeof openTicketView === "function") { openTicketView(); return; }
  console.error("[购票] ticket.js 没有加载成功");
  showView("view-home");
  showToast("购票页面没加载出来，刷新一下页面再试");
}

/* 按需加载的脚本（版本号跟 index.html 的 HJ_VERSION）：普通访客用不到就不下载。
   ready() 为真表示已经加载并初始化好；失败了允许下次重试 */
const lateScripts = {};

function loadLateScript(file, ready) {
  if (ready()) return Promise.resolve();
  lateScripts[file] ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `${file}?v=${window.HJ_VERSION || ""}`;
    s.onload = () => (ready() ? resolve() : reject(new Error(`${file} init failed`)));
    s.onerror = () => { s.remove(); reject(new Error(`${file} load failed`)); };
    document.head.appendChild(s);
  }).catch((e) => { delete lateScripts[file]; throw e; });
  return lateScripts[file];
}

/* 管理页（#internal）的脚本 admin.js */
const loadAdminJs = () => loadLateScript("admin.js", () => !!window.HJ_ADMIN_READY);

function openInternalView() {
  showView("view-internal");
  if (window.HJ_ADMIN_READY) return;
  const btn = $("internalSubmit");
  const msg = $("internalMsg");
  btn.disabled = true;
  setMsg(msg, "正在加载…");
  loadAdminJs().then(() => {
    btn.disabled = false;
    btn.onclick = null;
    setMsg(msg, "");
  }, (e) => {
    console.error("[管理页]", e);
    btn.disabled = false;
    btn.onclick = () => openInternalView();   // 点「进入」重试加载
    setMsg(msg, "管理页脚本加载失败，检查一下网络后点「进入」重试");
  });
}

function initHashRoute() {
  const coldDeepLink = !!location.hash && location.hash !== "#";
  routeFromHash();
  if (coldDeepLink) {
    const landing = document.querySelector(".view:not([hidden])");
    /* 购票页、场地登记页、问卷、最新活动（#latest）例外：大家多半是拿着链接直接进来的，「← 返回」回首页正好有用，不隐藏
       （不要返回按钮的最新活动页用 /activity/） */
    const keepBack = landing && (landing.id === "view-ticket" || landing.id === "view-venue" ||
      location.hash === SURVEY_HASH || location.hash === "#latest");
    if (landing && !keepBack && landing.querySelector(".back-btn")) {
      coldEntryView = landing.id;
      hideColdEntryBack();
    }
  }
  window.addEventListener("hashchange", routeFromHash);
  /* 在 /activity/ 和站点根目录之间前进 / 后退：只换了路径时不会触发 hashchange */
  window.addEventListener("popstate", () => { if (location.pathname !== routedPath) routeFromHash(); });
  /* /activity/ 上 <base> 指向站点根目录，页面里的 href="#…" 会变成整页跳转，这里改成站内切换 */
  if (ACTIVITY_PATH) {
    document.addEventListener("click", (e) => {
      const a = e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey
        ? null : e.target.closest?.("a[href^='#']");
      if (!a || (a.target && a.target !== "_self") || !onActivityPage()) return;
      e.preventDefault();
      setRoute(a.getAttribute("href") === "#" ? "" : a.getAttribute("href"));
    });
  }
}


/* =============================================================================
   4. 首页 / 活动详情 / 相册
   ============================================================================= */

const EMPTY_NOTE = `<div class="empty-note">内容整理中，稍后会补充~</div>`;

function renderHome() {
  const badge = $("ticketBadge");
  badge.hidden = !LATEST_EVENT.ticketUrl;
  if (LATEST_EVENT.ticketUrl) badge.href = LATEST_EVENT.ticketUrl;
  $("latestTile").classList.toggle("has-ticket", !!LATEST_EVENT.ticketUrl);
}

/* 手机 / 平板？B 站的 player.html 是给 PC 用的，移动端基本只给一张「非常抱歉…」的错误图，
   移动端要换 blackboard 的 H5 播放器 */
function isMobileUA() {
  const ua = navigator.userAgent || "";
  if (/Android|iPhone|iPad|iPod|Mobile|HarmonyOS|MicroMessenger/i.test(ua)) return true;
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;   // iPadOS 默认把自己报成 Mac
}

/* B 站外链播放器地址。官方外链播放器只有 muted 开关（没有音量参数和 JS 接口），
   所以站内音量条对它只能控制「静音 / 不静音」 */
function bilibiliPlayerUrl({ bvid, aid = 0, cid = 0, page = 1, start = 0, danmaku = false, autoplay = false, muted = false }) {
  const params = new URLSearchParams({
    bvid,
    autoplay: autoplay ? "1" : "0",
    danmaku: danmaku ? "1" : "0",
  });
  /* aid + cid 一起给，播放器就不用自己再去查一次（那一次查询正是最容易被风控挡下的地方） */
  if (aid) params.set("aid", String(aid));
  if (cid) params.set("cid", String(cid));
  if (start > 0) params.set("t", String(Math.floor(start)));

  if (isMobileUA()) {
    params.set("page", String(page));
    params.set("highQuality", "1");
    params.set("as_wide", "1");     // 铺满容器，不留黑边
    return `https://www.bilibili.com/blackboard/html5mobileplayer.html?${params}`;
  }

  params.set("isOutside", "true");  // 站外嵌入的标记，不带更容易被当成盗链
  params.set("p", String(page));
  params.set("muted", muted ? "1" : "0");
  params.set("high_quality", "1");  // 尽量使用较高画质（未登录时仍可能受 B 站限制）
  params.set("poster", "1");
  return `https://player.bilibili.com/player.html?${params}`;
}

/* 最新活动视频 -------------------------------------------------------------------
   默认显示封面卡片，点卡片进详情，点右下「播放视频」原位展开并自动播放
   （LATEST_VIDEO.defaultOpen = true 时默认展开，但不自动播放）。
   离开首页时卸载播放器，免得在后台继续出声 */
const hasSelfHostedVideo = () => !!String(LATEST_VIDEO.src || "").trim();
const hasBiliVideo = () => /^BV[0-9A-Za-z]{10}$/.test(LATEST_VIDEO.bvid || "");
const hasHomeVideo = () => hasSelfHostedVideo() || hasBiliVideo();
let homeVideoOpen = false;
let homeVideoUserClosed = false;   // 用户手动收起过则不再自动展开
let homeVideoAutoplay = false;     // 当前这次是以自动播放的方式加载的吗
let homeVideoMuted = false;        // 当前播放器是带着哪种 muted 参数加载的
let homeVideoMuteTimer = 0;

function setHomeVideoOpen(open, autoplay = false) {
  homeVideoOpen = open;
  homeVideoAutoplay = open && autoplay;
  homeVideoMuted = hjSound.muted;            // 跟着站内音量的静音状态加载
  $("latestTile").hidden = open;
  $("latestVideoBlock").hidden = !open;

  const frame = $("latestVideoFrame");
  const native = $("latestVideoPlayer");
  const selfHosted = hasSelfHostedVideo();

  frame.hidden = selfHosted;
  native.hidden = !selfHosted;

  if (selfHosted) {
    frame.src = "about:blank";
    if (open) {
      if (LATEST_VIDEO.poster) native.poster = LATEST_VIDEO.poster;
      if (native.dataset.src !== LATEST_VIDEO.src) {
        native.src = LATEST_VIDEO.src;
        native.dataset.src = LATEST_VIDEO.src;
        if (LATEST_VIDEO.start > 0) {
          native.addEventListener("loadedmetadata", () => {
            try { native.currentTime = LATEST_VIDEO.start; } catch (e) {}
          }, { once: true });
        }
      }
      hjSound.attach(native);                      // 音量跟着右上角的音量条走
      if (autoplay) native.play().catch(() => {}); // 浏览器拦了就让访客自己点一下
    } else {
      native.pause();
      hjSound.detach(native);
    }
  } else {
    // 收起时卸载播放器，停止播放和下载
    frame.src = open
      ? bilibiliPlayerUrl({ ...LATEST_VIDEO, autoplay, muted: homeVideoMuted })
      : "about:blank";
  }

  /* 用 B 站外链播放器时常驻一个出口：播放器被风控挡掉也能点进 B 站看 */
  const back = $("videoFallbackLink");
  if (back) {
    const showBack = open && !selfHosted && hasBiliVideo();
    back.hidden = !showBack;
    if (showBack) back.href = `https://www.bilibili.com/video/${LATEST_VIDEO.bvid}`;
  }
}

/* 站内音量的静音状态变了 → 让外链播放器跟上。
   跨域 iframe 只能靠重新加载来换 muted 参数，所以：
   - 只在「静音 ⇄ 不静音」真的翻转时才动，音量在 1~100 之间调不会碰播放器；
   - 拖动音量条会连着触发，等手停下来半秒再重载，避免视频反复重播。 */
function syncExternalVideoMute() {
  if (hasSelfHostedVideo()) return;   // 自托管视频由 hjSound 直接调音量，不用重载
  if (!homeVideoOpen) { homeVideoMuted = hjSound.muted; return; }
  if (hjSound.muted === homeVideoMuted) return;
  clearTimeout(homeVideoMuteTimer);
  homeVideoMuteTimer = setTimeout(() => {
    if (!homeVideoOpen || hjSound.muted === homeVideoMuted) return;
    homeVideoMuted = hjSound.muted;
    $("latestVideoFrame").src = bilibiliPlayerUrl({
      ...LATEST_VIDEO, autoplay: homeVideoAutoplay, muted: homeVideoMuted,
    });
    showToast(homeVideoMuted ? "外链视频已跟随静音（播放器重新加载）" : "外链视频已取消静音（播放器重新加载）");
  }, 500);
}

/* 站内音量总线 ------------------------------------------------------------------
   右上角的音量条是全站唯一的音量入口，所有声音都从这里过：
   - 背景音乐由 hjMusic 自己按 hjMusic.vol 调（还要配合淡入淡出，所以不进下面这个集合）；
   - 页面里其它 <audio> / <video> 用 hjSound.attach(el) 登记一下，就会跟着音量条走；
   - B 站外链播放器是跨域 iframe，只能跟随静音，见 syncExternalVideoMute()。 */
const hjSound = {
  media: new Set(),
  get level() { return hjMusic.vol; },
  get muted() { return hjMusic.vol <= 0; },
  attach(el) {
    if (!el) return el;
    this.media.add(el);
    try { el.volume = this.level; } catch (e) {}
    return el;
  },
  detach(el) { this.media.delete(el); },
  /* 音量变化后由 hjMusic.setVolume 调用，把新音量推给所有声音 */
  apply() {
    this.media.forEach((el) => { try { el.volume = this.level; } catch (e) {} });
    syncExternalVideoMute();
  },
};

function openHomeVideo() {
  if (hjMusic.playing) hjMusic.pause();   // 视频与背景音乐不同时响
  homeVideoUserClosed = false;
  setHomeVideoOpen(true, true);
  // 站内是静音状态时视频也会静音加载，提一句免得以为视频坏了
  if (hjSound.muted) showToast("站内已静音，视频也是静音的（右上角音量条可取消）");
  playEnterAnim($("latestVideoBlock"));
  $("videoCloseBtn").focus({ preventScroll: true });
}

function closeHomeVideo() {
  if (!homeVideoOpen) return;
  homeVideoUserClosed = true;
  setHomeVideoOpen(false);
  playEnterAnim($("latestTile"));
  $("latestPlayBtn").focus({ preventScroll: true });
}

function initHomeVideo() {
  if (!hasHomeVideo()) return;
  $("latestPlayBtn").hidden = false;
  $("latestPlayBtn").addEventListener("click", (e) => {
    e.stopPropagation();   // 不触发卡片本身的"进入详情"
    openHomeVideo();
  });
  $("videoDetailBtn").addEventListener("click", openLatestEvent);
  $("videoCloseBtn").addEventListener("click", closeHomeVideo);
  // LATEST_VIDEO.defaultOpen 为 true 时默认展开（仅在首页可见时加载播放器）；默认是收起的封面卡片
  if (LATEST_VIDEO.defaultOpen && !$("view-home").hidden) setHomeVideoOpen(true);
}

function renderShopsPanel(areas) {
  if (!areas || !areas.length) return EMPTY_NOTE;
  return areas.map((area) => `
    <div class="area-block">
      ${area.name ? `<h4>${escapeHtml(area.name)}</h4>` : ""}
      <ul class="shop-list">
        ${area.shops.map((s) => `
          <li class="shop-item">
            <span class="num">${escapeHtml(s.num).replace(/·/g, "·<wbr>")}</span>
            <span>
              <span class="name">${escapeHtml(s.name)}</span>
              <span class="desc">${escapeHtml(s.desc || "")}</span>
            </span>
            ${s.price ? `<span class="price">${escapeHtml(s.price)}</span>` : ""}
          </li>
        `).join("")}
      </ul>
    </div>
  `).join("");
}

/* 标签页里的 B 站外链视频 -----------------------------------------------------------
   先只放一张「点击播放」的封面，点了才加载播放器（自动播放）：
   - 不点就不去连 B 站，页面打开快，也不会和背景音乐抢声音；
   - 播放器地址用 bilibiliPlayerUrl()，手机自动换 H5 播放器（和首页视频同一套）；
   - 切到别的标签 / 离开详情页时 stopTabVideos() 把播放器卸掉，免得在后台继续出声。
   封面：video.cover，没填就用这一页的第一张图，再没有就用 B 站播放器自己的封面（直接加载不自动播放）。 */
const tabVideos = new Map();   // 占位元素 id → video 配置
let tabVideoSeq = 0;

function renderTabVideo(video, fallbackCover) {
  if (!video || !/^BV[0-9A-Za-z]{10}$/.test(video.bvid || "")) return "";
  const id = `tabVideo${++tabVideoSeq}`;
  tabVideos.set(id, video);
  const cover = video.cover || fallbackCover || "";
  const title = video.title || "活动视频";
  return `
    <div class="tab-video video-block" id="${id}" data-cover="${escapeHtml(cover)}">
      <div class="tab-video-frame">${tabVideoFacadeHtml(title, cover)}</div>
      <div class="video-actions tab-video-actions">
        <a class="video-action" href="https://www.bilibili.com/video/${escapeHtml(video.bvid)}/" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">看不了？去 B 站看</a>
      </div>
    </div>`;
}

function tabVideoFacadeHtml(title, cover) {
  return `
    <button type="button" class="tab-video-facade" data-tab-video-play aria-label="播放：${escapeHtml(title)}"
      ${cover ? `data-bg="${escapeHtml(cover)}" data-bg-w="1280"` : ""}>
      <span class="hero-play tab-video-play">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>
        <span>播放视频</span>
      </span>
    </button>`;
}

function playTabVideo(box) {
  const video = tabVideos.get(box.id);
  if (!video) return;
  if (hjMusic.playing) hjMusic.pause();   // 视频与背景音乐不同时响
  /* 首页视频开着的话先收起来（其实离开首页时已经卸载了，这里兜底） */
  if (homeVideoOpen) setHomeVideoOpen(false);
  box.querySelector(".tab-video-frame").innerHTML = `
    <iframe title="${escapeHtml(video.title || "活动视频")}" scrolling="no" frameborder="0" allowfullscreen
      referrerpolicy="strict-origin-when-cross-origin"
      allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
      src="${escapeHtml(bilibiliPlayerUrl({ ...video, autoplay: true, muted: hjSound.muted }))}"></iframe>`;
  box.classList.add("is-playing");
  if (hjSound.muted) showToast("站内已静音，视频也是静音的（右上角音量条可取消）");
}

/* 卸掉所有正在放的标签页视频，换回封面（root 不传 = 整个详情页） */
function stopTabVideos(root) {
  (root || document).querySelectorAll(".tab-video.is-playing").forEach((box) => {
    const video = tabVideos.get(box.id) || {};
    box.classList.remove("is-playing");
    box.querySelector(".tab-video-frame").innerHTML = tabVideoFacadeHtml(video.title || "活动视频", box.dataset.cover);
    applyBgs(box);
  });
}

function initTabVideos() {
  const onClick = (e) => {
    const btn = e.target.closest("[data-tab-video-play]");
    if (!btn) return;
    const box = btn.closest(".tab-video");
    if (box) playTabVideo(box);
  };
  $("view-detail").addEventListener("click", onClick);
  $("infoBox").addEventListener("click", onClick);   // 花街介绍 ·「花舞之街记录」
}

/* 跳转磁贴：和首页磁贴同一套样式（背景图 + 底部渐变 + 文字），整块可点 */
function renderTabTileLink(l) {
  return `
    <a class="tile tab-tile-link" href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer"
      data-bg="${escapeHtml(l.image)}" data-bg-w="720">
      <div class="tile-overlay">
        <h3>${escapeHtml(l.label || "查看详情")}</h3>
        <span class="tile-hint">点击前往 B 站观看 ↗</span>
      </div>
    </a>`;
}

/* 标签页内容：字符串（纯文字，保留换行），或 { video, links, images, text, note, link, titles } 对象，
   按 视频 → 跳转按钮 → 图片 → 文字 → 居中短句（note）→ 单个链接 的顺序排。titles：各块上方的小标题（可选）。
   站外链接一律 noreferrer：带着本站 Referer 点进 B 站的部分视频（如直播回放）会显示「视频不见了」 */
function renderTabContent(tab) {
  if (typeof tab === "string") {
    return tab ? `<div class="empty-note empty-note-left">${escapeHtml(tab)}</div>` : EMPTY_NOTE;
  }
  if (!tab || (!tab.images && !tab.text && !tab.note && !tab.link && !(tab.links && tab.links.length) && !tab.video)) return EMPTY_NOTE;

  const titles = tab.titles || {};
  const secTitle = (key) => (titles[key] ? `<h3 class="tab-sec-title">${escapeHtml(titles[key])}</h3>` : "");
  let html = "";
  if (tab.video) {
    const v = renderTabVideo(tab.video, tab.images && tab.images[0]);
    if (v) html += secTitle("video") + v;
  }
  if (tab.links && tab.links.length) {
    html += secTitle("links") + `<div class="tab-links">`
      + tab.links.map((l) => l.image ? renderTabTileLink(l)
        : `<a class="ticket-badge-inline tab-link-btn" href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${escapeHtml(l.label || "查看详情")}</a>`).join("")
      + `</div>`;
  }
  if (tab.images && tab.images.length) {
    html += secTitle("images") + `<div class="tab-gallery">`
      + tab.images.map((src) => `<img src="${escapeHtml(resizedSrc(src, 1280))}" data-orig="${escapeHtml(src)}" alt="" loading="lazy" decoding="async" data-lightbox data-lightbox-src="${escapeHtml(src)}">`).join("")
      + `</div>`;
  }
  if (tab.text) {
    html += `<div class="empty-note empty-note-left">${escapeHtml(tab.text)}</div>`;
  }
  if (tab.note) {
    html += `<div class="empty-note">${escapeHtml(tab.note)}</div>`;
  }
  if (tab.link) {
    html += `<a class="ticket-badge-inline" href="${escapeHtml(tab.link.url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${escapeHtml(tab.link.label || "查看详情")}</a>`;
  }
  return html;
}

/* 详情页标签切换（只作用于详情视图，避免与花街介绍弹窗里的标签互相影响） */
function selectDetailTab(tab) {
  const detailView = $("view-detail");
  detailView.querySelectorAll(".tab-btn").forEach((b) => {
    const active = b.dataset.tab === tab;
    b.classList.toggle("is-active", active);
    b.setAttribute("aria-selected", active ? "true" : "false");
  });
  detailView.querySelectorAll(".tab-panel").forEach((p) => {
    p.hidden = p.id !== "panel-" + tab;
    if (p.hidden) stopTabVideos(p);   // 切走的那一页里如果有视频在放，停掉
  });
  /* 切到「反馈与建议」：活动问卷（survey.js）刷新一次开放状态 */
  if (tab === "feedback" && window.HJ_SURVEY_READY && typeof onSurveyTabShown === "function") onSurveyTabShown();
}

function initTabs() {
  $("view-detail").querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectDetailTab(btn.dataset.tab);
      playEnterAnim($("panel-" + btn.dataset.tab));
    });
  });
}

/* data.route / data.tab：从 #survey 进来时用，保留 #survey 地址、直接打开「反馈与建议」 */
function openDetail(data) {
  if (data.route) setRoute(data.route);
  else if (data.isLatest) setRoute("#latest");
  else if (data.id) setRoute("#event-" + data.id);

  $("detailBackBtn").style.display = data.isLatest && onActivityPage() ? "none" : "";
  setBgResized($("detailHero"), data.cover, 1280);
  $("detailTitle").textContent = data.title;
  $("detailMeta").textContent = [data.dateLabel, data.location].filter(Boolean).join(" · ");
  setupDetailLike(data);

  const ticket = $("detailTicket");
  ticket.hidden = !data.ticketUrl;
  if (data.ticketUrl) ticket.href = data.ticketUrl;

  stopTabVideos($("view-detail"));
  tabVideos.clear();
  $("panel-poster").innerHTML = renderTabContent(data.poster);
  $("panel-manual").innerHTML = renderTabContent(data.manual);
  $("panel-shops").innerHTML = renderShopsPanel(data.areas);
  $("panel-review").innerHTML = renderTabContent(data.review);
  applyBgs($("view-detail"));

  $("feedbackTabBtn").hidden = !data.isLatest;
  if (data.isLatest) {
    /* 活动问卷只建一次、之后原样挂回来：来回切页面，填了一半的内容也不会丢 */
    if (data.survey && window.HJ_SURVEY_READY && typeof mountSurvey === "function") mountSurvey($("panel-feedback"));
    else if (data.survey) $("panel-feedback").innerHTML = `<div class="empty-note">问卷没加载出来，刷新一下页面再试</div>`;
    else $("panel-feedback").innerHTML = renderTabContent(data.feedback);
  }
  /* tabs：只显示列出的标签页（不写就是全部显示）；hideReview 单独隐藏「活动回顾」 */
  ["poster", "manual", "shops", "review"].forEach((t) => {
    $("view-detail").querySelector(`.tab-btn[data-tab="${t}"]`).hidden =
      data.tabs ? !data.tabs.includes(t) : (t === "review" && !!data.hideReview);
  });

  selectDetailTab(data.tab || (data.tabs && data.tabs[0]) || "poster");
  showView("view-detail");
}

function openLatestEvent() {
  openDetail({
    ...LATEST_EVENT,
    title: LATEST_EVENT.title || "敬请期待",
    isLatest: true,
  });
}

/* #survey：最新活动详情页，直接打开「反馈与建议」（活动问卷） */
function openLatestSurvey() {
  openDetail({
    ...LATEST_EVENT,
    title: LATEST_EVENT.title || "敬请期待",
    isLatest: true,
    route: SURVEY_HASH,
    tab: "feedback",
  });
}

/* 瀑布流（往期活动相册、小型活动回顾共用）-------------------------------------
   每张卡片按图片自己的比例显示整张图；列数按宽度自动定（每列至少 260px），
   卡片按顺序依次放进当前最短的一列，所以从左到右、从上到下读就是列表的顺序，列与列之间也不会留空 */
const MASONRY_MIN_COL = 260;
const MASONRY_GAP = 20;
const imageRatios = {};   // 图片地址 → 宽高比（加载过一次就记住）
const ratioProbes = new Set();   // 量完尺寸后图片继续下载完（卡片背景直接用），期间留着引用

/* 宽高比从缩略图量（和原图一样），缩略图没有再量原图；量到尺寸就返回，不用等整张图下载完 */
function loadImageRatio(src) {
  if (imageRatios[src]) return Promise.resolve(imageRatios[src]);
  const measure = (url) => new Promise((resolve) => {
    const img = new Image();
    let timer = 0, settled = false;
    const finish = (r) => {
      clearInterval(timer);
      if (!settled) { settled = true; resolve(r); }
    };
    const check = () => { if (img.naturalWidth && img.naturalHeight) finish(img.naturalWidth / img.naturalHeight); };
    ratioProbes.add(img);
    img.onload = () => { check(); finish(0); ratioProbes.delete(img); };
    img.onerror = () => { finish(0); ratioProbes.delete(img); };
    img.src = url;
    timer = setInterval(check, 60);
  });
  const small = resizedSrc(src, 720);
  return measure(small)
    .then((r) => r || (small !== src ? measure(src) : 0))
    .then((r) => (imageRatios[src] = r || 4 / 3));
}

function masonryColCount(grid) {
  return Math.max(1, Math.floor((grid.clientWidth + MASONRY_GAP) / (MASONRY_MIN_COL + MASONRY_GAP)));
}

/* 卡片的高度由 aspect-ratio 决定，不用等图片加载完就能量出来 */
function layoutMasonry(grid) {
  const items = Array.from(grid.querySelectorAll("[data-index]"))
    .sort((x, y) => x.dataset.index - y.dataset.index);
  if (!items.length) return;
  const n = masonryColCount(grid);
  const cols = Array.from({ length: n }, () => {
    const col = document.createElement("div");
    col.className = "album-col";
    return col;
  });
  grid.replaceChildren(...cols);
  items.forEach((item) => {
    let target = cols[0];
    cols.forEach((col) => { if (col.offsetHeight < target.offsetHeight - 1) target = col; });   // 一样高时取最左边
    target.appendChild(item);
  });
  grid.dataset.cols = String(n);
}

/* 卡片排好后按顺序依次入场 */
function playMasonryEnter(grid) {
  Array.from(grid.querySelectorAll("[data-index]"))
    .sort((x, y) => x.dataset.index - y.dataset.index)
    .forEach((el, i) => playFxAnim(el, "fx-page-enter", 180 + i * 60, true));
}

/* 窗口宽度变化导致列数变了才重排 */
let masonryResizeTimer = 0;
window.addEventListener("resize", () => {
  clearTimeout(masonryResizeTimer);
  masonryResizeTimer = setTimeout(() => {
    ["albumGrid", "miniReviewGrid"].forEach((id) => {
      const grid = $(id);
      if (!grid || grid.closest(".view").hidden || !grid.querySelector("[data-index]")) return;
      if (String(masonryColCount(grid)) !== grid.dataset.cols) layoutMasonry(grid);
    });
  }, 150);
});

/* 往期活动相册：标题叠在图片底部，点开进活动详情；
   右上角的点赞和详情页横幅里的点赞是同一个目标（act:<id>），数字互相同步 */
function renderAlbumGrid() {
  const grid = $("albumGrid");
  grid.replaceChildren();
  return Promise.all(ARCHIVE_EVENTS.map((ev) => loadImageRatio(ev.cover))).then((ratios) => {
    grid.innerHTML = ARCHIVE_EVENTS.map((ev, i) => `
      <div class="album-card" data-index="${i}" style="aspect-ratio:${ratios[i]}"
        data-bg="${escapeHtml(ev.cover)}" data-bg-w="720">
        <div class="overlay">
          <span class="year">${escapeHtml(ev.year)}</span>
          <div class="title">${escapeHtml(ev.title)}</div>
        </div>
        ${likeBtnHtml("act:" + ev.id)}
      </div>
    `).join("");
    applyBgs(grid);
    grid.querySelectorAll(".album-card").forEach((card) => {
      card.addEventListener("click", () => openDetail(ARCHIVE_EVENTS[Number(card.dataset.index)]));
    });
    layoutMasonry(grid);
    paintLikes();          // 已经拿到过的数字先显示出来
    refreshLikes(grid);    // 再向服务器取最新的
  });
}

function openArchiveList() {
  setRoute("#previous");
  $("archiveBackBtn").style.display = "";
  showView("view-archive-list");
  playViewEnterStagger("view-archive-list", "albumGrid");
  renderAlbumGrid().then(() => playMasonryEnter($("albumGrid")));
}

/* 小型活动回顾：图片下面是点赞和说明；点图片看大图（有 full 就看 full 那张，比如长图海报）；
   pinLast: true 的固定排在最后 */
function renderMiniReviews() {
  const grid = $("miniReviewGrid");
  grid.replaceChildren();
  if (!MINI_REVIEWS.length) {
    grid.innerHTML = `<div class="empty-note">还没有内容，敬请期待</div>`;
    return Promise.resolve();
  }
  const list = [...MINI_REVIEWS.filter((item) => !item.pinLast), ...MINI_REVIEWS.filter((item) => item.pinLast)];
  return Promise.all(list.map((item) => loadImageRatio(item.image))).then((ratios) => {
    grid.innerHTML = list.map((item, i) => `
      <div class="review-item" data-index="${i}">
        <button type="button" class="review-photo" style="aspect-ratio:${ratios[i]}"
          data-lightbox data-lightbox-src="${escapeHtml(item.full || item.image)}">
          <img src="${escapeHtml(resizedSrc(item.image, 720))}" data-orig="${escapeHtml(item.image)}"
            alt="${escapeHtml(item.caption || "花街活动照片")}" loading="lazy" decoding="async">
        </button>
        ${likeBtnHtml(likeKeyFromSrc("mini", item.image))}
        ${item.caption ? `<p class="review-caption">${escapeHtml(item.caption)}</p>` : ""}
      </div>
    `).join("");
    refreshLikes(grid);
    layoutMasonry(grid);
  });
}

function openMiniReview() {
  setRoute("#mini-review");
  showView("view-mini-review");
  playViewEnterStagger("view-mini-review", "miniReviewGrid");
  renderMiniReviews().then(() => playMasonryEnter($("miniReviewGrid")));
}

function initNav() {
  $("latestTile").addEventListener("click", openLatestEvent);
  $("archiveTile").addEventListener("click", openArchiveList);
  $("miniTile").addEventListener("click", openMiniReview);
  $("infoTile").addEventListener("click", () => requestCaptcha("info"));
  /* 场地使用登记：站内表单（venue.js），hashchange → openVenueView */
  $("bookingTile").addEventListener("click", async () => {
    if (await blockedByStaticMode()) return;
    if (typeof openVenueView !== "function") { showToast("登记页没加载出来，刷新一下页面再试"); return; }
    if (location.hash === VENUE_HASH) openVenueView();
    else setRoute(VENUE_HASH);
  });
  $("groupTile").addEventListener("click", async () => {
    if (await blockedByStaticMode()) return;
    requestCaptcha("group");
  });
  document.querySelectorAll("[data-back]").forEach((btn) => btn.addEventListener("click", goHome));
}


/* =============================================================================
   5. 机器人验证总开关、星芒节时间覆盖（管理页在 admin.js，这里是访客端读取）
   ============================================================================= */

/* 机器人验证总开关：captchaOn = false 时全站不弹人机验证，Worker 端也一律放行（压测用）。
   存在 Worker 的 site_flags.captcha_off，没有这一行 = 开启 */
let captchaOn = true;

function applyCaptchaEnabled(on) {
  const changed = captchaOn !== !!on;
  captchaOn = !!on;
  /* 购票表单里的验证组件在 ticket.js；只在开关真的变了时才动它，
     否则每次读到「开启」都会把访客已经做完的验证重置掉 */
  if (typeof syncTicketCaptcha === "function") syncTicketCaptcha(changed);
  if (typeof syncVenueCaptcha === "function") syncVenueCaptcha(changed);   // 场地登记表单（venue.js）
  if (window.HJ_SURVEY_READY && typeof syncSurveyCaptcha === "function") syncSurveyCaptcha(changed);   // 活动问卷（survey.js）
  if (!captchaOn && !$("captchaOverlay").hidden) closeCaptcha();
  syncFeedbackGate();   // 网站说明弹窗里的反馈表单同样跟着总开关走
}


/* 星芒节时间覆盖 --------------------------------------------------------------
   游戏内星芒节期间全境强制下雪，天气算法无法得知；管理员在此设置时段后，
   落在时段内的天气档一律显示「小雪」。
   - 时间一律按国服时间（UTC+8）解释，与访客设备时区无关
   - 全局设置存在 Worker（启动时随站点状态一起读取，管理页用 set_starlight 修改），本地另缓存一份，
     Worker 暂时连不上时使用缓存 */
let hjStarlight = null;   // { start, end }（epoch 毫秒）或 null

const isValidRange = (v) =>
  !!v && Number.isFinite(v.start) && Number.isFinite(v.end) && v.end > v.start;

function hjStarlightActiveAt(epochMs) {
  return !!hjStarlight && epochMs >= hjStarlight.start && epochMs <= hjStarlight.end;
}

function readStarlightLocal() {
  try {
    const v = JSON.parse(storage.get(STORE.starlight) || "null");
    return isValidRange(v) ? { start: v.start, end: v.end } : null;
  } catch (e) {
    return null;
  }
}
function writeStarlightLocal(value) {
  if (value) storage.set(STORE.starlight, JSON.stringify(value));
  else storage.remove(STORE.starlight);
}

/* 状态变化后统一刷新：本地缓存、管理面板、天气条 */
function applyStarlight(value) {
  hjStarlight = isValidRange(value) ? { start: value.start, end: value.end } : null;
  writeStarlightLocal(hjStarlight);
  refreshStarlightStatus();
  hjResetOmens();
  hjWeatherLastKey = "";   // 天气条下次显示时一定重画
  hjClockTick();
}


/* 管理页「星芒节」面板里的状态文字（面板由 admin.js 放进页面，没进过管理页时不存在） */
function refreshStarlightStatus() {
  const status = $("starlightStatus");
  if (!status) return;
  if (!hjStarlight) {
    status.textContent = "当前状态：未设置（天气按算法正常显示）";
    return;
  }
  const active = hjStarlightActiveAt(hjNow());
  status.textContent = `当前时段：${formatCnLabel(hjStarlight.start)} — ${formatCnLabel(hjStarlight.end)}`
    + (active ? "（进行中：所有天气显示为小雪）" : "（不在时段内：天气按算法正常显示）");
}


/* =============================================================================
   6. 花街介绍 / 活动群弹窗
   ============================================================================= */

let firstBootInfoOpen = false;   // 首次进入时自动弹出的这次花街介绍：复制不附末尾那段话
let infoGalleryRendered = false;

function renderInfoGallery() {
  if (infoGalleryRendered) return;
  infoGalleryRendered = true;
  const grid = $("infoGalleryGrid");
  grid.innerHTML = INFO_GALLERY.map((src) => `
    <div class="gallery-cell">
      <img src="${escapeHtml(resizedSrc(src, 720))}" data-orig="${escapeHtml(src)}" alt="" loading="lazy" decoding="async"
        data-lightbox="gallery" data-lightbox-src="${escapeHtml(src)}">
      ${likeBtnHtml(likeKeyFromSrc("info", src))}
    </div>
  `).join("");
  refreshLikes(grid);
}

function switchInfoTab(tab) {
  document.querySelectorAll(".info-tabs .tab-btn").forEach((btn) => {
    const active = btn.dataset.infoTab === tab;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
  $("infoPanelIntro").hidden = tab !== "intro";
  $("infoPanelGallery").hidden = tab !== "gallery";
  $("infoPanelRecord").hidden = tab !== "record";
  if (tab === "gallery") renderInfoGallery();
  renderInfoRecord(tab === "record");
}

/* 「花舞之街记录」：每次切进来重画一次封面（详情页换活动时会清空视频登记表），切走就把播放器卸掉 */
function renderInfoRecord(show) {
  const panel = $("infoPanelRecord");
  stopTabVideos(panel);
  if (!show) return;
  panel.innerHTML = renderTabVideo(INFO_RECORD_VIDEO) || EMPTY_NOTE;
  applyBgs(panel);
}

function openInfoModal() {
  $("infoOverlay").hidden = false;
  switchInfoTab("intro");
  playFadeOnly($("infoBox"));
  isLockedDown();   // 复制时要不要附末尾那段话看它
}

function closeInfoModal() {
  stopTabVideos($("infoBox"));
  $("infoOverlay").hidden = true;
  firstBootInfoOpen = false;
  setTimeout(maybeShowSitePopup, 0);   // 新访客：花街介绍关掉以后再弹公告，不叠在一起
}

function openGroupModal() {
  $("groupOverlay").hidden = false;
  playEnterAnim(document.querySelector("#groupOverlay .group-box"));
}

function closeGroupModal() {
  $("groupOverlay").hidden = true;
}

async function copyText(text, okMsg, fallbackMsg) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(okMsg);
  } catch (e) {
    showToast(fallbackMsg);
  }
}

/* 复制花街介绍文字：人机验证通过后 5 分钟内（或验证总开关关着时）附上 INFO_COPY_TAIL 那段话；
   开屏自动弹出的那次、分享功能关闭时不附 */
function onInfoTextCopy(e) {
  const selection = window.getSelection().toString();
  if (!selection || siteLockdown || firstBootInfoOpen) return;
  if (!captchaOn || isCaptchaFresh()) {
    e.clipboardData.setData("text/plain", `${selection}\n\n${INFO_COPY_TAIL}`);
    e.preventDefault();
  } else {
    openCaptcha("copy_verify");
  }
}

/* 点击遮罩空白处关闭弹窗（遮罩带 data-close-only-x 时不关：只能点 ×） */
function closeOnBackdrop(overlay, close) {
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay && !overlay.dataset.closeOnlyX) close();
  });
}

function initInfo() {
  $("infoClose").addEventListener("click", closeInfoModal);
  closeOnBackdrop($("infoOverlay"), closeInfoModal);
  document.querySelectorAll(".info-tabs .tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchInfoTab(btn.dataset.infoTab));
  });
  document.querySelector(".info-text").addEventListener("copy", onInfoTextCopy);

  $("groupClose").addEventListener("click", closeGroupModal);
  closeOnBackdrop($("groupOverlay"), closeGroupModal);
  $("copyGroupBtn").addEventListener("click", () => copyText(GROUP_QQ, "群号已复制", "群号：" + GROUP_QQ));
}

/* =============================================================================
   7. 网站说明弹窗（首页底部小字点开）：关于网站 / 反馈与建议 / 分享网站
   反馈走 Worker 的 submit_feedback，表单里嵌一个人机验证；管理员在「反馈建议箱」里处理
   ============================================================================= */

const FEEDBACK_CATEGORIES = {
  bug: "bug反馈",
  experience: "体验反馈",
  feature: "功能建议",
  join: "加入花街",
  other: "其他",
};
/* 选了类别后，内容框上方的提示跟着换，帮访客知道写什么 */
const FEEDBACK_HINTS = {
  "": "说说遇到的问题或想法吧",
  bug: "在哪个页面、做了什么操作、看到了什么问题？用的是手机还是电脑、什么浏览器？",
  experience: "哪里用着顺手、哪里别扭，都可以说说",
  feature: "希望网站加上什么功能？",
  join: "想以什么方式加入花街（店家 / 演出 / 工作人员 / 其他）？简单介绍一下自己吧，记得在下面留下联系方式",
  other: "想说什么都可以",
};
const FEEDBACK_ERRORS = {
  bad_category: "请先选择问卷类别",
  bad_content: "内容太短了，多写几个字吧",
  too_long: "内容太长了（最多 1000 字）",
  bad_contact: "勾选了留下联系方式，就请填写一下联系方式",
  captcha: "人机验证未通过，已换一题，请重新验证后提交",
  rate_limited: "提交太频繁了，请过一会儿再试",
  server_error: "提交失败，请稍后再试（一直这样的话请在活动群里告诉我们）",
};

const feedbackState = { proof: null, submitting: false };
let feedbackGate = null;
let aboutTab = "about";

function switchAboutTab(tab) {
  aboutTab = tab;
  document.querySelectorAll("#siteAboutOverlay [data-about-tab]").forEach((btn) => {
    const active = btn.dataset.aboutTab === tab;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
  $("aboutPanelAbout").hidden = tab !== "about";
  $("aboutPanelFeedback").hidden = tab !== "feedback";
  $("aboutPanelShare").hidden = tab !== "share";
  syncFeedbackGate();
}

function openSiteAbout(tab = "about") {
  $("siteAboutOverlay").hidden = false;
  switchAboutTab(tab);
  playEnterAnim($("siteAboutBox"));
}

function closeSiteAbout() {
  $("siteAboutOverlay").hidden = true;
}

/* 反馈表单里的人机验证：第一次进入「反馈与建议」页时才出题（不点开就不打扰 Cloudflare / Worker）；
   切到别的子页时不撤题，回来还能接着答。总开关关掉时整块隐藏 */
let feedbackGateOpen = false;
function syncFeedbackGate() {
  const host = $("feedbackVerify");
  if (!host) return;
  if (!captchaOn) {
    host.hidden = true;
    feedbackState.proof = null;
    if (feedbackGate && feedbackGateOpen) feedbackGate.hide();
    feedbackGateOpen = false;
    return;
  }
  host.hidden = false;
  const visible = !$("siteAboutOverlay").hidden && aboutTab === "feedback" && !$("feedbackForm").hidden;
  if (!visible || feedbackGateOpen) return;
  if (!feedbackGate) {
    if (!window.HJVerify) return;
    feedbackGate = HJVerify.createGate(host, {
      post: callWorker,
      turnstileSiteKey: TURNSTILE_SITE_KEY,
      onPass: (proof) => {
        feedbackState.proof = proof;
        setMsg($("feedbackMsg"), "");
      },
    });
  }
  feedbackState.proof = null;
  feedbackGate.open();
  feedbackGateOpen = true;
}

function syncFeedbackContactField() {
  const on = $("feedbackWantContact").checked;
  $("feedbackContact").hidden = !on;
  if (on) $("feedbackContact").focus();
}

async function submitFeedback(e) {
  e.preventDefault();
  if (feedbackState.submitting) return;
  const msg = $("feedbackMsg");
  const category = $("feedbackCategory").value;
  const content = $("feedbackContent").value.trim();
  const wantContact = $("feedbackWantContact").checked;
  const contact = $("feedbackContact").value.trim();

  if (!category) { setMsg(msg, FEEDBACK_ERRORS.bad_category); $("feedbackCategory").focus(); return; }
  if (content.length < 2) { setMsg(msg, FEEDBACK_ERRORS.bad_content); $("feedbackContent").focus(); return; }
  if (wantContact && !contact) { setMsg(msg, FEEDBACK_ERRORS.bad_contact); $("feedbackContact").focus(); return; }
  const proof = feedbackState.proof;
  if (captchaOn && !proof) {
    setMsg(msg, feedbackGate
      ? "请先完成下方的人机验证（自动验证，或点「自动验证不成功？点击手动验证」换手动验证）"
      : "人机验证组件没加载出来，刷新页面再试一次");
    return;
  }

  setMsg(msg, "");
  feedbackState.submitting = true;
  const btn = $("feedbackSubmitBtn");
  btn.disabled = true;
  btn.textContent = "提交中…";
  const data = await callWorker({ action: "submit_feedback", category, content, wantContact, contact, ...(proof || {}) });
  feedbackState.submitting = false;
  btn.disabled = false;
  btn.textContent = "提交";
  /* 凭证是一次性的：无论成败都作废，需要时重新出题 */
  feedbackState.proof = null;

  if (!data || !data.ok) {
    if (captchaOn && feedbackGate) feedbackGate.refresh();
    setMsg(msg, !data ? "连接失败，检查一下网络后再试（本次未提交成功）"
      : FEEDBACK_ERRORS[data.error] || "提交失败，请稍后再试");
    return;
  }
  $("feedbackForm").reset();
  $("feedbackCount").textContent = "0";
  $("feedbackContentHint").textContent = FEEDBACK_HINTS[""];
  syncFeedbackContactField();
  $("feedbackForm").hidden = true;
  $("feedbackDone").hidden = false;
  if (feedbackGate) feedbackGate.hide();
  feedbackGateOpen = false;
}

function initSiteAbout() {
  $("aboutShareText").textContent = SHARE_TEXT;
  $("siteAboutLink").addEventListener("click", (e) => {
    e.preventDefault();
    openSiteAbout("about");
  });
  $("siteAboutClose").addEventListener("click", closeSiteAbout);
  closeOnBackdrop($("siteAboutOverlay"), closeSiteAbout);
  document.querySelectorAll("#siteAboutOverlay [data-about-tab]").forEach((btn) => {
    btn.addEventListener("click", () => switchAboutTab(btn.dataset.aboutTab));
  });
  $("siteAboutOverlay").addEventListener("click", (e) => {
    const go = e.target.closest("[data-about-goto]");
    if (go) switchAboutTab(go.dataset.aboutGoto);
  });

  $("feedbackCategory").addEventListener("change", (e) => {
    $("feedbackContentHint").textContent = FEEDBACK_HINTS[e.target.value] || FEEDBACK_HINTS[""];
    /* 选「加入花街」时顺手把联系方式勾上：不留联系方式就没法回复 */
    if (e.target.value === "join" && !$("feedbackWantContact").checked) {
      $("feedbackWantContact").checked = true;
      $("feedbackContact").hidden = false;
    }
  });
  $("feedbackContent").addEventListener("input", (e) => {
    $("feedbackCount").textContent = String(e.target.value.length);
  });
  $("feedbackWantContact").addEventListener("change", syncFeedbackContactField);
  $("feedbackForm").addEventListener("submit", submitFeedback);
  $("feedbackAgainBtn").addEventListener("click", () => {
    $("feedbackDone").hidden = true;
    $("feedbackForm").hidden = false;
    setMsg($("feedbackMsg"), "");
    syncFeedbackGate();
  });

  $("shareSiteBtn").addEventListener("click", () => copyText(SHARE_TEXT, "分享内容已复制", SHARE_TEXT));
}


/* =============================================================================
   8. 大图预览（Lightbox）
   - 普通模式：单击 / 双击放大，右键缩小，拖动平移，双指缩放
   - 相册模式（花街介绍相册）：不缩放，双击把图片设为网页背景
   - 长图（高度超过宽度 LB_LONG_RATIO 倍的海报等）：自动按页面宽度显示、上下滚动看，不缩放
   页面里带 data-lightbox 属性的元素点击即打开；data-lightbox="gallery" 为相册模式，
   data-lightbox-src 可指定图片地址（默认取元素自身的 src）。
   页面里显示的是缩小版时，先把已经下载好的缩小版放大显示，原图下载好了再无缝换上。
   ============================================================================= */

const LB_ZOOM_STEP = 2.5;
const LB_MAX_SCALE = 20;
const DOUBLE_TAP_MS = 320;
const LB_LONG_RATIO = 2.5;

let lightboxMode = "normal";
let lbLong = false;   // 当前是长图（滚动查看，不缩放）
let lbState = null;
let lbSeq = 0;        // 每次打开 / 关闭 +1，丢弃过期的原图加载

function resetLightboxTransform() {
  lbState = { scale: 1, tx: 0, ty: 0, dragging: false, startX: 0, startY: 0, moved: false };
  $("lightboxImg").style.transformOrigin = "50% 50%";
  applyLightboxTransform();
}

function applyLightboxTransform() {
  const img = $("lightboxImg");
  img.style.transform = `translate(${lbState.tx}px, ${lbState.ty}px) scale(${lbState.scale})`;
  if (!lbState.dragging) img.style.cursor = lbState.scale > 1 ? "zoom-out" : "zoom-in";
}

function setLightboxLong(long) {
  lbLong = long;
  const overlay = $("lightboxOverlay");
  overlay.classList.toggle("is-long", long);
  if (long) {
    overlay.scrollTop = 0;
    $("lightboxImg").style.cursor = "default";
  }
}

function openLightbox(src, mode, preview) {
  lightboxMode = mode === "gallery" ? "gallery" : "normal";
  const img = $("lightboxImg");
  const seq = ++lbSeq;
  setLightboxLong(false);
  img.onload = () => {
    if (!lbLong && lightboxMode !== "gallery" && img.naturalWidth && img.naturalHeight / img.naturalWidth > LB_LONG_RATIO) setLightboxLong(true);
  };
  if (preview && preview !== src) {
    img.src = preview;
    const full = new Image();
    full.onload = () => {
      const swap = () => { if (seq === lbSeq) img.src = src; };
      if (full.decode) full.decode().then(swap, swap);
      else swap();
    };
    full.src = src;
  } else {
    img.src = src;
  }
  $("lightboxOverlay").hidden = false;
  resetLightboxTransform();
  if (lightboxMode === "gallery") img.style.cursor = "default";
  if (img.complete && img.naturalWidth) img.onload();   // 已缓存的图片
}

function closeLightbox() {
  lbSeq++;
  $("lightboxOverlay").hidden = true;
  $("lightboxImg").onload = null;
  $("lightboxImg").removeAttribute("src");
  lightboxMode = "normal";
  setLightboxLong(false);
  resetLightboxTransform();
}

/* 相册模式：把当前图片设为网页背景（切换昼夜时恢复默认天空） */
function setSiteBackgroundFromLightbox() {
  const img = $("lightboxImg");
  if (!img.src) return;
  const uri = `url('${img.src}')`;
  $("skyBase").style.backgroundImage = uri;
  $("skyFade").style.backgroundImage = uri;
  $("skyFade").style.opacity = "0";
  document.body.classList.add("custom-bg");   // CSS 据此给标题区加毛玻璃底板
  showToast("已设为网页背景");
  closeLightbox();
}

/* 以 (clientX, clientY) 为中心缩放 */
function setTransformOriginAt(img, clientX, clientY) {
  const rect = img.getBoundingClientRect();
  const px = ((clientX - rect.left) / rect.width) * 100;
  const py = ((clientY - rect.top) / rect.height) * 100;
  img.style.transformOrigin = `${px}% ${py}%`;
}

function zoomAt(clientX, clientY, factor) {
  setTransformOriginAt($("lightboxImg"), clientX, clientY);
  const next = lbState.scale * factor;
  if (next <= 1.001) {
    Object.assign(lbState, { scale: 1, tx: 0, ty: 0 });
  } else if (next > LB_MAX_SCALE) {
    lbState.scale = LB_MAX_SCALE;   // 已到上限：保留当前平移
  } else {
    Object.assign(lbState, { scale: next, tx: 0, ty: 0 });
  }
  applyLightboxTransform();
}

function lbPointerDown(x, y) {
  if (lbLong || lbState.scale <= 1) return;
  Object.assign(lbState, { dragging: true, moved: false, startX: x - lbState.tx, startY: y - lbState.ty });
  const img = $("lightboxImg");
  img.classList.add("is-dragging");
  img.style.cursor = "grabbing";
}

function lbPointerMove(x, y) {
  if (!lbState.dragging) return;
  lbState.tx = x - lbState.startX;
  lbState.ty = y - lbState.startY;
  lbState.moved = true;
  applyLightboxTransform();
}

function lbPointerUp() {
  lbState.dragging = false;
  const img = $("lightboxImg");
  img.classList.remove("is-dragging");
  img.style.cursor = lbState.scale > 1 ? "zoom-out" : "zoom-in";
}

function initLightbox() {
  const overlay = $("lightboxOverlay");
  const img = $("lightboxImg");
  resetLightboxTransform();

  // 统一的打开入口
  document.addEventListener("click", (e) => {
    const trigger = e.target.closest("[data-lightbox]");
    if (!trigger) return;
    const shown = trigger.tagName === "IMG" ? trigger : trigger.querySelector("img");
    const preview = shown && shown.complete && shown.naturalWidth ? shown.currentSrc || shown.src : "";
    openLightbox(trigger.dataset.lightboxSrc || trigger.src, trigger.dataset.lightbox, preview);
  });

  $("lightboxClose").addEventListener("click", closeLightbox);
  closeOnBackdrop(overlay, closeLightbox);

  /* 鼠标 */
  img.addEventListener("mousedown", (e) => {
    lbPointerDown(e.clientX, e.clientY);
    e.preventDefault();
  });
  window.addEventListener("mousemove", (e) => lbPointerMove(e.clientX, e.clientY));
  window.addEventListener("mouseup", lbPointerUp);
  img.addEventListener("click", (e) => {
    e.stopPropagation();
    if (lightboxMode === "gallery" || lbLong) return;
    if (lbState.moved) {
      lbState.moved = false;
      return;
    }
    zoomAt(e.clientX, e.clientY, LB_ZOOM_STEP);
  });
  img.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (lightboxMode !== "gallery" && !lbLong) zoomAt(e.clientX, e.clientY, 1 / LB_ZOOM_STEP);
  });
  img.addEventListener("dblclick", (e) => {
    e.preventDefault();
    if (lightboxMode === "gallery") setSiteBackgroundFromLightbox();
  });

  /* 触屏 */
  let lastTap = 0;
  let pinching = false;
  let pinchStartDist = 0;
  let pinchStartScale = 1;
  const touchDist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

  img.addEventListener("touchstart", (e) => {
    if (lightboxMode === "gallery" || lbLong) return;
    if (e.touches.length === 2) {
      pinching = true;
      lbState.dragging = false;
      pinchStartDist = touchDist(e.touches);
      pinchStartScale = lbState.scale;
      setTransformOriginAt(img,
        (e.touches[0].clientX + e.touches[1].clientX) / 2,
        (e.touches[0].clientY + e.touches[1].clientY) / 2);
    } else if (e.touches.length === 1 && !pinching) {
      lbPointerDown(e.touches[0].clientX, e.touches[0].clientY);
    }
  });

  img.addEventListener("touchmove", (e) => {
    if (lightboxMode === "gallery" || lbLong) return;
    if (e.touches.length === 2) {
      e.preventDefault();
      const scale = clamp(pinchStartScale * (touchDist(e.touches) / pinchStartDist), 1, LB_MAX_SCALE);
      lbState.scale = scale;
      if (scale <= 1.001) Object.assign(lbState, { scale: 1, tx: 0, ty: 0 });
      lbState.moved = true;
      applyLightboxTransform();
    } else if (e.touches.length === 1 && !pinching && lbState.scale > 1) {
      lbPointerMove(e.touches[0].clientX, e.touches[0].clientY);
      e.preventDefault();
    }
  }, { passive: false });

  img.addEventListener("touchend", (e) => {
    if (e.touches.length !== 0 || lbLong) return;
    const now = Date.now();
    const isDoubleTap = now - lastTap < DOUBLE_TAP_MS;

    if (lightboxMode === "gallery") {
      if (!e.changedTouches.length) return;
      if (isDoubleTap) {
        setSiteBackgroundFromLightbox();
        lastTap = 0;
      } else {
        lastTap = now;
      }
      return;
    }

    if (pinching) {
      pinching = false;
      lbPointerUp();
      return;
    }
    if (!lbState.moved) {
      // 单击放大，双击复位
      if (isDoubleTap) {
        resetLightboxTransform();
        lastTap = 0;
      } else {
        const touch = e.changedTouches[0];
        zoomAt(touch.clientX, touch.clientY, LB_ZOOM_STEP);
        lastTap = now;
      }
    }
    lbPointerUp();
  });
}


/* =============================================================================
   9. 人机验证弹窗
   -----------------------------------------------------------------------------
   验证界面（Cloudflare 自动验证 + 狒科生 / 文科生 / 理科生三种手动验证）在 verify.js，这里只管衔接：
   - 通过后把凭证交给 Worker 确认（verify_turnstile），再执行排队中的动作
     （打开活动群 / 花街介绍、复制附言、密码连错后的再验证）
   - 通过后 5 分钟内免验证（存本地，刷新仍有效）；密码连错触发的验证不享受这个窗口
   - 表单里的验证（购票 / 场地登记 / 问卷 / 反馈）不走弹窗，凭证随表单一起交给 Worker
   ============================================================================= */

const CAPTCHA_GRACE_MS = 5 * 60 * 1000;

const isCaptchaFresh = () => Date.now() - (Number(storage.get(STORE.captchaOkAt)) || 0) < CAPTCHA_GRACE_MS;
const markCaptchaOk = () => storage.set(STORE.captchaOkAt, Date.now());

let captchaGate = null;         // 弹窗里的验证组件（verify.js）
let turnstilePending = null;    // 验证通过后要执行的动作
let turnstileFailStreak = 0;    // Turnstile 交给 Worker 校验时连续失败的次数
let captchaSession = 0;         // 每次打开 / 关闭弹窗 +1，用来丢弃过期的异步回调

/* 免验证窗口内直接执行，否则弹出验证 */
function requestCaptcha(pending) {
  if (isCaptchaFresh()) { runCaptchaPending(pending); return; }
  openCaptcha(pending);
}

/* 弹出验证（不看免验证窗口）。总开关关着时直接执行；verify.js 没加载成功时给句提示 */
function openCaptcha(pending) {
  if (!captchaOn) { runCaptchaPending(pending); return; }
  if (!captchaGate) { showToast("人机验证组件没加载出来，刷新页面再试一次"); return; }
  turnstilePending = pending;
  turnstileFailStreak = 0;
  captchaSession++;
  setMsg($("captchaMsg"), "");
  $("captchaOverlay").hidden = false;
  playEnterAnim(document.querySelector("#captchaOverlay .gate-card"));
  captchaGate.open();
}

function closeCaptcha() {
  $("captchaOverlay").hidden = true;
  captchaSession++;
  if (captchaGate) captchaGate.hide();
  turnstilePending = null;
}

/* 把凭证交给 Worker 确认：Turnstile 走 siteverify，手动验证走一次性通行证 */
async function finishCaptcha(proof) {
  const pending = turnstilePending;
  const msg = $("captchaMsg");
  const session = captchaSession;

  setMsg(msg, "验证中…");
  const verify = await callWorker({ action: "verify_turnstile", ...proof });
  if (session !== captchaSession) return;

  if (!verify || !verify.ok) {
    /* Turnstile 失败后无条件重建会陷入「自动通过 → Worker 校验失败 → 重建」的循环，
       所以连续失败 2 次就改用手动验证 */
    if (proof.token) {
      turnstileFailStreak++;
      if (turnstileFailStreak >= 2) {
        captchaGate.useManual("验证服务暂时不可用，启用内置验证");
        return;
      }
      setMsg(msg, "验证未通过，请重新完成一次");
      captchaGate.refresh();
      return;
    }
    setMsg(msg, !verify ? "连接失败，检查一下网络后再试"
      : verify.error === "rate_limited" ? "尝试太频繁了，请稍等一会儿再试"
      : "验证已过期，请重新完成一次");
    captchaGate.clearProof();
    return;
  }

  closeCaptcha();
  markCaptchaOk();
  runCaptchaPending(pending);
}

function runCaptchaPending(pending) {
  switch (pending) {
    case "group":
      openGroupModal();
      break;
    case "info":
      openInfoModal();
      break;
    case "copy_verify":
      showToast("验证通过");
      break;
    case "internal":
      showToast("验证通过");
      $("internalPassword").focus();
      break;
  }
}

function initCaptcha() {
  if (!window.HJVerify) { console.error("[验证] verify.js 没有加载成功，人机验证不可用"); return; }
  captchaGate = HJVerify.createGate($("captchaVerify"), {
    post: callWorker,
    turnstileSiteKey: TURNSTILE_SITE_KEY,
    onPass: finishCaptcha,
  });
  $("captchaClose").addEventListener("click", closeCaptcha);
  closeOnBackdrop($("captchaOverlay"), closeCaptcha);
}


/* =============================================================================
   10. 视觉特效：昼夜切换、飘落花叶 / 星星、点击爆花
   ============================================================================= */

/* 动画档位：full 完整（飘落、悬停设计图等全部特效）/ lite 轻量（只保留点击、翻页等一次性的短动画）/ off 关闭。
   fxEnabled = 不是「关闭」，翻页、弹窗这类一次性动画看它 */
const FX_LEVELS = ["full", "lite", "off"];
const FX_LEVEL_NAMES = { full: "完整", lite: "轻量", off: "关闭" };
const FX_LEVEL_TOASTS = {
  full: "动画：完整",
  lite: "动画：轻量（只保留点击和翻页时的短动画）",
  off: "动画：关闭",
};
let fxLevel = "full";
let fxEnabled = true;
const DAYNIGHT_FADE_MS = 900;

/* 昼夜底图（地址在 config.js 的 TILE_BG / SKY_IMAGES）------------------------ */
function forEachTile(fn) {
  TILE_IDS.forEach((id) => {
    const el = $(id);
    if (el) fn(el, id);
  });
}

function setTileBg(el, uri) {
  el.style.backgroundImage = uri ? `url('${uri}')` : "";
}

function applyTileBackgrounds(isDay) {
  const bg = TILE_BG[isDay ? "day" : "night"];
  forEachTile((el, id) => setTileBg(el, bg[id]));
}

/* 竖屏（手机）的天空只看得到中间一窄条，用裁窄的版本；横竖屏切换时跟着换 */
const skyPortraitMq = window.matchMedia ? window.matchMedia("(max-aspect-ratio: 4/5)") : null;
let skyPortraitMissing = false;   // 裁窄的天空图读不到（还没生成 / 没上传）时退回原图
function skyUrl(isDay) {
  const portrait = skyPortraitMq && skyPortraitMq.matches && !skyPortraitMissing && typeof SKY_IMAGES_PORTRAIT !== "undefined";
  return (portrait ? SKY_IMAGES_PORTRAIT : SKY_IMAGES)[isDay ? "day" : "night"];
}

function setSky(isDay) {
  const url = skyUrl(isDay);
  $("skyBase").style.backgroundImage = `url('${url}')`;
  if (skyPortraitMissing || typeof SKY_IMAGES_PORTRAIT === "undefined" || !Object.values(SKY_IMAGES_PORTRAIT).includes(url)) return;
  const probe = new Image();
  probe.onerror = () => {
    skyPortraitMissing = true;
    if (!document.body.classList.contains("custom-bg")) setSky(isDayMode());
  };
  probe.src = url;
}

/* 某一套昼夜要用的图：天空 + 首页六张卡片 */
const dayNightUrls = (isDay) => [skyUrl(isDay), ...Object.values(TILE_BG[isDay ? "day" : "night"])];

/* 等一组图片下载并解码好（最多等 maxMs），用于切换昼夜前 */
function whenImagesReady(urls, maxMs) {
  const warm = window.HJ_BOOT && window.HJ_BOOT.warm;
  const all = Promise.all(urls.map((u) => (warm ? warm(u) : Promise.resolve())));
  return Promise.race([all, new Promise((r) => setTimeout(r, maxMs))]);
}

/* 首页卡片底图都到齐的时刻（预取等它之后才开始，不和首页抢带宽） */
let homeImagesReady = Promise.resolve();

/* 慢网络 / 省流量模式 */
function isSlowNetwork() {
  const c = navigator.connection;
  return !!c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ""));
}

/* 页面里卡片的底图模式 ----------------------------------------------------------
   卡片不高于屏幕：底图整张铺满卡片（和弹窗一样）；高于屏幕：加 .is-tall，
   底图改成跟随屏幕的水印（样式见 style.css「弹窗与表单卡片共用的底」）。
   卡片高度会随内容变（购票开没开、查询结果、问卷展开），所以用 ResizeObserver 盯着，
   页面里新插进来的卡片（活动问卷、只读的购票管理面板）由 MutationObserver 补登记。
   切换留 48px 余量，手机地址栏伸缩导致屏幕高度微变时不会来回跳 */
const CARD_TALL_MARGIN = 48;
const cardSizeWatcher = window.ResizeObserver
  ? new ResizeObserver((entries) => entries.forEach((e) => updateCardBackdrop(e.target))) : null;
const watchedCards = new WeakSet();

function updateCardBackdrop(card) {
  const h = card.offsetHeight, vh = window.innerHeight;
  const tall = card.classList.contains("is-tall");
  if (!tall && h > vh + CARD_TALL_MARGIN) card.classList.add("is-tall");
  else if (tall && h < vh - CARD_TALL_MARGIN) card.classList.remove("is-tall");
}

function refreshCardBackdrops() {
  document.querySelectorAll(".view .gate-card").forEach((card) => {
    if (cardSizeWatcher && !watchedCards.has(card)) {
      watchedCards.add(card);
      cardSizeWatcher.observe(card);
    }
    updateCardBackdrop(card);
  });
}

function initCardBackdrops() {
  let queued = false;
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; refreshCardBackdrops(); });
  };
  window.addEventListener("resize", queue);
  new MutationObserver(queue).observe(document.querySelector("main") || document.body, { childList: true, subtree: true });
  queue();   // 第一次量高度放到下一帧，不在启动时强制排版
}

/* 进站后、浏览器空闲时先把弹窗底图备好；电脑上顺便把另一套昼夜底图也下载好。
   手机 / 慢网络不预先下载另一套（省流量，也不和正在看的内容抢带宽），点切换按钮时现取，取好再交叉淡入 */
function preloadDayNightImages(isDay) {
  const eager = window.innerWidth > 760 && !(skyPortraitMq && skyPortraitMq.matches) && !isSlowNetwork();
  const urls = [INFO_BG_IMAGE, ...(eager ? dayNightUrls(!isDay) : [])];
  window.HJ_LATE(() => urls.forEach((url) => { new Image().src = url; }));
}

function crossfadeSky(isDay, duration) {
  const uri = skyUrl(isDay);
  const fade = $("skyFade");
  fade.style.backgroundImage = `url('${uri}')`;
  fade.style.transitionDuration = duration + "ms";
  requestAnimationFrame(() => { fade.style.opacity = "1"; });
  setTimeout(() => {
    $("skyBase").style.backgroundImage = `url('${uri}')`;
    fade.style.opacity = "0";
  }, duration);
}

function crossfadeTileBackgrounds(isDay, duration) {
  const bg = TILE_BG[isDay ? "day" : "night"];
  forEachTile((el, id) => {
    const newUri = bg[id];
    // 悬停中的卡片被设计图盖住，直接换图，避免新旧底图透过渐变区域叠加闪烁
    if (el.matches(":hover")) {
      setTileBg(el, newUri);
      return;
    }
    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:absolute;inset:0;z-index:0;background-size:cover;background-position:center;" +
      `opacity:0;transition:opacity ${duration}ms ease;pointer-events:none;background-image:url('${newUri}');`;
    el.appendChild(overlay);
    requestAnimationFrame(() => { overlay.style.opacity = "1"; });
    setTimeout(() => {
      setTileBg(el, newUri);
      overlay.remove();
    }, duration + 60);
  });
}

function applyDayNight(willBeDay) {
  const body = document.body;
  body.classList.remove("custom-bg");   // 回到默认天空，撤掉标题区毛玻璃

  if (!fxEnabled) {
    body.classList.remove("fx-crossfading");
    body.classList.toggle("day-mode", willBeDay);
    setSky(willBeDay);
    $("skyFade").style.backgroundImage = "";
    applyTileBackgrounds(willBeDay);
  } else {
    body.classList.add("fx-crossfading");
    body.classList.toggle("day-mode", willBeDay);
    crossfadeSky(willBeDay, DAYNIGHT_FADE_MS);
    crossfadeTileBackgrounds(willBeDay, DAYNIGHT_FADE_MS);
    setTimeout(() => {
      body.classList.remove("fx-crossfading");
      $("skyFade").style.backgroundImage = "";
    }, DAYNIGHT_FADE_MS + 80);
  }
  applyFx();
  hjMusic.followDayNight();
}

/* 切换昼夜：新一套图片先下载解码好（已缓存时几乎是立即）再切，最多等 2.5 秒；等待期间按钮呼吸闪烁 */
let dayNightBusy = false;
function toggleDayNight() {
  if (dayNightBusy) return;
  const willBeDay = !isDayMode();
  const btn = $("dayNightToggle");
  dayNightBusy = true;
  const slow = setTimeout(() => btn.classList.add("is-busy"), 150);
  whenImagesReady(dayNightUrls(willBeDay), 2500).then(() => {
    clearTimeout(slow);
    btn.classList.remove("is-busy");
    dayNightBusy = false;
    applyDayNight(willBeDay);
  });
}

function initDayNight() {
  const isDay = window.HJ_START_DAY ?? (() => { const h = new Date().getHours(); return h >= 6 && h < 18; })();
  document.body.classList.toggle("day-mode", isDay);
  setSky(isDay);
  /* 开屏期间：卡片底图排在天空、标题字体、弹窗底图之后再下载，下载完顺手解码好 */
  window.HJ_BOOT.afterAssets(() => {
    const urls = Object.values(TILE_BG[isDayMode() ? "day" : "night"]);
    applyTileBackgrounds(isDayMode());
    homeImagesReady = whenImagesReady(urls, 15000);
  });
  document.documentElement.style.setProperty("--info-photo", `url('${INFO_BG_IMAGE}')`);   // 弹窗 / 表单卡片共用的底图
  preloadDayNightImages(isDay);

  /* 横竖屏切换：天空换成对应的版本（换成相册里的自定义背景时不动） */
  const onOrientation = () => { if (!document.body.classList.contains("custom-bg")) setSky(isDayMode()); };
  if (skyPortraitMq) {
    if (skyPortraitMq.addEventListener) skyPortraitMq.addEventListener("change", onOrientation);
    else if (skyPortraitMq.addListener) skyPortraitMq.addListener(onOrientation);
  }

  // 动画进行中 1 秒内忽略重复点击
  let locked = false;
  $("dayNightToggle").addEventListener("click", () => {
    if (fxEnabled) {
      if (locked) return;
      locked = true;
      setTimeout(() => { locked = false; }, 1000);
    }
    toggleDayNight();
  });
}

/* 飘落层 --------------------------------------------------------------------- */

function clearFx() {
  $("fxLayer").innerHTML = "";
}

/* 白天：花叶飘落。每片叶子由五层嵌套元素组成（结构与动画说明见 style.css），
   各层周期、幅度、相位随机，避免整屏同步。 */
function renderDayFx() {
  clearFx();
  if (!DAY_FX_LEAVES.length) return;

  const reduce = prefersReducedMotion();
  const count = window.innerWidth < 760 ? 11 : 17;
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const sign = () => (Math.random() > 0.5 ? 1 : -1);
  const sec = (v) => v.toFixed(2) + "s";
  const frag = document.createDocumentFragment();

  for (let i = 0; i < count; i++) {
    const sprite = randomItem(DAY_FX_LEAVES);
    const w = rand(15, 31);             // 宽度 px
    const fall = rand(9.5, 19);         // 下落一整程
    const swayDur = rand(1.9, 5.6);     // 左右摆动周期
    const flipDur = rand(2.1, 6.6);     // 绕 Y 轴翻转周期
    const flipXDur = rand(1.6, 5.4);    // 绕 X 轴翻转周期（与 Y 轴错开）
    const tumbleDur = rand(2.6, 7.4);   // 绕 Z 轴摆动周期

    /* 第 1 层：下落 + 淡入淡出。两个动画共用同一个负 delay，
       保证淡入淡出只发生在屏幕外的两端，不会在半空中突然消失 */
    const el = document.createElement("span");
    el.className = "fx-leaf";
    el.style.left = rand(-3, 101).toFixed(2) + "vw";
    el.style.width = w.toFixed(1) + "px";
    el.style.height = (w / sprite.ar).toFixed(1) + "px";
    const fallDelay = sec(-Math.random() * fall);
    el.style.animationDuration = `${sec(fall)}, ${sec(fall)}`;
    el.style.animationDelay = `${fallDelay}, ${fallDelay}`;
    el.style.setProperty("--op", rand(0.5, 0.88).toFixed(2));
    el.style.setProperty("--sway", Math.round(rand(10, 54)) + "px");
    el.style.setProperty("--sway-skew", rand(0, 7).toFixed(1) + "deg");
    el.style.setProperty("--drift", Math.round(rand(-70, 150)) + "px");

    /* "重量"：18% 沉叶不翻转，20% 轻叶翻 720°，其余翻 360°；X 轴翻转沿用同一重量 */
    const r = Math.random();
    const turn = r < 0.18 ? 0 : r < 0.38 ? 720 : 360;
    el.style.setProperty("--flip-turn", turn * sign() + "deg");
    el.style.setProperty("--tilt-start", rand(-34, 6).toFixed(1) + "deg");
    el.style.setProperty("--tilt-end", rand(-6, 34).toFixed(1) + "deg");
    if (reduce) el.style.setProperty("--static-top", Math.round(rand(2, 88)) + "vh");

    /* 第 2 层：左右摆动 */
    const sway = document.createElement("span");
    sway.className = "fx-leaf-sway";
    sway.style.animationDuration = sec(swayDur);
    sway.style.animationDelay = sec(-Math.random() * swayDur);

    /* 第 3 层：绕 Y 轴翻转；delay 与第 5 层明暗动画共用，侧对镜头时最暗 */
    const flipDelay = -Math.random() * flipDur;
    const flip = document.createElement("span");
    flip.className = "fx-leaf-flip";
    flip.style.animationDuration = sec(flipDur);
    flip.style.animationDelay = sec(flipDelay);

    /* 第 4 层：绕 X 轴翻转。轻叶 360° 连续翻；中等 180° 来回翻（alternate 避免循环跳变）；沉叶不翻 */
    const flipXTurn = turn === 0 ? 0 : turn === 720 ? 360 : 180;
    const flipX = document.createElement("span");
    flipX.className = "fx-leaf-flipx";
    flipX.style.setProperty("--flipx-turn", flipXTurn * sign() + "deg");
    flipX.style.animationDuration = sec(flipXDur);
    flipX.style.animationDelay = sec(-Math.random() * flipXDur);
    if (flipXTurn === 180) {
      flipX.style.animationDirection = "alternate";
      flipX.style.animationTimingFunction = "ease-in-out";
    }

    /* 第 5 层：贴图 + Z 轴摆动 + 明暗。
       明暗周期 = 翻转周期 × 360 / 转数，使每次侧对镜头都恰好最暗；不翻转的叶子只缓慢呼吸 */
    const lightDur = turn === 0 ? flipDur * 2 : (flipDur * 360) / turn;
    const face = document.createElement("span");
    face.className = "fx-leaf-face";
    face.style.backgroundImage = `url('${sprite.src}')`;
    face.style.animationDuration = `${sec(tumbleDur)}, ${sec(lightDur)}`;
    face.style.animationDelay = `${sec(-Math.random() * tumbleDur)}, `
      + sec(turn === 0 ? -Math.random() * lightDur : flipDelay);

    flipX.appendChild(face);
    flip.appendChild(flipX);
    sway.appendChild(flip);
    el.appendChild(sway);
    frag.appendChild(el);
  }
  $("fxLayer").appendChild(frag);
}

/* 夜晚：闪烁的星星 */
function renderNightFx() {
  clearFx();
  const frag = document.createDocumentFragment();
  for (let i = 0; i < 26; i++) {
    const el = document.createElement("span");
    el.className = "fx-star";
    el.style.left = Math.random() * 100 + "vw";
    el.style.top = Math.random() * 100 + "vh";
    el.style.animationDuration = 2 + Math.random() * 3 + "s";
    el.style.animationDelay = Math.random() * 4 + "s";
    frag.appendChild(el);
  }
  $("fxLayer").appendChild(frag);
}

/* 飘落花叶 / 星光只在「完整」档 */
function applyFx() {
  if (fxLevel !== "full") clearFx();
  else if (isDayMode()) renderDayFx();
  else renderNightFx();
}

/* 动画档位 ------------------------------------------------------------------- */

/* 默认档位由 index.html 开头的脚本算好（HJ_FX_LEVEL）：手动选过的为准；
   否则开了系统"减弱动态效果"→ 关闭，电脑 → 完整，手机 → 轻量 */
function getDefaultFxLevel() {
  if (FX_LEVELS.includes(window.HJ_FX_LEVEL)) return window.HJ_FX_LEVEL;
  if (prefersReducedMotion()) return "off";
  return window.innerWidth > 760 ? "full" : "lite";
}

function clearAllFxEnterClasses() {
  document.querySelectorAll(".fx-page-enter").forEach((el) => {
    el.classList.remove("fx-page-enter");
    el.style.animationDelay = "";
  });
  document.querySelectorAll(".fx-fade-only").forEach((el) => el.classList.remove("fx-fade-only"));
}

function syncFxToggle() {
  const btn = $("fxToggle");
  const label = `动画：${FX_LEVEL_NAMES[fxLevel]}（点击切换）`;
  btn.classList.toggle("is-active", fxEnabled);
  btn.classList.toggle("is-lite", fxLevel === "lite");
  btn.setAttribute("aria-label", label);
  btn.title = label;
  document.body.classList.toggle("fx-hover-enabled", fxLevel === "full");   // 悬停设计图只在完整档（也就不下载那几张图）
  document.body.classList.toggle("fx-lite", fxLevel === "lite");
  applyFx();
  if (!fxEnabled) clearAllFxEnterClasses();
}

function setFxLevel(level) {
  fxLevel = level;
  fxEnabled = level !== "off";
  window.HJ_FX_LEVEL = level;
  storage.set(STORE.fxLevel, level);
  storage.remove("hj_fx_enabled");
  syncFxToggle();
}

function initFxToggle() {
  fxLevel = getDefaultFxLevel();
  fxEnabled = fxLevel !== "off";
  syncFxToggle();
  /* 开屏图还在时，各区块的入场动画留到进站那一刻再播（initApp 末尾） */
  if (!document.documentElement.classList.contains("boot-pending")) playPageEnterStagger();
  /* 完整 → 轻量 → 关闭 → 完整 */
  $("fxToggle").addEventListener("click", () => {
    const next = FX_LEVELS[(FX_LEVELS.indexOf(fxLevel) + 1) % FX_LEVELS.length];
    setFxLevel(next);
    showToast(FX_LEVEL_TOASTS[next]);
  });
}

/* 点击爆花 ------------------------------------------------------------------- */

const BURST_COUNT = 7;
const BURST_COUNT_LITE = 4;
const BURST_THROTTLE_MS = 150;
const BURST_FALLBACK_EMOJI = ["🌸", "🌼", "🌿", "🍃"];
const FX_EXCLUDED_TARGETS =
  "button, a, input, textarea, select, label, .tile, .tab-btn, .back-btn, " +
  ".info-overlay, .lightbox-overlay, .review-photo, .album-card";

/* 白天用与飘落相同的花叶贴图，夜晚是星点 */
function spawnClickBurst(x, y) {
  const layer = $("fxClickLayer");
  if (layer.children.length > 60) layer.innerHTML = "";
  const isDay = isDayMode();
  const count = fxLevel === "full" ? BURST_COUNT : BURST_COUNT_LITE;

  for (let i = 0; i < count; i++) {
    const el = document.createElement("span");
    const angle = Math.random() * Math.PI * 2;
    const dist = 26 + Math.random() * 46;
    el.style.left = x + "px";
    el.style.top = y + "px";
    el.style.setProperty("--bx", Math.cos(angle) * dist + "px");
    el.style.setProperty("--by", Math.sin(angle) * dist + 16 + "px");

    if (isDay && DAY_FX_LEAVES.length) {
      const sprite = randomItem(DAY_FX_LEAVES);
      const w = 11 + Math.random() * 12;
      el.className = "fx-burst-petal";
      el.style.width = w.toFixed(1) + "px";
      el.style.height = (w / sprite.ar).toFixed(1) + "px";
      el.style.backgroundImage = `url('${sprite.src}')`;
      el.style.setProperty("--br", (Math.random() * 140 - 70).toFixed(1) + "deg");
      el.style.animationDuration = (0.85 + Math.random() * 0.5).toFixed(2) + "s";
    } else if (isDay) {
      el.className = "fx-burst-petal";   // 没有贴图时退回表情符号
      el.textContent = randomItem(BURST_FALLBACK_EMOJI);
      el.style.fontSize = 12 + Math.random() * 8 + "px";
      el.style.setProperty("--br", Math.random() * 180 - 90 + "deg");
    } else {
      el.className = "fx-burst-star";
    }
    layer.appendChild(el);
    setTimeout(() => el.remove(), 1500);   // 动画最长约 1.35s
  }
}

function initClickBurst() {
  let lastBurstTime = 0;
  document.addEventListener("click", (e) => {
    if (!fxEnabled || e.target.closest(FX_EXCLUDED_TARGETS)) return;
    const now = Date.now();
    if (now - lastBurstTime < BURST_THROTTLE_MS) return;
    lastBurstTime = now;
    spawnClickBurst(e.clientX, e.clientY);
  });
}


/* =============================================================================
   11. 头部工具：背景音乐与音量、「更多」下拉、日历、时间条、天气
   右上角按钮从右往左：更多 / 昼夜 / 特效 / 时钟 / 音量
   ============================================================================= */

/* 背景音乐播放器 ------------------------------------------------------------------
   淡入淡出、循环、按昼夜选曲；歌单在 config.js 的 MUSIC_TRACKS，为空时所有操作均为空转。
   音量按钮的亮 / 暗表示是否静音（音量 0 = 静音）。 */
const hjMusic = {
  audio: null,
  tracks: MUSIC_TRACKS.slice(),
  index: 0,
  loaded: "",          // 当前 audio 已载入的 src
  playing: false,
  wantPlay: false,
  swapping: false,     // 昼夜换曲的淡出期间为 true，期间忽略 ended
  fadeRaf: 0,
  pauseTimer: 0,
  vol: MUSIC_VOLUME,

  btn() { return $("soundToggle"); },
  hasTracks() { return this.tracks.length > 0; },
  current() { return this.tracks[this.index] || null; },

  /* 优先选与当前昼夜匹配的曲目 */
  pickIndex() {
    const want = isDayMode() ? "day" : "night";
    const i = this.tracks.findIndex((t) => t.mode === want);
    return i >= 0 ? i : 0;
  },

  ensure() {
    if (this.audio || !this.hasTracks()) return;
    const a = new Audio();
    a.preload = "none";
    a.volume = 0;
    a.loop = this.tracks.length <= 1;   // 单曲时原地循环
    a.addEventListener("ended", () => this.next());
    a.addEventListener("error", () => {
      if (this.loaded) this.fail();
    });
    this.audio = a;
  },

  fail() {
    this.playing = false;
    this.wantPlay = false;
    this.remember();
    this.sync();
    showToast("音源读不出来，检查一下 assets/audio/ 里的文件名");
  },

  fade(to, done) {
    cancelAnimationFrame(this.fadeRaf);
    if (!this.audio) {
      if (done) done();
      return;
    }
    const from = this.audio.volume;
    const t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / MUSIC_FADE_MS);
      this.audio.volume = clamp(from + (to - from) * k, 0, 1);
      if (k < 1) this.fadeRaf = requestAnimationFrame(step);
      else if (done) done();
    };
    this.fadeRaf = requestAnimationFrame(step);
  },

  /* 换源并淡入到目标音量 */
  startTrack(track) {
    this.loaded = track.src;
    this.audio.src = track.src;
    this.audio.load();
    const p = this.audio.play();
    if (p && p.catch) p.catch(() => {});
    this.fade(this.vol);
    this.sync();
  },

  play() {
    if (!this.hasTracks()) {
      showToast("音源还没放进仓库，先给你留个位置~");
      return;
    }
    this.ensure();
    this.index = this.pickIndex();
    const t = this.current();
    if (t && this.loaded !== t.src) {
      this.loaded = t.src;
      this.audio.src = t.src;
      this.audio.load();
    }
    this.wantPlay = true;
    const p = this.audio.play();
    if (p && p.catch) {
      p.catch((err) => {
        if (err && err.name === "NotAllowedError") showToast("浏览器不让自动播放，再点一下按钮就好");
        else this.fail();
      });
    }
    this.playing = true;
    this.fade(this.vol);
    this.sync();
    this.remember();
  },

  pause() {
    this.swapping = false;
    this.wantPlay = false;
    this.remember();
    if (!this.audio || !this.playing) {
      this.playing = false;
      this.sync();
      return;
    }
    this.playing = false;
    const stop = () => {
      cancelAnimationFrame(this.fadeRaf);
      this.audio.pause();
      this.audio.currentTime = 0;
      this.audio.volume = 0;
    };
    this.fade(0, stop);
    // 部分浏览器会节流 requestAnimationFrame，用定时器兜底确保停止
    clearTimeout(this.pauseTimer);
    this.pauseTimer = setTimeout(stop, MUSIC_FADE_MS + 120);
    this.sync();
  },

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  },

  next() {
    // 淡出暂停过程中也可能收到 ended，用 playing 拦住
    if (!this.playing || this.swapping || !this.hasTracks()) return;
    this.index = (this.index + 1) % this.tracks.length;
    this.startTrack(this.current());
  },

  /* 切换昼夜时换曲：淡出 → 换源 → 淡入（仅在播放中） */
  followDayNight() {
    if (!this.playing || this.swapping || !this.hasTracks()) return;
    const i = this.pickIndex();
    const t = this.tracks[i];
    if (!t || t.src === this.loaded) return;
    this.index = i;
    this.swapping = true;
    this.fade(0, () => {
      this.swapping = false;
      if (this.playing) this.startTrack(t);   // 淡出途中被暂停则不再继续
    });
  },

  setVolume(v) {
    this.vol = clamp(Number(v) || 0, 0, 1);
    if (this.audio && this.playing) this.audio.volume = this.vol;
    storage.set(STORE.volume, Math.round(this.vol * 100));
    this.sync();
    hjSound.apply();   // 背景音乐以外的声音（外链视频等）也跟着这根音量条走
  },

  remember() {
    storage.set(STORE.soundOn, this.wantPlay ? "1" : "0");
  },

  /* 替换歌单（控制台调试用） */
  load(list) {
    this.tracks = (Array.isArray(list) ? list : []).filter((t) => t && t.src);
    this.index = 0;
    this.loaded = "";
    if (this.audio) {
      this.audio.pause();
      this.audio = null;   // 重建，ensure() 会按新曲目数决定是否 loop
    }
    this.sync();
    if (this.wantPlay && this.hasTracks()) this.play();
  },

  /* 同步按钮状态：音量 > 0 为亮色喇叭，0 为暗色静音图标（图标切换由 CSS 完成） */
  sync() {
    const btn = this.btn();
    if (!btn) return;
    const on = this.vol > 0;
    const label = on ? "音量（未静音）" : "音量（静音）";
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-label", label);
    btn.title = label;
  },
};

/* 控制台调试入口 */
window.HJ_MUSIC = {
  load: (list) => hjMusic.load(list),
  play: () => hjMusic.play(),
  pause: () => hjMusic.pause(),
  toggle: () => hjMusic.toggle(),
  setVolume: (v) => hjMusic.setVolume(v),
  get tracks() { return hjMusic.tracks; },
};

function initSound() {
  // 恢复上次音量；注意无记录时 getItem 返回 null，不能直接 Number()（会变成 0 = 静音）
  const raw = storage.get(STORE.volume);
  const saved = raw === null ? NaN : Number(raw);
  hjMusic.setVolume(Number.isFinite(saved) ? saved / 100 : MUSIC_VOLUME);

  $("soundToggle").addEventListener("click", toggleVolPanel);
  initVolSlider();

  // 浏览器禁止无交互自动播放：有音源且未静音时，在首次交互时开始播放
  if (hjMusic.vol > 0 && hjMusic.hasTracks()) {
    const kick = () => {
      document.removeEventListener("pointerdown", kick);
      document.removeEventListener("keydown", kick);
      hjMusic.play();
    };
    document.addEventListener("pointerdown", kick);
    document.addEventListener("keydown", kick);
  }
}

/* 音量弹层 ---------------------------------------------------------------------
   一根竖条：拖动 / 点击轨道 / 方向键调整；界面不显示数值，数值只通过 aria 提供给读屏。
   这根竖条是全站唯一的音量入口，调整结果经 hjMusic.setVolume → hjSound.apply() 分发给所有声音。 */
function openVolPanel(open) {
  $("volPanel").hidden = !open;
  $("soundToggle").setAttribute("aria-expanded", String(!!open));
}

function toggleVolPanel() {
  openVolPanel($("volPanel").hidden);
  openMorePanel(false);   // 与「更多」互斥
}

function paintVolSlider(p) {
  $("volFill").style.height = p + "%";
  $("volThumb").style.bottom = `calc(${p}% - 8px)`;
  const track = $("volTrack");
  track.setAttribute("aria-valuenow", String(p));
  track.setAttribute("aria-valuetext", p === 0 ? "静音" : "音量 " + p);
}

const currentVolPercent = () => Math.round(hjMusic.vol * 100);

function setVolumePercent(p) {
  hjMusic.setVolume(clamp(Math.round(p), 0, 100) / 100);
  paintVolSlider(currentVolPercent());
}

function initVolSlider() {
  const track = $("volTrack");
  paintVolSlider(currentVolPercent());

  const valueFromPointer = (e) => {
    const rect = track.getBoundingClientRect();
    if (!rect.height) return currentVolPercent();
    return (1 - (e.clientY - rect.top) / rect.height) * 100;
  };

  let dragging = false;
  track.addEventListener("pointerdown", (e) => {
    dragging = true;
    try { track.setPointerCapture(e.pointerId); } catch (err) {}
    setVolumePercent(valueFromPointer(e));
    e.preventDefault();
  });
  track.addEventListener("pointermove", (e) => {
    if (dragging) setVolumePercent(valueFromPointer(e));
  });
  track.addEventListener("pointerup", () => { dragging = false; });
  track.addEventListener("pointercancel", () => { dragging = false; });

  // 键盘：方向键 ±5，Home 静音，End 最大
  const KEY_STEPS = { ArrowUp: 5, ArrowRight: 5, ArrowDown: -5, ArrowLeft: -5 };
  track.addEventListener("keydown", (e) => {
    const cur = currentVolPercent();
    let next = null;
    if (e.key in KEY_STEPS) next = cur + KEY_STEPS[e.key];
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = 100;
    if (next === null) return;
    e.preventDefault();
    setVolumePercent(next);
  });
}

/* 「更多」下拉 -----------------------------------------------------------------
   圆形图标按钮在「更多」下方竖排展开。新增功能：在 HJ_MORE_FEATURES 加一项，
   并在 onMoreItemClick 里处理；dev 不为 false 的项视为开发中；shown() 返回假时不显示。
   花语的图标是四瓣的月见草（和开屏图同一种花） */
const HUAYU_PETAL = "M12 11.2C8.9 9.6 7 5.9 8.9 3.9c1.1-1.1 2.5-.8 3.1.5.6-1.3 2-1.6 3.1-.5 1.9 2 0 5.7-3.1 7.3z";
const HJ_MORE_FEATURES = [
  { id: "alarm",    label: "闹铃",   dev: false, icon: '<circle cx="12" cy="13" r="7"/><path d="M12 10v3l2.2 2.2"/><path d="M5.5 4.5l-2 2"/><path d="M18.5 4.5l2 2"/>' },
  { id: "calendar", label: "日历", dev: false, icon: '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M8 3v4M16 3v4M4 10.5h16"/>' },
  { id: "huayu",    label: "听得花间语", dev: false, shown: () => huayuMode === "open" || huayuMode === "decrypt",
    icon: [0, 90, 180, 270].map((a) => `<path transform="rotate(${a} 12 12)" d="${HUAYU_PETAL}"/>`).join("") },
];

function onMoreItemClick(id) {
  if (id === "calendar") openCalWidget(true);
  else if (id === "alarm") openAlarmModal(true);
  else if (id === "huayu") openHuayuModal();
  else showToast("功能正在开发中~");
  openMorePanel(false);
}

function renderMorePanel() {
  const panel = $("morePanel");
  panel.innerHTML = HJ_MORE_FEATURES.filter((f) => !f.shown || f.shown()).map((f) => {
    const title = f.label + (f.dev === false ? "" : "（开发中）");
    return `<button type="button" class="more-item" data-more-id="${f.id}" aria-label="${f.label}" title="${title}">`
      + `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${f.icon}</svg></button>`;
  }).join("");
  panel.querySelectorAll(".more-item").forEach((btn) => {
    btn.addEventListener("click", () => onMoreItemClick(btn.dataset.moreId));
  });
}

/* 显隐用 is-open 类（配合 CSS visibility 过渡），不用 hidden，否则收起动画会被截断 */
function openMorePanel(open) {
  $("morePanel").classList.toggle("is-open", !!open);
  const btn = $("moreToggle");
  btn.classList.toggle("is-active", !!open);
  btn.setAttribute("aria-expanded", String(!!open));
}

function initMorePanel() {
  renderMorePanel();
  $("moreToggle").addEventListener("click", () => {
    openMorePanel(!$("morePanel").classList.contains("is-open"));
    openVolPanel(false);   // 与音量弹层互斥
  });
}

/* 点击空白处或按 Esc 收起音量弹层和「更多」下拉 */
function initHeaderPanels() {
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#volPanel, #soundToggle")) openVolPanel(false);
    if (!e.target.closest("#morePanel, #moreToggle")) openMorePanel(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    openVolPanel(false);
    openMorePanel(false);
  });
}

/* 日历小组件 -------------------------------------------------------------------
   - 打开后常驻页面（点外面、按 Esc 不关闭），只能用 × 关闭
   - 月份范围：2021-01 ~ 当前月 + 12
   - 开合、缩放、拖动位置保存在本地；月份不保存，每次打开都回到今天所在的月份
   - 活动标注写在 config.js 的 HJ_CAL_ITEMS；HJ_CAL_EVENTS 是按天展开后的索引（日格横条用它）
   - 控制台调试：HJ_CAL.items.push({ date: "2026-09-26", label: "测试" }); HJ_CAL.refresh() */
const HJ_CAL_MIN = { y: 2021, m: 1 };

/* 按天展开：key = YYYY-MM-DD，值为当天的事件数组（含所属 item，便于取区间） */
const HJ_CAL_EVENTS = {};

function calItemStart(item) { return item.start || item.date; }
function calItemEnd(item) { return item.end || item.date; }

function calEachDay(item, fn) {
  const [sy, sm, sd] = calItemStart(item).split("-").map(Number);
  const [ey, em, ed] = calItemEnd(item).split("-").map(Number);
  const end = new Date(ey, em - 1, ed);
  for (const d = new Date(sy, sm - 1, sd); d <= end; d.setDate(d.getDate() + 1)) fn(calKey(d));
}

function buildCalEvents() {
  Object.keys(HJ_CAL_EVENTS).forEach((k) => delete HJ_CAL_EVENTS[k]);
  HJ_CAL_ITEMS.forEach((item) => {
    calEachDay(item, (key) => {
      (HJ_CAL_EVENTS[key] ||= []).push({ label: item.label, tone: item.tone, item });
    });
  });
}
const HJ_CAL_TONES = ["rose", "gold", "teal", "wisteria", "blue", "orange"];
const HJ_CAL_ZOOMS = [0.8, 0.9, 1, 1.1, 1.2];
const CAL_EDGE = 8;         // 拖动时距视口边缘的最小距离
const CAL_KEEP_VISIBLE = 60; // 至少保留在视口内的宽 / 高
const calState = { y: 0, m: 0, pick: "", zoom: 1 };

/* 年月 ↔ 连续月序号 */
const calIdx = (y, m) => y * 12 + (m - 1);
const calFromIdx = (i) => ({ y: Math.floor(i / 12), m: (i % 12) + 1 });
const calMinIdx = () => calIdx(HJ_CAL_MIN.y, HJ_CAL_MIN.m);
function calMaxIdx() {
  const d = new Date();
  return calIdx(d.getFullYear(), d.getMonth() + 1) + 12;
}
const calClampIdx = (i) => clamp(i, calMinIdx(), calMaxIdx());
const calKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const calTone = (ev) => (HJ_CAL_TONES.includes(ev.tone) ? ev.tone : "rose");

function calGoTo(y, m) {
  const c = calFromIdx(calClampIdx(calIdx(y, m)));
  calState.y = c.y;
  calState.m = c.m;
}

function renderCalGrid() {
  const { y, m } = calState;
  const firstWeekday = (new Date(y, m - 1, 1).getDay() + 6) % 7;   // 0 = 周一
  const todayKey = calKey(new Date());
  const cells = [];

  // 固定 6 行 × 7 列，从本月第一周的周一开始
  for (let i = 0; i < 42; i++) {
    const d = new Date(y, m - 1, 1 - firstWeekday + i);
    const key = calKey(d);
    const cls = ["cal-day"];
    if (d.getMonth() !== m - 1) cls.push("is-out");
    if (key === todayKey) cls.push("is-today");
    if (key === calState.pick) cls.push("is-pick");
    const bars = (HJ_CAL_EVENTS[key] || []).slice(0, 3)
      .map((ev) => `<i class="cal-bar tone-${calTone(ev)}"></i>`).join("");
    cells.push(`<button type="button" tabindex="-1" class="${cls.join(" ")}" data-date="${key}">`
      + `<span class="cal-num">${d.getDate()}</span>`
      + (bars ? `<span class="cal-bars">${bars}</span>` : "")
      + `</button>`);
  }

  const grid = $("calGrid");
  grid.innerHTML = cells.join("");
  grid.querySelectorAll(".cal-day").forEach((btn) => {
    btn.addEventListener("click", () => {
      calState.pick = btn.dataset.date;
      renderCal();
    });
  });
}

/* 本月事件胶囊：与本月有交集的活动各出现一次，跨日的显示日期区间 */
const calMd = (key) => {
  const [, mm, dd] = key.split("-").map(Number);
  return `${mm}/${dd}`;
};

function renderCalEvents() {
  const { y, m } = calState;
  const monthStart = `${y}-${pad2(m)}-01`;
  const monthEnd = `${y}-${pad2(m)}-${pad2(new Date(y, m, 0).getDate())}`;
  const list = HJ_CAL_ITEMS
    .filter((item) => calItemStart(item) <= monthEnd && calItemEnd(item) >= monthStart)
    .sort((a, b) => calItemStart(a).localeCompare(calItemStart(b)));

  const box = $("calEvents");
  if (!list.length) {
    box.innerHTML = '<p class="cal-empty">本月暂无活动标注</p>';
    return;
  }
  box.innerHTML = list.map((item) => {
    const start = calItemStart(item);
    const end = calItemEnd(item);
    const when = start === end ? calMd(start) : `${calMd(start)}–${calMd(end)}`;
    // 跨月的活动点击后跳到它在本月的第一天，不会把日历翻走
    const jump = start >= monthStart ? start : monthStart;
    return `<button type="button" class="cal-chip tone-${calTone(item)}" data-date="${jump}">`
      + `<span>${escapeHtml(item.label)}</span><span class="cal-chip-day">${when}</span></button>`;
  }).join("");
  box.querySelectorAll(".cal-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const [cy, cm] = chip.dataset.date.split("-").map(Number);
      calState.y = cy;
      calState.m = cm;
      calState.pick = chip.dataset.date;
      renderCal();
    });
  });
}

let calEventsBuilt = false;
function renderCal() {
  if (!calEventsBuilt) { buildCalEvents(); calEventsBuilt = true; }   // 先建事件索引，日格上才有活动横条
  $("calTitle").textContent = `${calState.y}年${calState.m}月`;
  renderCalGrid();
  renderCalEvents();
  const idx = calIdx(calState.y, calState.m);
  $("calPrev").disabled = idx <= calMinIdx();
  $("calNext").disabled = idx >= calMaxIdx();
}

function calShift(dir) {
  calGoTo(calState.y, calState.m + dir);
  renderCal();
}

function setCalZoom(z) {
  calState.zoom = z;
  $("calWidget").style.setProperty("--cal-zoom", String(z));
  $("calZoomIn").disabled = z >= HJ_CAL_ZOOMS[HJ_CAL_ZOOMS.length - 1];
  $("calZoomOut").disabled = z <= HJ_CAL_ZOOMS[0];
  storage.set(STORE.calZoom, z);
}

function calZoomStep(dir) {
  const i = HJ_CAL_ZOOMS.indexOf(calState.zoom);
  return HJ_CAL_ZOOMS[clamp((i === -1 ? 2 : i) + dir, 0, HJ_CAL_ZOOMS.length - 1)];
}

/* 从关着到打开：不管之前翻到哪个月，都回到今天 */
function calGoToday() {
  const now = new Date();
  calGoTo(now.getFullYear(), now.getMonth() + 1);
  calState.pick = "";
  renderCal();
}

function openCalWidget(open) {
  if (open && $("calWidget").hidden) calGoToday();
  $("calWidget").hidden = !open;
  storage.set(STORE.calOpen, open ? "1" : "0");
}

/* 用 right / top 定位：与缩放锚点（右上角）一致 */
function setCalPos(right, top) {
  const w = $("calWidget");
  w.style.right = right + "px";
  w.style.top = top + "px";
  storage.set(STORE.calXy, `${right},${top}`);
}

const viewportSize = () => ({
  vw: window.innerWidth || document.documentElement.clientWidth,
  vh: window.innerHeight || document.documentElement.clientHeight,
});

/* 标题栏拖动（鼠标 / 触屏通用），工具按钮区域除外；双击复位 */
function initCalDrag() {
  const w = $("calWidget");
  const head = w.querySelector(".cal-head");
  let drag = null;

  head.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (e.target.closest(".cal-tool")) return;
    const r = w.getBoundingClientRect();
    drag = { ox: e.clientX - r.left, oy: e.clientY - r.top, w: r.width, h: r.height, ...viewportSize() };
    try { head.setPointerCapture(e.pointerId); } catch (err) {}
    w.classList.add("is-drag");
    e.preventDefault();
  });

  head.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const left = e.clientX - drag.ox;
    let top = e.clientY - drag.oy;
    let right = drag.vw - (left + drag.w);
    if (drag.w) right = clamp(right, CAL_EDGE, drag.vw - CAL_KEEP_VISIBLE);
    if (drag.h) top = clamp(top, CAL_EDGE, drag.vh - CAL_KEEP_VISIBLE);
    setCalPos(Math.round(right), Math.round(top));
  });

  const end = () => {
    drag = null;
    w.classList.remove("is-drag");
  };
  head.addEventListener("pointerup", end);
  head.addEventListener("pointercancel", end);

  head.addEventListener("dblclick", (e) => {
    if (e.target.closest(".cal-tool")) return;
    w.style.right = "";
    w.style.top = "";
    storage.remove(STORE.calXy);
  });
}

/* 从本地恢复：缩放、位置、开合（月份总是从今天开始） */
function initCalWidget() {
  const now = new Date();
  calState.y = now.getFullYear();
  calState.m = now.getMonth() + 1;
  storage.remove(STORE.calYm);   // 以前版本存过的月份，清掉

  const z = Number(storage.get(STORE.calZoom));
  setCalZoom(HJ_CAL_ZOOMS.includes(z) ? z : 1);

  $("calPrev").addEventListener("click", () => calShift(-1));
  $("calNext").addEventListener("click", () => calShift(1));
  $("calZoomIn").addEventListener("click", () => setCalZoom(calZoomStep(1)));
  $("calZoomOut").addEventListener("click", () => setCalZoom(calZoomStep(-1)));
  $("calClose").addEventListener("click", () => openCalWidget(false));

  const xy = (storage.get(STORE.calXy) || "").split(",").map(Number);
  if (xy.length === 2 && xy.every(Number.isFinite)) {
    const { vw, vh } = viewportSize();
    setCalPos(clamp(xy[0], CAL_EDGE, vw - CAL_KEEP_VISIBLE), clamp(xy[1], CAL_EDGE, vh - CAL_KEEP_VISIBLE));
  }

  initCalDrag();
  /* 日格和事件索引等打开时再画（openCalWidget → calGoToday → renderCal） */
  if (storage.get(STORE.calOpen) === "1") openCalWidget(true);
}

/* 控制台调试入口 */
window.HJ_CAL = {
  items: HJ_CAL_ITEMS,
  events: HJ_CAL_EVENTS,
  refresh: () => {
    buildCalEvents();
    renderCal();
  },
  open: () => openCalWidget(true),
  close: () => openCalWidget(false),
  go: (y, m) => {
    calGoTo(y, m);
    renderCal();
  },
};

/* 时间条 -----------------------------------------------------------------------
   国服时间：固定 UTC+8，不随访客时区变化。
   艾欧泽亚时间（ET）：流速为现实的 144/7 倍，自 1970-01-01 00:00 UTC 起算
   （1 ET 小时 = 175 秒，1 ET 分钟 ≈ 2.92 秒，1 ET 日 = 70 分钟）。
   两个时间都用校准过的 hjNow()，和游戏内的时钟对得上。 */
const EORZEA_RATE = 144 / 7;
const ET_MINUTE_MS = 60000 / EORZEA_RATE;

function hjReadClocks(now = hjNow()) {
  const cn = new Date(now + CN_TZ_OFFSET_MS);
  const etMinutes = Math.floor(now / ET_MINUTE_MS);   // 自 1970 年起的 ET 分钟数
  const etHour = Math.floor(etMinutes / 60) % 24;
  const etMin = etMinutes % 60;
  return {
    cn: `${pad2(cn.getUTCHours())}:${pad2(cn.getUTCMinutes())}:${pad2(cn.getUTCSeconds())}`,
    et: `${pad2(etHour)}:${pad2(etMin)}`,
    etNight: etHour >= 18 || etHour < 6,
  };
}

const hjClockShown = () => !$("hjClock").classList.contains("is-hidden");

function hjClockTick() {
  if (!hjClockShown()) return;   // 时间条收着时不算天气和天象
  const t = hjReadClocks();
  $("hjTimeCN").textContent = t.cn;
  $("hjTimeET").textContent = t.et;
  $("hjEtGlyph").textContent = t.etNight ? "☾" : "☀";   // ☾ / ☀
  $("hjClockEt").classList.toggle("is-night", t.etNight);
  hjRenderWeather();
  hjRenderOmens();
}

/* 刷新时机对准「下一个整秒」和「下一个 ET 整分」中较早的那个，ET 一跳分钟页面就跟着跳；
   页面在后台时跳过 */
let hjClockTimer = 0;
function scheduleClockTick() {
  clearTimeout(hjClockTimer);
  const now = hjNow();
  const toNextSecond = 1000 - (now % 1000);
  const toNextEtMinute = ET_MINUTE_MS - (now % ET_MINUTE_MS);
  hjClockTimer = setTimeout(() => {
    if (!document.hidden) hjClockTick();
    scheduleClockTick();
  }, Math.min(toNextSecond, toNextEtMinute) + 8);
}

function initClock() {
  hjClockTick();
  scheduleClockTick();
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) hjClockTick();
  });
}

/* 时钟按钮：切换时间条显隐（默认隐藏，不记忆） */
function initClockToggle() {
  const btn = $("clockToggle");
  const clock = $("hjClock");
  const sync = () => {
    const hidden = clock.classList.contains("is-hidden");
    btn.classList.toggle("is-active", !hidden);
    btn.setAttribute("aria-pressed", String(!hidden));
    btn.setAttribute("aria-label", hidden ? "显示时间条（国服时间与艾欧泽亚时间）" : "隐藏时间条");
    btn.setAttribute("title", hidden ? "点击显示时间条" : "点击隐藏时间条");
  };
  btn.addEventListener("click", () => {
    clock.classList.toggle("is-hidden");
    sync();
    if (!clock.classList.contains("is-hidden")) hjClockTick();
  });
  sync();
}

/* 高脚孤丘天气 -------------------------------------------------------------------
   显示当前 + 未来 5 个时段。图标读取 weather/<天气名>.png。
   算法与 asvel.github.io/ffxiv-weather、ffxiv.pf-n.co/skywatcher 一致：
     每个 ET 日按 0/8/16 时分三段，seed = ET 天数 * 100 + 段标记，
     step1 = (seed << 11) ^ seed，step2 = (step1 >>> 8) ^ step1，chance = step2 % 100。
   概率分布（WeatherRate: The Goblet）：碧空 40 / 晴朗 20 / 阴云 25 / 薄雾 10 / 小雨 5。
   星芒节覆盖时段内一律显示「小雪」（见第 6 节）。 */
const HJ_WEATHER_ICON_DIR = "weather/";
const HJ_WEATHER_SLOTS = 6;
const ET_HOUR_SECONDS = 175;
const HJ_GOBLET_WEATHERS = [   // limit 为累计概率上限，须升序
  { limit: 40,  name: "碧空" },
  { limit: 60,  name: "晴朗" },
  { limit: 85,  name: "阴云" },
  { limit: 95,  name: "薄雾" },
  { limit: 100, name: "小雨" },
];
const HJ_STARLIGHT_WEATHER = { name: "小雪" };

const hjWeatherIcon = (name) => HJ_WEATHER_ICON_DIR + encodeURIComponent(name) + ".png";

function hjGobletWeatherAt(unixSec) {
  const eHours = Math.floor(Math.floor(unixSec) / ET_HOUR_SECONDS);
  const eDays = Math.floor(eHours / 24);
  const chunk = ((eHours % 24) - (eHours % 8) + 8) % 24;   // ET 0/8/16 → 8/16/0
  const seed = eDays * 100 + chunk;
  /* 原算法是无符号 32 位运算；JS 的 ^ 结果是有符号的，用 >>> 0 转回无符号再取余 */
  const s1 = ((seed << 11) ^ seed) >>> 0;
  const s2 = ((s1 >>> 8) ^ s1) >>> 0;
  const chance = s2 % 100;
  const idx = HJ_GOBLET_WEATHERS.findIndex((w) => chance < w.limit);
  const i = idx === -1 ? HJ_GOBLET_WEATHERS.length - 1 : idx;
  return { chance, idx: i, ...HJ_GOBLET_WEATHERS[i] };
}

function hjGobletForecast(count) {
  const now = hjNow() / 1000;
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = now + i * 8 * ET_HOUR_SECONDS;   // 每段 = 现实 23 分 20 秒
    out.push(hjStarlightActiveAt(t * 1000) ? { ...HJ_STARLIGHT_WEATHER } : hjGobletWeatherAt(t));
  }
  return out;
}

/* 天气序列没变时不重绘；force = true 时强制重绘 */
let hjWeatherLastKey = "";
function hjRenderWeather(force) {
  const seqEl = $("hjWeatherSeq");
  const seq = hjGobletForecast(HJ_WEATHER_SLOTS);
  const key = seq.map((s) => s.name).join("|");
  if (!force && key === hjWeatherLastKey) return;
  hjWeatherLastKey = key;

  const arrow = '<span class="hj-weather-arrow" aria-hidden="true">→</span>';
  seqEl.innerHTML = seq.map((w, i) => {
    const current = i === 0;
    return `<span class="hj-wx${current ? " is-current" : ""}" title="${w.name}">`
      + (current ? '<span class="hj-wx-current-prefix">当前</span>' : "")
      + `<img src="${hjWeatherIcon(w.name)}" alt="${w.name}" loading="lazy" decoding="async" width="18" height="18">`
      + `<span class="hj-wx-name">${w.name}</span></span>`;
  }).join(arrow);
}

/* 特殊天象与钓场之王（时间条第三行）------------------------------------------------
   都由高脚孤丘的天气推算，只显示下一次还要等多久（现实时间）。
   1 个天气时段 = 8 ET 小时 = 现实 1400 秒，时段从 ET 0 / 8 / 16 时开始。
   - 彩虹（与灰机 wiki 天气预报一致）：只在每个 ET 月 27 日 12:00 ~ 次月 6 日 12:00 之间；
     ET 16:00 换天气时，8–16 时是「小雨」、16 时起是碧空 / 晴朗 / 阴云；
     ET 8:00 换天气时，前一天 16–24 时是「小雨」、8 时起是碧空 / 晴朗 / 阴云（中间 0–8 时不论）。
     0:00 换天气在夜里，不出彩虹。ET x:10 出现，持续 30 ET 分钟（现实约 1 分 27 秒）。
     ET 1 个月 = 32 天，日期由 ET 天数推出。
   - 枪鼻头（高脚孤丘钓场的钓场之王）：ET 21:00–24:00，且 16–24 时这段天气为阴云或薄雾。
   星芒节覆盖时段内天气当作小雪，两者都不会出现。 */
const HJ_PERIOD_MS = 8 * ET_HOUR_SECONDS * 1000;
const HJ_OMEN_SCAN_PERIODS = 3 * 24 * 30 * 3;       // 往后最多找约 30 天（现实）
const HJ_RAINBOW_AFTER = ["碧空", "晴朗", "阴云"];
const HJ_RAINBOW_OFFSET_MS = 10 * ET_MINUTE_MS;     // ET x:10 出现
const HJ_RAINBOW_LEN_MS = 30 * ET_MINUTE_MS;
const HJ_FISH_WEATHERS = ["阴云", "薄雾"];
const HJ_FISH_OFFSET_MS = 5 * ET_HOUR_SECONDS * 1000;   // 16:00 起第 5 个 ET 小时 = 21:00

const HJ_RAINBOW_SEASON = [26 * 24 + 12, 5 * 24 + 12];   // 月内第几个 ET 小时：27 日 12:00 起、6 日 12:00 止

const hjPeriodWeatherName = (p) => hjGobletWeatherAt(p * HJ_PERIOD_MS / 1000).name;

/* 第 p 个时段开始时是 ET 当月的第几个小时（1 日 0:00 = 0） */
const hjPeriodMonthHour = (p) => (Math.floor(p / 3) % 32) * 24 + (p % 3) * 8;

/* 第 p 个时段里的彩虹 / 枪鼻头窗口，没有就返回 null */
function hjRainbowIn(p) {
  const slot = p % 3;   // 0 / 1 / 2 = ET 0 / 8 / 16 时开始
  if (slot === 0) return null;
  const mh = hjPeriodMonthHour(p);
  if (mh < HJ_RAINBOW_SEASON[0] && mh >= HJ_RAINBOW_SEASON[1]) return null;
  const rainP = slot === 1 ? p - 2 : p - 1;
  const start = p * HJ_PERIOD_MS + HJ_RAINBOW_OFFSET_MS;
  if (hjStarlightActiveAt(rainP * HJ_PERIOD_MS) || hjStarlightActiveAt(start)) return null;
  if (hjPeriodWeatherName(rainP) !== "小雨" || !HJ_RAINBOW_AFTER.includes(hjPeriodWeatherName(p))) return null;
  return { start, end: start + HJ_RAINBOW_LEN_MS };
}
function hjSpearnoseIn(p) {
  if (p % 3 !== 2) return null;
  const start = p * HJ_PERIOD_MS + HJ_FISH_OFFSET_MS;
  const end = (p + 1) * HJ_PERIOD_MS;
  if (hjStarlightActiveAt(start) || hjStarlightActiveAt(end - 1)) return null;
  return HJ_FISH_WEATHERS.includes(hjPeriodWeatherName(p)) ? { start, end } : null;
}

function hjNextWindow(find, now) {
  const p0 = Math.floor(now / HJ_PERIOD_MS);
  for (let p = p0; p < p0 + HJ_OMEN_SCAN_PERIODS; p++) {
    const w = find(p);
    if (w && w.end > now) return w;
  }
  return null;
}

/* 现实时长：1 小时内 mm:ss，超过显示 h:mm:ss，超过一天再加「x天」 */
function hjFormatWait(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor(total / 3600) % 24;
  const m = Math.floor(total / 60) % 60;
  const s = total % 60;
  const ms2 = `${pad2(m)}:${pad2(s)}`;
  if (d) return `${d}天${pad2(h)}:${ms2}`;
  return h ? `${h}:${ms2}` : ms2;
}

/* 窗口只在过期或星芒节设置变化时重新查找，每秒只刷新文字 */
const hjOmenCache = {};   // key → { w: 窗口或 null, at: 查找时刻 }
function hjResetOmens() { delete hjOmenCache.rainbow; delete hjOmenCache.fish; }

function hjOmenWindow(key, find, now) {
  const c = hjOmenCache[key];
  const stale = !c || (c.w ? now >= c.w.end : now - c.at > 60000) || now < c.at;
  if (stale) hjOmenCache[key] = { w: hjNextWindow(find, now), at: now };
  return hjOmenCache[key].w;
}

function hjPaintOmen(itemId, w, now, liveText) {
  const item = $(itemId);
  if (!item) return;
  const live = !!w && now >= w.start;
  const text = !w ? "近期不会出现"
    : live ? liveText(w)
    : `将在 ${hjFormatWait(w.start - now)} 后出现`;
  item.classList.toggle("is-live", live);
  const state = item.querySelector(".hj-omen-state");
  if (state.textContent !== text) state.textContent = text;
}

function hjRenderOmens() {
  const now = hjNow();
  hjPaintOmen("hjOmenRainbow", hjOmenWindow("rainbow", hjRainbowIn, now), now, () => "天象出现！");
  hjPaintOmen("hjOmenFish", hjOmenWindow("fish", hjSpearnoseIn, now), now,
    (w) => `现在会咬钩！持续 ${hjFormatWait(w.end - now)}`);
}


/* =============================================================================
   12. 点赞（Worker：get_likes / add_like）
   - 目标 key：活动详情 act:<id>，小型回顾 mini:<文件名>，花街相册 info:<文件名>
   - 每人每日（UTC+8）最多 10 次，同一目标可重复点赞；上限由服务器强制，前端只做预检
   - 接口不可用时按钮保持隐藏，不影响其它功能
   ============================================================================= */

const LIKE_DAILY_LIMIT = 10;
const LIKE_LIMIT_MSG = `今天 ${LIKE_DAILY_LIMIT} 次点赞已用完，明天再来吧`;
const LIKE_HEART_SVG = '<svg class="ico-heart" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>';

const hjLikeState = {
  counts: {},                   // key → 总数
  liked: new Set(),             // 本访客点过的 key
  remaining: LIKE_DAILY_LIMIT,  // 今日剩余次数
  available: false,             // 接口是否可用
};

function likeKeyFromSrc(prefix, src) {
  const name = String(src).split("/").pop().split("?")[0];
  return `${prefix}:${name}`;
}

/* 图片角标版点赞按钮（初始隐藏，接口可用后显示） */
function likeBtnHtml(key) {
  return `<button type="button" class="hj-like-btn hj-like-chip" data-like-key="${key}" aria-pressed="false" aria-label="点赞" title="点赞" hidden>`
    + `${LIKE_HEART_SVG}<span class="hj-like-count">0</span></button>`;
}

/* root 内（含 root 自身）所有点赞按钮 */
function likeButtonsIn(root) {
  const list = [...root.querySelectorAll(".hj-like-btn[data-like-key]")];
  if (root.matches && root.matches(".hj-like-btn[data-like-key]")) list.push(root);
  return list;
}

function paintLikes() {
  if (!hjLikeState.available) return;
  likeButtonsIn(document).forEach((btn) => {
    const key = btn.dataset.likeKey;
    if (!key) return;
    const liked = hjLikeState.liked.has(key);
    btn.hidden = false;
    btn.classList.toggle("is-liked", liked);
    btn.setAttribute("aria-pressed", liked ? "true" : "false");
    const count = btn.querySelector(".hj-like-count");
    if (count) count.textContent = String(hjLikeState.counts[key] || 0);
  });
}

async function refreshLikes(root) {
  if (siteLockdown) return;   // 静态模式：点赞按钮保持隐藏
  const keys = [...new Set(likeButtonsIn(root).map((b) => b.dataset.likeKey).filter(Boolean))];
  if (!keys.length) return;
  const data = await callWorker({ action: "get_likes", keys });
  if (!data || !data.ok) return;
  hjLikeState.available = true;
  Object.assign(hjLikeState.counts, data.counts || {});
  (data.liked || []).forEach((k) => hjLikeState.liked.add(k));
  if (typeof data.remaining === "number") hjLikeState.remaining = data.remaining;
  paintLikes();
}

/* 详情页横幅里的点赞按钮：切换活动时先清空旧状态 */
function setupDetailLike(data) {
  const btn = $("detailLikeBtn");
  btn.dataset.likeKey = "act:" + (data.id || "latest");
  btn.classList.remove("is-liked");
  btn.querySelector(".hj-like-count").textContent = "0";
  refreshLikes(btn);
}

async function onLikeBtnClick(btn) {
  const key = btn.dataset.likeKey;
  if (!key) return;
  if (await blockedByStaticMode()) return;
  if (hjLikeState.remaining <= 0) {
    showToast(LIKE_LIMIT_MSG);
    return;
  }

  btn.disabled = true;
  const data = await callWorker({ action: "add_like", key });
  btn.disabled = false;

  if (data && data.ok) {
    hjLikeState.liked.add(key);
    hjLikeState.counts[key] = data.count;
    if (typeof data.remaining === "number") hjLikeState.remaining = data.remaining;
    paintLikes();
    showToast(`点赞成功，今天还剩 ${hjLikeState.remaining} 次`);
  } else if (data && data.error === "daily_limit") {
    hjLikeState.remaining = 0;
    showToast(LIKE_LIMIT_MSG);
  } else {
    showToast("点赞失败，请稍后再试");
  }
}

/* 捕获阶段拦截：避免同时触发图片预览、点击爆花等 */
function initLikes() {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".hj-like-btn");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    onLikeBtnClick(btn);
  }, true);
}


/* =============================================================================
   13. 闹铃与倒计时（纯本地，不经过 Worker）
   - 入口：右上角「更多」→「闹铃」，弹窗内分两个子类型：闹铃 / 倒计时
   - 闹铃：到指定时刻响铃。时间可按 国服时间（UTC+8）或 艾欧泽亚时间 设置；
     国服时间可勾「每小时重复」（每小时的第 MM 分响，忽略小时），
     艾欧泽亚时间可勾「每日重复」（1 艾欧泽亚日 ≈ 现实 70 分钟）
   - 倒计时：倒数结束响铃。国服最短 30 秒；艾欧泽亚最短 15 分钟（游戏内时间）；
     可勾「倒计时结束后自动循环」
   - 铃声取自仓库 music/<名称>.ogg（名称见 ALARM_SOUNDS，与文件名一致），
     播放时长 30 / 45 秒两档（默认 30 秒），结尾慢慢减弱（淡出）
   - 同一时刻只播一个铃声：新的闹铃/倒计时到点时，先停掉正在响的铃声再播新的
   - 国服时间的闹铃同一时刻（时:分）只允许设置一个，重复添加会被拦下并提示
   - 添加后在页面上生成小组件：标题栏可拖动、双击回默认位置、± 缩放、× 收起
   - 所有数据（含组件位置 / 缩放）保存在 localStorage（STORE.alarmItems）
   - 控制台调试：HJ_ALARM.list() / HJ_ALARM.ringNow(id) / HJ_ALARM.open() / HJ_ALARM.clear()
   ============================================================================= */

/* 音源列表：与 music/ 目录里的文件名（不带扩展名）一致。
   新增铃声：把 .ogg 放进 music/，再在这个数组里加上文件名即可。 */
const ALARM_SOUNDS = ["基本闹铃", "闹铃1", "闹铃2", "闹铃3", "哄睡曲1", "哄睡曲2", "哄睡曲3"];
const ALARM_SOUND_DIR = "music/";
const ALARM_PLAY_DEFAULT = 30;                  // 默认播放时长（秒）
const ALARM_PLAY_OPTIONS = [30, 45];            // 可选播放时长（秒）：30 / 45 两档，结尾都会渐弱
const ALARM_FADE_SEC = 4;                       // 结尾渐弱（淡出）时长（秒）
const ALARM_ZOOMS = [0.8, 0.9, 1, 1.1, 1.2];    // 小组件缩放档位（与日历一致）
const ALARM_CN_MIN_SEC = 30;                    // 国服倒计时最短秒数
const ALARM_ET_MIN_MIN = 15;                    // 艾欧泽亚倒计时最短分钟数（游戏内时间）

const hjAlarms = {
  items: [],           // 全部闹铃 / 倒计时（含运行时字段，保存时会一并写入本地）
  ringing: new Map(),  // id → 播放会话 { stop }
};
const hjAlarmWidgets = new Map();   // id → { el, big, status, actions, sig }
let hjAlarmPreview = null;          // 试听会话

const alarmSoundSrc = (name) => ALARM_SOUND_DIR + encodeURIComponent(name) + ".ogg";
const alarmById = (id) => hjAlarms.items.find((it) => it.id === id);
const alarmZoneShort = (it) => (it.zone === "cn" ? "国服" : "艾欧泽亚");

/* 剩余时长 → HH:MM:SS（不足 1 小时则 MM:SS） */
function alarmFmtDur(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0 ? `${pad2(h)}:${pad2(m)}:${pad2(sec)}` : `${pad2(m)}:${pad2(sec)}`;
}

/* 某时刻的国服钟面（UTC+8，无夏令时，可直接偏移计算） */
function alarmCnClockAt(ms) {
  const d = new Date(ms + CN_TZ_OFFSET_MS);
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
}

/* 时/分/秒 → 人话（0 的部分省略） */
function alarmHumanDur(h, m, s) {
  if (h > 0) return `${h}小时${m > 0 ? `${m}分` : ""}${s > 0 ? `${s}秒` : ""}`;
  if (m > 0) return `${m}分${s > 0 ? `${s}秒` : ""}`;
  return `${s}秒`;
}

/* 下一次响铃时刻（epoch 毫秒） -------------------------------------------------- */
function alarmNextFire(it, now) {
  if (it.zone === "cn") {
    const d = new Date(now + CN_TZ_OFFSET_MS);
    if (it.repeat) {                       // 每小时重复：只看「分」
      d.setUTCMinutes(it.mm, 0, 0);
      let t = d.getTime() - CN_TZ_OFFSET_MS;
      if (t <= now) t += 3600 * 1000;
      return t;
    }
    d.setUTCHours(it.hh, it.mm, 0, 0);     // 仅一次：下一个 HH:MM
    let t = d.getTime() - CN_TZ_OFFSET_MS;
    if (t <= now) t += 24 * 3600 * 1000;
    return t;
  }
  // 艾欧泽亚：时间流速 144/7，ET 钟面每天（现实约 70 分钟）扫过全部 24 小时
  const target = it.hh * 3600 + it.mm * 60;
  const etSec = (now / 1000) * EORZEA_RATE;
  const tod = ((etSec % 86400) + 86400) % 86400;
  if (Math.floor(tod / 60) === Math.floor(target / 60)) return now;   // 正处在目标分钟内：立即响
  const delta = (target - tod + 86400) % 86400;
  return now + (delta / EORZEA_RATE) * 1000;
}

/* 铃声播放：从 0 快速渐入 → 平播 → 最后 ALARM_FADE_SEC 秒慢慢减弱到 0。
   音量始终乘上全站音量条（hjMusic.vol），拖音量条即时生效。 */
function alarmPlayCore(name, playSec, onEnd) {
  const audio = new Audio(alarmSoundSrc(name));
  audio.preload = "auto";
  const totalMs = Math.max(1, Number(playSec) || ALARM_PLAY_DEFAULT) * 1000;
  const fadeMs = Math.min(ALARM_FADE_SEC * 1000, totalMs * 0.6);
  const t0 = performance.now();
  let timer = 0;
  let stopped = false;

  const paint = () => {
    const t = performance.now() - t0;
    let f = 1;
    if (t < 500) f = Math.max(0.02, t / 500);              // 开头小渐入，防爆音
    const left = totalMs - t;
    if (left <= fadeMs) f = Math.max(0, left / fadeMs);    // 结尾慢慢减弱
    try { audio.volume = clamp(hjMusic.vol * f, 0, 1); } catch (e) {}
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    try { audio.pause(); } catch (e) {}
    if (onEnd) onEnd();
  };

  audio.addEventListener("ended", stop);   // 音频文件本身比播放时长短
  audio.addEventListener("error", () => {
    showToast(`铃声加载失败：${ALARM_SOUND_DIR}${name}.ogg`);
    stop();
  });
  paint();
  const p = audio.play();
  if (p && p.catch) p.catch((err) => {
    if (err && err.name === "NotAllowedError") showToast("浏览器拦截了铃声，点击一下页面任意处即可出声");
    stop();
  });
  // 用定时器同时负责音量包络和到点停止（后台标签页里 rAF 会停，定时器不会）
  timer = setInterval(() => {
    paint();
    if (performance.now() - t0 >= totalMs) stop();
  }, 100);
  return { stop, audio };
}

function alarmRing(it) {
  if (hjAlarms.ringing.has(it.id)) return;   // 同一个不在响铃中重复触发
  // 同一时刻只播一个铃声：若还有别的闹铃/倒计时正在响，先停掉它再播新的
  [...hjAlarms.ringing.keys()].forEach((id) => { if (id !== it.id) alarmStopRing(id); });
  const sess = alarmPlayCore(it.sound, it.playSec, () => {
    hjAlarms.ringing.delete(it.id);
    alarmPaintWidget(it);
    alarmRenderLists();
  });
  hjAlarms.ringing.set(it.id, sess);
  alarmPaintWidget(it);
  alarmRenderLists();
}

function alarmStopRing(id) {
  const sess = hjAlarms.ringing.get(id);
  if (sess) sess.stop();
}

/* 本地存取 -------------------------------------------------------------------- */
function alarmSave() {
  storage.set(STORE.alarmItems, JSON.stringify(hjAlarms.items));
}

/* 补齐默认值 + 清洗非法数据；返回 null 表示该条作废 */
function alarmNormalize(raw) {
  if (!raw || typeof raw !== "object") return null;
  const kind = raw.kind === "countdown" ? "countdown" : "alarm";
  const num = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  const it = {
    id: String(raw.id || `alm${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`),
    kind,
    zone: raw.zone === "et" ? "et" : "cn",
    name: String(raw.name || "").slice(0, 12),
    sound: ALARM_SOUNDS.includes(raw.sound) ? raw.sound : ALARM_SOUNDS[0],
    playSec: ALARM_PLAY_OPTIONS.includes(Number(raw.playSec)) ? Number(raw.playSec) : ALARM_PLAY_DEFAULT,
    enabled: raw.enabled !== false,
    done: !!raw.done,          // 一次性闹铃已响过 / 不循环的倒计时已走完
    hidden: !!raw.hidden,      // 小组件被 × 收起
    zoom: ALARM_ZOOMS.includes(Number(raw.zoom)) ? Number(raw.zoom) : 1,
    x: num(raw.x), y: num(raw.y),          // 组件位置（right / top 像素）
    hh: clamp(Math.floor(Number(raw.hh) || 0), 0, 23),
    mm: clamp(Math.floor(Number(raw.mm) || 0), 0, 59),
    repeat: !!raw.repeat,      // 闹铃：cn = 每小时重复，et = 每日重复
    durMs: Number(raw.durMs) > 0 ? Number(raw.durMs) : 0,   // 倒计时时长（现实毫秒）
    durLabel: String(raw.durLabel || ""),
    loop: !!raw.loop,
    paused: !!raw.paused,
    remainMs: Number(raw.remainMs) > 0 ? Number(raw.remainMs) : 0,
    endAt: Number(raw.endAt) > 0 ? Number(raw.endAt) : 0,
    nextFireAt: Number(raw.nextFireAt) > 0 ? Number(raw.nextFireAt) : 0,
  };
  if (it.kind === "countdown" && it.durMs < 1000) return null;
  return it;
}

/* 刷新页面后恢复排程：离开期间错过的响铃不补响 */
function alarmRevive(it) {
  const now = hjNow();
  if (it.kind === "alarm") {
    if (!it.enabled || it.done) { it.nextFireAt = 0; return; }
    if (!it.nextFireAt || it.nextFireAt <= now) {
      if (it.repeat) it.nextFireAt = alarmNextFire(it, now);
      else { it.done = true; it.nextFireAt = 0; }   // 一次性闹铃错过了 → 标记已完成
    }
    return;
  }
  if (!it.enabled || it.done) { it.endAt = 0; return; }
  if (it.paused) return;                             // 暂停中：保留 remainMs
  if (!it.endAt || it.endAt <= now) {
    if (it.loop) {                                   // 循环倒计时：从现在起继续循环，不补响
      let end = it.endAt || now;
      let guard = 0;
      while (end <= now && guard++ < 100000) end += it.durMs;
      it.endAt = end;
    } else { it.done = true; it.endAt = 0; it.remainMs = 0; }
  }
}

/* 每秒心跳：判定响铃、推进状态、刷新组件与面板 -------------------------------- */
function alarmTick() {
  const now = hjNow();
  let dirty = false;
  hjAlarms.items.forEach((it) => {
    if (!it.enabled || it.done) return;
    if (it.kind === "alarm") {
      if (it.nextFireAt && now >= it.nextFireAt) {
        alarmRing(it);
        if (it.repeat) it.nextFireAt = alarmNextFire(it, now + 500);
        else { it.done = true; it.nextFireAt = 0; }
        dirty = true;
      }
    } else if (!it.paused && it.endAt && now >= it.endAt) {
      alarmRing(it);
      if (it.loop) {
        let end = it.endAt;
        let guard = 0;
        while (end <= now && guard++ < 10000) end += it.durMs;   // 后台节流错过多轮时只补一轮
        it.endAt = end;
      } else { it.done = true; it.endAt = 0; it.remainMs = 0; }
      dirty = true;
    }
  });
  if (dirty) alarmSave();
  hjAlarms.items.forEach(alarmPaintWidget);
  alarmPaintListLive();
  alarmPaintNowHints();
}

/* 状态操作（停用 / 启用 / 暂停 / 重置 / 重新启用） ---------------------------- */
function alarmSetEnabled(it, on) {
  it.enabled = !!on;
  const now = hjNow();
  if (it.kind === "alarm") {
    if (it.enabled) { it.done = false; it.nextFireAt = alarmNextFire(it, now); }
    else { it.nextFireAt = 0; alarmStopRing(it.id); }
  } else if (it.enabled) {
    it.done = false;
    it.paused = false;
    it.endAt = now + (it.remainMs > 0 ? it.remainMs : it.durMs);
    it.remainMs = 0;
  } else {
    if (!it.paused && it.endAt) it.remainMs = Math.max(1000, it.endAt - now);
    it.paused = true;
    it.endAt = 0;
    alarmStopRing(it.id);
  }
  alarmSave();
  alarmAfterChange();
}

function alarmTogglePause(it) {
  if (it.done || !it.enabled) return;
  const now = hjNow();
  if (it.paused) {
    it.paused = false;
    it.endAt = now + (it.remainMs > 0 ? it.remainMs : it.durMs);
    it.remainMs = 0;
  } else {
    it.remainMs = Math.max(1000, (it.endAt || now) - now);
    it.paused = true;
    it.endAt = 0;
  }
  alarmSave();
  alarmAfterChange();
}

function alarmRestart(it) {   // 倒计时：从头开始
  it.enabled = true;
  it.done = false;
  it.paused = false;
  it.remainMs = 0;
  it.endAt = hjNow() + it.durMs;
  alarmSave();
  alarmAfterChange();
}

function alarmRearm(it) {     // 一次性闹铃响过后重新启用
  it.enabled = true;
  it.done = false;
  it.nextFireAt = alarmNextFire(it, hjNow());
  alarmSave();
  alarmAfterChange();
}

function alarmRemove(it) {
  alarmStopRing(it.id);
  hjAlarms.items = hjAlarms.items.filter((x) => x !== it);
  alarmSave();
  alarmAfterChange();
  showToast(`已删除「${it.name}」`);
}

function alarmAfterChange() {
  alarmRenderAllWidgets();
  alarmRenderLists();
}

/* 小组件 ---------------------------------------------------------------------- */
function alarmSubText(it) {
  if (it.kind === "alarm") {
    const rep = it.repeat ? (it.zone === "cn" ? "每小时重复" : "每日重复") : "仅一次";
    return `${alarmZoneShort(it)}时间 · ${rep}`;
  }
  return `${alarmZoneShort(it)}倒计时 · ${it.durLabel}${it.loop ? " · 自动循环" : ""}`;
}

function alarmWidgetActionsHtml(it) {
  const b = [];
  if (hjAlarms.ringing.has(it.id)) b.push('<button type="button" class="alm-btn is-hot" data-w="stopring">停止响铃</button>');
  if (it.kind === "alarm") {
    if (it.done) b.push('<button type="button" class="alm-btn" data-w="rearm">重新启用</button>');
    else b.push(`<button type="button" class="alm-btn" data-w="toggle">${it.enabled ? "停用" : "启用"}</button>`);
  } else if (it.done) {
    b.push('<button type="button" class="alm-btn" data-w="restart">重新开始</button>');
  } else if (it.enabled) {
    b.push(`<button type="button" class="alm-btn" data-w="pause">${it.paused ? "继续" : "暂停"}</button>`);
    b.push('<button type="button" class="alm-btn" data-w="restart">重置</button>');
  } else {
    b.push('<button type="button" class="alm-btn" data-w="toggle">启用</button>');
  }
  return b.join("");
}

/* 新组件的默认落点：按可见顺序往右下阶梯排开，保证每个的标题栏和正文都露在外面 */
function alarmInitPos(it) {
  const visible = hjAlarms.items.filter((x) => !x.hidden);
  const n = Math.max(0, visible.indexOf(it));
  const { vw, vh } = viewportSize();
  it.x = clamp(16 + (n % 4) * 30, CAL_EDGE, Math.max(CAL_EDGE, vw - CAL_KEEP_VISIBLE));
  it.y = clamp(112 + (n % 6) * 92, CAL_EDGE, Math.max(CAL_EDGE, vh - CAL_KEEP_VISIBLE));
}

function alarmSetPos(it, el, right, top) {
  it.x = right;
  it.y = top;
  el.style.right = right + "px";
  el.style.top = top + "px";
  alarmSave();
}

function alarmSyncZoomBtns(it, el) {
  el.querySelector('[data-w="zoomin"]').disabled = it.zoom >= ALARM_ZOOMS[ALARM_ZOOMS.length - 1];
  el.querySelector('[data-w="zoomout"]').disabled = it.zoom <= ALARM_ZOOMS[0];
}

function alarmBuildWidget(it) {
  const el = document.createElement("div");
  el.className = "alm-widget";
  el.dataset.id = it.id;
  el.innerHTML = `
    <div class="alm-head" title="拖动移动 · 双击回默认位置">
      <span class="alm-name">${escapeHtml(it.name)}</span>
      <span class="alm-tools">
        <button type="button" class="alm-tool" data-w="zoomout" aria-label="缩小组件" title="缩小">
          <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>
        </button>
        <button type="button" class="alm-tool" data-w="zoomin" aria-label="放大组件" title="放大">
          <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
        </button>
        <button type="button" class="alm-tool" data-w="hide" aria-label="收起组件" title="收起（可在闹铃面板重新显示）">
          <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </span>
    </div>
    <div class="alm-big" data-r="big">--:--</div>
    <div class="alm-sub" data-r="sub">${escapeHtml(alarmSubText(it))}</div>
    <div class="alm-status" data-r="status"></div>
    <div class="alm-actions" data-r="actions"></div>
    <div class="alm-meta">♪ ${escapeHtml(it.sound)} · 播 ${it.playSec} 秒后渐弱</div>`;
  el.style.setProperty("--alm-zoom", String(it.zoom));
  if (it.x === null || it.y === null) alarmInitPos(it);
  el.style.right = it.x + "px";
  el.style.top = it.y + "px";

  /* 标题栏拖动（鼠标 / 触屏通用），逻辑与日历小组件一致 */
  const head = el.querySelector(".alm-head");
  let drag = null;
  head.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (e.target.closest(".alm-tool")) return;
    const r = el.getBoundingClientRect();
    drag = { ox: e.clientX - r.left, oy: e.clientY - r.top, w: r.width, h: r.height, ...viewportSize() };
    try { head.setPointerCapture(e.pointerId); } catch (err) {}
    el.classList.add("is-drag");
    e.preventDefault();
  });
  head.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const left = e.clientX - drag.ox;
    let top = e.clientY - drag.oy;
    let right = drag.vw - (left + drag.w);
    if (drag.w) right = clamp(right, CAL_EDGE, drag.vw - CAL_KEEP_VISIBLE);
    if (drag.h) top = clamp(top, CAL_EDGE, drag.vh - CAL_KEEP_VISIBLE);
    alarmSetPos(it, el, Math.round(right), Math.round(top));
  });
  const endDrag = () => { drag = null; el.classList.remove("is-drag"); };
  head.addEventListener("pointerup", endDrag);
  head.addEventListener("pointercancel", endDrag);
  head.addEventListener("dblclick", (e) => {
    if (e.target.closest(".alm-tool")) return;
    alarmInitPos(it);
    el.style.right = it.x + "px";
    el.style.top = it.y + "px";
    alarmSave();
  });

  /* 工具按钮与操作按钮（事件委托） */
  el.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-w]");
    if (!btn || btn.disabled) return;
    const act = btn.dataset.w;
    if (act === "zoomin" || act === "zoomout") {
      const i = ALARM_ZOOMS.indexOf(it.zoom);
      const z = ALARM_ZOOMS[clamp((i === -1 ? 2 : i) + (act === "zoomin" ? 1 : -1), 0, ALARM_ZOOMS.length - 1)];
      it.zoom = z;
      el.style.setProperty("--alm-zoom", String(z));
      alarmSyncZoomBtns(it, el);
      alarmSave();
    } else if (act === "hide") {
      it.hidden = true;
      alarmSave();
      alarmAfterChange();
      showToast("组件已收起，可在「闹铃」面板里重新显示");
    } else if (act === "toggle") alarmSetEnabled(it, !it.enabled);
    else if (act === "pause") alarmTogglePause(it);
    else if (act === "restart") alarmRestart(it);
    else if (act === "rearm") alarmRearm(it);
    else if (act === "stopring") alarmStopRing(it.id);
  });
  return el;
}

function alarmRenderAllWidgets() {
  const layer = $("alarmWidgetLayer");
  layer.innerHTML = "";
  hjAlarmWidgets.clear();
  hjAlarms.items.forEach((it) => {
    if (it.hidden) return;
    const el = alarmBuildWidget(it);
    layer.appendChild(el);
    hjAlarmWidgets.set(it.id, {
      el,
      big: el.querySelector('[data-r="big"]'),
      status: el.querySelector('[data-r="status"]'),
      actions: el.querySelector('[data-r="actions"]'),
      sig: "",
    });
    alarmSyncZoomBtns(it, el);
    alarmPaintWidget(it);
  });
}

function alarmPaintWidget(it) {
  const w = hjAlarmWidgets.get(it.id);
  if (!w) return;
  const now = hjNow();
  const ringing = hjAlarms.ringing.has(it.id);
  let big, status;
  if (it.kind === "alarm") {
    big = `${pad2(it.hh)}:${pad2(it.mm)}`;
    status = ringing ? (hjMusic.vol <= 0 ? "响铃中（站内已静音）" : "响铃中…")
      : !it.enabled ? "已停用"
      : it.done ? "已完成（一次性）"
      : `距下次响铃 ${alarmFmtDur(it.nextFireAt - now)}`;
  } else {
    const remain = it.paused ? it.remainMs : Math.max(0, (it.endAt || now) - now);
    big = it.done ? "00:00" : alarmFmtDur(remain);
    status = ringing ? (hjMusic.vol <= 0 ? "时间到，响铃中（站内已静音）" : "时间到，响铃中…")
      : !it.enabled ? "已停用"
      : it.done ? "时间到！"
      : it.paused ? "已暂停"
      : it.zone === "et" ? `≈ 艾欧泽亚剩 ${Math.max(1, Math.ceil((remain / 1000) * EORZEA_RATE / 60))} 分钟`
      : `至 国服 ${alarmCnClockAt(it.endAt)}`;
  }
  w.big.textContent = big;
  w.status.textContent = status;
  w.el.classList.toggle("is-ringing", ringing);
  w.el.classList.toggle("is-off", !it.enabled || it.done);
  const sig = [it.enabled, it.done, it.paused, ringing].join("|");
  if (sig !== w.sig) {
    w.sig = sig;
    w.actions.innerHTML = alarmWidgetActionsHtml(it);
  }
}

/* 弹窗：表单 ------------------------------------------------------------------ */
function alarmFillFormSelects() {
  const snd = ALARM_SOUNDS.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("");
  const dur = ALARM_PLAY_OPTIONS.map((s) => `<option value="${s}"${s === ALARM_PLAY_DEFAULT ? " selected" : ""}>${s} 秒</option>`).join("");
  $("almSound").innerHTML = snd;
  $("cdSound").innerHTML = snd;
  $("almPlaySec").innerHTML = dur;
  $("cdPlaySec").innerHTML = dur;
}

const alarmFormZone = (group) => (document.querySelector(`input[name="${group}"]:checked`) || { value: "cn" }).value;

function alarmNum(id) {
  const el = $(id);
  return clamp(Math.floor(Number(el.value) || 0), Number(el.min) || 0, Number(el.max) || 99);
}

function alarmSegSync(segId) {
  $(segId).querySelectorAll("label").forEach((lb) => {
    lb.classList.toggle("is-active", lb.querySelector("input").checked);
  });
}

/* 表单联动提示：重复方式说明 / 倒计时换算 */
function alarmSyncZoneUi(kind) {
  if (kind === "alarm") {
    const zone = alarmFormZone("almZone");
    const rep = $("almRepeat").checked;
    $("almRepeatText").textContent = zone === "cn" ? "每小时重复" : "每日重复";
    const tv = $("almTime").value || "--:--";
    const mm = tv.slice(3);
    $("almRepeatHint").textContent = zone === "cn"
      ? (rep ? `每小时的第 ${mm} 分都会响（忽略「时」）` : `到下一个国服 ${tv} 响一次`)
      : (rep ? `每个艾欧泽亚日的 ${tv} 都响（1 艾欧泽亚日 ≈ 现实 70 分钟）` : `到下一个艾欧泽亚 ${tv} 响一次（最多等 ≈ 现实 70 分钟）`);
  } else {
    const zone = alarmFormZone("cdZone");
    $("cdCnWrap").hidden = zone !== "cn";
    $("cdEtWrap").hidden = zone !== "et";
    const h = alarmNum("cdCnH"), m = alarmNum("cdCnM"), s = alarmNum("cdCnS");
    const total = h * 3600 + m * 60 + s;
    $("cdCnHint").textContent = total > 0 ? `共 ${alarmHumanDur(h, m, s)}${total < ALARM_CN_MIN_SEC ? `，最短 ${ALARM_CN_MIN_SEC} 秒` : ""}` : "";
    const eh = alarmNum("cdEtH"), em = alarmNum("cdEtM");
    const etTotal = eh * 60 + em;
    const realSec = (etTotal * 60) / EORZEA_RATE;
    $("cdEtHint").textContent = etTotal > 0
      ? `≈ 现实 ${realSec >= 60 ? `${Math.floor(realSec / 60)} 分 ${Math.round(realSec % 60)} 秒` : `${Math.round(realSec)} 秒`}${etTotal < ALARM_ET_MIN_MIN ? `，最短 ${ALARM_ET_MIN_MIN} 分钟` : ""}`
      : "";
  }
}

function alarmPaintNowHints() {
  if ($("alarmOverlay").hidden) return;
  const t = hjReadClocks();
  const text = `现在：国服 ${t.cn} · 艾欧泽亚 ${t.et} ${t.etNight ? "☾" : "☀"}`;
  $("almNowHint").textContent = text;
  $("cdNowHint").textContent = text;
}

/* 试听：再点一次停止；两个页签共用一个试听会话 */
function alarmPreview() {
  const setLabel = (on) => { $("almPreview").textContent = on ? "停止试听" : "试听"; $("cdPreview").textContent = on ? "停止试听" : "试听"; };
  if (hjAlarmPreview) {
    hjAlarmPreview.stop();
    hjAlarmPreview = null;
    return;   // onEnd 会把按钮文字复原
  }
  const tab = $("alarmPanelCountdown").hidden ? "alm" : "cd";
  const sound = $(`${tab}Sound`).value;
  const sec = Number($(`${tab}PlaySec`).value) || ALARM_PLAY_DEFAULT;
  setLabel(true);
  hjAlarmPreview = alarmPlayCore(sound, sec, () => { hjAlarmPreview = null; setLabel(false); });
}

const alarmMsg = (text) => setMsg($("alarmMsg"), text);

function alarmSubmitAlarm() {
  const zone = alarmFormZone("almZone");
  const m = /^(\d{1,2}):(\d{2})$/.exec($("almTime").value || "");
  if (!m) { alarmMsg("请先选择响铃时间"); return; }
  const it = alarmNormalize({
    kind: "alarm", zone,
    hh: Number(m[1]), mm: Number(m[2]),
    repeat: $("almRepeat").checked,
    name: $("almName").value.trim(),
    sound: $("almSound").value,
    playSec: Number($("almPlaySec").value) || ALARM_PLAY_DEFAULT,
  });
  if (!it.name) it.name = `闹铃${hjAlarms.items.filter((x) => x.kind === "alarm").length + 1}`;
  // 国服时间的闹铃同一时刻只允许一个：已有同 时:分 的国服闹铃就拦下
  if (zone === "cn") {
    const dup = hjAlarms.items.find((x) => x.kind === "alarm" && x.zone === "cn" && x.hh === it.hh && x.mm === it.mm);
    if (dup) {
      const t = `${String(it.hh).padStart(2, "0")}:${String(it.mm).padStart(2, "0")}`;
      alarmMsg(`国服时间 ${t} 已经设过闹铃「${dup.name}」，同一时间不能设置两个`);
      return;
    }
  }
  it.nextFireAt = alarmNextFire(it, hjNow());
  hjAlarms.items.push(it);
  alarmSave();
  alarmAfterChange();
  alarmMsg("");
  $("almName").value = "";
  showToast(`闹铃「${it.name}」已添加，组件已放到页面上`);
}

function alarmSubmitCountdown() {
  const zone = alarmFormZone("cdZone");
  let durMs = 0;
  let durLabel = "";
  if (zone === "cn") {
    const h = alarmNum("cdCnH"), m = alarmNum("cdCnM"), s = alarmNum("cdCnS");
    const total = h * 3600 + m * 60 + s;
    if (total < ALARM_CN_MIN_SEC) { alarmMsg(`国服倒计时最短 ${ALARM_CN_MIN_SEC} 秒`); return; }
    durMs = total * 1000;
    durLabel = alarmHumanDur(h, m, s);
  } else {
    const h = alarmNum("cdEtH"), m = alarmNum("cdEtM");
    const total = h * 60 + m;
    if (total < ALARM_ET_MIN_MIN) { alarmMsg(`艾欧泽亚倒计时最短 ${ALARM_ET_MIN_MIN} 分钟`); return; }
    durMs = (total * 60 / EORZEA_RATE) * 1000;
    durLabel = (h > 0 ? `${h}小时` : "") + `${m}分`;
  }
  const it = alarmNormalize({
    kind: "countdown", zone, durMs, durLabel,
    loop: $("cdLoop").checked,
    name: $("cdName").value.trim(),
    sound: $("cdSound").value,
    playSec: Number($("cdPlaySec").value) || ALARM_PLAY_DEFAULT,
  });
  if (!it.name) it.name = `倒计时${hjAlarms.items.filter((x) => x.kind === "countdown").length + 1}`;
  it.endAt = hjNow() + durMs;
  hjAlarms.items.push(it);
  alarmSave();
  alarmAfterChange();
  alarmMsg("");
  $("cdName").value = "";
  showToast(`倒计时「${it.name}」已开始`);
}

/* 弹窗：已添加列表 ------------------------------------------------------------ */
function alarmListLiveText(it) {
  const now = hjNow();
  if (hjAlarms.ringing.has(it.id)) return "响铃中…";
  if (!it.enabled) return "已停用";
  if (it.kind === "alarm") {
    if (it.done) return "已完成（一次性）";
    return `距响铃 ${alarmFmtDur(it.nextFireAt - now)}`;
  }
  if (it.done) return "已结束";
  if (it.paused) return `已暂停（剩 ${alarmFmtDur(it.remainMs)}）`;
  return `剩余 ${alarmFmtDur(it.endAt - now)}`;
}

function alarmListRowHtml(it) {
  const ringing = hjAlarms.ringing.has(it.id);
  const btns = [];
  if (ringing) btns.push('<button type="button" data-act="stop">停止响铃</button>');
  if (it.kind === "alarm") {
    if (it.done) btns.push('<button type="button" data-act="rearm">重新启用</button>');
    else btns.push(`<button type="button" data-act="toggle">${it.enabled ? "停用" : "启用"}</button>`);
  } else if (it.done) {
    btns.push('<button type="button" data-act="restart">重新开始</button>');
  } else {
    btns.push(`<button type="button" data-act="toggle">${it.enabled ? "停用" : "启用"}</button>`);
    if (it.enabled) btns.push(`<button type="button" data-act="pause">${it.paused ? "继续" : "暂停"}</button>`);
    btns.push('<button type="button" data-act="restart">重置</button>');
  }
  btns.push(`<button type="button" data-act="widget">${it.hidden ? "显示组件" : "隐藏组件"}</button>`);
  btns.push('<button type="button" class="is-danger" data-act="del">删除</button>');
  return `<div class="alarm-item" data-id="${it.id}">`
    + `<div class="alarm-item-top"><span class="alarm-item-name">${escapeHtml(it.name)}</span>`
    + `<span class="alarm-item-live" data-live="${it.id}"></span></div>`
    + `<div class="alarm-item-sub">${escapeHtml(alarmSubText(it))} · ♪${escapeHtml(it.sound)} · 播 ${it.playSec} 秒后渐弱</div>`
    + `<div class="alarm-item-btns">${btns.join("")}</div></div>`;
}

function alarmRenderList(box, kind) {
  const list = hjAlarms.items.filter((it) => it.kind === kind);
  box.innerHTML = list.length
    ? list.map(alarmListRowHtml).join("")
    : '<p class="alarm-empty">还没有添加，先在上方设置一个吧</p>';
}

function alarmRenderLists() {
  if ($("alarmOverlay").hidden) return;
  alarmRenderList($("almListAlarm"), "alarm");
  alarmRenderList($("almListCountdown"), "countdown");
  alarmPaintListLive();
}

function alarmPaintListLive() {
  if ($("alarmOverlay").hidden) return;
  document.querySelectorAll("#alarmOverlay .alarm-item-live").forEach((el) => {
    const it = alarmById(el.dataset.live);
    if (it) el.textContent = alarmListLiveText(it);
  });
}

function alarmListClick(e) {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const row = btn.closest(".alarm-item");
  const it = row ? alarmById(row.dataset.id) : null;
  if (!it) return;
  const act = btn.dataset.act;
  if (act === "toggle") alarmSetEnabled(it, !it.enabled);
  else if (act === "pause") alarmTogglePause(it);
  else if (act === "restart") alarmRestart(it);
  else if (act === "rearm") alarmRearm(it);
  else if (act === "stop") alarmStopRing(it.id);
  else if (act === "widget") {
    it.hidden = !it.hidden;
    alarmSave();
    alarmAfterChange();
  } else if (act === "del") alarmRemove(it);
  alarmRenderLists();
}

/* 弹窗：开合与页签 ------------------------------------------------------------ */
function alarmSwitchTab(name) {
  document.querySelectorAll("#alarmOverlay [data-alarm-tab]").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.alarmTab === name);
  });
  $("alarmPanelAlarm").hidden = name !== "alarm";
  $("alarmPanelCountdown").hidden = name !== "countdown";
}

function openAlarmModal(open) {
  $("alarmOverlay").hidden = !open;
  if (open) {
    alarmRenderLists();
    alarmPaintNowHints();
    playFadeOnly($("alarmOverlay").querySelector(".alarm-card"));
  } else if (hjAlarmPreview) {
    hjAlarmPreview.stop();   // 关窗即停试听（onEnd 会复原按钮文字）
    hjAlarmPreview = null;
  }
}

function closeAlarmModal() {
  openAlarmModal(false);
}

function initAlarmModal() {
  alarmFillFormSelects();
  $("alarmClose").addEventListener("click", closeAlarmModal);
  document.querySelectorAll("#alarmOverlay [data-alarm-tab]").forEach((btn) => {
    btn.addEventListener("click", () => alarmSwitchTab(btn.dataset.alarmTab));
  });
  $("almZoneSeg").addEventListener("change", () => { alarmSegSync("almZoneSeg"); alarmSyncZoneUi("alarm"); });
  $("cdZoneSeg").addEventListener("change", () => { alarmSegSync("cdZoneSeg"); alarmSyncZoneUi("countdown"); });
  $("almRepeat").addEventListener("change", () => alarmSyncZoneUi("alarm"));
  $("almTime").addEventListener("input", () => alarmSyncZoneUi("alarm"));
  ["cdCnH", "cdCnM", "cdCnS", "cdEtH", "cdEtM"].forEach((id) => {
    $(id).addEventListener("input", () => alarmSyncZoneUi("countdown"));
  });
  $("almPreview").addEventListener("click", alarmPreview);
  $("cdPreview").addEventListener("click", alarmPreview);
  $("almAddAlarm").addEventListener("click", alarmSubmitAlarm);
  $("cdAdd").addEventListener("click", alarmSubmitCountdown);
  $("almListAlarm").addEventListener("click", alarmListClick);
  $("almListCountdown").addEventListener("click", alarmListClick);
  alarmSyncZoneUi("alarm");
  alarmSyncZoneUi("countdown");
}

/* 启动：恢复本地数据 → 生成组件 → 每秒心跳 */
function initAlarm() {
  initAlarmModal();
  try {
    const arr = JSON.parse(storage.get(STORE.alarmItems) || "[]");
    if (Array.isArray(arr)) hjAlarms.items = arr.map(alarmNormalize).filter(Boolean);
  } catch (e) { hjAlarms.items = []; }
  hjAlarms.items.forEach(alarmRevive);
  alarmSave();
  alarmRenderAllWidgets();
  alarmTick();
  setInterval(() => alarmTick(), 1000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) alarmTick(); });
}

/* 控制台调试入口 */
window.HJ_ALARM = {
  list: () => hjAlarms.items,
  open: () => openAlarmModal(true),
  ringNow: (id) => { const it = alarmById(id); if (it) alarmRing(it); },
  clear: () => {
    [...hjAlarms.ringing.keys()].forEach(alarmStopRing);
    hjAlarms.items = [];
    alarmSave();
    alarmAfterChange();
  },
};


/* =============================================================================
   14. 首页弹窗公告
   内容由管理页「弹窗公告」设置（Worker：get_popup）。规则：
   - 只在首页弹；开屏图、花街介绍、别的弹窗开着时先不弹，等它们关掉再弹；
   - 每次打开网站最多弹一次（sessionStorage 记着，站内来回切页面不会反复弹）；
   - 「今天不再显示」：本机当天不再弹；管理员改了内容（rev 变了）会重新弹。
   ============================================================================= */
const POPUP_SEEN_KEY = "hj_popup_seen";   // sessionStorage：本次打开网站已经弹过的 rev
const POPUP_MUTE_KEY = "hj_popup_mute";   // localStorage：「rev|日期」当天不再显示
let sitePopup = null;                     // Worker 返回的公告（开着才有内容）

const localDateKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
function sessionGet(key) { try { return sessionStorage.getItem(key); } catch (e) { return null; } }
function sessionSet(key, v) { try { sessionStorage.setItem(key, String(v)); } catch (e) {} }

/* 正文：先转义，再把 http(s) 网址变成链接；换行由 CSS 的 pre-wrap 保留 */
function popupBodyHtml(text) {
  return escapeHtml(text || "").replace(/https?:\/\/[^\s<>"']+/g, (url) => {
    const trail = /[，。；、）)\].,;!！?？]+$/.exec(url);   // 句尾标点不算进网址
    const clean = trail ? url.slice(0, -trail[0].length) : url;
    return `<a href="${clean}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${clean}</a>${trail ? trail[0] : ""}`;
  });
}

function fillSitePopup(p) {
  const title = (p.title || "").trim();
  $("sitePopupTitle").textContent = title || "公告";
  const img = $("sitePopupImage");
  img.hidden = !p.image_url;
  if (p.image_url) img.src = workerImageUrl(p.image_url);
  else img.removeAttribute("src");
  const body = $("sitePopupBody");
  body.innerHTML = popupBodyHtml(p.body);
  body.hidden = !(p.body || "").trim();
}

function anyModalOpen() {
  return A11Y_MODALS.some(({ overlay }) => { const el = $(overlay); return el && !el.hidden; });
}

function maybeShowSitePopup() {
  const p = sitePopup;
  if (!p || !p.enabled) return;
  if ($("view-home").hidden) return;                                             // 只在首页弹
  if (document.documentElement.classList.contains("boot-pending")) return;       // 开屏图还在
  if (anyModalOpen()) return;                                                    // 别的弹窗开着
  if (sessionGet(POPUP_SEEN_KEY) === String(p.rev)) return;                      // 这次打开网站已经弹过
  if (storage.get(POPUP_MUTE_KEY) === `${p.rev}|${localDateKey()}`) return;       // 今天不再显示
  sessionSet(POPUP_SEEN_KEY, p.rev);
  openSitePopup(p);
}

/* preview = true：管理页「预览」，不显示「今天不再显示」 */
function openSitePopup(p, preview = false) {
  fillSitePopup(p);
  $("sitePopupMuteBtn").hidden = preview;
  $("sitePopupOverlay").hidden = false;
  $("sitePopupBox").scrollTop = 0;
  playEnterAnim($("sitePopupBox"));
}

function closeSitePopup() {
  $("sitePopupOverlay").hidden = true;
}

function applySitePopup(p) {
  sitePopup = p && p.enabled ? p : null;
  maybeShowSitePopup();
}

function initSitePopup() {
  $("sitePopupClose").addEventListener("click", closeSitePopup);
  $("sitePopupOkBtn").addEventListener("click", closeSitePopup);
  $("sitePopupMuteBtn").addEventListener("click", () => {
    if (sitePopup) storage.set(POPUP_MUTE_KEY, `${sitePopup.rev}|${localDateKey()}`);
    closeSitePopup();
    showToast("今天不再显示这条公告");
  });
  closeOnBackdrop($("sitePopupOverlay"), closeSitePopup);
}

/* =============================================================================
   15. 花语（「更多」里的「听得花间语」）
   压缩、换字 / 组句在 huayu.js（第一次打开时加载，window.HJHuayu），加密在 Worker，密钥只在后端。
   花语有两代：一代是「听花语：」+ 一串草木字（最短），二代是一段像散文的句子；
   写的时候用管理页「花语加密」里选定的那一代（启动时随 get_site_state 读回 huayuAlgo），
   听的时候自动认出是哪一代，两代都能解。
   访客端开关也在那里（huayuMode）：open 完全开放（能写能听）/ decrypt 仅开放解密（只能听）/ off 彻底关闭（「更多」里不显示）。
   管理员用自定义密钥写的花语，访客要自己填密钥才听得懂（寻宝、彩蛋用）。网站不保存输入的内容。
   弹窗只能点右上角的 × 关（点遮罩、按 Esc 都不关），免得写了一半的话被误关掉。
   ============================================================================= */
const HUAYU_VISITOR_MAX = 5000;   // 访客一次最多写多少字
const HUAYU_DETECT_NOW = 4000;    // 输入框超过这么长（多半是粘贴的长花语）就等停手再认是不是花语
let huayuMode = null;             // null = 还不知道（Worker 没有花语功能时一直是 null，按钮不显示）
let huayuAlgo = 2;                // 写花语用第几代（管理页选定）
let huayuBusy = false;
let huayuResultCopy = "";
let huayuDetectTimer = 0;

const loadHuayuJs = () => loadLateScript("huayu.js", () => !!window.HJHuayu);

const HUAYU_ERRORS = {
  empty: "先写点什么吧",
  not_huayu: "没找到花语：一代花语以「听花语：」开头，二代花语是一段花的句子，要整段完整粘贴",
  broken: "这段花语不完整，可能复制时漏了几个字",
  version: "这段花语来自更新的版本，刷新页面再试",
  unsupported: "这个浏览器太旧，解不开这段花语，换个浏览器试试",
  bad_key: "听不懂：这段花语被改动过，或者不是本站写的",
  bad_custom_key: "密钥不对，再想想？",
  need_key: "这段花语设了密钥，填上密钥再听",
  closed: "花语暂未开放",
  closed_seal: "现在只能听花语，暂时不能写",
  too_long: `太长啦，一次最多写 ${HUAYU_VISITOR_MAX} 字`,
  rate_limited: "操作太频繁了，歇一会儿再试",
  net: "连接失败，检查一下网络后再试",
  no_js: "花语字典没加载出来，检查一下网络后重新打开",
};

const huayuErrorText = (res) => (res && res.error === "unknown action" ? HUAYU_ERRORS.closed
  : HUAYU_ERRORS[res && res.error] || "出了点问题，稍后再试");

/* 开关变了：更新「更多」里的按钮；弹窗开着时同步界面。state = { mode, algo }（只给 mode 字符串也行） */
function applyHuayuMode(state) {
  const { mode, algo } = typeof state === "object" && state ? state : { mode: state };
  if ([1, 2].includes(Number(algo))) huayuAlgo = Number(algo);
  const next = ["open", "decrypt", "off"].includes(mode) ? mode : null;
  if (next === huayuMode) return;
  huayuMode = next;
  renderMorePanel();
  if (!$("huayuOverlay").hidden) syncHuayuUi();
}

/* get_site_state 没带花语开关时（Worker 版本不一致）单独问一次 */
async function refreshHuayuMode() {
  const data = await callWorker({ action: "huayu_state" });
  if (data && data.ok) applyHuayuMode(data);
}

function syncHuayuUi() {
  const canWrite = huayuMode === "open";
  const ready = !!window.HJHuayu;
  $("huayuHint").textContent = !ready ? "花语字典加载中…"
    : canWrite ? "写下想说的话化作花语，或把收到的花语贴进来听听"
      : "把收到的花语贴进来，听听花在说什么";
  $("huayuInputLabel").textContent = canWrite ? "想说的话 / 花语" : "花语";
  $("huayuInput").placeholder = canWrite ? "写点什么，或者粘贴收到的花语" : "粘贴收到的花语";
  $("huayuSealBtn").hidden = !canWrite;
  $("huayuOpenBtn").disabled = $("huayuSealBtn").disabled = !ready || huayuBusy;
  syncHuayuInput();
}

/* 输入变化：字数；像是设了密钥的花语时提前露出密钥框；像花语时「听」排在前面。
   很长的一段停手 0.3 秒再认，免得每改一个字都把整段读一遍 */
function syncHuayuInput() {
  clearTimeout(huayuDetectTimer);
  if ($("huayuInput").value.length > HUAYU_DETECT_NOW) huayuDetectTimer = setTimeout(syncHuayuInputNow, 300);
  else syncHuayuInputNow();
}

function syncHuayuInputNow() {
  const text = $("huayuInput").value;
  const H = window.HJHuayu;
  const info = H && text ? H.detect(text) : null;
  const looks = !!(info && info.ok);
  const n = H ? H.countChars(text) : text.length;
  $("huayuCount").textContent = !text ? "" : looks ? `${H.ALGO_NAMES[info.algo]}花语` : `${n} 字`;
  $("huayuCount").classList.toggle("is-over", !looks && n > HUAYU_VISITOR_MAX);
  $("huayuKeyRow").hidden = !(looks && info.kind === 1);
  $("huayuCard").classList.toggle("is-writing", !looks && !!text);
}

function showHuayuResult(label, text, meta, copyLabel) {
  $("huayuResultLabel").textContent = label;
  $("huayuResultMeta").textContent = meta || "";
  $("huayuResultText").textContent = text;
  $("huayuCopyBtn").textContent = copyLabel;
  huayuResultCopy = text;
  $("huayuResult").hidden = false;
  playFadeOnly($("huayuResult"));
  $("huayuResult").scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

async function withHuayuBusy(btn, fn) {
  if (huayuBusy) return;
  huayuBusy = true;
  const label = btn.textContent;
  btn.textContent = "……";
  syncHuayuUi();
  try { await fn(); } finally {
    huayuBusy = false;
    btn.textContent = label;
    syncHuayuUi();
  }
}

async function huayuSeal() {
  const H = window.HJHuayu;
  const msg = $("huayuMsg");
  const text = $("huayuInput").value;
  setMsg(msg, "");
  if (!text.trim()) { setMsg(msg, HUAYU_ERRORS.empty); return; }
  const already = H.detect(text);   // 整段就是花语（二代句式对得上，或带着「听花语」）时提醒一下
  if (already.ok && (already.algo === 2 || text.includes(H.MARK))) {
    setMsg(msg, "这已经是花语啦，点「听花解语」听听它在说什么");
    return;
  }
  if (H.countChars(text) > HUAYU_VISITOR_MAX) { setMsg(msg, HUAYU_ERRORS.too_long); return; }
  let res = await H.encrypt(text, { algo: huayuAlgo, post: callWorker });
  if (!res.ok && res.error === "algo_changed" && res.algo) {   // 管理员刚换了算法：换成新的再写一次
    huayuAlgo = res.algo;
    res = await H.encrypt(text, { algo: huayuAlgo, post: callWorker });
  }
  if (!res.ok) {
    if (res.error === "closed") {
      applyHuayuMode(res.mode);
      setMsg(msg, res.mode === "decrypt" ? HUAYU_ERRORS.closed_seal : HUAYU_ERRORS.closed);
    } else setMsg(msg, huayuErrorText(res));
    return;
  }
  showHuayuResult("花语", res.text, `原文 ${res.plainChars} 字 → 花语 ${res.cipherChars} 字`, "复制花语");
}

async function huayuOpen() {
  const H = window.HJHuayu;
  const msg = $("huayuMsg");
  setMsg(msg, "");
  const input = $("huayuInput").value;
  if (!input.trim()) { setMsg(msg, "先把花语粘贴进来吧"); return; }
  const key = $("huayuKey").value.trim();
  const res = await H.decrypt(input, { post: callWorker, key });
  if (!res.ok) {
    if (res.error === "need_key") {
      $("huayuKeyRow").hidden = false;
      $("huayuKey").focus();
    }
    if (res.error === "closed") applyHuayuMode(res.mode);
    setMsg(msg, res.error === "bad_key" && res.kind === 1 ? HUAYU_ERRORS.bad_custom_key : huayuErrorText(res));
    return;
  }
  showHuayuResult("花在说", res.text, res.kind === 1 ? "密钥花语" : "", "复制原文");
}

function openHuayuModal() {
  $("huayuOverlay").hidden = false;
  syncHuayuUi();
  playFadeOnly($("huayuCard"));
  if (window.HJHuayu) return;
  loadHuayuJs().then(syncHuayuUi, (e) => {
    console.error("[花语]", e);
    $("huayuHint").textContent = HUAYU_ERRORS.no_js;
  });
}

function closeHuayuModal() {
  $("huayuOverlay").hidden = true;
}

function initHuayu() {
  $("huayuClose").addEventListener("click", closeHuayuModal);   // 只有 × 能关（遮罩带 data-close-only-x）
  $("huayuInput").addEventListener("input", () => {
    syncHuayuInput();
    setMsg($("huayuMsg"), "");
  });
  $("huayuSealBtn").addEventListener("click", (e) => withHuayuBusy(e.currentTarget, huayuSeal));
  $("huayuOpenBtn").addEventListener("click", (e) => withHuayuBusy(e.currentTarget, huayuOpen));
  $("huayuKey").addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("huayuOpenBtn").click();
  });
  $("huayuCopyBtn").addEventListener("click", () => {
    copyText(huayuResultCopy, "已复制", "复制失败，请长按文字手动复制");
  });
}

/* =============================================================================
   16. 圆角下拉与日期选择
   网页里所有的下拉框（<select>）和日期 / 日期时间 / 时间框，用鼠标点开时弹出和日历小组件同一风格的圆角弹层，
   代替浏览器自带的方角列表和日期面板。控件本身不换：值、表单校验、input / change 事件都照旧，
   后加进页面的控件（管理页、购票表单等）也自动生效（事件挂在 document 上）。
   · 触屏上照旧用系统自带的选择器（手机上的滚轮 / 底部列表更顺手）；
   · 日期类只在 Chromium 内核（Chrome、Edge 等）上替换，其它浏览器的日期面板拦不干净，保持原样；
   · 日期框仍可以直接键盘输入；「今天」按国服日期算（全站的日期、时间都按国服时间理解）；
   · 弹层开着时：Esc 只关弹层；点弹层外面只关弹层，这一下不会点到别处（和原生下拉一样）。
   ============================================================================= */
const PICK_WEEK = ["一", "二", "三", "四", "五", "六", "日"];
const PICK_DATE_TYPES = ["date", "datetime-local", "time"];
const pick = { pop: null, anchor: null, kind: "", pointer: "mouse", start: "", items: [], active: -1, y: 0, m: 0, months: false };

const pickDateOn = () => !!navigator.userAgentData;   // Chromium 才有
const pickableSelect = (el) => el instanceof HTMLSelectElement && !el.multiple && el.size <= 1 && !el.disabled;
const pickableDate = (el) => el instanceof HTMLInputElement && PICK_DATE_TYPES.includes(el.type)
  && !el.disabled && !el.readOnly && pickDateOn();

function pickPopEl() {
  if (pick.pop) return pick.pop;
  const pop = document.createElement("div");
  pop.className = "hj-pop";
  pop.hidden = true;
  pop.addEventListener("mousedown", (e) => e.preventDefault());   // 点弹层不抢走控件的焦点
  pop.addEventListener("click", onPickClick);
  document.body.appendChild(pop);
  pick.pop = pop;
  return pop;
}

/* 贴着控件放：下面放得下放下面，否则放上面；左右不出屏幕 */
function placePick() {
  const { pop, anchor } = pick;
  if (!anchor) return;
  if (!anchor.isConnected || !anchor.getClientRects().length) { closePick(); return; }
  const r = anchor.getBoundingClientRect();
  const { vw, vh } = viewportSize();
  if (r.bottom < 0 || r.top > vh) { closePick(); return; }
  const below = vh - r.bottom - 14, above = r.top - 14;
  const list = pop.querySelector(".hj-opt-list");
  if (list) list.style.maxHeight = `${clamp(Math.max(below, above), 120, 320)}px`;
  if (pick.kind === "select") pop.style.minWidth = `${Math.round(r.width)}px`;
  const w = pop.offsetWidth, h = pop.offsetHeight;
  const top = h <= below || below >= above ? r.bottom + 6 : r.top - 6 - h;
  pop.style.left = `${clamp(r.left, 8, Math.max(8, vw - w - 8))}px`;
  pop.style.top = `${Math.max(8, top)}px`;
}

function openPick(anchor, kind) {
  closePick();
  const pop = pickPopEl();
  pick.anchor = anchor;
  pick.kind = kind;
  pick.start = anchor.value;
  const cs = getComputedStyle(anchor);
  pop.style.fontFamily = cs.fontFamily;
  pop.style.minWidth = "";
  pop.className = `hj-pop hj-pop-${kind === "select" ? "select" : "date"}`;
  if (kind === "select") renderSelectPick();
  else {
    /* 没填过：从今天所在的月份开始；今天不在可选范围里时，从最近能选的那个月开始 */
    let d = pickParts().date || cnDate(0);
    if (pickMin() && d < pickMin()) d = pickMin();
    if (pickMax() && d > pickMax()) d = pickMax();
    pick.y = +d.slice(0, 4);
    pick.m = +d.slice(5, 7);
    pick.months = false;
    renderDatePick();
  }
  pop.hidden = false;
  anchor.setAttribute("aria-expanded", "true");
  placePick();
  pop.querySelectorAll(".hj-time-col").forEach(centerPickedTime);
  pop.querySelector(".hj-opt.is-active")?.scrollIntoView({ block: "nearest" });
}

function closePick() {
  const { pop, anchor } = pick;
  if (!anchor) return;
  pick.anchor = null;
  pop.hidden = true;
  pop.innerHTML = "";
  anchor.removeAttribute("aria-expanded");
  /* 日期时间 / 时间：选的过程中只发 input，关上时值变了才发一次 change（免得改一次存一次） */
  if (pick.kind !== "select" && pick.kind !== "date" && anchor.value !== pick.start) {
    anchor.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function pickSetValue(v, change) {
  const el = pick.anchor;
  if (el.value === v) return;
  el.value = v;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  if (change) el.dispatchEvent(new Event("change", { bubbles: true }));
}

/* ---- 下拉框 ---- */
function renderSelectPick() {
  const sel = pick.anchor;
  const items = [];
  let html = "";
  const addOpt = (o, inGroup) => {
    if (o.hidden) return;
    const off = o.disabled || (inGroup && o.parentElement.disabled);
    const cls = ["hj-opt"];
    if (inGroup) cls.push("in-group");
    if (off) cls.push("is-disabled");
    if (o.selected) cls.push("is-selected", "is-active");
    html += `<div class="${cls.join(" ")}" role="option" aria-selected="${o.selected}" data-i="${items.length}">${escapeHtml(o.label)}</div>`;
    items.push(o);
  };
  for (const node of sel.children) {
    if (node.tagName === "OPTGROUP") {
      html += `<div class="hj-opt-group">${escapeHtml(node.label)}</div>`;
      for (const o of node.children) addOpt(o, true);
    } else if (node.tagName === "OPTION") addOpt(node, false);
  }
  pick.items = items;
  pick.active = items.findIndex((o) => o.selected);
  pick.pop.innerHTML = `<div class="hj-opt-list" role="listbox">${html || '<div class="hj-opt-group">（没有选项）</div>'}</div>`;
}

function pickSelectChoose(i) {
  const o = pick.items[i];
  const sel = pick.anchor;
  if (!o || o.disabled || o.parentElement.disabled) return;
  closePick();
  if (!o.selected) {
    o.selected = true;
    sel.dispatchEvent(new Event("input", { bubbles: true }));
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }
  sel.focus();
}

function pickSelectMove(to) {
  const opts = [...pick.pop.querySelectorAll(".hj-opt")];
  const ok = (i) => opts[i] && !opts[i].classList.contains("is-disabled");
  let i = to;
  if (!ok(i)) {
    const dir = to > pick.active ? 1 : -1;
    while (i >= 0 && i < opts.length && !ok(i)) i += dir;
    if (!ok(i)) return;
  }
  opts.forEach((el, k) => el.classList.toggle("is-active", k === i));
  pick.active = i;
  opts[i].scrollIntoView({ block: "nearest" });
}

/* ---- 日期 / 日期时间 / 时间 ---- */
const pickHasDate = () => pick.kind !== "time";
const pickHasTime = () => pick.kind !== "date";

/* 控件的值 → { date: "YYYY-MM-DD" | "", h, m }（时间没填时是 -1） */
function pickParts() {
  const v = pick.anchor.value;
  const date = (/^\d{4}-\d{2}-\d{2}/.exec(v) || [""])[0];
  const t = /(\d{2}):(\d{2})/.exec(pick.kind === "time" ? v : v.slice(11));
  return { date, h: t ? +t[1] : -1, m: t ? +t[2] : -1 };
}

function pickCompose({ date, h, m }) {
  const hm = `${pad2(Math.max(h, 0))}:${pad2(Math.max(m, 0))}`;
  if (pick.kind === "date") return date;
  if (pick.kind === "time") return hm;
  return date ? `${date}T${hm}` : "";
}

const pickMin = () => (pick.anchor.min || "").slice(0, 10);
const pickMax = () => (pick.anchor.max || "").slice(0, 10);
const pickDayOk = (key) => (!pickMin() || key >= pickMin()) && (!pickMax() || key <= pickMax());

function pickNavOk(dir) {
  const y = pick.y, m = pick.m;
  if (pick.months) {
    const edge = dir < 0 ? `${y - 1}-12-31` : `${y + 1}-01-01`;
    return dir < 0 ? !pickMin() || edge >= pickMin() : !pickMax() || edge <= pickMax();
  }
  const d = new Date(y, m - 1 + dir, 1);
  const first = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
  const last = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())}`;
  return (!pickMin() || last >= pickMin()) && (!pickMax() || first <= pickMax());
}

const PICK_CHEVRON = (d) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;

function renderDatePick() {
  const parts = pickParts();
  let cal = "";
  if (pickHasDate()) {
    const title = pick.months ? `${pick.y}年` : `${pick.y}年${pick.m}月`;
    cal += `<div class="hj-date-head">
      <button type="button" class="hj-date-title" data-act="mode" title="${pick.months ? "回到日期" : "选月份"}">${title}${PICK_CHEVRON(pick.months ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6")}</button>
      <span class="hj-date-navs">
        <button type="button" class="hj-date-nav" data-act="prev" aria-label="${pick.months ? "上一年" : "上个月"}"${pickNavOk(-1) ? "" : " disabled"}>${PICK_CHEVRON("M14.5 5l-7 7 7 7")}</button>
        <button type="button" class="hj-date-nav" data-act="next" aria-label="${pick.months ? "下一年" : "下个月"}"${pickNavOk(1) ? "" : " disabled"}>${PICK_CHEVRON("M9.5 5l7 7-7 7")}</button>
      </span>
    </div>`;
    const today = cnDate(0);
    if (pick.months) {
      let cells = "";
      for (let m = 1; m <= 12; m++) {
        const first = `${pick.y}-${pad2(m)}-01`, last = `${pick.y}-${pad2(m)}-${pad2(new Date(pick.y, m, 0).getDate())}`;
        const ok = (!pickMin() || last >= pickMin()) && (!pickMax() || first <= pickMax());
        const cls = ["hj-month"];
        if (today.slice(0, 7) === first.slice(0, 7)) cls.push("is-today");
        if (parts.date.slice(0, 7) === first.slice(0, 7)) cls.push("is-pick");
        cells += `<button type="button" class="${cls.join(" ")}" data-month="${m}"${ok ? "" : " disabled"}>${m}月</button>`;
      }
      cal += `<div class="hj-month-grid">${cells}</div>`;
    } else {
      const firstWeekday = (new Date(pick.y, pick.m - 1, 1).getDay() + 6) % 7;   // 周一起始，和日历小组件一样
      let cells = "";
      for (let i = 0; i < 42; i++) {
        const d = new Date(pick.y, pick.m - 1, 1 - firstWeekday + i);
        const key = calKey(d);
        const cls = ["hj-day"];
        if (d.getMonth() !== pick.m - 1) cls.push("is-out");
        if (key === today) cls.push("is-today");
        if (key === parts.date) cls.push("is-pick");
        cells += `<button type="button" class="${cls.join(" ")}" data-date="${key}"${pickDayOk(key) ? "" : " disabled"}>${d.getDate()}</button>`;
      }
      cal += `<div class="hj-date-week" aria-hidden="true">${PICK_WEEK.map((w) => `<span>${w}</span>`).join("")}</div>
        <div class="hj-date-grid">${cells}</div>`;
    }
    cal = `<div class="hj-date-cal">${cal}</div>`;
  }
  let time = "";
  if (pickHasTime()) {
    const col = (name, n, cur) => {
      let s = "";
      for (let i = 0; i < n; i++) s += `<button type="button" class="hj-time-cell${i === cur ? " is-pick" : ""}" data-${name}="${i}">${pad2(i)}</button>`;
      return `<div class="hj-time-col" data-col="${name}">${s}</div>`;
    };
    time = `<div class="hj-time">
      <div class="hj-time-label">时间</div>
      <div class="hj-time-cols">${col("hour", 24, parts.h)}<span class="hj-time-sep">:</span>${col("minute", 60, parts.m)}</div>
    </div>`;
  }
  const foot = [];
  if (!pick.anchor.required) foot.push('<button type="button" class="hj-date-btn" data-act="clear">清除</button>');
  if (pickHasDate()) foot.push(`<button type="button" class="hj-date-btn" data-act="today"${pickDayOk(cnDate(0)) ? "" : " disabled"}>今天</button>`);
  if (pickHasTime()) foot.push('<button type="button" class="hj-date-btn is-main" data-act="done">完成</button>');
  pick.pop.innerHTML = `<div class="hj-date-main">${cal}${time}</div><div class="hj-date-foot">${foot.join("")}</div>`;
}

/* 翻月、切换月份视图后重画；时间列滚到选中的那一格 */
function rerenderDatePick() {
  renderDatePick();
  pick.pop.querySelectorAll(".hj-time-col").forEach(centerPickedTime);
  placePick();
}

function centerPickedTime(col) {
  const cell = col.querySelector(".is-pick") || col.firstElementChild;
  col.scrollTop = cell.offsetTop - col.offsetTop - (col.clientHeight - cell.offsetHeight) / 2;
}

function pickDateSet(parts, close) {
  pickSetValue(pickCompose(parts), pick.kind === "date");
  if (close) { const el = pick.anchor; closePick(); el.focus(); return; }
  /* 不整个重画：时间列保持滚动位置 */
  const now = pickParts();
  pick.pop.querySelectorAll(".hj-day, .hj-month").forEach((b) => {
    b.classList.toggle("is-pick", b.dataset.date ? b.dataset.date === now.date
      : `${pick.y}-${pad2(+b.dataset.month)}` === now.date.slice(0, 7));
  });
  pick.pop.querySelectorAll("[data-hour]").forEach((b) => b.classList.toggle("is-pick", +b.dataset.hour === now.h));
  pick.pop.querySelectorAll("[data-minute]").forEach((b) => b.classList.toggle("is-pick", +b.dataset.minute === now.m));
}

function onPickClick(e) {
  if (!pick.anchor) return;
  if (pick.kind === "select") {
    const opt = e.target.closest(".hj-opt");
    if (opt) pickSelectChoose(+opt.dataset.i);
    return;
  }
  const btn = e.target.closest("button");
  if (!btn || btn.disabled) return;
  const parts = pickParts();
  const { act } = btn.dataset;
  if (act === "prev" || act === "next") {
    const dir = act === "prev" ? -1 : 1;
    if (pick.months) pick.y += dir;
    else {
      const d = new Date(pick.y, pick.m - 1 + dir, 1);
      pick.y = d.getFullYear();
      pick.m = d.getMonth() + 1;
    }
    rerenderDatePick();
  } else if (act === "mode") {
    pick.months = !pick.months;
    rerenderDatePick();
  } else if (btn.dataset.month) {
    pick.m = +btn.dataset.month;
    pick.months = false;
    rerenderDatePick();
  } else if (btn.dataset.date) {
    const { date } = btn.dataset;
    if (pick.kind === "date") { pickDateSet({ ...parts, date }, true); return; }
    const [y, m] = date.split("-").map(Number);
    const flip = y !== pick.y || m !== pick.m;   // 点了露出来的上 / 下个月的日子：翻过去
    pick.y = y;
    pick.m = m;
    if (!flip) { pickDateSet({ ...parts, date }, false); return; }
    pickSetValue(pickCompose({ ...parts, date }));
    rerenderDatePick();
  } else if (btn.dataset.hour || btn.dataset.minute) {
    const next = { ...parts, date: parts.date || cnDate(0) };
    if (btn.dataset.hour) next.h = +btn.dataset.hour;
    if (btn.dataset.minute) next.m = +btn.dataset.minute;
    if (next.h < 0) next.h = 0;
    if (next.m < 0) next.m = 0;
    pickDateSet(next, false);
  } else if (act === "today") {
    const today = cnDate(0);
    pick.y = +today.slice(0, 4);
    pick.m = +today.slice(5, 7);
    pick.months = false;
    if (pick.kind === "date") { pickDateSet({ ...parts, date: today }, true); return; }
    pickSetValue(pickCompose({ ...parts, date: today }));
    rerenderDatePick();
  } else if (act === "clear") {
    pickSetValue("", pick.kind === "date");
    const el = pick.anchor;
    closePick();
    el.focus();
  } else if (act === "done") {
    const el = pick.anchor;
    closePick();
    el.focus();
  }
}

/* 弹层开着时的按键；返回 true 表示已处理（不再传给页面，免得 Esc 把外面的弹窗也关了） */
function onPickKey(e) {
  if (e.key === "Escape") { const el = pick.anchor; closePick(); el.focus(); return true; }
  if (e.key === "Tab") { closePick(); return false; }
  if (pick.kind !== "select") {
    if (e.key === "Enter" && pickHasTime()) { const el = pick.anchor; closePick(); el.focus(); return true; }
    return false;   // 其余按键照常改日期框里的数字
  }
  const n = pick.items.length;
  if (e.key === "ArrowDown") pickSelectMove(Math.min(pick.active + 1, n - 1));
  else if (e.key === "ArrowUp") pickSelectMove(Math.max(pick.active - 1, 0));
  else if (e.key === "Home") pickSelectMove(0);
  else if (e.key === "End") pickSelectMove(n - 1);
  else if (e.key === "PageDown") pickSelectMove(Math.min(pick.active + 8, n - 1));
  else if (e.key === "PageUp") pickSelectMove(Math.max(pick.active - 8, 0));
  else if (e.key === "Enter" || e.key === " ") pickSelectChoose(pick.active);
  else return e.key.length === 1;   // 打字不改选中项，免得弹层和框里对不上
  return true;
}

/* 点弹层外面关掉后，吞掉随后这一下 click，别让它点到下面的按钮、遮罩 */
function swallowNextClick() {
  const eat = (e) => { e.preventDefault(); e.stopPropagation(); };
  document.addEventListener("click", eat, { capture: true, once: true });
  setTimeout(() => document.removeEventListener("click", eat, { capture: true }), 600);
}

function initPickers() {
  if (pickDateOn()) document.documentElement.classList.add("hj-pick-date");
  document.addEventListener("pointerdown", (e) => {
    pick.pointer = e.pointerType || "mouse";
    if (pick.anchor && !pick.pop.contains(e.target) && e.target !== pick.anchor) {
      closePick();
      swallowNextClick();
    }
  }, true);
  document.addEventListener("mousedown", (e) => {
    const t = e.target;
    if (e.button !== 0 || pick.pointer === "touch" || !pickableSelect(t)) return;
    e.preventDefault();   // 不弹浏览器自带的列表
    t.focus();
    if (pick.anchor === t) closePick();
    else openPick(t, "select");
  }, true);
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (pick.pointer === "touch" || !pickableDate(t)) return;
    if (pick.anchor !== t) { openPick(t, t.type); return; }
    /* 再点右端的日历图标：收起 */
    const r = t.getBoundingClientRect();
    if (e.clientX > r.right - parseFloat(getComputedStyle(t).paddingRight) - 28) closePick();
  }, true);
  document.addEventListener("keydown", (e) => {
    if (pick.anchor) {
      if (onPickKey(e)) { e.preventDefault(); e.stopPropagation(); }
      return;
    }
    const t = e.target;
    const openKey = e.key === "F4" || (e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp"));
    if (pickableSelect(t) && (openKey || e.key === " ")) {
      e.preventDefault();
      openPick(t, "select");
    } else if (pickableDate(t) && openKey) {
      e.preventDefault();
      openPick(t, t.type);
    }
  }, true);
  /* 在日期框里直接打字：弹层跟着改 */
  document.addEventListener("input", (e) => {
    if (e.isTrusted && e.target === pick.anchor && pick.kind !== "select") {
      const d = pickParts().date;
      if (d) { pick.y = +d.slice(0, 4); pick.m = +d.slice(5, 7); pick.months = false; }
      rerenderDatePick();
    }
  }, true);
  document.addEventListener("scroll", (e) => {
    if (pick.anchor && !pick.pop.contains(e.target)) placePick();
  }, true);
  window.addEventListener("resize", () => closePick());
  window.addEventListener("blur", () => closePick());
}

/* =============================================================================
   17. 无障碍与启动
   ============================================================================= */

/* 启动时一次取齐：分享功能开关、机器人验证开关、星芒节、弹窗公告、花语开关、服务器时间。
   读不到时各项维持默认（验证开着、分享功能开着、星芒节用本地缓存、不弹公告、不显示花语按钮） */
async function loadSiteState() {
  const sentAt = Date.now();
  const data = await callWorker({ action: "get_site_state" });
  const receivedAt = Date.now();
  if (!data || !data.ok) {
    applyStarlight(readStarlightLocal());
    return;
  }
  syncServerClock(Number(data.now), sentAt, receivedAt);
  siteLockdown = !!data.lockdown;
  applyCaptchaEnabled(data.captcha !== false);
  applyStarlight(data.starlight);
  applySitePopup(data.popup);
  if (data.huayu === undefined) refreshHuayuMode();
  else applyHuayuMode(data.huayu);
  hjClockTick();
}

/* 首页卡片是 div：补上按钮语义和键盘操作 */
function initA11yTiles() {
  document.querySelectorAll("main .tile[id]").forEach((el) => {
    el.setAttribute("role", "button");
    el.setAttribute("tabindex", "0");
    el.addEventListener("keydown", (e) => {
      if (e.target !== el) return;   // 卡片内部的按钮自己处理键盘
      if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        el.click();
      }
    });
  });
}

function initA11yTabs(container) {
  container.querySelector(".tabs")?.setAttribute("role", "tablist");
  container.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", btn.classList.contains("is-active") ? "true" : "false");
  });
}

/* 弹窗：按 Esc 关闭最上层（按此顺序检查；遮罩带 data-close-only-x 的只能点 × 关），打开时焦点移到关闭按钮 */
const CLOSE_PRESS_MS = 160;   // 点 × 后保持「按下」样子的时长，看清反馈再关窗
const A11Y_MODALS = [
  { overlay: "infoOverlay",     closeBtn: "infoClose",     close: closeInfoModal },
  { overlay: "groupOverlay",    closeBtn: "groupClose",    close: closeGroupModal },
  { overlay: "siteAboutOverlay", closeBtn: "siteAboutClose", close: closeSiteAbout },
  { overlay: "ticketGuideOverlay", closeBtn: "ticketGuideClose", close: () => closeTicketGuide() },   // ticket.js
  { overlay: "captchaOverlay",  closeBtn: "captchaClose",  close: closeCaptcha },
  { overlay: "ticketNoticeOverlay", closeBtn: "ticketNoticeClose", close: () => closeTicketNotice() },   // ticket.js
  { overlay: "adminModalOverlay", closeBtn: "adminModalClose", close: () => closeAdminPanel() },         // admin.js
  { overlay: "alarmOverlay",    closeBtn: "alarmClose",    close: closeAlarmModal },
  { overlay: "huayuOverlay",    closeBtn: "huayuClose",    close: closeHuayuModal },
  { overlay: "sitePopupOverlay", closeBtn: "sitePopupClose", close: () => closeSitePopup() },
  { overlay: "lightboxOverlay", closeBtn: "lightboxClose", close: closeLightbox },
];

/* 切换页面（返回首页 / 换 hash / 浏览器前进后退）时把还开着的弹窗都关掉，免得下一个弹窗叠在上面 */
function closeAllModals() {
  A11Y_MODALS.forEach(({ overlay, close }) => {
    const el = $(overlay);
    if (el && !el.hidden) close();
  });
}

function initA11yModals() {
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    /* 大图总叠在别的弹窗上面，先关它；其次是弹窗公告（管理页「预览」时叠在管理弹窗上面） */
    const firstOpen = (id) => !$(id).hidden && A11Y_MODALS.find((m) => m.overlay === id);
    const top = firstOpen("lightboxOverlay") || firstOpen("sitePopupOverlay")
      || A11Y_MODALS.find((m) => !$(m.overlay).hidden);
    if (top && !$(top.overlay).dataset.closeOnlyX) top.close();   // 只能点 × 的弹窗，Esc 也不关
  });

  A11Y_MODALS.forEach(({ overlay, closeBtn }) => {
    const el = $(overlay);
    new MutationObserver(() => {
      if (!el.hidden) $(closeBtn).focus();
    }).observe(el, { attributes: true, attributeFilter: ["hidden"] });
  });

  /* 右上角的圆形 ×：和其他按钮一样按下时填成实心强调色；点完先保持这个样子一小会儿（style.css 的 .is-closing）再关窗，
     不然窗口一下就没了、看不到反馈。Esc、点遮罩照旧立刻关。
     在捕获阶段拦下这次点击，时间到了调用表里的 close（和按钮本身的点击处理一样） */
  A11Y_MODALS.forEach(({ overlay, closeBtn, close }) => {
    const btn = $(closeBtn);
    if (!btn.matches(".info-close, .lightbox-close")) return;
    btn.addEventListener("click", (e) => {
      if (prefersReducedMotion()) return;
      e.stopImmediatePropagation();
      if (btn.classList.contains("is-closing")) return;
      btn.classList.add("is-closing");
      setTimeout(() => {
        if (!$(overlay).hidden) close();
        btn.classList.remove("is-closing");
      }, CLOSE_PRESS_MS);
    }, true);
  });
}

/* 离线缓存与预取（进站后、浏览器空闲时）----------------------------------------------
   sw.js：打开过的页面、脚本、图片存进浏览器缓存，下次打开（尤其网络差时）直接从本机读取。
   预取：把进站后最常点的内容先悄悄下载好——最新活动的横幅和海报（缩小版）、花街相册的前几张缩略图；
   一张接一张地取，不和访客正在看的内容抢带宽；慢网络 / 省流量模式下不预取 */
function initOfflineCache() {
  const sw = "serviceWorker" in navigator && window.isSecureContext ? navigator.serviceWorker : null;
  const controlled = !sw ? Promise.resolve()
    : sw.register(`sw.js?v=${window.HJ_VERSION || ""}`)
      .then(() => (sw.controller ? null : new Promise((r) => {
        sw.addEventListener("controllerchange", r, { once: true });
        setTimeout(r, 4000);
      })))
      .catch(() => {});
  if (isSlowNetwork()) return;
  const poster = (LATEST_EVENT.poster && LATEST_EVENT.poster.images) || [];
  const urls = [
    LATEST_EVENT.cover && resizedSrc(LATEST_EVENT.cover, 1280),
    ...poster.map((src) => resizedSrc(src, 1280)),
    ...INFO_GALLERY.slice(0, 6).map((src) => resizedSrc(src, 720)),
  ].filter(Boolean);
  Promise.all([controlled, homeImagesReady]).then(() => {
    const next = () => {
      const url = urls.shift();
      if (!url || document.hidden) return;
      const img = new Image();
      img.fetchPriority = "low";
      img.onload = img.onerror = () => setTimeout(next, 150);
      img.src = url;
    };
    next();
  });
}

/* 启动 ------------------------------------------------------------------------- */
function initApp() {
  const booting = document.documentElement.classList.contains("boot-pending");
  initResizedFallback();
  initDayNight();   // 最先设卡片底图和天空，其余初始化期间图片就开始下载了
  initCardBackdrops();
  renderHome();
  initHomeVideo();
  initTabs();
  initTabVideos();
  initA11yTabs($("view-detail"));
  initA11yTabs($("infoBox"));
  initA11yTabs($("siteAboutBox"));
  initNav();
  initLikes();
  initFxToggle();
  initInfo();
  initSiteAbout();
  initLightbox();
  initCaptcha();
  /* 购票（ticket.js）。管理页的初始化在 admin.js 末尾，进入 #internal 时才执行 */
  if (typeof initTicket === "function") {
    initTicket();
    initTicketEntry();
    refreshTicketEntry();   // 首页购票入口：购票开放且非测试时才出现
  } else {
    console.error("[购票] ticket.js 没有加载成功，购票入口与购票页不可用");
  }
  /* 场地使用登记（venue.js） */
  if (typeof initVenue === "function") initVenue();
  else console.error("[场地登记] venue.js 没有加载成功，场地使用登记不可用");
  initClickBurst();
  initA11yTiles();
  initA11yModals();
  initSound();
  initMorePanel();
  initHeaderPanels();
  initCalWidget();
  initAlarm();
  initHuayu();
  initPickers();
  initClock();
  initClockToggle();
  initHashRoute();
  initSitePopup();
  loadSiteState();   // 异步：分享 / 验证 / 花语开关、星芒节、弹窗公告（开着就弹，等开屏图 / 花街介绍都关掉以后）
  window.HJ_LATE(initOfflineCache);

  /* 通知开屏脚本：主程序已就绪。新访客点击开屏图后，页面各区块依次入场并自动弹出花街介绍；
     进站前等花街介绍的底图解码好（标题字体、天空由开屏脚本自己等） */
  const boot = window.HJ_BOOT;
  boot.appReady(() => {
    playPageEnterStagger();
    /* 拿着购票链接直接进来的访客：购票页自己会弹「购票须知」，这里就别再叠一层花街介绍 */
    if (!$("view-ticket").hidden) return;
    firstBootInfoOpen = true;
    openInfoModal();
  }, booting ? [boot.warm(INFO_BG_IMAGE, true)] : []);
}
