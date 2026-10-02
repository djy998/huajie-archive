/* 花舞之街 · 主程序。window.HJ 由 boot.js 提供，admin.js、huayu.js 按需加载 */

/* ==== 1. 常量与工具 ==== */
const STORE = {
  fxLevel: "hj_fx_level",
  volume: "hj_volume",
  captchaOkAt: "hj_captcha_ok_at",
  pwFails: "hj_pw_fail_count",
  starlight: "hj_starlight",
  calOpen: "hj_cal_open",
  calZoom: "hj_cal_zoom",
  calXy: "hj_cal_xy",
  alarms: "hj_alarm_items",
  popupMute: "hj_popup_mute",
  popupNever: "hj_popup_never",
  popupSeen: "hj_popup_seen",
  ticketLook: "hj_ticket_look",
  ticketGuideAck: "hj_ticket_guide_ack",
  surveyDraft: "hj_survey_draft_",
  surveyDone: "hj_survey_done_",
  maint: "hj_maint",   // 名字同时写在 boot.js
};

const $ = (id) => document.getElementById(id);

/* 隐私模式下 Web Storage 会抛错 */
function webStore(name) {
  const area = () => window[name];
  return {
    get(key) { try { return area().getItem(key); } catch (e) { return null; } },
    set(key, value) { try { area().setItem(key, String(value)); } catch (e) {} },
    remove(key) { try { area().removeItem(key); } catch (e) {} },
    json(key) { try { return JSON.parse(this.get(key) || "null"); } catch (e) { return null; } },
  };
}
const storage = webStore("localStorage");
const session = webStore("sessionStorage");

const pad2 = (n) => (n < 10 ? "0" : "") + n;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const randomItem = (list) => list[Math.floor(Math.random() * list.length)];
const isDayMode = () => document.body.classList.contains("day-mode");
const prefersReducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

/* 已转义文本中的网址转为链接，句尾标点不计入 */
function linkify(html) {
  return html.replace(/https?:\/\/[^\s<>"'，。；、）！？]+/g, (m) => {
    const url = m.replace(/(?:&quot;|&#039;).*$/, "").replace(/[.,;:!?)\]]+$/, "");
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${url}</a>${m.slice(url.length)}`;
  });
}

/* 站内时间一律按国服时间（UTC+8） */
const CN_TZ_OFFSET_MS = 8 * 3600 * 1000;
/* "2026-09-20T12:00" → epoch 毫秒，格式不对为 0 */
function cnLocalToEpoch(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(value || ""));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - CN_TZ_OFFSET_MS : 0;
}
const epochToCnLocal = (ms) => (ms ? new Date(ms + CN_TZ_OFFSET_MS).toISOString().slice(0, 16) : "");
const formatCnTime = (ms) => (ms ? epochToCnLocal(ms).replace("T", " ") : "");
const formatCnSeconds = (ms) => (ms ? new Date(ms + CN_TZ_OFFSET_MS).toISOString().slice(0, 19).replace("T", " ") : "");
function formatCnLabel(ms) {
  const d = new Date(ms + CN_TZ_OFFSET_MS);
  return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日 ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}
const formatCnClock = (ms) => new Date(ms + CN_TZ_OFFSET_MS).toISOString().slice(11, 19);
/* 国服日期 + N 天 → "YYYY-MM-DD" */
const cnDate = (days = 0) => new Date(Date.now() + CN_TZ_OFFSET_MS + days * 86400000).toISOString().slice(0, 10);
const ymdKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
/* 时长：hh:mm:ss，不足 1 小时为 mm:ss */
function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const mmss = `${pad2(Math.floor(total / 60) % 60)}:${pad2(total % 60)}`;
  return h ? `${pad2(h)}:${mmss}` : mmss;
}

/* 等待时长：mm:ss / h:mm:ss / x天hh:mm:ss */
function formatWait(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const days = Math.floor(total / 86400);
  const h = Math.floor(total / 3600) % 24;
  const mmss = `${pad2(Math.floor(total / 60) % 60)}:${pad2(total % 60)}`;
  return days ? `${days}天${pad2(h)}:${mmss}` : h ? `${h}:${mmss}` : mmss;
}

/* 按 Worker 时间校准本机时钟：1 ET 分钟仅约 2.9 秒 */
let hjClockOffset = 0;
const hjNow = () => Date.now() + hjClockOffset;

function syncServerClock(serverNow, sentAt, receivedAt) {
  const rtt = receivedAt - sentAt;
  if (!Number.isFinite(serverNow) || rtt < 0 || rtt > 5000) return;
  hjClockOffset = Math.round(serverNow + rtt / 2 - receivedAt);
}

/* 缩小版图片 resized/<宽度>/<原路径>.webp（tools/make-thumbs.py 生成），不存在时退回原图 */
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

/* 模板里的 data-bg="原图" data-bg-w="宽度" */
function applyBgs(root) {
  (root || document).querySelectorAll("[data-bg]").forEach((el) => {
    setBgResized(el, el.dataset.bg, Number(el.dataset.bgW) || 720);
    el.removeAttribute("data-bg");
  });
}

/* <img data-orig>：缩小版加载失败时换回原图 */
function initResizedFallback() {
  document.addEventListener("error", (e) => {
    const img = e.target;
    if (img.tagName !== "IMG" || !img.dataset.orig || img.dataset.fallback) return;
    img.dataset.fallback = "1";
    img.src = img.dataset.orig;
  }, true);
}

/* 提示文字，空串即隐藏 */
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

async function copyText(text, okMsg, fallbackMsg) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(okMsg);
  } catch (e) {
    showToast(fallbackMsg);
  }
}

function downloadBlob(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 20000);
}

/* 点遮罩关闭弹窗；带 data-close-only-x 的只能点 × */
function closeOnBackdrop(overlay, close) {
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay && !overlay.dataset.closeOnlyX) close();
  });
}

function markTabs(buttons, isActive) {
  buttons.forEach((b) => {
    const on = isActive(b);
    b.classList.toggle("is-active", on);
    b.setAttribute("aria-selected", String(on));
  });
}

/* Worker ------------------------------------------------------------------------ */
const workerBase = () => new URL(WORKER_URL, location.href).href;

/* 公告配图统一指向当前的 WORKER_URL */
function workerImageUrl(url) {
  const m = /\/image\/(announcements\/[\w-]+\.(?:webp|jpg|png))$/.exec(url || "");
  return m ? new URL(`image/${m[1]}`, workerBase()).href : url;
}

/* 连不上或返回的不是 JSON 时为 null；业务错误为 { ok: false, error } */
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

/* 按需加载的脚本；失败后允许重试 */
const lateScripts = {};
function loadLateScript(file, ready) {
  if (ready()) return Promise.resolve();
  lateScripts[file] ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `${file}?v=${HJ.version}`;
    s.onload = () => (ready() ? resolve() : reject(new Error(`${file} init failed`)));
    s.onerror = () => { s.remove(); reject(new Error(`${file} load failed`)); };
    document.head.appendChild(s);
  }).catch((e) => { delete lateScripts[file]; throw e; });
  return lateScripts[file];
}


/* ==== 2. 视图与路由 ==== */
/* #latest #survey #previous #event-<id> #mini-review #ti #venue #internal；/activity/、/previous/ 为独立入口 */
const STANDALONE_PAGES = {
  activity: { hash: "#latest", open: () => openLatestEvent() },
  previous: { hash: "#previous", open: () => openArchiveList() },
};
const SITE_ROOT = new URL(".", document.baseURI).pathname;
const pagePath = () => location.pathname.replace(/index\.html$/, "");
const STANDALONE = STANDALONE_PAGES[document.documentElement.dataset.page] || null;
const STANDALONE_PATH = STANDALONE ? pagePath() : null;
const onStandalonePage = () => !!STANDALONE && pagePath() === STANDALONE_PATH;
const PAGE_DOC_TITLE = document.title;
const BASE_DOC_TITLE = document.documentElement.dataset.siteTitle || PAGE_DOC_TITLE;

/* 动画结束后移除类名，否则 animation-fill-mode 会锁住 transform，悬停效果失效 */
function playFxAnim(el, className, delayMs, autoClean) {
  if (!el) return;
  el.classList.remove(className);
  el.style.animationDelay = fxEnabled && delayMs !== undefined ? delayMs + "ms" : "";
  if (!fxEnabled) return;
  void el.offsetWidth;
  el.classList.add(className);
  if (!autoClean) return;
  const done = (e) => {
    if (e.target !== el || e.animationName !== "fxPageEnter") return;
    el.classList.remove(className);
    el.style.animationDelay = "";
    el.removeEventListener("animationend", done);
  };
  el.addEventListener("animationend", done);
}

const playEnterAnim = (el) => playFxAnim(el, "fx-page-enter", undefined, true);
const playFadeOnly = (el) => playFxAnim(el, "fx-fade-only");

function playViewEnterStagger(viewId, gridId) {
  const view = $(viewId);
  const topLevel = Array.from(view.children).filter((el) => el.id !== gridId);
  const gridItems = gridId ? Array.from($(gridId).children) : [];
  topLevel.forEach((el, i) => playFxAnim(el, "fx-page-enter", i * 90, true));
  gridItems.forEach((el, i) => playFxAnim(el, "fx-page-enter", topLevel.length * 90 + i * 60, true));
}

function playPageEnterStagger() {
  [
    document.querySelector(".site-header"),
    document.querySelector(".tile-hero:not([hidden])") || document.querySelector("#latestVideoBlock:not([hidden])"),
    document.querySelector("#view-home .tile-grid"),
    document.querySelector("#view-home .tile-grid-3"),
    document.querySelector("footer"),
  ].filter(Boolean).forEach((el, i) => playFxAnim(el, "fx-page-enter", i * 110, true));
}

function scrollToTopInstant() {
  const root = document.documentElement;
  const prev = root.style.scrollBehavior;
  root.style.scrollBehavior = "auto";
  window.scrollTo(0, 0);
  root.style.scrollBehavior = prev;
}

function showView(id) {
  if (id !== "view-ticket") {
    document.title = onStandalonePage() ? PAGE_DOC_TITLE : BASE_DOC_TITLE;
    document.documentElement.classList.remove("hj-ticket-bare");
    window.stopTicketIdle?.();
  }
  if (id === "view-home") {
    if (LATEST_VIDEO.defaultOpen && !homeVideoOpen && !homeVideoUserClosed && hasHomeVideo()) setHomeVideoOpen(true);
    setTimeout(maybeShowSitePopup, 0);
  } else if (homeVideoOpen) {
    setHomeVideoOpen(false);
  }
  if (id !== "view-detail") stopTabVideos();
  document.querySelectorAll(".view").forEach((v) => { v.hidden = v.id !== id; });
  scrollToTopInstant();
  playEnterAnim($(id));
}

function setRoute(hash) {
  const target = hash || "";
  if (onStandalonePage()) {
    if (target === STANDALONE.hash) return;
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

const ROUTES = {
  "#internal": () => openInternalView(),
  [TICKET_HASH]: () => openFeature("openTicketView", "购票页面没加载出来，刷新一下页面再试"),
  [VENUE_HASH]: () => openFeature("openVenueView", "登记页没加载出来，刷新一下页面再试"),
  "#latest": () => openLatestEvent(),
  [SURVEY_HASH]: () => openLatestSurvey(),
  "#previous": () => openArchiveList(),
  "#mini-review": () => openMiniReview(),
};

/* 功能脚本没加载成功时回到首页并提示 */
function openFeature(name, missingMsg) {
  if (typeof window[name] === "function") return window[name]();
  showView("view-home");
  showToast(missingMsg);
}

let routedPath = null;
function routeFromHash() {
  applyMaintenance();
  closeAllModals();
  let hash = location.hash;
  if (onStandalonePage() && hash && hash !== "#") {
    /* /activity/#latest → /activity/；其它 hash 回到站点根目录 */
    history.replaceState(null, "", hash === STANDALONE.hash ? STANDALONE_PATH : SITE_ROOT + hash);
    if (hash === STANDALONE.hash) hash = "";
  }
  routedPath = location.pathname;
  if (onStandalonePage()) STANDALONE.open();
  else if (ROUTES[hash]) ROUTES[hash]();
  else if (hash.startsWith("#event-")) {
    const ev = ARCHIVE_EVENTS.find((e) => e.id === hash.slice("#event-".length));
    if (ev) openDetail(ev);
    else goHome();
  } else showView("view-home");
}

function initHashRoute() {
  routeFromHash();
  window.addEventListener("hashchange", routeFromHash);
  /* 独立入口与根目录之间前进 / 后退只换路径，不触发 hashchange */
  window.addEventListener("popstate", () => { if (location.pathname !== routedPath) routeFromHash(); });
  if (!STANDALONE) return;
  /* 独立入口的 <base> 指向根目录，href="#…" 会整页跳转，改为站内切换 */
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest?.("a[href^='#']");
    if (!a || (a.target && a.target !== "_self") || !onStandalonePage()) return;
    e.preventDefault();
    setRoute(a.getAttribute("href") === "#" ? "" : a.getAttribute("href"));
  });
}

function openInternalView() {
  showView("view-internal");
  if (HJ.adminReady) return;
  const btn = $("internalSubmit");
  const msg = $("internalMsg");
  btn.disabled = true;
  setMsg(msg, "加载中…");
  loadLateScript("admin.js", () => !!HJ.adminReady).then(() => {
    btn.disabled = false;
    btn.onclick = null;
    setMsg(msg, "");
  }, () => {
    btn.disabled = false;
    btn.onclick = () => openInternalView();
    setMsg(msg, "加载失败，点击重试");
  });
}


/* ==== 3. 首页与活动详情 ==== */
const EMPTY_NOTE = `<div class="empty-note">内容整理中，稍后会补充~</div>`;
const BV_PATTERN = /^BV[0-9A-Za-z]{10}$/;
const VIDEO_MUTED_TOAST = "站内已静音";

/* 移动端用 B 站 H5 播放器，PC 版 player.html 在移动端无法播放 */
function isMobileUA() {
  const ua = navigator.userAgent || "";
  if (/Android|iPhone|iPad|iPod|Mobile|HarmonyOS|MicroMessenger/i.test(ua)) return true;
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;   // iPadOS 默认报成 Mac
}

/* 外链播放器仅支持 muted；给出 aid + cid 可省去易被风控拦截的查询 */
function bilibiliPlayerUrl({ bvid, aid = 0, cid = 0, page = 1, start = 0, danmaku = false, autoplay = false, muted = false }) {
  const params = new URLSearchParams({ bvid, autoplay: autoplay ? "1" : "0", danmaku: danmaku ? "1" : "0" });
  if (aid) params.set("aid", String(aid));
  if (cid) params.set("cid", String(cid));
  if (start > 0) params.set("t", String(Math.floor(start)));
  if (isMobileUA()) {
    params.set("page", String(page));
    params.set("highQuality", "1");
    params.set("as_wide", "1");
    return `https://www.bilibili.com/blackboard/html5mobileplayer.html?${params}`;
  }
  params.set("isOutside", "true");
  params.set("p", String(page));
  params.set("muted", muted ? "1" : "0");
  params.set("high_quality", "1");
  params.set("poster", "1");
  return `https://player.bilibili.com/player.html?${params}`;
}

/* 最新活动视频：点「播放视频」原位展开，离开首页时卸载 */
const hasSelfHostedVideo = () => !!String(LATEST_VIDEO.src || "").trim();
const hasBiliVideo = () => BV_PATTERN.test(LATEST_VIDEO.bvid || "");
const hasHomeVideo = () => hasSelfHostedVideo() || hasBiliVideo();
let homeVideoOpen = false;
let homeVideoUserClosed = false;
let homeVideoAutoplay = false;
let homeVideoMuted = false;        // 外链播放器加载时的 muted 参数
let homeVideoMuteTimer = 0;

function setHomeVideoOpen(open, autoplay = false) {
  homeVideoOpen = open;
  homeVideoAutoplay = open && autoplay;
  homeVideoMuted = siteVolume.muted;
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
        native.src = native.dataset.src = LATEST_VIDEO.src;
        if (LATEST_VIDEO.start > 0) {
          native.addEventListener("loadedmetadata", () => {
            try { native.currentTime = LATEST_VIDEO.start; } catch (e) {}
          }, { once: true });
        }
      }
      siteVolume.attach(native);
      if (autoplay) native.play().catch(() => {});
    } else {
      native.pause();
      siteVolume.detach(native);
    }
  } else {
    frame.src = open ? bilibiliPlayerUrl({ ...LATEST_VIDEO, autoplay, muted: homeVideoMuted }) : "about:blank";
  }
  const back = $("videoFallbackLink");
  const showBack = open && !selfHosted && hasBiliVideo();
  back.hidden = !showBack;
  if (showBack) back.href = `https://www.bilibili.com/video/${LATEST_VIDEO.bvid}`;
}

/* 静音状态变化时重新加载外链播放器（跨域 iframe 只能这样换 muted），拖动音量条时防抖 */
function syncExternalVideoMute() {
  if (hasSelfHostedVideo()) return;
  if (!homeVideoOpen) { homeVideoMuted = siteVolume.muted; return; }
  if (siteVolume.muted === homeVideoMuted) return;
  clearTimeout(homeVideoMuteTimer);
  homeVideoMuteTimer = setTimeout(() => {
    if (!homeVideoOpen || siteVolume.muted === homeVideoMuted) return;
    homeVideoMuted = siteVolume.muted;
    $("latestVideoFrame").src = bilibiliPlayerUrl({ ...LATEST_VIDEO, autoplay: homeVideoAutoplay, muted: homeVideoMuted });
    showToast(homeVideoMuted ? "视频已静音" : "视频已取消静音");
  }, 500);
}

function openHomeVideo() {
  bgm.pause();
  homeVideoUserClosed = false;
  setHomeVideoOpen(true, true);
  if (siteVolume.muted) showToast(VIDEO_MUTED_TOAST);
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
    e.stopPropagation();
    openHomeVideo();
  });
  $("videoDetailBtn").addEventListener("click", openLatestEvent);
  $("videoCloseBtn").addEventListener("click", closeHomeVideo);
  if (LATEST_VIDEO.defaultOpen && !$("view-home").hidden) setHomeVideoOpen(true);
}

/* 标签页里的 B 站视频：先显示封面（video.cover 或本页第一张图），点击后才加载播放器 */
const tabVideos = new Map();   // 元素 id → 视频配置
let tabVideoSeq = 0;

function renderTabVideo(video, fallbackCover) {
  if (!video || !BV_PATTERN.test(video.bvid || "")) return "";
  const id = `tabVideo${++tabVideoSeq}`;
  tabVideos.set(id, video);
  const cover = video.cover || fallbackCover || "";
  return `
    <div class="tab-video video-block" id="${id}" data-cover="${escapeHtml(cover)}">
      <div class="tab-video-frame">${tabVideoFacadeHtml(video.title || "活动视频", cover)}</div>
      <div class="video-actions tab-video-actions">
        <a class="video-action" href="https://www.bilibili.com/video/${escapeHtml(video.bvid)}/" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">在 B 站观看</a>
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
  bgm.pause();
  box.querySelector(".tab-video-frame").innerHTML = `
    <iframe title="${escapeHtml(video.title || "活动视频")}" scrolling="no" frameborder="0" allowfullscreen
      referrerpolicy="strict-origin-when-cross-origin"
      allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
      src="${escapeHtml(bilibiliPlayerUrl({ ...video, autoplay: true, muted: siteVolume.muted }))}"></iframe>`;
  box.classList.add("is-playing");
  if (siteVolume.muted) showToast(VIDEO_MUTED_TOAST);
}

/* 卸载播放器，换回封面 */
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
    const box = e.target.closest("[data-tab-video-play]")?.closest(".tab-video");
    if (box) playTabVideo(box);
  };
  $("view-detail").addEventListener("click", onClick);
  $("infoBox").addEventListener("click", onClick);
}

/* 标签页：字符串或 { video, links, images, text, note, link, titles }；外链用 noreferrer，否则部分 B 站视频无法打开 */
const extLink = (url, label, cls) =>
  `<a class="${cls}" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${escapeHtml(label || "查看详情")}</a>`;

/* 有图为磁贴，无图为胶囊按钮 */
function renderTabLink(l) {
  if (!l.image) return extLink(l.url, l.label, "link-pill tab-link-btn");
  return `
    <a class="tile tab-tile-link" href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer"
      data-bg="${escapeHtml(l.image)}" data-bg-w="720">
      <div class="tile-overlay">
        <h3>${escapeHtml(l.label || "查看详情")}</h3>
        <span class="tile-hint">在 B 站观看 ↗</span>
      </div>
    </a>`;
}

function renderTabContent(tab) {
  if (typeof tab === "string") return tab ? `<div class="empty-note empty-note-left">${escapeHtml(tab)}</div>` : EMPTY_NOTE;
  if (!tab || !(tab.video || tab.links?.length || tab.images?.length || tab.text || tab.note || tab.link)) return EMPTY_NOTE;
  const titles = tab.titles || {};
  const heading = (key) => (titles[key] ? `<h3 class="tab-sec-title">${escapeHtml(titles[key])}</h3>` : "");
  let html = "";
  const video = tab.video ? renderTabVideo(tab.video, tab.images?.[0]) : "";
  if (video) html += heading("video") + video;
  if (tab.links?.length) html += heading("links") + `<div class="tab-links">${tab.links.map(renderTabLink).join("")}</div>`;
  if (tab.images?.length) {
    html += heading("images") + `<div class="tab-gallery">` + tab.images.map((src) =>
      `<img src="${escapeHtml(resizedSrc(src, 1280))}" data-orig="${escapeHtml(src)}" alt="" loading="lazy" decoding="async" data-lightbox data-lightbox-src="${escapeHtml(src)}">`
    ).join("") + `</div>`;
  }
  if (tab.text) html += `<div class="empty-note empty-note-left">${escapeHtml(tab.text)}</div>`;
  if (tab.note) html += `<div class="empty-note">${escapeHtml(tab.note)}</div>`;
  if (tab.link) html += extLink(tab.link.url, tab.link.label, "link-pill");
  return html;
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
          </li>`).join("")}
      </ul>
    </div>`).join("");
}

/* 活动详情 ----------------------------------------------------------------------------- */
const DETAIL_TABS = ["poster", "manual", "shops", "review", "feedback"];

function selectDetailTab(tab) {
  const view = $("view-detail");
  markTabs(view.querySelectorAll(".tab-btn"), (b) => b.dataset.tab === tab);
  view.querySelectorAll(".tab-panel").forEach((p) => {
    p.hidden = p.id !== "panel-" + tab;
    if (p.hidden) stopTabVideos(p);
  });
  if (tab === "feedback") window.onSurveyTabShown?.();
}

function initDetailTabs() {
  $("view-detail").querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectDetailTab(btn.dataset.tab);
      playEnterAnim($("panel-" + btn.dataset.tab));
    });
  });
}

/* data：LATEST_EVENT 或 ARCHIVE_EVENTS 的一项；route / tab 指定地址和初始标签页 */
function openDetail(data) {
  setRoute(data.route || (data.isLatest ? "#latest" : "#event-" + data.id));
  $("detailBackBtn").hidden = !!data.isLatest && onStandalonePage();
  setBgResized($("detailHero"), data.cover, 1280);
  $("detailTitle").textContent = data.title;
  $("detailMeta").textContent = [data.dateLabel, data.location].filter(Boolean).join(" · ");
  setupDetailLike(data);

  stopTabVideos($("view-detail"));
  tabVideos.clear();
  $("panel-poster").innerHTML = renderTabContent(data.poster);
  $("panel-manual").innerHTML = renderTabContent(data.manual);
  $("panel-shops").innerHTML = renderShopsPanel(data.areas);
  $("panel-review").innerHTML = renderTabContent(data.review);
  applyBgs($("view-detail"));
  if (data.isLatest) {
    if (data.survey && typeof window.mountSurvey === "function") window.mountSurvey($("panel-feedback"));
    else if (data.survey) $("panel-feedback").innerHTML = `<div class="empty-note">问卷没加载出来，刷新一下页面再试</div>`;
    else $("panel-feedback").innerHTML = renderTabContent(data.feedback);
  }
  /* tabs 限定显示的标签页；hideReview 隐藏「活动回顾」；「反馈与建议」仅最新活动 */
  DETAIL_TABS.forEach((t) => {
    $("view-detail").querySelector(`.tab-btn[data-tab="${t}"]`).hidden = t === "feedback" ? !data.isLatest
      : data.tabs ? !data.tabs.includes(t) : t === "review" && !!data.hideReview;
  });
  selectDetailTab(data.tab || data.tabs?.[0] || "poster");
  showView("view-detail");
}

const latestEventData = () => ({ ...LATEST_EVENT, title: LATEST_EVENT.title || "敬请期待", isLatest: true });
const openLatestEvent = () => openDetail(latestEventData());
const openLatestSurvey = () => openDetail({ ...latestEventData(), route: SURVEY_HASH, tab: "feedback" });

/* 瀑布流：卡片按图片比例显示，依次放进最短的一列 */
const MASONRY_MIN_COL = 260;
const MASONRY_GAP = 20;
const imageRatios = {};
const ratioProbes = new Set(); // 测量用的 Image 在下载完成前保持引用

/* 取得尺寸即返回，不等图片下载完 */
function loadImageRatio(src) {
  if (imageRatios[src]) return Promise.resolve(imageRatios[src]);
  const measure = (url) => new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    let timer = 0;
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

const masonryColCount = (grid) => Math.max(1, Math.floor((grid.clientWidth + MASONRY_GAP) / (MASONRY_MIN_COL + MASONRY_GAP)));
const masonryItems = (grid) => Array.from(grid.querySelectorAll("[data-index]")).sort((x, y) => x.dataset.index - y.dataset.index);

function layoutMasonry(grid) {
  const items = masonryItems(grid);
  if (!items.length) return;
  const n = masonryColCount(grid);
  const cols = Array.from({ length: n }, () => Object.assign(document.createElement("div"), { className: "album-col" }));
  grid.replaceChildren(...cols);
  items.forEach((item) => {
    let target = cols[0];
    cols.forEach((col) => { if (col.offsetHeight < target.offsetHeight - 1) target = col; });
    target.appendChild(item);
  });
  grid.dataset.cols = String(n);
}

const playMasonryEnter = (grid) => masonryItems(grid).forEach((el, i) => playFxAnim(el, "fx-page-enter", 180 + i * 60, true));

function initMasonryResize() {
  let timer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      ["albumGrid", "miniReviewGrid"].forEach((id) => {
        const grid = $(id);
        if (grid.closest(".view").hidden || !grid.querySelector("[data-index]")) return;
        if (String(masonryColCount(grid)) !== grid.dataset.cols) layoutMasonry(grid);
      });
    }, 150);
  });
}

function renderAlbumGrid() {
  const grid = $("albumGrid");
  grid.replaceChildren();
  return Promise.all(ARCHIVE_EVENTS.map((ev) => loadImageRatio(ev.cover))).then((ratios) => {
    grid.innerHTML = ARCHIVE_EVENTS.map((ev, i) => `
      <div class="album-card" data-index="${i}" style="aspect-ratio:${ratios[i]}" data-bg="${escapeHtml(ev.cover)}" data-bg-w="720">
        <div class="overlay">
          <span class="year">${escapeHtml(ev.year)}</span>
          <div class="title">${escapeHtml(ev.title)}</div>
        </div>
        ${likeBtnHtml("act:" + ev.id)}
      </div>`).join("");
    applyBgs(grid);
    grid.querySelectorAll(".album-card").forEach((card) => {
      card.addEventListener("click", () => openDetail(ARCHIVE_EVENTS[Number(card.dataset.index)]));
    });
    layoutMasonry(grid);
    refreshLikes(grid);
  });
}

function openArchiveList() {
  setRoute("#previous");
  $("archiveBackBtn").hidden = onStandalonePage();
  showView("view-archive-list");
  playViewEnterStagger("view-archive-list", "albumGrid");
  renderAlbumGrid().then(() => playMasonryEnter($("albumGrid")));
}

/* 小型活动回顾：full 为点开后的大图，pinLast 排在最后 */
function renderMiniReviews() {
  const grid = $("miniReviewGrid");
  grid.replaceChildren();
  if (!MINI_REVIEWS.length) {
    grid.innerHTML = `<div class="empty-note">还没有内容，敬请期待</div>`;
    return Promise.resolve();
  }
  const list = [...MINI_REVIEWS.filter((it) => !it.pinLast), ...MINI_REVIEWS.filter((it) => it.pinLast)];
  return Promise.all(list.map((it) => loadImageRatio(it.image))).then((ratios) => {
    grid.innerHTML = list.map((it, i) => `
      <div class="review-item" data-index="${i}">
        <button type="button" class="review-photo" style="aspect-ratio:${ratios[i]}" data-lightbox data-lightbox-src="${escapeHtml(it.full || it.image)}">
          <img src="${escapeHtml(resizedSrc(it.image, 720))}" data-orig="${escapeHtml(it.image)}" alt="${escapeHtml(it.caption || "花街活动照片")}" loading="lazy" decoding="async">
        </button>
        ${likeBtnHtml(likeKeyFromSrc("mini", it.image))}
        ${it.caption ? `<p class="review-caption">${escapeHtml(it.caption)}</p>` : ""}
      </div>`).join("");
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
  $("bookingTile").addEventListener("click", async () => {
    if (await blockedByStaticMode()) return;
    if (typeof window.openVenueView !== "function") return showToast("登记页没加载出来，刷新一下页面再试");
    if (location.hash === VENUE_HASH) window.openVenueView();
    else setRoute(VENUE_HASH);
  });
  $("groupTile").addEventListener("click", async () => {
    if (!(await blockedByStaticMode())) requestCaptcha("group");
  });
  document.querySelectorAll("[data-back]").forEach((btn) => btn.addEventListener("click", goHome));
}


/* ==== 4. 站点开关与星芒节 ==== */
/* 分享功能关闭时为纯静态展示：活动群、复制附言、场地登记、问卷、点赞不可用 */
const STATIC_MODE_MSG = "功能未开放，敬请谅解~";
let siteLockdown = false;

async function isLockedDown() {
  const data = await callWorker({ action: "get_lockdown" });
  if (data) siteLockdown = !!data.value;
  return siteLockdown;
}

/* 互动功能在静态模式下拦截，同时重新读取开关 */
async function blockedByStaticMode() {
  if (siteLockdown) isLockedDown();
  else if (!(await isLockedDown())) return false;
  showToast(STATIC_MODE_MSG);
  return true;
}

/* 全站开关：维护中时除 #internal 外只显示背景与维护提示。本机记一份，下次进站由 boot.js 立即套用 */
let siteMaintenance = storage.get(STORE.maint) === "1";
const maintenanceActive = () => document.documentElement.classList.contains("hj-maint");

function applyMaintenance(on) {
  if (on !== undefined) {
    siteMaintenance = !!on;
    if (siteMaintenance) storage.set(STORE.maint, "1");
    else storage.remove(STORE.maint);
  }
  const active = siteMaintenance && location.hash !== "#internal";
  const was = maintenanceActive();
  document.documentElement.classList.toggle("hj-maint", active);
  if (active && !was) {
    closeAllModals();
    openMorePanel(false);
    openVolPanel(false);
  }
  return active;
}

/* 人机验证总开关（关闭时前后端均不验证） */
let captchaOn = true;

function applyCaptchaEnabled(on) {
  const changed = captchaOn !== !!on;
  captchaOn = !!on;
  formGates.forEach((g) => g.sync(changed));
  if (!captchaOn && !$("captchaOverlay").hidden) closeCaptcha();
}

/* 星芒节期间游戏内强制下雪，管理员设置的时段内天气显示为小雪；本机缓存一份备用 */
let hjStarlight = null;   // { start, end } 或 null

const isValidRange = (v) => !!v && Number.isFinite(v.start) && Number.isFinite(v.end) && v.end > v.start;
const hjStarlightActiveAt = (ms) => !!hjStarlight && ms >= hjStarlight.start && ms <= hjStarlight.end;

function applyStarlight(value) {
  hjStarlight = isValidRange(value) ? { start: value.start, end: value.end } : null;
  if (hjStarlight) storage.set(STORE.starlight, JSON.stringify(hjStarlight));
  else storage.remove(STORE.starlight);
  omenCache.clear();
  weatherKey = "";
  clockTick();
}


/* ==== 5. 人机验证 ==== */
/* 弹窗式通过后 5 分钟内免验证；表单式凭证随表单提交 */
const CAPTCHA_GRACE_MS = 5 * 60 * 1000;
const CAPTCHA_NEEDED_MSG = "请完成人机验证";
const CAPTCHA_FAILED_MSG = "请重新验证";
const CAPTCHA_LOAD_FAILED_MSG = "加载失败，请刷新页面再试一次";

const isCaptchaFresh = () => Date.now() - (Number(storage.get(STORE.captchaOkAt)) || 0) < CAPTCHA_GRACE_MS;

let captchaGate = null;
let captchaPending = null;      // 通过后要做的事
let captchaFailStreak = 0;      // Turnstile 凭证连续校验失败次数
let captchaSession = 0;         // 丢弃过期回调用

function requestCaptcha(pending) {
  if (isCaptchaFresh()) runCaptchaPending(pending);
  else openCaptcha(pending);
}

function openCaptcha(pending) {
  if (!captchaOn) { runCaptchaPending(pending); return; }
  if (!captchaGate) { showToast(CAPTCHA_LOAD_FAILED_MSG); return; }
  captchaPending = pending;
  captchaFailStreak = 0;
  captchaSession++;
  setMsg($("captchaMsg"), "");
  $("captchaOverlay").hidden = false;
  playEnterAnim(document.querySelector("#captchaOverlay .gate-card"));
  captchaGate.open();
}

function closeCaptcha() {
  $("captchaOverlay").hidden = true;
  captchaSession++;
  captchaGate?.hide();
  captchaPending = null;
}

async function finishCaptcha(proof) {
  const pending = captchaPending;
  const session = captchaSession;
  const msg = $("captchaMsg");
  setMsg(msg, "验证中…");
  /* 听得花间语：验证与打开记录一并提交 */
  const data = await callWorker({ action: pending === "huayu" ? "huayu_visit" : "verify_turnstile", ...proof });
  if (session !== captchaSession) return;
  if (data?.error === "closed") {
    closeCaptcha();
    applyHuayuMode({ mode: data.mode });
    showToast(HUAYU_ERRORS.closed);
    return;
  }
  if (data && data.ok) {
    closeCaptcha();
    storage.set(STORE.captchaOkAt, Date.now());
    runCaptchaPending(pending);
    return;
  }
  if (proof.token) {
    /* 连续两次校验失败则改用手动验证 */
    if (++captchaFailStreak >= 2) {
      captchaGate.useManual("已切换为手动验证");
      return;
    }
    setMsg(msg, "请重新验证");
    captchaGate.refresh();
    return;
  }
  setMsg(msg, !data ? "连接失败，检查一下网络后再试"
    : data.error === "rate_limited" ? "操作过于频繁，请稍后再试"
    : "验证已过期，请重新验证");
  captchaGate.refresh();
}

function runCaptchaPending(pending) {
  if (pending === "group") openGroupModal();
  else if (pending === "info") openInfoModal();
  else if (pending === "huayu") {
    huayuVisited = true;
    openHuayuModal();
  }
  else if (pending === "copy") showToast("验证通过");
  else if (pending === "internal") {
    showToast("验证通过");
    $("internalPassword").focus();
  }
}

function initCaptcha() {
  captchaGate = window.HJVerify.createGate($("captchaVerify"), {
    post: callWorker,
    turnstileSiteKey: TURNSTILE_SITE_KEY,
    onPass: finishCaptcha,
  });
  $("captchaClose").addEventListener("click", closeCaptcha);
  closeOnBackdrop($("captchaOverlay"), closeCaptcha);
}

/* 表单验证：Worker 已校验过的凭证作废并换题，未校验的保留 */
const formGates = [];

function createFormGate(host, { shouldOpen = () => true, onPass } = {}) {
  let gate = null;
  let opened = false;
  const fg = {
    get opened() { return opened; },
    open(again = false) {
      host.hidden = !captchaOn;
      if (!captchaOn || (opened && !again) || !shouldOpen() || !window.HJVerify) return;
      gate ??= HJVerify.createGate(host, { post: callWorker, turnstileSiteKey: TURNSTILE_SITE_KEY, onPass });
      gate.open();
      opened = true;
    },
    close() {
      if (gate) gate.hide();
      opened = false;
    },
    proof: () => (captchaOn && gate && opened ? gate.getProof() : null),
    /* 缺少凭证时返回提示语 */
    missing() {
      if (!captchaOn || fg.proof()) return "";
      if (!window.HJVerify) return CAPTCHA_LOAD_FAILED_MSG;
      fg.open();
      return CAPTCHA_NEEDED_MSG;
    },
    afterSubmit(data) {
      if (data && data.ok) fg.close();
      else if ((!data || data.error === "captcha" || data.error === "server_error") && gate && opened) gate.refresh();
    },
    sync(changed) {
      host.hidden = !captchaOn;
      if (!changed) return;
      fg.close();
      fg.open();
    },
  };
  formGates.push(fg);
  return fg;
}


/* ==== 6. 花街介绍、活动群、网站说明 ==== */
let firstBootInfoOpen = false;   // 进站时自动弹出的那次
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
    </div>`).join("");
  refreshLikes(grid);
}

function switchInfoTab(tab) {
  markTabs(document.querySelectorAll(".info-tabs .tab-btn"), (b) => b.dataset.infoTab === tab);
  $("infoPanelIntro").hidden = tab !== "intro";
  $("infoPanelGallery").hidden = tab !== "gallery";
  $("infoPanelRecord").hidden = tab !== "record";
  if (tab === "gallery") renderInfoGallery();
  const record = $("infoPanelRecord");
  stopTabVideos(record);
  if (tab === "record") {
    record.innerHTML = INFO_RECORD_VIDEOS.map((v) =>
      `<h3 class="tab-sec-title">${escapeHtml(v.heading)}</h3>${renderTabVideo(v) || EMPTY_NOTE}`).join("");
    applyBgs(record);
  }
}

function openInfoModal() {
  $("infoOverlay").hidden = false;
  switchInfoTab("intro");
  playFadeOnly($("infoBox"));
  isLockedDown();
}

function closeInfoModal() {
  stopTabVideos($("infoBox"));
  $("infoOverlay").hidden = true;
  firstBootInfoOpen = false;
  setTimeout(maybeShowSitePopup, 0);
}

/* 已验证时复制内容附上 INFO_COPY_TAIL；自动弹出与静态模式下不附 */
function onInfoTextCopy(e) {
  const selection = window.getSelection().toString();
  if (!selection || siteLockdown || firstBootInfoOpen) return;
  if (captchaOn && !isCaptchaFresh()) { openCaptcha("copy"); return; }
  e.clipboardData.setData("text/plain", `${selection}\n\n${INFO_COPY_TAIL}`);
  e.preventDefault();
}

function openGroupModal() {
  $("groupOverlay").hidden = false;
  playEnterAnim(document.querySelector("#groupOverlay .group-box"));
}

const closeGroupModal = () => { $("groupOverlay").hidden = true; };

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

/* 网站说明：关于网站 / 反馈与建议 / 分享网站 --------------------------------------------- */
const FEEDBACK_CATEGORIES = { bug: "bug反馈", experience: "体验反馈", feature: "功能建议", join: "加入花街", other: "其他" };
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
  bad_content: "内容过短",
  too_long: "最多 1000 字",
  bad_contact: "请填写联系方式",
  captcha: CAPTCHA_FAILED_MSG,
  rate_limited: "操作过于频繁，请稍后再试",
  server_error: "提交失败，请稍后再试（一直这样的话请在活动群里告诉我们）",
};
let aboutTab = "about";
let feedbackSubmitting = false;
let feedbackGate = null;

function switchAboutTab(tab) {
  aboutTab = tab;
  markTabs(document.querySelectorAll("#siteAboutOverlay [data-about-tab]"), (b) => b.dataset.aboutTab === tab);
  $("aboutPanelAbout").hidden = tab !== "about";
  $("aboutPanelFeedback").hidden = tab !== "feedback";
  $("aboutPanelShare").hidden = tab !== "share";
  feedbackGate.open();
}

function openSiteAbout(tab = "about") {
  $("siteAboutOverlay").hidden = false;
  switchAboutTab(tab);
  playEnterAnim($("siteAboutBox"));
}

const closeSiteAbout = () => { $("siteAboutOverlay").hidden = true; };

function syncFeedbackContactField() {
  const on = $("feedbackWantContact").checked;
  $("feedbackContact").hidden = !on;
  if (on) $("feedbackContact").focus();
}

async function submitFeedback(e) {
  e.preventDefault();
  if (feedbackSubmitting) return;
  const msg = $("feedbackMsg");
  const category = $("feedbackCategory").value;
  const content = $("feedbackContent").value.trim();
  const wantContact = $("feedbackWantContact").checked;
  const contact = $("feedbackContact").value.trim();
  const invalid = !category ? ["bad_category", "feedbackCategory"]
    : content.length < 2 ? ["bad_content", "feedbackContent"]
    : wantContact && !contact ? ["bad_contact", "feedbackContact"] : null;
  if (invalid) {
    setMsg(msg, FEEDBACK_ERRORS[invalid[0]]);
    $(invalid[1]).focus();
    return;
  }
  const missing = feedbackGate.missing();
  if (missing) { setMsg(msg, missing); return; }

  setMsg(msg, "");
  feedbackSubmitting = true;
  const btn = $("feedbackSubmitBtn");
  btn.disabled = true;
  btn.textContent = "提交中…";
  const data = await callWorker({ action: "submit_feedback", category, content, wantContact, contact, ...feedbackGate.proof() });
  feedbackSubmitting = false;
  btn.disabled = false;
  btn.textContent = "提交";
  feedbackGate.afterSubmit(data);
  if (!data || !data.ok) {
    setMsg(msg, !data ? "网络连接失败" : FEEDBACK_ERRORS[data.error] || "提交失败，请稍后再试");
    return;
  }
  $("feedbackForm").reset();
  $("feedbackCount").textContent = "0";
  $("feedbackContentHint").textContent = FEEDBACK_HINTS[""];
  syncFeedbackContactField();
  $("feedbackForm").hidden = true;
  $("feedbackDone").hidden = false;
}

function initSiteAbout() {
  feedbackGate = createFormGate($("feedbackVerify"), {
    shouldOpen: () => !$("siteAboutOverlay").hidden && aboutTab === "feedback" && !$("feedbackForm").hidden,
    onPass: () => setMsg($("feedbackMsg"), ""),
  });
  $("aboutShareText").textContent = SHARE_TEXT;
  $("siteAboutLink").addEventListener("click", (e) => {
    e.preventDefault();
    openSiteAbout("about");
  });
  $("siteAboutClose").addEventListener("click", closeSiteAbout);
  closeOnBackdrop($("siteAboutOverlay"), closeSiteAbout);
  $("siteAboutOverlay").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-about-tab], [data-about-goto]");
    if (btn) switchAboutTab(btn.dataset.aboutTab || btn.dataset.aboutGoto);
  });
  $("feedbackCategory").addEventListener("change", (e) => {
    $("feedbackContentHint").textContent = FEEDBACK_HINTS[e.target.value] || FEEDBACK_HINTS[""];
    if (e.target.value === "join" && !$("feedbackWantContact").checked) {
      $("feedbackWantContact").checked = true;
      $("feedbackContact").hidden = false;
    }
  });
  $("feedbackContent").addEventListener("input", (e) => { $("feedbackCount").textContent = String(e.target.value.length); });
  $("feedbackWantContact").addEventListener("change", syncFeedbackContactField);
  $("feedbackForm").addEventListener("submit", submitFeedback);
  $("feedbackAgainBtn").addEventListener("click", () => {
    $("feedbackDone").hidden = true;
    $("feedbackForm").hidden = false;
    setMsg($("feedbackMsg"), "");
    feedbackGate.open();
  });
  $("shareSiteBtn").addEventListener("click", () => copyText(SHARE_TEXT, "分享内容已复制", SHARE_TEXT));
}


/* ==== 7. 弹窗公告 ==== */
/* 仅首页且无其他弹窗时弹出，每次打开最多一次 */
let sitePopup = null;

const todayKey = () => ymdKey(new Date());

function maybeShowSitePopup() {
  const p = sitePopup;
  if (!p || maintenanceActive() || $("view-home").hidden || document.documentElement.classList.contains("boot-pending") || anyModalOpen()) return;
  const rev = String(p.rev);
  if (session.get(STORE.popupSeen) === rev || storage.get(STORE.popupNever) === rev
    || storage.get(STORE.popupMute) === `${rev}|${todayKey()}`) return;
  session.set(STORE.popupSeen, p.rev);
  openSitePopup(p);
}

/* preview：管理页预览 */
let sitePopupPreview = false;

function openSitePopup(p, preview = false) {
  const title = (p.title || "").trim();
  $("sitePopupTitle").textContent = title || "公告";
  const img = $("sitePopupImage");
  img.hidden = !p.image_url;
  if (p.image_url) img.src = workerImageUrl(p.image_url);
  else img.removeAttribute("src");
  const body = $("sitePopupBody");
  body.innerHTML = linkify(escapeHtml(p.body || ""));
  body.hidden = !(p.body || "").trim();
  sitePopupPreview = preview;
  $("sitePopupMutes").hidden = preview;
  $("sitePopupMuteCheck").checked = false;
  $("sitePopupMuteMode").value = "today";
  $("sitePopupOverlay").hidden = false;
  $("sitePopupBox").scrollTop = 0;
  playEnterAnim($("sitePopupBox"));
}

/* 关闭时按勾选项记录：今日不再显示，或本版公告不再弹出（直到管理页保存新内容或访客清除网站数据） */
function closeSitePopup() {
  if ($("sitePopupOverlay").hidden) return;
  $("sitePopupOverlay").hidden = true;
  if (sitePopupPreview || !sitePopup || !$("sitePopupMuteCheck").checked) return;
  if ($("sitePopupMuteMode").value === "never") {
    storage.set(STORE.popupNever, sitePopup.rev);
    showToast("不再显示");
  } else {
    storage.set(STORE.popupMute, `${sitePopup.rev}|${todayKey()}`);
    showToast("今日不再显示");
  }
}

function applySitePopup(p) {
  sitePopup = p && p.enabled ? p : null;
  maybeShowSitePopup();
}

function initSitePopup() {
  $("sitePopupClose").addEventListener("click", closeSitePopup);
  $("sitePopupOkBtn").addEventListener("click", closeSitePopup);
  /* 选了范围就视为要勾选 */
  $("sitePopupMuteMode").addEventListener("change", () => { $("sitePopupMuteCheck").checked = true; });
  closeOnBackdrop($("sitePopupOverlay"), closeSitePopup);
}


/* ==== 8. 大图预览 ==== */
/* 单击放大、右键缩小、拖动、双指缩放；相册图双击设为背景；长图按宽度滚动 */
const LB_ZOOM_STEP = 2.5;
const LB_MAX_SCALE = 20;
const LB_LONG_RATIO = 2.5;
const DOUBLE_TAP_MS = 320;

let lightboxMode = "normal";
let lbLong = false;
let lbState = null;
let lbSeq = 0;

function resetLightboxTransform() {
  lbState = { scale: 1, tx: 0, ty: 0, dragging: false, startX: 0, startY: 0, moved: false };
  $("lightboxImg").style.transformOrigin = "50% 50%";
  applyLightboxTransform();
}

function applyLightboxTransform() {
  const img = $("lightboxImg");
  img.style.transform = `translate(${lbState.tx}px, ${lbState.ty}px) scale(${lbState.scale})`;
  if (!lbState.dragging) img.style.cursor = lightboxMode === "gallery" || lbLong ? "default" : lbState.scale > 1 ? "zoom-out" : "zoom-in";
}

function setLightboxLong(long) {
  lbLong = long;
  $("lightboxOverlay").classList.toggle("is-long", long);
  if (long) $("lightboxOverlay").scrollTop = 0;
  applyLightboxTransform();
}

function openLightbox(src, mode, preview) {
  lightboxMode = mode === "gallery" ? "gallery" : "normal";
  const img = $("lightboxImg");
  const seq = ++lbSeq;
  resetLightboxTransform();
  setLightboxLong(false);
  img.onload = () => {
    if (!lbLong && lightboxMode !== "gallery" && img.naturalWidth && img.naturalHeight / img.naturalWidth > LB_LONG_RATIO) setLightboxLong(true);
  };
  img.src = preview && preview !== src ? preview : src;
  if (preview && preview !== src) {
    const full = new Image();
    full.onload = () => {
      const swap = () => { if (seq === lbSeq) img.src = src; };
      if (full.decode) full.decode().then(swap, swap);
      else swap();
    };
    full.src = src;
  }
  $("lightboxOverlay").hidden = false;
  if (img.complete && img.naturalWidth) img.onload();
}

function closeLightbox() {
  lbSeq++;
  $("lightboxOverlay").hidden = true;
  $("lightboxImg").onload = null;
  $("lightboxImg").removeAttribute("src");
  lightboxMode = "normal";
  resetLightboxTransform();
  setLightboxLong(false);
}

/* 设为网页背景，切换昼夜时恢复 */
function setSiteBackgroundFromLightbox() {
  const img = $("lightboxImg");
  if (!img.src) return;
  const uri = `url('${img.src}')`;
  $("skyBase").style.backgroundImage = uri;
  $("skyFade").style.backgroundImage = uri;
  $("skyFade").style.opacity = "0";
  document.body.classList.add("custom-bg");
  showToast("已设为网页背景");
  closeLightbox();
}

function setTransformOriginAt(img, clientX, clientY) {
  const rect = img.getBoundingClientRect();
  img.style.transformOrigin = `${((clientX - rect.left) / rect.width) * 100}% ${((clientY - rect.top) / rect.height) * 100}%`;
}

function zoomAt(clientX, clientY, factor) {
  setTransformOriginAt($("lightboxImg"), clientX, clientY);
  const next = lbState.scale * factor;
  if (next <= 1.001) Object.assign(lbState, { scale: 1, tx: 0, ty: 0 });
  else if (next > LB_MAX_SCALE) lbState.scale = LB_MAX_SCALE;
  else Object.assign(lbState, { scale: next, tx: 0, ty: 0 });
  applyLightboxTransform();
}

function lbPointerDown(x, y) {
  if (lbLong || lbState.scale <= 1) return;
  Object.assign(lbState, { dragging: true, moved: false, startX: x - lbState.tx, startY: y - lbState.ty });
  $("lightboxImg").classList.add("is-dragging");
  $("lightboxImg").style.cursor = "grabbing";
}

function lbPointerMove(x, y) {
  if (!lbState.dragging) return;
  Object.assign(lbState, { tx: x - lbState.startX, ty: y - lbState.startY, moved: true });
  applyLightboxTransform();
}

function lbPointerUp() {
  lbState.dragging = false;
  $("lightboxImg").classList.remove("is-dragging");
  applyLightboxTransform();
}

function initLightbox() {
  const overlay = $("lightboxOverlay");
  const img = $("lightboxImg");
  resetLightboxTransform();

  document.addEventListener("click", (e) => {
    const trigger = e.target.closest("[data-lightbox]");
    if (!trigger) return;
    const shown = trigger.tagName === "IMG" ? trigger : trigger.querySelector("img");
    const preview = shown && shown.complete && shown.naturalWidth ? shown.currentSrc || shown.src : "";
    openLightbox(trigger.dataset.lightboxSrc || trigger.src, trigger.dataset.lightbox, preview);
  });
  $("lightboxClose").addEventListener("click", closeLightbox);
  closeOnBackdrop(overlay, closeLightbox);

  img.addEventListener("mousedown", (e) => {
    lbPointerDown(e.clientX, e.clientY);
    e.preventDefault();
  });
  window.addEventListener("mousemove", (e) => lbPointerMove(e.clientX, e.clientY));
  window.addEventListener("mouseup", lbPointerUp);
  img.addEventListener("click", (e) => {
    e.stopPropagation();
    if (lightboxMode === "gallery" || lbLong) return;
    if (lbState.moved) { lbState.moved = false; return; }
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

  /* 触屏：单击放大、双击复位、双指缩放；相册双击设为背景。点按在这里处理，阻止随后的 click */
  let lastTap = 0;
  let pinch = null;   // { dist, scale }
  const touchDist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const zoomable = () => lightboxMode !== "gallery" && !lbLong;

  img.addEventListener("touchstart", (e) => {
    if (!zoomable()) return;
    if (e.touches.length === 2) {
      pinch = { dist: touchDist(e.touches), scale: lbState.scale };
      lbState.dragging = false;
      setTransformOriginAt(img, (e.touches[0].clientX + e.touches[1].clientX) / 2, (e.touches[0].clientY + e.touches[1].clientY) / 2);
    } else if (e.touches.length === 1 && !pinch) {
      lbPointerDown(e.touches[0].clientX, e.touches[0].clientY);
    }
  });
  img.addEventListener("touchmove", (e) => {
    if (!zoomable()) return;
    if (e.touches.length === 2 && pinch) {
      e.preventDefault();
      const scale = clamp(pinch.scale * (touchDist(e.touches) / pinch.dist), 1, LB_MAX_SCALE);
      Object.assign(lbState, scale <= 1.001 ? { scale: 1, tx: 0, ty: 0 } : { scale }, { moved: true });
      applyLightboxTransform();
    } else if (e.touches.length === 1 && !pinch && lbState.scale > 1) {
      lbPointerMove(e.touches[0].clientX, e.touches[0].clientY);
      e.preventDefault();
    }
  }, { passive: false });
  img.addEventListener("touchend", (e) => {
    if (e.touches.length || lbLong) return;
    const now = Date.now();
    const doubleTap = now - lastTap < DOUBLE_TAP_MS;
    if (lightboxMode === "gallery") {
      if (doubleTap) { setSiteBackgroundFromLightbox(); lastTap = 0; } else lastTap = now;
      return;
    }
    e.preventDefault();
    if (pinch) {
      pinch = null;
    } else if (!lbState.moved) {
      if (doubleTap) {
        resetLightboxTransform();
        lastTap = 0;
      } else {
        zoomAt(e.changedTouches[0].clientX, e.changedTouches[0].clientY, LB_ZOOM_STEP);
        lastTap = now;
      }
    }
    lbPointerUp();
  });
}


/* ==== 9. 昼夜、动画与特效 ==== */
/* 动画档位：full 全部特效 / lite 仅保留点击和翻页的短动画 / off 关闭 */
const FX_LEVELS = ["full", "lite", "off"];
const FX_LEVEL_NAMES = { full: "完整", lite: "轻量", off: "关闭" };
const DAYNIGHT_FADE_MS = 900;
let fxLevel = "full";
let fxEnabled = true;

/* 天空与首页卡片底图（config.js 的 SKY_IMAGES / TILE_BG）------------------------------ */
const TILE_IDS = Object.keys(TILE_BG.day);
const tileBgs = (isDay) => TILE_BG[isDay ? "day" : "night"];
const setTileBg = (el, uri) => { el.style.backgroundImage = uri ? `url('${uri}')` : ""; };

function applyTileBackgrounds(isDay) {
  const bg = tileBgs(isDay);
  TILE_IDS.forEach((id) => setTileBg($(id), bg[id]));
}

/* 竖屏使用裁窄的天空图，不存在时退回原图 */
const skyPortraitMq = matchMedia("(max-aspect-ratio: 4/5)");
let skyPortraitMissing = false;
const useSkyPortrait = () => skyPortraitMq.matches && !skyPortraitMissing;
const skyUrl = (isDay) => (useSkyPortrait() ? SKY_IMAGES_PORTRAIT : SKY_IMAGES)[isDay ? "day" : "night"];

function setSky(isDay) {
  const url = skyUrl(isDay);
  $("skyBase").style.backgroundImage = `url('${url}')`;
  if (!useSkyPortrait()) return;
  const probe = new Image();
  probe.onerror = () => {
    skyPortraitMissing = true;
    if (!document.body.classList.contains("custom-bg")) setSky(isDayMode());
  };
  probe.src = url;
}

const dayNightUrls = (isDay) => [skyUrl(isDay), ...Object.values(tileBgs(isDay))];

/* 等图片下载并解码，最多 maxMs */
const whenImagesReady = (urls, maxMs) =>
  Promise.race([Promise.all(urls.map((u) => HJ.boot.warm(u))), new Promise((r) => setTimeout(r, maxMs))]);

let homeImagesReady = Promise.resolve();

const isSlowNetwork = () => {
  const c = navigator.connection;
  return !!c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ""));
};

/* 空闲时预取弹窗底图；电脑上同时预取另一套昼夜底图 */
function preloadDayNightImages(isDay) {
  const eager = window.innerWidth > 760 && !useSkyPortrait() && !isSlowNetwork();
  const urls = [INFO_BG_IMAGE, ...(eager ? dayNightUrls(!isDay) : [])];
  HJ.late(() => urls.forEach((url) => { new Image().src = url; }));
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
  const bg = tileBgs(isDay);
  TILE_IDS.forEach((id) => {
    const el = $(id);
    /* 悬停中的卡片被设计图覆盖，直接替换 */
    if (el.matches(":hover")) { setTileBg(el, bg[id]); return; }
    const layer = document.createElement("div");
    layer.className = "tile-crossfade";
    layer.style.cssText = `background-image:url('${bg[id]}');transition-duration:${duration}ms`;
    el.appendChild(layer);
    requestAnimationFrame(() => { layer.style.opacity = "1"; });
    setTimeout(() => {
      setTileBg(el, bg[id]);
      layer.remove();
    }, duration + 60);
  });
}

function applyDayNight(willBeDay) {
  const body = document.body;
  body.classList.remove("custom-bg");
  body.classList.toggle("day-mode", willBeDay);
  if (fxEnabled) {
    body.classList.add("fx-crossfading");
    crossfadeSky(willBeDay, DAYNIGHT_FADE_MS);
    crossfadeTileBackgrounds(willBeDay, DAYNIGHT_FADE_MS);
    setTimeout(() => {
      body.classList.remove("fx-crossfading");
      $("skyFade").style.backgroundImage = "";
    }, DAYNIGHT_FADE_MS + 80);
  } else {
    body.classList.remove("fx-crossfading");
    setSky(willBeDay);
    $("skyFade").style.backgroundImage = "";
    applyTileBackgrounds(willBeDay);
  }
  applyFx();
  bgm.followDayNight();
}

/* 切换昼夜：新图就绪（最多 2.5 秒）后再切换 */
let dayNightBusy = false;
let dayNightLockedUntil = 0;
function toggleDayNight() {
  if (dayNightBusy || (fxEnabled && Date.now() < dayNightLockedUntil)) return;
  dayNightLockedUntil = Date.now() + 1000;
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
  const isDay = !!HJ.day;
  document.body.classList.toggle("day-mode", isDay);
  setSky(isDay);
  /* 卡片底图排在开屏所需资源之后 */
  HJ.boot.afterAssets(() => {
    applyTileBackgrounds(isDayMode());
    homeImagesReady = whenImagesReady(Object.values(tileBgs(isDayMode())), 15000);
  });
  document.documentElement.style.setProperty("--info-photo", `url('${INFO_BG_IMAGE}')`);
  preloadDayNightImages(isDay);
  skyPortraitMq.addEventListener("change", () => {
    if (!document.body.classList.contains("custom-bg")) setSky(isDayMode());
  });
  $("dayNightToggle").addEventListener("click", toggleDayNight);
}

/* 卡片高于屏幕时加 .is-tall，底图改为固定的水印；留余量避免手机地址栏伸缩时来回切换 */
const CARD_TALL_MARGIN = 48;
const cardSizeWatcher = new ResizeObserver((entries) => entries.forEach((e) => updateCardBackdrop(e.target)));
const watchedCards = new WeakSet();

function updateCardBackdrop(card) {
  const h = card.offsetHeight;
  const vh = window.innerHeight;
  if (h > vh + CARD_TALL_MARGIN) card.classList.add("is-tall");
  else if (h < vh - CARD_TALL_MARGIN) card.classList.remove("is-tall");
}

function initCardBackdrops() {
  let queued = false;
  const refresh = () => {
    queued = false;
    document.querySelectorAll(".view .gate-card").forEach((card) => {
      if (!watchedCards.has(card)) {
        watchedCards.add(card);
        cardSizeWatcher.observe(card);
      }
      updateCardBackdrop(card);
    });
  };
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(refresh);
  };
  window.addEventListener("resize", queue);
  new MutationObserver(queue).observe(document.querySelector("main"), { childList: true, subtree: true });
  queue();
}

/* 飘落层 ------------------------------------------------------------------------------- */
const clearFx = () => { $("fxLayer").innerHTML = ""; };

/* 白天花叶飘落：每片五层嵌套（下落 / 摆动 / Y 翻转 / X 翻转 / 贴图与明暗），各层周期与相位随机 */
function renderDayFx() {
  clearFx();
  const reduce = prefersReducedMotion();
  const count = window.innerWidth < 760 ? 11 : 17;
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const sign = () => (Math.random() > 0.5 ? 1 : -1);
  const sec = (v) => v.toFixed(2) + "s";
  const span = (cls) => Object.assign(document.createElement("span"), { className: cls });
  const frag = document.createDocumentFragment();

  for (let i = 0; i < count; i++) {
    const sprite = randomItem(DAY_FX_LEAVES);
    const w = rand(15, 31);
    const fall = rand(9.5, 19);
    const swayDur = rand(1.9, 5.6);
    const flipDur = rand(2.1, 6.6);
    const flipXDur = rand(1.6, 5.4);
    const tumbleDur = rand(2.6, 7.4);

    /* 下落与淡入淡出共用 delay，淡入淡出发生在屏幕外 */
    const el = span("fx-leaf");
    const fallDelay = sec(-Math.random() * fall);
    Object.assign(el.style, {
      left: rand(-3, 101).toFixed(2) + "vw",
      width: w.toFixed(1) + "px",
      height: (w / sprite.ar).toFixed(1) + "px",
      animationDuration: `${sec(fall)}, ${sec(fall)}`,
      animationDelay: `${fallDelay}, ${fallDelay}`,
    });
    el.style.setProperty("--op", rand(0.5, 0.88).toFixed(2));
    el.style.setProperty("--sway", Math.round(rand(10, 54)) + "px");
    el.style.setProperty("--sway-skew", rand(0, 7).toFixed(1) + "deg");
    el.style.setProperty("--drift", Math.round(rand(-70, 150)) + "px");
    /* 18% 不翻转，20% 翻 720°，其余 360° */
    const r = Math.random();
    const turn = r < 0.18 ? 0 : r < 0.38 ? 720 : 360;
    el.style.setProperty("--flip-turn", turn * sign() + "deg");
    el.style.setProperty("--tilt-start", rand(-34, 6).toFixed(1) + "deg");
    el.style.setProperty("--tilt-end", rand(-6, 34).toFixed(1) + "deg");
    if (reduce) el.style.setProperty("--static-top", Math.round(rand(2, 88)) + "vh");

    const sway = span("fx-leaf-sway");
    sway.style.animationDuration = sec(swayDur);
    sway.style.animationDelay = sec(-Math.random() * swayDur);

    /* Y 翻转与明暗共用 delay，侧面朝向时最暗 */
    const flipDelay = -Math.random() * flipDur;
    const flip = span("fx-leaf-flip");
    flip.style.animationDuration = sec(flipDur);
    flip.style.animationDelay = sec(flipDelay);

    const flipXTurn = turn === 0 ? 0 : turn === 720 ? 360 : 180;
    const flipX = span("fx-leaf-flipx");
    flipX.style.setProperty("--flipx-turn", flipXTurn * sign() + "deg");
    flipX.style.animationDuration = sec(flipXDur);
    flipX.style.animationDelay = sec(-Math.random() * flipXDur);
    if (flipXTurn === 180) {
      flipX.style.animationDirection = "alternate";
      flipX.style.animationTimingFunction = "ease-in-out";
    }

    /* 明暗周期 = 翻转周期 × 360 / 转数 */
    const lightDur = turn === 0 ? flipDur * 2 : (flipDur * 360) / turn;
    const face = span("fx-leaf-face");
    face.style.backgroundImage = `url('${sprite.src}')`;
    face.style.animationDuration = `${sec(tumbleDur)}, ${sec(lightDur)}`;
    face.style.animationDelay = `${sec(-Math.random() * tumbleDur)}, ${sec(turn === 0 ? -Math.random() * lightDur : flipDelay)}`;

    flipX.appendChild(face);
    flip.appendChild(flipX);
    sway.appendChild(flip);
    el.appendChild(sway);
    frag.appendChild(el);
  }
  $("fxLayer").appendChild(frag);
}

/* 夜晚星光 */
function renderNightFx() {
  clearFx();
  const frag = document.createDocumentFragment();
  for (let i = 0; i < 26; i++) {
    const el = document.createElement("span");
    el.className = "fx-star";
    Object.assign(el.style, {
      left: Math.random() * 100 + "vw",
      top: Math.random() * 100 + "vh",
      animationDuration: 2 + Math.random() * 3 + "s",
      animationDelay: Math.random() * 4 + "s",
    });
    frag.appendChild(el);
  }
  $("fxLayer").appendChild(frag);
}

function applyFx() {
  if (fxLevel !== "full") clearFx();
  else if (isDayMode()) renderDayFx();
  else renderNightFx();
}

function syncFxToggle() {
  const btn = $("fxToggle");
  const label = `动画：${FX_LEVEL_NAMES[fxLevel]}`;
  btn.classList.toggle("is-active", fxEnabled);
  btn.classList.toggle("is-lite", fxLevel === "lite");
  btn.setAttribute("aria-label", label);
  btn.title = label;
  document.body.classList.toggle("fx-hover-enabled", fxLevel === "full");
  document.body.classList.toggle("fx-lite", fxLevel === "lite");
  applyFx();
  if (fxEnabled) return;
  document.querySelectorAll(".fx-page-enter, .fx-fade-only").forEach((el) => {
    el.classList.remove("fx-page-enter", "fx-fade-only");
    el.style.animationDelay = "";
  });
}

function setFxLevel(level) {
  fxLevel = level;
  fxEnabled = level !== "off";
  HJ.fx = level;
  storage.set(STORE.fxLevel, level);
  syncFxToggle();
}

function initFxToggle() {
  fxLevel = FX_LEVELS.includes(HJ.fx) ? HJ.fx : "lite";
  fxEnabled = fxLevel !== "off";
  syncFxToggle();
  /* 开屏时入场动画留到进站 */
  if (!document.documentElement.classList.contains("boot-pending")) playPageEnterStagger();
  $("fxToggle").addEventListener("click", () => {
    const next = FX_LEVELS[(FX_LEVELS.indexOf(fxLevel) + 1) % FX_LEVELS.length];
    setFxLevel(next);
    showToast(`动画：${FX_LEVEL_NAMES[next]}`);
  });
}

/* 点击特效：白天花叶，夜晚星点 ------------------------------------------------------------- */
const BURST_COUNT = { full: 7, lite: 4 };
const BURST_THROTTLE_MS = 150;
const BURST_EXCLUDED = "button, a, input, textarea, select, label, .tile, .tab-btn, .back-btn, .info-overlay, .lightbox-overlay, .review-photo, .album-card, .bard-stage";

function spawnClickBurst(x, y) {
  const layer = $("fxClickLayer");
  if (layer.children.length > 60) layer.innerHTML = "";
  const isDay = isDayMode();
  for (let i = 0; i < BURST_COUNT[fxLevel]; i++) {
    const el = document.createElement("span");
    const angle = Math.random() * Math.PI * 2;
    const dist = 26 + Math.random() * 46;
    el.style.left = x + "px";
    el.style.top = y + "px";
    el.style.setProperty("--bx", Math.cos(angle) * dist + "px");
    el.style.setProperty("--by", Math.sin(angle) * dist + 16 + "px");
    if (isDay) {
      const sprite = randomItem(DAY_FX_LEAVES);
      const w = 11 + Math.random() * 12;
      el.className = "fx-burst-petal";
      Object.assign(el.style, {
        width: w.toFixed(1) + "px",
        height: (w / sprite.ar).toFixed(1) + "px",
        backgroundImage: `url('${sprite.src}')`,
        animationDuration: (0.85 + Math.random() * 0.5).toFixed(2) + "s",
      });
      el.style.setProperty("--br", (Math.random() * 140 - 70).toFixed(1) + "deg");
    } else {
      el.className = "fx-burst-star";
    }
    layer.appendChild(el);
    setTimeout(() => el.remove(), 1500);
  }
}

function initClickBurst() {
  let last = 0;
  document.addEventListener("click", (e) => {
    if (!fxEnabled || e.target.closest(BURST_EXCLUDED)) return;
    const now = Date.now();
    if (now - last < BURST_THROTTLE_MS) return;
    last = now;
    spawnClickBurst(e.clientX, e.clientY);
  });
}

/* ==== 10. 头部工具：音量、更多、日历、时间条 ==== */
const MUSIC_VOLUME = 0.55;
const MUSIC_FADE_MS = 700;

/* 全站音量：<audio> / <video> 通过 attach 跟随；B 站外链播放器只能跟随静音 */
const siteVolume = {
  level: MUSIC_VOLUME,
  media: new Set(),
  get muted() { return this.level <= 0; },
  attach(el) {
    this.media.add(el);
    try { el.volume = this.level; } catch (e) {}
  },
  detach(el) { this.media.delete(el); },
  set(value) {
    this.level = clamp(Number(value) || 0, 0, 1);
    storage.set(STORE.volume, Math.round(this.level * 100));
    this.media.forEach((el) => { try { el.volume = this.level; } catch (e) {} });
    bgm.followVolume();
    syncExternalVideoMute();
    paintVolume();
  },
};

/* 背景音乐（config.js 的 MUSIC_TRACKS）：按昼夜选曲，首次交互后开始播放 */
const bgm = {
  tracks: MUSIC_TRACKS.filter((t) => t && t.src),
  audio: null,
  index: 0,
  loaded: "",
  playing: false,
  swapping: false,   // 换曲淡出中
  fadeRaf: 0,
  stopTimer: 0,

  pickIndex() {
    const mode = isDayMode() ? "day" : "night";
    return Math.max(0, this.tracks.findIndex((t) => t.mode === mode));
  },

  fade(to, done) {
    cancelAnimationFrame(this.fadeRaf);
    const a = this.audio;
    const from = a.volume;
    const t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / MUSIC_FADE_MS);
      a.volume = clamp(from + (to - from) * k, 0, 1);
      if (k < 1) this.fadeRaf = requestAnimationFrame(step);
      else if (done) done();
    };
    this.fadeRaf = requestAnimationFrame(step);
  },

  start(track) {
    if (this.loaded !== track.src) {
      this.loaded = track.src;
      this.audio.src = track.src;
      this.audio.load();
    }
    this.audio.play().catch((err) => {
      this.playing = false;
      if (err && err.name === "NotAllowedError") this.armAutoplay();
      else showToast("背景音乐加载失败");
    });
    this.fade(siteVolume.level);
  },

  play() {
    if (!this.tracks.length) return;
    if (!this.audio) {
      const a = new Audio();
      a.preload = "none";
      a.volume = 0;
      a.loop = this.tracks.length === 1;
      a.addEventListener("ended", () => this.next());
      this.audio = a;
    }
    clearTimeout(this.stopTimer);
    this.playing = true;
    this.index = this.pickIndex();
    this.start(this.tracks[this.index]);
  },

  pause() {
    this.swapping = false;
    if (!this.playing) return;
    this.playing = false;
    const stop = () => {
      cancelAnimationFrame(this.fadeRaf);
      clearTimeout(this.stopTimer);
      this.audio.pause();
      this.audio.currentTime = 0;
      this.audio.volume = 0;
    };
    this.fade(0, stop);
    this.stopTimer = setTimeout(stop, MUSIC_FADE_MS + 120);   // 后台标签页中 rAF 会暂停
  },

  next() {
    if (!this.playing || this.swapping) return;
    this.index = (this.index + 1) % this.tracks.length;
    this.start(this.tracks[this.index]);
  },

  followDayNight() {
    if (!this.playing || this.swapping) return;
    const i = this.pickIndex();
    if (this.tracks[i].src === this.loaded) return;
    this.index = i;
    this.swapping = true;
    this.fade(0, () => {
      this.swapping = false;
      if (this.playing) this.start(this.tracks[i]);
    });
  },

  followVolume() {
    if (!this.audio || !this.playing || this.swapping) return;
    cancelAnimationFrame(this.fadeRaf);
    this.audio.volume = siteVolume.level;
  },

  armAutoplay() {
    if (!this.tracks.length || siteVolume.muted) return;
    const kick = () => {
      document.removeEventListener("pointerup", kick, true);
      document.removeEventListener("keydown", kick, true);
      if (!this.playing) this.play();
    };
    document.addEventListener("pointerup", kick, true);
    document.addEventListener("keydown", kick, true);
  },
};

function paintVolume() {
  const p = Math.round(siteVolume.level * 100);
  const label = p ? "音量" : "音量：静音";
  const btn = $("soundToggle");
  btn.classList.toggle("is-on", p > 0);
  btn.setAttribute("aria-label", label);
  btn.title = label;
  $("volFill").style.height = p + "%";
  $("volThumb").style.bottom = `calc(${p}% - 8px)`;
  const track = $("volTrack");
  track.setAttribute("aria-valuenow", String(p));
  track.setAttribute("aria-valuetext", p ? "音量 " + p : "静音");
}

function initVolume() {
  const saved = Number(storage.get(STORE.volume) ?? NaN);
  siteVolume.set(Number.isFinite(saved) ? saved / 100 : MUSIC_VOLUME);
  bgm.armAutoplay();

  const track = $("volTrack");
  const setPercent = (p) => siteVolume.set(clamp(Math.round(p), 0, 100) / 100);
  const fromPointer = (e) => {
    const r = track.getBoundingClientRect();
    return r.height ? (1 - (e.clientY - r.top) / r.height) * 100 : siteVolume.level * 100;
  };
  let dragging = false;
  track.addEventListener("pointerdown", (e) => {
    dragging = true;
    try { track.setPointerCapture(e.pointerId); } catch (err) {}
    setPercent(fromPointer(e));
    e.preventDefault();
  });
  track.addEventListener("pointermove", (e) => { if (dragging) setPercent(fromPointer(e)); });
  track.addEventListener("pointerup", () => { dragging = false; });
  track.addEventListener("pointercancel", () => { dragging = false; });
  const KEY_STEPS = { ArrowUp: 5, ArrowRight: 5, ArrowDown: -5, ArrowLeft: -5 };
  track.addEventListener("keydown", (e) => {
    const cur = Math.round(siteVolume.level * 100);
    const next = e.key in KEY_STEPS ? cur + KEY_STEPS[e.key] : e.key === "Home" ? 0 : e.key === "End" ? 100 : null;
    if (next === null) return;
    e.preventDefault();
    setPercent(next);
  });
}

/* 「更多」菜单；dev: true 的项显示为开发中；icon 为 SVG 路径，glyph 为单色图片图标（.ico-glyph-xxx，跟随文字颜色）；
   花语图标为四瓣月见草，吟游诗人图标为游戏原版职业图标的字形 */
const HUAYU_PETAL = "M12 11.2C8.9 9.6 7 5.9 8.9 3.9c1.1-1.1 2.5-.8 3.1.5.6-1.3 2-1.6 3.1-.5 1.9 2 0 5.7-3.1 7.3z";
const MORE_ITEMS = [
  { id: "alarm", label: "闹铃", open: () => openAlarmModal(true),
    icon: '<circle cx="12" cy="13" r="7"/><path d="M12 10v3l2.2 2.2"/><path d="M5.5 4.5l-2 2"/><path d="M18.5 4.5l2 2"/>' },
  { id: "calendar", label: "日历", open: () => openCalWidget(true),
    icon: '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M8 3v4M16 3v4M4 10.5h16"/>' },
  { id: "huayu", label: "听得花间语", open: () => requestHuayu(), shown: () => huayuMode === "open" || huayuMode === "decrypt",
    icon: [0, 90, 180, 270].map((a) => `<path transform="rotate(${a} 12 12)" d="${HUAYU_PETAL}"/>`).join("") },
  { id: "puzzle", label: "花街拼图", open: () => openPuzzle(),
    icon: '<path d="M4.5 12.5v-1.8A2.7 2.7 0 0 1 7.2 8h9.6a2.7 2.7 0 0 1 2.7 2.7v1.8"/><rect x="3.5" y="12.5" width="17" height="8" rx="1.6"/>'
      + '<path d="M10.6 12.5v2.7h2.8v-2.7"/><path d="M12 2.6l.8 1.8 1.8.8-1.8.8-.8 1.8-.8-1.8-1.8-.8 1.8-.8z"/><path d="M6.6 4.2v1.8M5.7 5.1h1.8M17.6 3.8v1.8M16.7 4.7h1.8"/>' },
  { id: "bard", label: "吟游诗人模拟器", open: () => openBard(), glyph: "bard" },
];

function renderMorePanel() {
  $("morePanel").innerHTML = MORE_ITEMS.filter((f) => !f.shown || f.shown()).map((f) =>
    `<button type="button" class="more-item" data-more-id="${f.id}" aria-label="${f.label}" title="${f.label}${f.dev ? "（开发中）" : ""}">`
    + (f.glyph ? `<span class="ico-glyph ico-glyph-${f.glyph}" aria-hidden="true"></span>`
      : `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${f.icon}</svg>`) + "</button>").join("");
}

function openVolPanel(open) {
  $("volPanel").hidden = !open;
  $("soundToggle").setAttribute("aria-expanded", String(open));
}

/* 用 is-open 而非 hidden，保留收起动画 */
function openMorePanel(open) {
  $("morePanel").classList.toggle("is-open", open);
  const btn = $("moreToggle");
  btn.classList.toggle("is-active", open);
  btn.setAttribute("aria-expanded", String(open));
}

/* 音量与「更多」互斥，点空白处或 Esc 收起 */
function initHeaderPanels() {
  renderMorePanel();
  $("soundToggle").addEventListener("click", () => {
    openVolPanel($("volPanel").hidden);
    openMorePanel(false);
  });
  $("moreToggle").addEventListener("click", () => {
    openMorePanel(!$("morePanel").classList.contains("is-open"));
    openVolPanel(false);
  });
  $("morePanel").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-more-id]");
    if (!btn) return;
    openMorePanel(false);
    const item = MORE_ITEMS.find((f) => f.id === btn.dataset.moreId);
    if (item.dev) showToast("功能正在开发中~");
    else item.open();
  });
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

/* 小组件（日历、闹铃）：right / top 定位（与右上角缩放锚点一致），拖动标题栏移动，双击复位 */
const WIDGET_ZOOMS = [0.8, 0.9, 1, 1.1, 1.2];
const WIDGET_EDGE = 8;
const WIDGET_KEEP_VISIBLE = 60;

const viewportSize = () => ({
  vw: window.innerWidth || document.documentElement.clientWidth,
  vh: window.innerHeight || document.documentElement.clientHeight,
});

function clampWidgetPos(right, top) {
  const { vw, vh } = viewportSize();
  return [clamp(right, WIDGET_EDGE, Math.max(WIDGET_EDGE, vw - WIDGET_KEEP_VISIBLE)),
    clamp(top, WIDGET_EDGE, Math.max(WIDGET_EDGE, vh - WIDGET_KEEP_VISIBLE))];
}

function placeWidget(el, right, top) {
  el.style.right = right + "px";
  el.style.top = top + "px";
}

function zoomStep(zoom, dir) {
  const i = WIDGET_ZOOMS.indexOf(zoom);
  return WIDGET_ZOOMS[clamp((i === -1 ? 2 : i) + dir, 0, WIDGET_ZOOMS.length - 1)];
}

function syncZoomButtons(zoomOut, zoomIn, zoom) {
  zoomOut.disabled = zoom <= WIDGET_ZOOMS[0];
  zoomIn.disabled = zoom >= WIDGET_ZOOMS[WIDGET_ZOOMS.length - 1];
}

function makeWidgetDraggable(el, head, { move, reset }) {
  let drag = null;
  head.addEventListener("pointerdown", (e) => {
    if ((e.pointerType === "mouse" && e.button !== 0) || e.target.closest("button")) return;
    const r = el.getBoundingClientRect();
    drag = { ox: e.clientX - r.left, oy: e.clientY - r.top, w: r.width, h: r.height, ...viewportSize() };
    try { head.setPointerCapture(e.pointerId); } catch (err) {}
    el.classList.add("is-drag");
    e.preventDefault();
  });
  head.addEventListener("pointermove", (e) => {
    if (!drag) return;
    let right = drag.vw - (e.clientX - drag.ox + drag.w);
    let top = e.clientY - drag.oy;
    if (drag.w) right = clamp(right, WIDGET_EDGE, drag.vw - WIDGET_KEEP_VISIBLE);
    if (drag.h) top = clamp(top, WIDGET_EDGE, drag.vh - WIDGET_KEEP_VISIBLE);
    move(Math.round(right), Math.round(top));
  });
  const end = () => {
    drag = null;
    el.classList.remove("is-drag");
  };
  head.addEventListener("pointerup", end);
  head.addEventListener("pointercancel", end);
  head.addEventListener("dblclick", (e) => { if (!e.target.closest("button")) reset(); });
}

/* 日历：范围 2021-01 ~ 本月 + 12，打开时回到本月；活动标注在 config.js 的 HJ_CAL_ITEMS */
const CAL_FIRST_MONTH = 2021 * 12;
const CAL_TONES = ["rose", "gold", "teal", "wisteria", "blue", "orange"];
const cal = { y: 0, m: 0, pick: "", zoom: 1, days: null };   // days：按日期索引的活动

const monthIndex = (y, m) => y * 12 + m - 1;
const calLastMonth = () => monthIndex(new Date().getFullYear(), new Date().getMonth() + 1) + 12;
const calStart = (item) => item.start || item.date;
const calEnd = (item) => item.end || item.date;
const calTone = (item) => (CAL_TONES.includes(item.tone) ? item.tone : "rose");

function calGoTo(y, m) {
  const i = clamp(monthIndex(y, m), CAL_FIRST_MONTH, calLastMonth());
  cal.y = Math.floor(i / 12);
  cal.m = (i % 12) + 1;
}

function buildCalDays() {
  const days = {};
  HJ_CAL_ITEMS.forEach((item) => {
    const [sy, sm, sd] = calStart(item).split("-").map(Number);
    const [ey, em, ed] = calEnd(item).split("-").map(Number);
    const end = new Date(ey, em - 1, ed);
    for (const d = new Date(sy, sm - 1, sd); d <= end; d.setDate(d.getDate() + 1)) (days[ymdKey(d)] ||= []).push(item);
  });
  return days;
}

function renderCal() {
  cal.days ??= buildCalDays();
  const { y, m } = cal;
  $("calTitle").textContent = `${y}年${m}月`;
  $("calPrev").disabled = monthIndex(y, m) <= CAL_FIRST_MONTH;
  $("calNext").disabled = monthIndex(y, m) >= calLastMonth();

  /* 6 × 7 日格，周一起始 */
  const firstWeekday = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const today = ymdKey(new Date());
  let cells = "";
  for (let i = 0; i < 42; i++) {
    const d = new Date(y, m - 1, 1 - firstWeekday + i);
    const key = ymdKey(d);
    const cls = ["cal-day"];
    if (d.getMonth() !== m - 1) cls.push("is-out");
    if (key === today) cls.push("is-today");
    if (key === cal.pick) cls.push("is-pick");
    const bars = (cal.days[key] || []).slice(0, 3).map((it) => `<i class="cal-bar tone-${calTone(it)}"></i>`).join("");
    cells += `<button type="button" tabindex="-1" class="${cls.join(" ")}" data-date="${key}">`
      + `<span class="cal-num">${d.getDate()}</span>${bars ? `<span class="cal-bars">${bars}</span>` : ""}</button>`;
  }
  $("calGrid").innerHTML = cells;

  /* 本月活动，点击跳到其在本月的第一天 */
  const first = `${y}-${pad2(m)}-01`;
  const last = `${y}-${pad2(m)}-${pad2(new Date(y, m, 0).getDate())}`;
  const md = (key) => `${+key.slice(5, 7)}/${+key.slice(8, 10)}`;
  const list = HJ_CAL_ITEMS.filter((it) => calStart(it) <= last && calEnd(it) >= first)
    .sort((a, b) => calStart(a).localeCompare(calStart(b)));
  $("calEvents").innerHTML = list.length ? list.map((it) => {
    const s = calStart(it);
    const e = calEnd(it);
    return `<button type="button" class="cal-chip tone-${calTone(it)}" data-date="${s >= first ? s : first}">`
      + `<span>${escapeHtml(it.label)}</span><span class="cal-chip-day">${s === e ? md(s) : `${md(s)}–${md(e)}`}</span></button>`;
  }).join("") : '<p class="cal-empty">本月暂无活动标注</p>';
}

function setCalZoom(zoom) {
  cal.zoom = zoom;
  $("calWidget").style.setProperty("--cal-zoom", String(zoom));
  syncZoomButtons($("calZoomOut"), $("calZoomIn"), zoom);
  storage.set(STORE.calZoom, zoom);
}

function setCalPos(right, top) {
  placeWidget($("calWidget"), right, top);
  storage.set(STORE.calXy, `${right},${top}`);
}

function openCalWidget(open) {
  const w = $("calWidget");
  if (open && w.hidden) {
    const now = new Date();
    calGoTo(now.getFullYear(), now.getMonth() + 1);
    cal.pick = "";
    renderCal();
  }
  w.hidden = !open;
  storage.set(STORE.calOpen, open ? "1" : "0");
}

function initCalWidget() {
  const w = $("calWidget");
  const zoom = Number(storage.get(STORE.calZoom));
  setCalZoom(WIDGET_ZOOMS.includes(zoom) ? zoom : 1);
  const xy = (storage.get(STORE.calXy) || "").split(",").map(Number);
  if (xy.length === 2 && xy.every(Number.isFinite)) setCalPos(...clampWidgetPos(xy[0], xy[1]));

  $("calPrev").addEventListener("click", () => { calGoTo(cal.y, cal.m - 1); renderCal(); });
  $("calNext").addEventListener("click", () => { calGoTo(cal.y, cal.m + 1); renderCal(); });
  $("calZoomIn").addEventListener("click", () => setCalZoom(zoomStep(cal.zoom, 1)));
  $("calZoomOut").addEventListener("click", () => setCalZoom(zoomStep(cal.zoom, -1)));
  $("calClose").addEventListener("click", () => openCalWidget(false));
  w.addEventListener("click", (e) => {
    const cell = e.target.closest("[data-date]");
    if (!cell) return;
    const date = cell.dataset.date;
    if (cell.classList.contains("cal-chip")) calGoTo(+date.slice(0, 4), +date.slice(5, 7));
    cal.pick = date;
    renderCal();
  });
  makeWidgetDraggable(w, w.querySelector(".cal-head"), {
    move: setCalPos,
    reset: () => {
      w.style.right = w.style.top = "";
      storage.remove(STORE.calXy);
    },
  });
  if (storage.get(STORE.calOpen) === "1") openCalWidget(true);
}

/* 时间条：艾欧泽亚时间（ET）流速为现实的 144/7 倍，1 ET 小时 = 175 秒 */
const EORZEA_RATE = 144 / 7;
const ET_HOUR_MS = 175000;
const ET_MINUTE_MS = ET_HOUR_MS / 60;

/* 艾欧泽亚历：星、灵交替共 12 个月，每月 32 天；每周 8 天，每月 1 日为冰属日；月相每 4 天一变 */
const ET_WEEKDAYS = ["冰属日", "水属日", "风属日", "雷属日", "火属日", "土属日", "星极日", "灵极日"];
const ET_MOONS = ["新月", "蛾眉月", "上弦月", "盈凸月", "满月", "亏凸月", "下弦月", "残月"];

function etDateText(etDays) {
  const day = etDays % 32;
  const month = Math.floor(etDays / 32) % 12;
  return `${month % 2 ? "灵" : "星"}${Math.floor(month / 2) + 1}月${day + 1}日 ${ET_WEEKDAYS[day % 8]} ${ET_MOONS[Math.floor(day / 4)]}`;
}

function readClocks(now = hjNow()) {
  const etMinutes = Math.floor(now / ET_MINUTE_MS);
  const etHour = Math.floor(etMinutes / 60) % 24;
  return {
    cn: formatCnClock(now),
    et: `${pad2(etHour)}:${pad2(etMinutes % 60)}`,
    etDate: etDateText(Math.floor(etMinutes / 1440)),
    etNight: etHour >= 18 || etHour < 6,
  };
}

const clockShown = () => !$("hjClock").classList.contains("is-hidden");

function clockTick() {
  if (!clockShown()) return;
  const t = readClocks();
  $("hjTimeCN").textContent = t.cn;
  $("hjTimeET").textContent = t.et;
  $("hjEtDate").textContent = t.etDate;
  $("hjEtGlyph").textContent = t.etNight ? "☾" : "☀";
  $("hjClockEt").classList.toggle("is-night", t.etNight);
  renderWeather();
  renderOmens();
}

/* 在下一个整秒或 ET 整分（取较早者）刷新 */
function scheduleClockTick() {
  const now = hjNow();
  setTimeout(() => {
    if (!document.hidden) clockTick();
    scheduleClockTick();
  }, Math.min(1000 - (now % 1000), ET_MINUTE_MS - (now % ET_MINUTE_MS)) + 8);
}

function initClock() {
  const btn = $("clockToggle");
  const sync = () => {
    const shown = clockShown();
    btn.classList.toggle("is-active", shown);
    btn.setAttribute("aria-pressed", String(shown));
    btn.setAttribute("aria-label", shown ? "隐藏时间条" : "显示时间条");
    btn.title = btn.getAttribute("aria-label");
  };
  btn.addEventListener("click", () => {
    $("hjClock").classList.toggle("is-hidden");
    sync();
    clockTick();
  });
  sync();
  scheduleClockTick();
  document.addEventListener("visibilitychange", () => { if (!document.hidden) clockTick(); });
}

/* 高脚孤丘天气，算法同 asvel.github.io/ffxiv-weather；ET 0 / 8 / 16 时换天气 */
const WEATHER_SLOTS = 6;
const WEATHER_PERIOD_MS = 8 * ET_HOUR_MS;
const GOBLET_WEATHERS = [   // 累计概率
  { limit: 40, name: "碧空" },
  { limit: 60, name: "晴朗" },
  { limit: 85, name: "阴云" },
  { limit: 95, name: "薄雾" },
  { limit: 100, name: "小雨" },
];
const STARLIGHT_WEATHER = "小雪";

function gobletWeatherAt(ms) {
  const eHours = Math.floor(ms / ET_HOUR_MS);
  const chunk = ((eHours % 24) - (eHours % 8) + 8) % 24;   // ET 0 / 8 / 16 时 → 8 / 16 / 0
  const seed = Math.floor(eHours / 24) * 100 + chunk;
  const s1 = ((seed << 11) ^ seed) >>> 0;
  const chance = (((s1 >>> 8) ^ s1) >>> 0) % 100;
  return GOBLET_WEATHERS.find((w) => chance < w.limit).name;
}

let weatherKey = "";
function renderWeather() {
  const now = hjNow();
  const seq = Array.from({ length: WEATHER_SLOTS }, (_, i) => {
    const t = now + i * WEATHER_PERIOD_MS;
    return hjStarlightActiveAt(t) ? STARLIGHT_WEATHER : gobletWeatherAt(t);
  });
  const key = seq.join("|");
  if (key === weatherKey) return;
  weatherKey = key;
  $("hjWeatherSeq").innerHTML = seq.map((name, i) =>
    `<span class="hj-wx${i ? "" : " is-current"}" title="${name}">${i ? "" : '<span class="hj-wx-current-prefix">当前</span>'}`
    + `<img src="weather/${encodeURIComponent(name)}.png" alt="${name}" loading="lazy" decoding="async" width="18" height="18">`
    + `<span class="hj-wx-name">${name}</span></span>`).join('<span class="hj-weather-arrow" aria-hidden="true">→</span>');
}

/* 彩虹：ET 27 日 12:00 至次月 6 日 12:00，雨后于 8:00 或 16:00 转碧空、晴朗、阴云时出现，持续 30 ET 分钟。
   枪鼻头：ET 21–24 时阴云或薄雾。星芒节期间均不出现 */
const OMEN_SCAN_PERIODS = 3 * 24 * 30 * 3;   // 约 30 天
const RAINBOW_AFTER = ["碧空", "晴朗", "阴云"];
const RAINBOW_SEASON = [26 * 24 + 12, 5 * 24 + 12];   // 月内 ET 小时
const SPEARNOSE_WEATHERS = ["阴云", "薄雾"];

const periodWeather = (p) => gobletWeatherAt(p * WEATHER_PERIOD_MS);
const periodMonthHour = (p) => (Math.floor(p / 3) % 32) * 24 + (p % 3) * 8;

function rainbowIn(p) {
  const slot = p % 3;
  if (slot === 0) return null;
  const mh = periodMonthHour(p);
  if (mh < RAINBOW_SEASON[0] && mh >= RAINBOW_SEASON[1]) return null;
  const rainP = slot === 1 ? p - 2 : p - 1;
  const start = p * WEATHER_PERIOD_MS + 10 * ET_MINUTE_MS;
  if (hjStarlightActiveAt(rainP * WEATHER_PERIOD_MS) || hjStarlightActiveAt(start)) return null;
  if (periodWeather(rainP) !== "小雨" || !RAINBOW_AFTER.includes(periodWeather(p))) return null;
  return { start, end: start + 30 * ET_MINUTE_MS };
}

function spearnoseIn(p) {
  if (p % 3 !== 2) return null;
  const start = p * WEATHER_PERIOD_MS + 5 * ET_HOUR_MS;   // 21:00
  const end = (p + 1) * WEATHER_PERIOD_MS;
  if (hjStarlightActiveAt(start) || hjStarlightActiveAt(end - 1)) return null;
  return SPEARNOSE_WEATHERS.includes(periodWeather(p)) ? { start, end } : null;
}

function nextWindow(find, now) {
  const p0 = Math.floor(now / WEATHER_PERIOD_MS);
  for (let p = p0; p < p0 + OMEN_SCAN_PERIODS; p++) {
    const w = find(p);
    if (w && w.end > now) return w;
  }
  return null;
}

/* 窗口过期后才重新查找 */
const omenCache = new Map();
function omenWindow(name, find, now) {
  let c = omenCache.get(name);
  if (!c || (c.w ? now >= c.w.end : now - c.at > 60000) || now < c.at) {
    c = { w: nextWindow(find, now), at: now };
    omenCache.set(name, c);
  }
  return c.w;
}

function paintOmen(id, w, now, liveText) {
  const item = $(id);
  const live = !!w && now >= w.start;
  const text = !w ? "近期不会出现" : live ? liveText(w) : `将在 ${formatWait(w.start - now)} 后出现`;
  item.classList.toggle("is-live", live);
  const state = item.querySelector(".hj-omen-state");
  if (state.textContent !== text) state.textContent = text;
}

function renderOmens() {
  const now = hjNow();
  paintOmen("hjOmenRainbow", omenWindow("rainbow", rainbowIn, now), now, () => "天象出现！");
  paintOmen("hjOmenFish", omenWindow("fish", spearnoseIn, now), now,
    (w) => `现在会咬钩！持续 ${formatWait(w.end - now)}`);
}


/* ==== 11. 点赞 ==== */
/* 键：act:<活动 id> / mini:<文件名> / info:<文件名> */
const LIKE_DAILY_LIMIT = 10;
const LIKE_LIMIT_MSG = `今天 ${LIKE_DAILY_LIMIT} 次点赞已用完，明天再来吧`;
const LIKE_HEART_SVG = '<svg class="ico-heart" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>';
const likes = { counts: {}, liked: new Set(), remaining: LIKE_DAILY_LIMIT, available: false };

const likeKeyFromSrc = (prefix, src) => `${prefix}:${String(src).split("/").pop().split("?")[0]}`;

const likeBtnHtml = (key) =>
  `<button type="button" class="hj-like-btn hj-like-chip" data-like-key="${key}" aria-pressed="false" aria-label="点赞" title="点赞" hidden>`
  + `${LIKE_HEART_SVG}<span class="hj-like-count">0</span></button>`;

function likeButtonsIn(root) {
  const list = [...root.querySelectorAll(".hj-like-btn[data-like-key]")];
  if (root.matches?.(".hj-like-btn[data-like-key]")) list.push(root);
  return list.filter((btn) => btn.dataset.likeKey);
}

function paintLikes() {
  if (!likes.available) return;
  likeButtonsIn(document).forEach((btn) => {
    const key = btn.dataset.likeKey;
    const on = likes.liked.has(key);
    btn.hidden = false;
    btn.classList.toggle("is-liked", on);
    btn.setAttribute("aria-pressed", String(on));
    btn.querySelector(".hj-like-count").textContent = String(likes.counts[key] || 0);
  });
}

function syncLikes(data) {
  if (typeof data.remaining === "number") likes.remaining = data.remaining;
  paintLikes();
}

async function refreshLikes(root) {
  paintLikes();
  if (siteLockdown) return;
  const keys = [...new Set(likeButtonsIn(root).map((b) => b.dataset.likeKey))];
  if (!keys.length) return;
  const data = await callWorker({ action: "get_likes", keys });
  if (!data || !data.ok) return;
  likes.available = true;
  Object.assign(likes.counts, data.counts);
  (data.liked || []).forEach((k) => likes.liked.add(k));
  syncLikes(data);
}

/* 详情页横幅的点赞按钮 */
function setupDetailLike(data) {
  const btn = $("detailLikeBtn");
  btn.dataset.likeKey = "act:" + (data.id || "latest");
  btn.classList.remove("is-liked");
  btn.querySelector(".hj-like-count").textContent = "0";
  refreshLikes(btn);
}

async function onLikeClick(btn) {
  const key = btn.dataset.likeKey;
  if (!key || (await blockedByStaticMode())) return;
  if (likes.remaining <= 0) { showToast(LIKE_LIMIT_MSG); return; }
  btn.disabled = true;
  const data = await callWorker({ action: "add_like", key });
  btn.disabled = false;
  if (data && data.ok) {
    likes.liked.add(key);
    likes.counts[key] = data.count;
    syncLikes(data);
    showToast(`点赞成功，今天还剩 ${likes.remaining} 次`);
  } else if (data && data.error === "daily_limit") {
    likes.remaining = 0;
    showToast(LIKE_LIMIT_MSG);
  } else {
    showToast("点赞失败，请稍后再试");
  }
}

/* 捕获阶段处理，避免同时打开大图 */
function initLikes() {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".hj-like-btn");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    onLikeClick(btn);
  }, true);
}


/* ==== 12. 闹铃与倒计时 ==== */
/* 仅存本机；同一时刻只响一个，错过不补响 */
const ALARM_SOUNDS = ["基本闹铃", "闹铃1", "闹铃2", "闹铃3", "哄睡曲1", "哄睡曲2", "哄睡曲3"];
const ALARM_PLAY_OPTIONS = [30, 45];   // 秒，首项为默认
const ALARM_FADE_SEC = 4;
const ALARM_CN_MIN_SEC = 30;
const ALARM_ET_MIN_MIN = 15;

const alarms = {
  items: [],
  ringing: new Map(),
  widgets: new Map(),
  preview: null,
};

const alarmById = (id) => alarms.items.find((it) => it.id === id);
const isRinging = (it) => alarms.ringing.has(it.id);
const alarmZoneName = (it) => (it.zone === "cn" ? "国服" : "艾欧泽亚");

function humanDuration(h, m, s) {
  if (h > 0) return `${h}小时${m > 0 ? `${m}分` : ""}${s > 0 ? `${s}秒` : ""}`;
  return m > 0 ? `${m}分${s > 0 ? `${s}秒` : ""}` : `${s}秒`;
}

function alarmNextFire(it, now) {
  if (it.zone === "et") {
    /* 正处于目标分钟内则立即响 */
    const target = it.hh * 3600 + it.mm * 60;
    const etSec = (now / 1000) * EORZEA_RATE;
    const tod = ((etSec % 86400) + 86400) % 86400;
    if (Math.floor(tod / 60) === Math.floor(target / 60)) return now;
    return now + (((target - tod + 86400) % 86400) / EORZEA_RATE) * 1000;
  }
  const d = new Date(now + CN_TZ_OFFSET_MS);
  if (it.repeat) d.setUTCMinutes(it.mm, 0, 0);
  else d.setUTCHours(it.hh, it.mm, 0, 0);
  const t = d.getTime() - CN_TZ_OFFSET_MS;
  return t > now ? t : t + (it.repeat ? 3600000 : 86400000);
}

/* 循环倒计时：跳过已错过的轮次 */
const nextLoopEnd = (end, now, dur) => end + (Math.floor((now - end) / dur) + 1) * dur;

/* 开头 0.5 秒渐入，结尾渐弱；用定时器驱动（后台标签页中 rAF 会暂停） */
function playAlarmSound(name, playSec, onEnd) {
  const audio = new Audio(`music/${encodeURIComponent(name)}.ogg`);
  const totalMs = playSec * 1000;
  const fadeMs = Math.min(ALARM_FADE_SEC * 1000, totalMs * 0.6);
  const t0 = performance.now();
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    audio.pause();
    onEnd();
  };
  const paint = () => {
    const t = performance.now() - t0;
    const k = Math.min(1, Math.max(0.02, t / 500), Math.max(0, (totalMs - t) / fadeMs));
    try { audio.volume = clamp(siteVolume.level * k, 0, 1); } catch (e) {}
    if (t >= totalMs) stop();
  };
  const timer = setInterval(paint, 100);
  paint();
  audio.addEventListener("ended", stop);
  audio.addEventListener("error", () => {
    showToast(`铃声加载失败：${name}`);
    stop();
  });
  audio.play().catch((err) => {
    if (err && err.name === "NotAllowedError") showToast("铃声被浏览器拦截，点击页面后可播放");
    stop();
  });
  return { stop };
}

function alarmRing(it) {
  if (isRinging(it)) return;
  alarms.ringing.forEach((s) => s.stop());   // 同一时刻只响一个
  alarms.ringing.set(it.id, playAlarmSound(it.sound, it.playSec, () => {
    alarms.ringing.delete(it.id);
    alarmRefresh(it);
  }));
  alarmRefresh(it);
}

const alarmStopRing = (it) => alarms.ringing.get(it.id)?.stop();

/* 本机存取 ------------------------------------------------------------------------------ */
const alarmSave = () => storage.set(STORE.alarms, JSON.stringify(alarms.items));
const positive = (v) => (Number(v) > 0 ? Number(v) : 0);
const coord = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/* 补齐默认值并校验，无效返回 null */
function alarmNormalize(raw) {
  if (!raw || typeof raw !== "object") return null;
  const it = {
    id: String(raw.id || `alm${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`),
    kind: raw.kind === "countdown" ? "countdown" : "alarm",
    zone: raw.zone === "et" ? "et" : "cn",
    name: String(raw.name || "").slice(0, 12),
    sound: ALARM_SOUNDS.includes(raw.sound) ? raw.sound : ALARM_SOUNDS[0],
    playSec: ALARM_PLAY_OPTIONS.includes(Number(raw.playSec)) ? Number(raw.playSec) : ALARM_PLAY_OPTIONS[0],
    enabled: raw.enabled !== false,
    done: !!raw.done,
    hidden: !!raw.hidden,        // 小组件已收起
    zoom: WIDGET_ZOOMS.includes(Number(raw.zoom)) ? Number(raw.zoom) : 1,
    x: coord(raw.x),             // right / top
    y: coord(raw.y),
    hh: clamp(Math.floor(Number(raw.hh) || 0), 0, 23),
    mm: clamp(Math.floor(Number(raw.mm) || 0), 0, 59),
    repeat: !!raw.repeat,        // 国服每小时 / 艾欧泽亚每日
    durMs: positive(raw.durMs),
    durLabel: String(raw.durLabel || ""),
    loop: !!raw.loop,
    paused: !!raw.paused,
    remainMs: positive(raw.remainMs),
    endAt: positive(raw.endAt),
    nextFireAt: positive(raw.nextFireAt),
  };
  return it.kind === "countdown" && it.durMs < 1000 ? null : it;
}

function alarmFinish(it) {
  it.done = true;
  it.nextFireAt = it.endAt = it.remainMs = 0;
}

function alarmRevive(it, now) {
  if (!it.enabled || it.done) {
    it.nextFireAt = it.endAt = 0;
  } else if (it.kind === "alarm") {
    if (it.nextFireAt > now) return;
    if (it.repeat) it.nextFireAt = alarmNextFire(it, now);
    else alarmFinish(it);
  } else if (!it.paused && it.endAt <= now) {
    if (it.loop) it.endAt = nextLoopEnd(it.endAt || now, now, it.durMs);
    else alarmFinish(it);
  }
}

function alarmTick() {
  const now = hjNow();
  let dirty = false;
  alarms.items.forEach((it) => {
    if (!it.enabled || it.done) return;
    const due = it.kind === "alarm" ? it.nextFireAt && now >= it.nextFireAt : !it.paused && it.endAt && now >= it.endAt;
    if (!due) return;
    alarmRing(it);
    if (it.kind === "alarm" && it.repeat) it.nextFireAt = alarmNextFire(it, now + ET_MINUTE_MS);   // 跳过当前这一分钟
    else if (it.kind === "countdown" && it.loop) it.endAt = nextLoopEnd(it.endAt, now, it.durMs);
    else alarmFinish(it);
    dirty = true;
  });
  if (dirty) alarmSave();
  alarms.items.forEach(alarmPaintWidget);
  alarmPaintListLive();
  alarmPaintNowHints();
}

/* 操作 --------------------------------------------------------------------------------- */
function alarmCommit() {
  alarmSave();
  alarmRenderWidgets();
  alarmRenderLists();
}

function alarmSetEnabled(it, on) {
  const now = hjNow();
  it.enabled = on;
  if (it.kind === "alarm") {
    it.done = false;
    it.nextFireAt = on ? alarmNextFire(it, now) : 0;
  } else if (on) {
    it.done = it.paused = false;
    it.endAt = now + (it.remainMs || it.durMs);
    it.remainMs = 0;
  } else {
    if (!it.paused && it.endAt) it.remainMs = Math.max(1000, it.endAt - now);
    it.paused = true;
    it.endAt = 0;
  }
  if (!on) alarmStopRing(it);
  alarmCommit();
}

function alarmTogglePause(it) {
  if (it.done || !it.enabled) return;
  const now = hjNow();
  if (it.paused) {
    it.endAt = now + (it.remainMs || it.durMs);
    it.remainMs = 0;
  } else {
    it.remainMs = Math.max(1000, (it.endAt || now) - now);
    it.endAt = 0;
  }
  it.paused = !it.paused;
  alarmCommit();
}

/* 倒计时重新开始；一次性闹铃重新启用 */
function alarmRestart(it) {
  it.enabled = true;
  it.done = it.paused = false;
  if (it.kind === "alarm") {
    it.nextFireAt = alarmNextFire(it, hjNow());
  } else {
    it.remainMs = 0;
    it.endAt = hjNow() + it.durMs;
  }
  alarmCommit();
}

function alarmRemove(it) {
  alarmStopRing(it);
  alarms.items = alarms.items.filter((x) => x !== it);
  alarmCommit();
  showToast(`已删除「${it.name}」`);
}

function alarmZoom(it, dir) {
  it.zoom = zoomStep(it.zoom, dir);
  const w = alarms.widgets.get(it.id);
  w.el.style.setProperty("--alm-zoom", String(it.zoom));
  syncZoomButtons(w.zoomOut, w.zoomIn, it.zoom);
  alarmSave();
}

/* 小组件与列表共用的操作 */
const ALARM_ACTIONS = {
  toggle: (it) => alarmSetEnabled(it, !it.enabled),
  pause: alarmTogglePause,
  restart: alarmRestart,
  stop: alarmStopRing,
  del: alarmRemove,
  zoomin: (it) => alarmZoom(it, 1),
  zoomout: (it) => alarmZoom(it, -1),
  widget: (it) => {
    it.hidden = !it.hidden;
    alarmCommit();
  },
  hide: (it) => {
    it.hidden = true;
    alarmCommit();
    showToast("已收起，可在闹铃面板中显示");
  },
};

function onAlarmAction(e, rowSelector) {
  const btn = e.target.closest("button[data-act]");
  const row = btn && !btn.disabled && btn.closest(rowSelector);
  const it = row && alarmById(row.dataset.id);
  if (it) ALARM_ACTIONS[btn.dataset.act](it);
}

function alarmButtons(it, inList) {
  const b = [];
  if (isRinging(it)) b.push(["stop", "停止响铃", "is-hot"]);
  if (it.kind === "alarm") b.push(it.done ? ["restart", "重新启用"] : ["toggle", it.enabled ? "停用" : "启用"]);
  else if (it.done) b.push(["restart", "重新开始"]);
  else {
    if (inList || !it.enabled) b.push(["toggle", it.enabled ? "停用" : "启用"]);
    if (it.enabled) b.push(["pause", it.paused ? "继续" : "暂停"]);
    if (inList || it.enabled) b.push(["restart", "重置"]);
  }
  if (inList) b.push(["widget", it.hidden ? "显示组件" : "隐藏组件"], ["del", "删除", "is-danger"]);
  return b.map(([act, text, cls = ""]) => {
    const c = [inList ? "" : "alm-btn", cls].filter(Boolean).join(" ");
    return `<button type="button"${c ? ` class="${c}"` : ""} data-act="${act}">${text}</button>`;
  }).join("");
}

function alarmSubText(it) {
  if (it.kind === "alarm") {
    return `${alarmZoneName(it)}时间 · ${it.repeat ? (it.zone === "cn" ? "每小时重复" : "每日重复") : "仅一次"}`;
  }
  return `${alarmZoneName(it)}倒计时 · ${it.durLabel}${it.loop ? " · 自动循环" : ""}`;
}

const alarmSoundText = (it, sep) => `♪${sep}${escapeHtml(it.sound)} · ${it.playSec} 秒`;

/* 小组件 ------------------------------------------------------------------------------- */
/* 默认位置：按顺序阶梯排开 */
function alarmDefaultPos(it) {
  const n = Math.max(0, alarms.items.filter((x) => !x.hidden).indexOf(it));
  [it.x, it.y] = clampWidgetPos(16 + (n % 4) * 30, 112 + (n % 6) * 92);
}

const toolBtn = (act, label, title, path) =>
  `<button type="button" class="alm-tool" data-act="${act}" aria-label="${label}" title="${title}">`
  + `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg></button>`;

function alarmBuildWidget(it) {
  const el = document.createElement("div");
  el.className = "alm-widget";
  el.dataset.id = it.id;
  el.innerHTML = `
    <div class="alm-head" title="拖动移动，双击复位">
      <span class="alm-name">${escapeHtml(it.name)}</span>
      <span class="alm-tools">${toolBtn("zoomout", "缩小组件", "缩小", "M5 12h14")}${toolBtn("zoomin", "放大组件", "放大", "M12 5v14M5 12h14")}${toolBtn("hide", "收起组件", "收起", "M6 6l12 12M18 6L6 18")}</span>
    </div>
    <div class="alm-big">--:--</div>
    <div class="alm-sub">${escapeHtml(alarmSubText(it))}</div>
    <div class="alm-status"></div>
    <div class="alm-actions"></div>
    <div class="alm-meta">${alarmSoundText(it, " ")}</div>`;
  el.style.setProperty("--alm-zoom", String(it.zoom));
  if (it.x === null || it.y === null) alarmDefaultPos(it);
  placeWidget(el, it.x, it.y);
  makeWidgetDraggable(el, el.querySelector(".alm-head"), {
    move: (right, top) => {
      [it.x, it.y] = [right, top];
      placeWidget(el, right, top);
      alarmSave();
    },
    reset: () => {
      alarmDefaultPos(it);
      placeWidget(el, it.x, it.y);
      alarmSave();
    },
  });
  return el;
}

function alarmRenderWidgets() {
  const layer = $("alarmWidgetLayer");
  layer.innerHTML = "";
  alarms.widgets.clear();
  alarms.items.filter((it) => !it.hidden).forEach((it) => {
    const el = alarmBuildWidget(it);
    layer.appendChild(el);
    const q = (sel) => el.querySelector(sel);
    alarms.widgets.set(it.id, {
      el, big: q(".alm-big"), status: q(".alm-status"), actions: q(".alm-actions"),
      zoomIn: q('[data-act="zoomin"]'), zoomOut: q('[data-act="zoomout"]'), sig: "",
    });
    syncZoomButtons(q('[data-act="zoomout"]'), q('[data-act="zoomin"]'), it.zoom);
    alarmPaintWidget(it);
  });
}

function alarmPaintWidget(it) {
  const w = alarms.widgets.get(it.id);
  if (!w) return;
  const now = hjNow();
  const ringing = isRinging(it);
  const muted = siteVolume.muted ? "（站内已静音）" : "…";
  let big, status;
  if (it.kind === "alarm") {
    big = `${pad2(it.hh)}:${pad2(it.mm)}`;
    status = ringing ? `响铃中${muted}`
      : !it.enabled ? "已停用"
      : it.done ? "已完成"
      : `距下次响铃 ${formatDuration(it.nextFireAt - now)}`;
  } else {
    const remain = it.paused ? it.remainMs : Math.max(0, (it.endAt || now) - now);
    big = it.done ? "00:00" : formatDuration(remain);
    status = ringing ? `时间到，响铃中${muted}`
      : !it.enabled ? "已停用"
      : it.done ? "时间到"
      : it.paused ? "已暂停"
      : it.zone === "et" ? `≈ 艾欧泽亚剩 ${Math.max(1, Math.ceil((remain / 1000) * EORZEA_RATE / 60))} 分钟`
      : `至 国服 ${formatCnClock(it.endAt)}`;
  }
  w.big.textContent = big;
  w.status.textContent = status;
  w.el.classList.toggle("is-ringing", ringing);
  w.el.classList.toggle("is-off", !it.enabled || it.done);
  const sig = [it.enabled, it.done, it.paused, ringing].join("|");
  if (sig === w.sig) return;
  w.sig = sig;
  w.actions.innerHTML = alarmButtons(it, false);
}

function alarmRefresh(it) {
  alarmPaintWidget(it);
  alarmRenderLists();
}

/* 弹窗：表单 ------------------------------------------------------------------------------ */
const alarmFormZone = (group) => document.querySelector(`input[name="${group}"]:checked`)?.value || "cn";
const alarmMsg = (text) => setMsg($("alarmMsg"), text);

function alarmNum(id) {
  const el = $(id);
  return clamp(Math.floor(Number(el.value) || 0), Number(el.min) || 0, Number(el.max) || 99);
}

const cnCountdownParts = () => [alarmNum("cdCnH"), alarmNum("cdCnM"), alarmNum("cdCnS")];
const etCountdownParts = () => [alarmNum("cdEtH"), alarmNum("cdEtM")];

function syncAlarmForm() {
  const zone = alarmFormZone("almZone");
  const rep = $("almRepeat").checked;
  const tv = $("almTime").value || "--:--";
  $("almRepeatText").textContent = zone === "cn" ? "每小时重复" : "每日重复";
  $("almRepeatHint").textContent = zone === "cn"
    ? (rep ? `每小时第 ${tv.slice(3)} 分响铃` : `下一个国服 ${tv} 响铃`)
    : (rep ? `每个艾欧泽亚日 ${tv} 响铃` : `下一个艾欧泽亚 ${tv} 响铃`);
}

function syncCountdownForm() {
  const zone = alarmFormZone("cdZone");
  $("cdCnWrap").hidden = zone !== "cn";
  $("cdEtWrap").hidden = zone !== "et";
  const [h, m, s] = cnCountdownParts();
  const total = h * 3600 + m * 60 + s;
  $("cdCnHint").textContent = total > 0
    ? `共 ${humanDuration(h, m, s)}${total < ALARM_CN_MIN_SEC ? `，最短 ${ALARM_CN_MIN_SEC} 秒` : ""}` : "";
  const [eh, em] = etCountdownParts();
  const etTotal = eh * 60 + em;
  const realSec = (etTotal * 60) / EORZEA_RATE;
  $("cdEtHint").textContent = etTotal > 0
    ? `≈ 现实 ${realSec >= 60 ? `${Math.floor(realSec / 60)} 分 ${Math.round(realSec % 60)} 秒` : `${Math.round(realSec)} 秒`}`
      + (etTotal < ALARM_ET_MIN_MIN ? `，最短 ${ALARM_ET_MIN_MIN} 分钟` : "")
    : "";
}

function syncSegments(seg) {
  seg.querySelectorAll("label").forEach((lb) => lb.classList.toggle("is-active", lb.querySelector("input").checked));
}

function alarmPaintNowHints() {
  if ($("alarmOverlay").hidden) return;
  const t = readClocks();
  $("almNowHint").textContent = $("cdNowHint").textContent = `现在：国服 ${t.cn} · 艾欧泽亚 ${t.et} ${t.etNight ? "☾" : "☀"}`;
}

/* 试听，再点一次停止 */
function alarmPreview() {
  if (alarms.preview) { alarms.preview.stop(); return; }
  const tab = $("alarmPanelCountdown").hidden ? "alm" : "cd";
  const label = (on) => { $("almPreview").textContent = $("cdPreview").textContent = on ? "停止试听" : "试听"; };
  label(true);
  alarms.preview = playAlarmSound($(`${tab}Sound`).value, Number($(`${tab}PlaySec`).value), () => {
    alarms.preview = null;
    label(false);
  });
}

function addAlarmItem(raw, nameStem, toast) {
  const it = alarmNormalize(raw);
  it.name ||= `${nameStem}${alarms.items.filter((x) => x.kind === it.kind).length + 1}`;
  alarms.items.push(it);
  alarmCommit();
  alarmMsg("");
  showToast(toast(it.name));
  return it;
}

function submitAlarm() {
  const zone = alarmFormZone("almZone");
  const m = /^(\d{1,2}):(\d{2})$/.exec($("almTime").value);
  if (!m) { alarmMsg("请先选择响铃时间"); return; }
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  const dup = zone === "cn" && alarms.items.find((x) => x.kind === "alarm" && x.zone === "cn" && x.hh === hh && x.mm === mm);
  if (dup) { alarmMsg(`国服时间 ${pad2(hh)}:${pad2(mm)} 已经设过闹铃「${dup.name}」，同一时间不能设置两个`); return; }
  const raw = {
    kind: "alarm", zone, hh, mm,
    repeat: $("almRepeat").checked,
    name: $("almName").value.trim(),
    sound: $("almSound").value,
    playSec: $("almPlaySec").value,
  };
  raw.nextFireAt = alarmNextFire(raw, hjNow());
  addAlarmItem(raw, "闹铃", (name) => `闹铃「${name}」已添加，组件已放到页面上`);
  $("almName").value = "";
}

function submitCountdown() {
  const zone = alarmFormZone("cdZone");
  let durMs;
  let durLabel;
  if (zone === "cn") {
    const [h, m, s] = cnCountdownParts();
    const total = h * 3600 + m * 60 + s;
    if (total < ALARM_CN_MIN_SEC) { alarmMsg(`国服倒计时最短 ${ALARM_CN_MIN_SEC} 秒`); return; }
    durMs = total * 1000;
    durLabel = humanDuration(h, m, s);
  } else {
    const [h, m] = etCountdownParts();
    const total = h * 60 + m;
    if (total < ALARM_ET_MIN_MIN) { alarmMsg(`艾欧泽亚倒计时最短 ${ALARM_ET_MIN_MIN} 分钟`); return; }
    durMs = ((total * 60) / EORZEA_RATE) * 1000;
    durLabel = (h > 0 ? `${h}小时` : "") + `${m}分`;
  }
  addAlarmItem({
    kind: "countdown", zone, durMs, durLabel,
    endAt: hjNow() + durMs,
    loop: $("cdLoop").checked,
    name: $("cdName").value.trim(),
    sound: $("cdSound").value,
    playSec: $("cdPlaySec").value,
  }, "倒计时", (name) => `倒计时「${name}」已开始`);
  $("cdName").value = "";
}

/* 弹窗：列表 ---------------------------------------------------------------------------- */
function alarmLiveText(it) {
  const now = hjNow();
  if (isRinging(it)) return "响铃中…";
  if (!it.enabled) return "已停用";
  if (it.kind === "alarm") return it.done ? "已完成" : `距响铃 ${formatDuration(it.nextFireAt - now)}`;
  if (it.done) return "已结束";
  return it.paused ? `已暂停 · 剩余 ${formatDuration(it.remainMs)}` : `剩余 ${formatDuration(it.endAt - now)}`;
}

function alarmRenderLists() {
  if ($("alarmOverlay").hidden) return;
  [["almListAlarm", "alarm"], ["almListCountdown", "countdown"]].forEach(([id, kind]) => {
    const list = alarms.items.filter((it) => it.kind === kind);
    $(id).innerHTML = list.length ? list.map((it) => `
      <div class="alarm-item" data-id="${escapeHtml(it.id)}">
        <div class="alarm-item-top"><span class="alarm-item-name">${escapeHtml(it.name)}</span><span class="alarm-item-live"></span></div>
        <div class="alarm-item-sub">${escapeHtml(alarmSubText(it))} · ${alarmSoundText(it, "")}</div>
        <div class="alarm-item-btns">${alarmButtons(it, true)}</div>
      </div>`).join("") : '<p class="alarm-empty">暂无</p>';
  });
  alarmPaintListLive();
}

function alarmPaintListLive() {
  if ($("alarmOverlay").hidden) return;
  document.querySelectorAll("#alarmOverlay .alarm-item").forEach((row) => {
    const it = alarmById(row.dataset.id);
    if (it) row.querySelector(".alarm-item-live").textContent = alarmLiveText(it);
  });
}

/* 弹窗：开合与页签 ------------------------------------------------------------------------ */
function openAlarmModal(open) {
  $("alarmOverlay").hidden = !open;
  if (open) {
    alarmRenderLists();
    alarmPaintNowHints();
    playFadeOnly($("alarmOverlay").querySelector(".alarm-card"));
  } else if (alarms.preview) {
    alarms.preview.stop();
  }
}

const closeAlarmModal = () => openAlarmModal(false);

function initAlarm() {
  const sounds = ALARM_SOUNDS.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("");
  const secs = ALARM_PLAY_OPTIONS.map((s) => `<option value="${s}">${s} 秒</option>`).join("");
  ["almSound", "cdSound"].forEach((id) => { $(id).innerHTML = sounds; });
  ["almPlaySec", "cdPlaySec"].forEach((id) => { $(id).innerHTML = secs; });

  $("alarmClose").addEventListener("click", closeAlarmModal);
  const tabs = document.querySelectorAll("#alarmOverlay [data-alarm-tab]");
  tabs.forEach((btn) => btn.addEventListener("click", () => {
    const name = btn.dataset.alarmTab;
    markTabs(tabs, (b) => b === btn);
    $("alarmPanelAlarm").hidden = name !== "alarm";
    $("alarmPanelCountdown").hidden = name !== "countdown";
  }));
  $("almZoneSeg").addEventListener("change", (e) => { syncSegments(e.currentTarget); syncAlarmForm(); });
  $("cdZoneSeg").addEventListener("change", (e) => { syncSegments(e.currentTarget); syncCountdownForm(); });
  $("almRepeat").addEventListener("change", syncAlarmForm);
  $("almTime").addEventListener("input", syncAlarmForm);
  ["cdCnH", "cdCnM", "cdCnS", "cdEtH", "cdEtM"].forEach((id) => $(id).addEventListener("input", syncCountdownForm));
  $("almPreview").addEventListener("click", alarmPreview);
  $("cdPreview").addEventListener("click", alarmPreview);
  $("almAddAlarm").addEventListener("click", submitAlarm);
  $("cdAdd").addEventListener("click", submitCountdown);
  ["almListAlarm", "almListCountdown"].forEach((id) => $(id).addEventListener("click", (e) => onAlarmAction(e, ".alarm-item")));
  $("alarmWidgetLayer").addEventListener("click", (e) => onAlarmAction(e, ".alm-widget"));
  syncAlarmForm();
  syncCountdownForm();

  const now = hjNow();
  const saved = storage.json(STORE.alarms);
  alarms.items = (Array.isArray(saved) ? saved : []).map(alarmNormalize).filter(Boolean);
  alarms.items.forEach((it) => alarmRevive(it, now));
  alarmSave();
  alarmRenderWidgets();
  alarmTick();
  setInterval(alarmTick, 1000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) alarmTick(); });
}


/* ==== 13. 花语 ==== */
/* 访客开关：open 可写可读 / decrypt 仅解读 / off 隐藏 */
const HUAYU_VISITOR_MAX = 5000;
const HUAYU_DETECT_NOW = 4000;    // 超过此长度时延迟识别
let huayuMode = null;
let huayuAlgo = 2;
let huayuBusy = false;
let huayuResultCopy = "";
let huayuDetectTimer = 0;

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
const loadHuayuJs = () => loadLateScript("huayu.js", () => !!window.HJHuayu);
const huayuErrorText = (res) => HUAYU_ERRORS[res && res.error] || "出了点问题，稍后再试";

function applyHuayuMode({ mode, algo } = {}) {
  if ([1, 2].includes(Number(algo))) huayuAlgo = Number(algo);
  const next = ["open", "decrypt", "off"].includes(mode) ? mode : null;
  if (next === huayuMode) return;
  huayuMode = next;
  renderMorePanel();
  if (!$("huayuOverlay").hidden) syncHuayuUi();
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

/* 显示字数；识别为花语时调整按钮顺序，带密钥的显示密钥框 */
function syncHuayuInput() {
  clearTimeout(huayuDetectTimer);
  if ($("huayuInput").value.length > HUAYU_DETECT_NOW) huayuDetectTimer = setTimeout(detectHuayuInput, 300);
  else detectHuayuInput();
}

function detectHuayuInput() {
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
  $("huayuResultMeta").textContent = meta;
  $("huayuResultText").textContent = text;
  $("huayuCopyBtn").textContent = copyLabel;
  huayuResultCopy = text;
  const box = $("huayuResult");
  box.hidden = false;
  playFadeOnly(box);
  box.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

async function withHuayuBusy(btn, fn) {
  if (huayuBusy) return;
  huayuBusy = true;
  const label = btn.textContent;
  btn.textContent = "……";
  syncHuayuUi();
  setMsg($("huayuMsg"), "");
  try { await fn(window.HJHuayu, $("huayuInput").value); } finally {
    huayuBusy = false;
    btn.textContent = label;
    syncHuayuUi();
  }
}

async function huayuSeal(H, text) {
  const say = (t) => setMsg($("huayuMsg"), t);
  if (!text.trim()) return say(HUAYU_ERRORS.empty);
  const already = H.detect(text);
  if (already.ok && (already.algo === 2 || text.includes(H.MARK))) return say("这已经是花语啦，点「听花解语」听听它在说什么");
  if (H.countChars(text) > HUAYU_VISITOR_MAX) return say(HUAYU_ERRORS.too_long);
  let res = await H.encrypt(text, { algo: huayuAlgo, post: callWorker });
  if (!res.ok && res.error === "algo_changed" && res.algo) {
    huayuAlgo = res.algo;
    res = await H.encrypt(text, { algo: huayuAlgo, post: callWorker });
  }
  if (res.ok) return showHuayuResult("花语", res.text, `原文 ${res.plainChars} 字 → 花语 ${res.cipherChars} 字`, "复制花语");
  if (res.error !== "closed") return say(huayuErrorText(res));
  applyHuayuMode({ mode: res.mode });
  say(res.mode === "decrypt" ? HUAYU_ERRORS.closed_seal : HUAYU_ERRORS.closed);
}

async function huayuOpen(H, text) {
  const say = (t) => setMsg($("huayuMsg"), t);
  if (!text.trim()) return say("先把花语粘贴进来吧");
  const res = await H.decrypt(text, { post: callWorker, key: $("huayuKey").value.trim() });
  if (res.ok) return showHuayuResult("花在说", res.text, res.kind === 1 ? "密钥花语" : "", "复制原文");
  if (res.error === "need_key") {
    $("huayuKeyRow").hidden = false;
    $("huayuKey").focus();
  }
  if (res.error === "closed") applyHuayuMode({ mode: res.mode });
  say(res.error === "bad_key" && res.kind === 1 ? HUAYU_ERRORS.bad_custom_key : huayuErrorText(res));
}

/* 每次打开页面后首次打开前需人机验证，Worker 同时记录一次打开 */
let huayuVisited = false;
async function requestHuayu() {
  if (huayuVisited) return openHuayuModal();
  if (captchaOn) return openCaptcha("huayu");
  const data = await callWorker({ action: "huayu_visit" });
  if (data?.error === "captcha") return openCaptcha("huayu");
  if (data?.error === "closed") {
    applyHuayuMode({ mode: data.mode });
    showToast(HUAYU_ERRORS.closed);
    return;
  }
  huayuVisited = !!data?.ok;
  openHuayuModal();
}

function openHuayuModal() {
  $("huayuOverlay").hidden = false;
  syncHuayuUi();
  playFadeOnly($("huayuCard"));
  if (window.HJHuayu) return;
  loadHuayuJs().then(syncHuayuUi, () => {
    $("huayuHint").textContent = HUAYU_ERRORS.no_js;
  });
}

const closeHuayuModal = () => { $("huayuOverlay").hidden = true; };

function initHuayu() {
  $("huayuClose").addEventListener("click", closeHuayuModal);
  $("huayuInput").addEventListener("input", () => {
    syncHuayuInput();
    setMsg($("huayuMsg"), "");
  });
  $("huayuSealBtn").addEventListener("click", (e) => withHuayuBusy(e.currentTarget, huayuSeal));
  $("huayuOpenBtn").addEventListener("click", (e) => withHuayuBusy(e.currentTarget, huayuOpen));
  $("huayuKey").addEventListener("keydown", (e) => { if (e.key === "Enter") $("huayuOpenBtn").click(); });
  $("huayuCopyBtn").addEventListener("click", () => copyText(huayuResultCopy, "已复制", "复制失败，请长按文字手动复制"));
}

/* ==== 花街拼图（puzzle.js 按需加载） ==== */
let puzzleSiteState = null;   // 站点状态里的拼图设置：中断继续开关与大赛，puzzle.js 打开时会再取一次

function openPuzzle() {
  closeAllModals();
  loadLateScript("puzzle.js", () => !!window.HJPuzzle).then(
    () => window.HJPuzzle.open(),
    () => showToast("拼图没加载出来，检查一下网络再试"),
  );
}

function closePuzzle() {
  if (window.HJPuzzle) window.HJPuzzle.close();
  else $("puzzleOverlay").hidden = true;
}

function initPuzzle() {
  $("puzzleClose").addEventListener("click", () => {
    if (window.HJPuzzle?.requestClose) window.HJPuzzle.requestClose();
    else closePuzzle();
  });
}

/* 吟游诗人模拟器：小组件与演奏都在 bard.js，打开时加载 */
function openBard() {
  loadLateScript("bard.js", () => !!window.HJBard).then(
    () => window.HJBard.open(),
    () => showToast("吟游诗人没请来，检查一下网络再试"),
  );
}


/* ==== 14. 下拉与日期选择 ==== */
/* 鼠标操作时以站内弹层代替浏览器面板；触屏保留系统选择器，日期类仅在 Chromium 上替换 */
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
  pop.hidden = true;
  pop.addEventListener("mousedown", (e) => e.preventDefault());   // 保持控件焦点
  pop.addEventListener("click", onPickClick);
  document.body.appendChild(pop);
  pick.pop = pop;
  return pop;
}

/* 优先放在控件下方 */
function placePick() {
  const { pop, anchor } = pick;
  if (!anchor) return;
  if (!anchor.isConnected || !anchor.getClientRects().length) { closePick(); return; }
  const r = anchor.getBoundingClientRect();
  const { vw, vh } = viewportSize();
  if (r.bottom < 0 || r.top > vh) { closePick(); return; }
  const below = vh - r.bottom - 14;
  const above = r.top - 14;
  const list = pop.querySelector(".hj-opt-list");
  if (list) list.style.maxHeight = `${clamp(Math.max(below, above), 120, 320)}px`;
  if (pick.kind === "select") pop.style.minWidth = `${Math.round(r.width)}px`;
  const w = pop.offsetWidth;
  const h = pop.offsetHeight;
  const top = h <= below || below >= above ? r.bottom + 6 : r.top - 6 - h;
  pop.style.left = `${clamp(r.left, 8, Math.max(8, vw - w - 8))}px`;
  pop.style.top = `${Math.max(8, top)}px`;
}

function openPick(anchor, kind) {
  closePick();
  const pop = pickPopEl();
  Object.assign(pick, { anchor, kind, start: anchor.value });
  pop.style.fontFamily = getComputedStyle(anchor).fontFamily;
  pop.style.minWidth = "";
  pop.className = `hj-pop hj-pop-${kind === "select" ? "select" : "date"}`;
  if (kind === "select") renderSelectPick();
  else {
    let d = pickParts().date || cnDate(0);
    if (pickMin() && d < pickMin()) d = pickMin();
    if (pickMax() && d > pickMax()) d = pickMax();
    Object.assign(pick, { y: +d.slice(0, 4), m: +d.slice(5, 7), months: false });
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
  /* 日期时间 / 时间：选择过程只发 input，关闭时再发 change */
  if (pick.kind !== "select" && pick.kind !== "date" && anchor.value !== pick.start) {
    anchor.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function closePickToAnchor() {
  const el = pick.anchor;
  closePick();
  el.focus();
}

function pickSetValue(v, change) {
  const el = pick.anchor;
  if (el.value === v) return;
  el.value = v;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  if (change) el.dispatchEvent(new Event("change", { bubbles: true }));
}

/* 下拉框 */
function renderSelectPick() {
  const items = [];
  let html = "";
  const addOpt = (o, inGroup) => {
    if (o.hidden) return;
    const cls = ["hj-opt"];
    if (inGroup) cls.push("in-group");
    if (o.disabled || (inGroup && o.parentElement.disabled)) cls.push("is-disabled");
    if (o.selected) cls.push("is-selected", "is-active");
    html += `<div class="${cls.join(" ")}" role="option" aria-selected="${o.selected}" data-i="${items.length}">${escapeHtml(o.label)}</div>`;
    items.push(o);
  };
  for (const node of pick.anchor.children) {
    if (node.tagName === "OPTGROUP") {
      html += `<div class="hj-opt-group">${escapeHtml(node.label)}</div>`;
      for (const o of node.children) addOpt(o, true);
    } else if (node.tagName === "OPTION") addOpt(node, false);
  }
  pick.items = items;
  pick.active = items.findIndex((o) => o.selected);
  pick.pop.innerHTML = `<div class="hj-opt-list" role="listbox">${html || '<div class="hj-opt-group">无选项</div>'}</div>`;
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
  const dir = to > pick.active ? 1 : -1;
  while (i >= 0 && i < opts.length && !ok(i)) i += dir;
  if (!ok(i)) return;
  opts.forEach((el, k) => el.classList.toggle("is-active", k === i));
  pick.active = i;
  opts[i].scrollIntoView({ block: "nearest" });
}

/* 日期 / 日期时间 / 时间 */
const pickHasDate = () => pick.kind !== "time";
const pickHasTime = () => pick.kind !== "date";
const pickMin = () => (pick.anchor.min || "").slice(0, 10);
const pickMax = () => (pick.anchor.max || "").slice(0, 10);
const pickDayOk = (key) => (!pickMin() || key >= pickMin()) && (!pickMax() || key <= pickMax());
const pickRangeOk = (first, last) => (!pickMin() || last >= pickMin()) && (!pickMax() || first <= pickMax());
const monthFirst = (y, m) => `${y}-${pad2(m)}-01`;
const monthLast = (y, m) => `${y}-${pad2(m)}-${pad2(new Date(y, m, 0).getDate())}`;

/* → { date, h, m }，未填的时间为 -1 */
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

function pickNavOk(dir) {
  if (pick.months) {
    const y = pick.y + dir;
    return pickRangeOk(monthFirst(y, 1), monthLast(y, 12));
  }
  const d = new Date(pick.y, pick.m - 1 + dir, 1);
  return pickRangeOk(monthFirst(d.getFullYear(), d.getMonth() + 1), monthLast(d.getFullYear(), d.getMonth() + 1));
}

const chevron = (d) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
const disabledIf = (off) => (off ? " disabled" : "");

function renderDatePick() {
  const parts = pickParts();
  const today = cnDate(0);
  let cal = "";
  if (pickHasDate()) {
    const { y, m, months } = pick;
    cal += `<div class="hj-date-head">
      <button type="button" class="hj-date-title" data-act="mode" title="${months ? "回到日期" : "选月份"}">${months ? `${y}年` : `${y}年${m}月`}${chevron(months ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6")}</button>
      <span class="hj-date-navs">
        <button type="button" class="hj-date-nav" data-act="prev" aria-label="${months ? "上一年" : "上个月"}"${disabledIf(!pickNavOk(-1))}>${chevron("M14.5 5l-7 7 7 7")}</button>
        <button type="button" class="hj-date-nav" data-act="next" aria-label="${months ? "下一年" : "下个月"}"${disabledIf(!pickNavOk(1))}>${chevron("M9.5 5l7 7-7 7")}</button>
      </span>
    </div>`;
    let cells = "";
    if (months) {
      for (let mm = 1; mm <= 12; mm++) {
        const ym = monthFirst(y, mm).slice(0, 7);
        const cls = ["hj-month"];
        if (today.startsWith(ym)) cls.push("is-today");
        if (parts.date.startsWith(ym)) cls.push("is-pick");
        cells += `<button type="button" class="${cls.join(" ")}" data-month="${mm}"${disabledIf(!pickRangeOk(monthFirst(y, mm), monthLast(y, mm)))}>${mm}月</button>`;
      }
      cal += `<div class="hj-month-grid">${cells}</div>`;
    } else {
      const firstWeekday = (new Date(y, m - 1, 1).getDay() + 6) % 7;   // 周一起始
      for (let i = 0; i < 42; i++) {
        const d = new Date(y, m - 1, 1 - firstWeekday + i);
        const key = ymdKey(d);
        const cls = ["hj-day"];
        if (d.getMonth() !== m - 1) cls.push("is-out");
        if (key === today) cls.push("is-today");
        if (key === parts.date) cls.push("is-pick");
        cells += `<button type="button" class="${cls.join(" ")}" data-date="${key}"${disabledIf(!pickDayOk(key))}>${d.getDate()}</button>`;
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
  if (pickHasDate()) foot.push(`<button type="button" class="hj-date-btn" data-act="today"${disabledIf(!pickDayOk(today))}>今天</button>`);
  if (pickHasTime()) foot.push('<button type="button" class="hj-date-btn is-main" data-act="done">完成</button>');
  pick.pop.innerHTML = `<div class="hj-date-main">${cal}${time}</div><div class="hj-date-foot">${foot.join("")}</div>`;
}

function rerenderDatePick() {
  renderDatePick();
  pick.pop.querySelectorAll(".hj-time-col").forEach(centerPickedTime);
  placePick();
}

function centerPickedTime(col) {
  const cell = col.querySelector(".is-pick") || col.firstElementChild;
  col.scrollTop = cell.offsetTop - col.offsetTop - (col.clientHeight - cell.offsetHeight) / 2;
}

/* 只更新高亮，保持时间列的滚动位置 */
function pickDateSet(parts) {
  pickSetValue(pickCompose(parts), pick.kind === "date");
  const now = pickParts();
  pick.pop.querySelectorAll(".hj-day, .hj-month").forEach((b) => {
    b.classList.toggle("is-pick", b.dataset.date ? b.dataset.date === now.date
      : `${pick.y}-${pad2(+b.dataset.month)}` === now.date.slice(0, 7));
  });
  pick.pop.querySelectorAll("[data-hour]").forEach((b) => b.classList.toggle("is-pick", +b.dataset.hour === now.h));
  pick.pop.querySelectorAll("[data-minute]").forEach((b) => b.classList.toggle("is-pick", +b.dataset.minute === now.m));
}

function pickDate(date) {
  const parts = pickParts();
  if (pick.kind === "date") {
    pickSetValue(date, true);
    closePickToAnchor();
    return;
  }
  const y = +date.slice(0, 4);
  const m = +date.slice(5, 7);
  const flip = y !== pick.y || m !== pick.m || pick.months;
  Object.assign(pick, { y, m, months: false });
  if (!flip) { pickDateSet({ ...parts, date }); return; }
  pickSetValue(pickCompose({ ...parts, date }));
  rerenderDatePick();
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
  const { act, month, date, hour, minute } = btn.dataset;
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
  } else if (month) {
    pick.m = +month;
    pick.months = false;
    rerenderDatePick();
  } else if (date) {
    pickDate(date);
  } else if (hour || minute) {
    const parts = pickParts();
    const next = { date: parts.date || cnDate(0), h: Math.max(parts.h, 0), m: Math.max(parts.m, 0) };
    if (hour) next.h = +hour;
    if (minute) next.m = +minute;
    pickDateSet(next);
  } else if (act === "today") {
    pickDate(cnDate(0));
  } else if (act === "clear") {
    pickSetValue("", pick.kind === "date");
    closePickToAnchor();
  } else if (act === "done") {
    closePickToAnchor();
  }
}

/* 返回 true 表示已处理，不再向外传递 */
function onPickKey(e) {
  if (e.key === "Escape") { closePickToAnchor(); return true; }
  if (e.key === "Tab") { closePick(); return false; }
  if (pick.kind !== "select") {
    if (e.key === "Enter" && pickHasTime()) { closePickToAnchor(); return true; }
    return false;
  }
  const last = pick.items.length - 1;
  const moves = {
    ArrowDown: pick.active + 1, ArrowUp: pick.active - 1, Home: 0, End: last,
    PageDown: pick.active + 8, PageUp: pick.active - 8,
  };
  if (e.key in moves) pickSelectMove(clamp(moves[e.key], 0, last));
  else if (e.key === "Enter" || e.key === " ") pickSelectChoose(pick.active);
  else return e.key.length === 1;
  return true;
}

/* 点外部关闭弹层时，吞掉随后的 click */
function swallowNextClick() {
  const eat = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };
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
    e.preventDefault();
    t.focus();
    if (pick.anchor === t) closePick();
    else openPick(t, "select");
  }, true);
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (pick.pointer === "touch" || !pickableDate(t)) return;
    if (pick.anchor !== t) { openPick(t, t.type); return; }
    /* 再点日历图标收起 */
    const r = t.getBoundingClientRect();
    if (e.clientX > r.right - parseFloat(getComputedStyle(t).paddingRight) - 28) closePick();
  }, true);
  document.addEventListener("keydown", (e) => {
    if (pick.anchor) {
      if (onPickKey(e)) {
        e.preventDefault();
        e.stopPropagation();
      }
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
  document.addEventListener("input", (e) => {
    if (!e.isTrusted || e.target !== pick.anchor || pick.kind === "select") return;
    const d = pickParts().date;
    if (d) Object.assign(pick, { y: +d.slice(0, 4), m: +d.slice(5, 7), months: false });
    rerenderDatePick();
  }, true);
  document.addEventListener("scroll", (e) => {
    if (pick.anchor && !pick.pop.contains(e.target)) placePick();
  }, true);
  window.addEventListener("resize", closePick);
  window.addEventListener("blur", closePick);
}


/* ==== 15. 启动 ==== */
/* 站点状态：分享功能、人机验证、星芒节、弹窗公告、花语开关、服务器时间 */
async function loadSiteState() {
  const sentAt = Date.now();
  const data = await callWorker({ action: "get_site_state" });
  if (!data || !data.ok) {
    applyStarlight(storage.json(STORE.starlight));
    return;
  }
  syncServerClock(Number(data.now), sentAt, Date.now());
  siteLockdown = !!data.lockdown;
  /* 旧版 Worker 的站点状态里没有 maintenance 时单独查询 */
  if ("maintenance" in data) applyMaintenance(!!data.maintenance);
  else callWorker({ action: "get_maintenance" }).then((d) => { if (d && d.ok) applyMaintenance(!!d.value); });
  applyCaptchaEnabled(data.captcha !== false);
  applyStarlight(data.starlight);
  applySitePopup(data.popup);
  applyHuayuMode(data.huayu);
  puzzleSiteState = data.puzzle || null;
}

/* 全站弹窗：Esc 关闭最上层，打开时聚焦关闭按钮 */
const MODALS = [
  { overlay: "infoOverlay", closeBtn: "infoClose", close: closeInfoModal },
  { overlay: "groupOverlay", closeBtn: "groupClose", close: closeGroupModal },
  { overlay: "siteAboutOverlay", closeBtn: "siteAboutClose", close: closeSiteAbout },
  { overlay: "ticketGuideOverlay", closeBtn: "ticketGuideClose", close: () => closeTicketGuide() },
  { overlay: "captchaOverlay", closeBtn: "captchaClose", close: closeCaptcha },
  { overlay: "ticketNoticeOverlay", closeBtn: "ticketNoticeClose", close: () => closeTicketNotice() },
  { overlay: "adminModalOverlay", closeBtn: "adminModalClose", close: () => closeAdminPanel() },
  { overlay: "alarmOverlay", closeBtn: "alarmClose", close: closeAlarmModal },
  { overlay: "huayuOverlay", closeBtn: "huayuClose", close: closeHuayuModal },
  { overlay: "puzzleOverlay", closeBtn: "puzzleClose", close: closePuzzle },
  { overlay: "sitePopupOverlay", closeBtn: "sitePopupClose", close: closeSitePopup },
  { overlay: "lightboxOverlay", closeBtn: "lightboxClose", close: closeLightbox },
];
const CLOSE_PRESS_MS = 160;

const modalOpen = (m) => !$(m.overlay).hidden;
const anyModalOpen = () => MODALS.some(modalOpen);

function closeAllModals() {
  MODALS.filter(modalOpen).forEach((m) => m.close());
}

function initA11y() {
  /* 首页卡片（role="button"）支持回车、空格 */
  document.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches?.("main .tile[role='button']")) {
      e.preventDefault();
      e.target.click();
    }
  });

  /* 大图、公告预览总在最上层 */
  const byId = (id) => MODALS.find((m) => m.overlay === id);
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const top = [byId("lightboxOverlay"), byId("sitePopupOverlay"), ...MODALS].find(modalOpen);
    if (top && !$(top.overlay).dataset.closeOnlyX) top.close();
  });

  MODALS.forEach(({ overlay, closeBtn, close }) => {
    const el = $(overlay);
    const btn = $(closeBtn);
    new MutationObserver(() => { if (!el.hidden) btn.focus(); }).observe(el, { attributes: true, attributeFilter: ["hidden"] });
    /* 圆形 × 保持按下态片刻再关闭 */
    if (!btn.matches(".info-close, .lightbox-close")) return;
    btn.addEventListener("click", (e) => {
      if (prefersReducedMotion()) return;
      e.stopImmediatePropagation();
      if (btn.classList.contains("is-closing")) return;
      btn.classList.add("is-closing");
      setTimeout(() => {
        if (!el.hidden) close();
        btn.classList.remove("is-closing");
      }, CLOSE_PRESS_MS);
    }, true);
  });
}

/* 离线缓存（sw.js）与常用图片预取，慢网络下不预取 */
function initOfflineCache() {
  const sw = "serviceWorker" in navigator && window.isSecureContext ? navigator.serviceWorker : null;
  const controlled = !sw ? Promise.resolve()
    : sw.register(`sw.js?v=${HJ.version}`)
      .then(() => (sw.controller ? null : new Promise((r) => {
        sw.addEventListener("controllerchange", r, { once: true });
        setTimeout(r, 4000);
      })))
      .catch(() => {});
  if (isSlowNetwork()) return;
  const urls = [
    LATEST_EVENT.cover && resizedSrc(LATEST_EVENT.cover, 1280),
    ...(LATEST_EVENT.poster?.images || []).map((src) => resizedSrc(src, 1280)),
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

function initApp() {
  const booting = document.documentElement.classList.contains("boot-pending");
  /* 各部分互不影响：某个脚本没加载成功时其余功能照常 */
  [
    initResizedFallback, initDayNight, initCardBackdrops, initHomeVideo, initDetailTabs, initTabVideos, initNav,
    initMasonryResize, initLikes, initFxToggle, initInfo, initSiteAbout, initLightbox, initCaptcha,
    () => initTicket(), () => initVenue(),
    initClickBurst, initA11y, initVolume, initHeaderPanels, initCalWidget, initAlarm, initHuayu, initPuzzle, initPickers,
    initClock, initHashRoute, initSitePopup, loadSiteState,
  ].forEach((init) => {
    try { init(); } catch (e) { console.error(e); }
  });
  HJ.late(initOfflineCache);

  /* 进站后弹出花街介绍（直接进入购票页时除外） */
  HJ.boot.appReady(() => {
    playPageEnterStagger();
    if (!$("view-ticket").hidden || maintenanceActive()) return;
    firstBootInfoOpen = true;
    openInfoModal();
  }, booting ? [HJ.boot.warm(INFO_BG_IMAGE, true)] : []);
}

document.addEventListener("DOMContentLoaded", initApp);
