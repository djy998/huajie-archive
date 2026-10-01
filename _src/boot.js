/* 花舞之街 · 启动：样式表、动画档位、开屏。window.HJ = { version, fx, day, late, boot } */
(() => {
  const root = document.documentElement;
  const version = new URL(document.currentScript.src).searchParams.get("v") || "";
  const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const VISITED_KEY = "hj_visited_2";

  /* 直接打开购票页或问卷时不显示开屏 */
  const hash = location.hash;
  const fresh = !get(VISITED_KEY) && hash !== "#ti" && hash !== "#survey";
  root.classList.add(fresh ? "boot-pending" : "css-wait");
  if (hash === "#ti" && (get("hj_ticket_look") || "")[0] === "1") root.classList.add("hj-ticket-bare");

  let fx = get("hj_fx_level");
  if (["full", "lite", "off"].indexOf(fx) < 0) fx = reduce ? "off" : innerWidth > 760 ? "full" : "lite";

  const hour = new Date().getHours();
  const day = hour >= 6 && hour < 18;
  const portrait = matchMedia("(max-aspect-ratio: 4/5)").matches;
  const sky = `assets/site/sky-${day ? "day" : "night"}${portrait ? "-p" : ""}.webp`;

  function addLink(rel, href, extra) {
    const link = Object.assign(document.createElement("link"), { rel, href }, extra);
    document.head.appendChild(link);
    return link;
  }

  function cssReady() {
    if (root.classList.contains("css-ready")) return;
    root.classList.remove("css-wait");
    root.classList.add("css-ready");
    document.dispatchEvent(new Event("hj:cssready"));
  }
  const css = addLink("stylesheet", `style.css?v=${version}`);
  css.onload = css.onerror = cssReady;
  setTimeout(cssReady, 8000);

  if (!fresh) {
    addLink("preload", sky, { as: "image" });
    addLink("preload", `assets/site/tile-latest-${day ? "day" : "night"}.webp`, { as: "image" });
    addLink("preload", "assets/site/brush.woff2", { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  }

  /* 进站后空闲时执行 */
  let late = [];
  let lateOpen = false;
  let loaded = false;
  const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(() => fn(), { timeout: 3000 }) : setTimeout(fn, 600));
  function openLate() {
    if (lateOpen || !loaded || root.classList.contains("boot-pending")) return;
    lateOpen = true;
    setTimeout(() => { late.forEach(idle); late = []; }, 800);
  }
  addEventListener("load", () => { loaded = true; openLate(); });

  const HJ = window.HJ = {
    version,
    fx,
    day,
    late: (fn) => (lateOpen ? idle(fn) : late.push(fn)),
    boot: null,
  };

  HJ.late(() => addLink("stylesheet", `assets/fonts/fonts.css?v=${version}`));
  HJ.late(() => {
    const s = document.createElement("script");
    s.src = "https://static.cloudflareinsights.com/beacon.min.js/v31edd6df95cf4e85bb4c19e7a9bdbcba1788362987495";
    s.integrity = "sha512-iIg7k2xntmwu6/uSb5tpc/hySgZc4eoL31yB29W6tJFo2akwjPWcEqnCEdJvGexCL0KEQwVYv5BlowfhVz26hg==";
    s.type = "module";
    s.crossOrigin = "anonymous";
    s.dataset.cfBeacon = '{"version":"2024.11.0","token":"1954b47c125f43f8b4338b3c4f804e4f","spa":2}';
    document.head.appendChild(s);
  });

  /* 开屏：点击后转两圈，资源未齐则继续转圈；样式表与主程序必须等到，图片字体最多再等 WAIT_MAX */
  const SPIN_MS = 1000;
  const LOOP_MS = 700;
  const WAIT_MAX = 1800;
  const WAIT_GRACE = 700;

  let clicked = false;
  let spun = false;
  let done = false;
  let looping = false;
  let finishing = false;
  let clickAt = 0;
  let spinEndAt = 0;
  let appAt = 0;
  let onEnter = null;
  let assetsReady = false;
  let afterAssets = [];

  function runAfterAssets() {
    if (!afterAssets) return;
    const list = afterAssets;
    afterAssets = null;
    list.forEach((fn) => fn());
  }

  /* 下载并解码图片，短暂持有引用以免被回收 */
  const kept = new Set();
  function warm(src, high) {
    return new Promise((resolve) => {
      if (!src) { resolve(); return; }
      const im = new Image();
      const finish = () => {
        resolve();
        setTimeout(() => kept.delete(im), 20000);
      };
      kept.add(im);
      im.decoding = "async";
      if (high) im.fetchPriority = "high";
      im.onload = () => (im.decode ? im.decode().then(finish, finish) : finish());
      im.onerror = finish;
      im.src = src;
    });
  }

  function warmFont(href) {
    return new Promise((resolve) => {
      const link = addLink("preload", href, { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
      if (!(link.relList && link.relList.supports && link.relList.supports("preload"))) return resolve();
      link.onload = link.onerror = () => resolve();
    });
  }

  HJ.boot = {
    warm,
    appReady(fn, waitFor) {
      onEnter = fn;
      appAt = performance.now();
      if (!fresh) return;
      Promise.all((waitFor || []).concat([skyReady, warmFont("assets/site/brush.woff2")])).then(() => {
        assetsReady = true;
        runAfterAssets();
        tryEnter();
      });
      tryEnter();
    },
    afterAssets(fn) {
      if (!fresh || !afterAssets) fn();
      else afterAssets.push(fn);
    },
  };
  if (!fresh) return;

  const overlay = document.getElementById("bootOverlay");
  const btn = document.getElementById("bootImageBtn");
  const img = document.getElementById("bootImage");

  const skyReady = new Promise((resolve) => {
    const go = () => warm(sky, true).then(() => {
      const base = document.getElementById("skyBase");
      if (base && !base.style.backgroundImage) base.style.backgroundImage = `url('${sky}')`;
      root.classList.add("sky-ready");
      resolve();
    });
    if (img.complete) go();
    else {
      img.addEventListener("load", go);
      img.addEventListener("error", go);
    }
  });

  /* [宽高比, 编号]，同 config.js 的 DAY_FX_LEAVES */
  const LEAVES = [[1.6, "01"], [1.1, "02"], [0.807, "03"], [1.257, "04"], [1.086, "05"],
    [0.949, "06"], [0.864, "07"], [1.517, "08"], [0.568, "09"]];
  const leafSrc = (n) => `assets/site/leaf-${n}.webp`;
  const rand = (a, b) => a + Math.random() * (b - a);
  if (day && fx !== "off") skyReady.then(() => LEAVES.forEach((l) => warm(leafSrc(l[1]))));

  function burst(anchor) {
    const full = fx === "full";
    const box = anchor.getBoundingClientRect();
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    const r = box.width * 0.42;
    const layer = document.createElement("div");
    layer.id = "bootFx";
    if (full) layer.className = "is-full";
    layer.setAttribute("aria-hidden", "true");
    const add = (cls, x, y, w, h, css) => {
      const el = document.createElement("span");
      el.className = cls;
      el.style.cssText = `left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;width:${w.toFixed(1)}px;height:${h.toFixed(1)}px;${css}`;
      layer.appendChild(el);
    };
    const delay = (i, n, lo, hi) => (i < n * 0.6 ? 0 : rand(lo, hi)).toFixed(2);
    if (day) {
      const n = full ? 100 : 30;
      for (let i = 0; i < n; i++) {
        const leaf = LEAVES[Math.floor(Math.random() * LEAVES.length)];
        const a = Math.random() * Math.PI * 2;
        const d = rand(90, 330);
        const s = rand(15, 31);
        add("boot-petal", cx + Math.cos(a) * r * rand(0.5, 1), cy + Math.sin(a) * r * rand(0.5, 1), s, s / leaf[0],
          `background-image:url('${leafSrc(leaf[1])}');--bx:${(Math.cos(a) * d).toFixed(1)}px;--by:${(Math.sin(a) * d).toFixed(1)}px;`
          + `--br:${rand(-200, 200).toFixed(0)}deg;animation-duration:${rand(1.05, 1.6).toFixed(2)}s;animation-delay:${delay(i, n, 0.12, 0.3)}s`);
      }
    } else {
      let n = full ? 60 : 22;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = rand(80, 300);
        const s = rand(3, 6.5);
        add("boot-star", cx + Math.cos(a) * r * rand(0.6, 1), cy + Math.sin(a) * r * rand(0.6, 1), s, s,
          `--bx:${(Math.cos(a) * d).toFixed(1)}px;--by:${(Math.sin(a) * d).toFixed(1)}px;`
          + `animation-duration:${rand(0.7, 1.15).toFixed(2)}s;animation-delay:${delay(i, n, 0.1, 0.25)}s`);
      }
      n = full ? 120 : 30;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = r * rand(0.7, 2.6);
        const s = rand(2, 4.5);
        add("boot-twinkle", cx + Math.cos(a) * d, cy + Math.sin(a) * d, s, s,
          `animation-duration:${rand(0.3, 0.6).toFixed(2)}s;animation-delay:${rand(0, 0.7).toFixed(2)}s;`
          + `animation-iteration-count:${1 + Math.floor(Math.random() * 3)}`);
      }
    }
    document.body.appendChild(layer);
    setTimeout(() => layer.remove(), 2400);
  }

  const deadline = () => Math.max(spinEndAt + WAIT_MAX, appAt + WAIT_GRACE);
  const ready = () => !!onEnter && root.classList.contains("css-ready") && (assetsReady || performance.now() >= deadline());

  let enterTimer = 0;
  function tryEnter() {
    if (done || !clicked || !spun || finishing) return;
    if (!ready()) {
      startLoop();
      if (onEnter && root.classList.contains("css-ready")) {
        clearTimeout(enterTimer);
        enterTimer = setTimeout(tryEnter, Math.max(50, deadline() - performance.now() + 20));
      }
      return;
    }
    if (looping) finishLoop();
    else setTimeout(reveal, Math.max(0, clickAt + (fx === "full" ? 1200 : SPIN_MS) - performance.now()));
  }

  let loopStart = 0;
  let hintTimer = 0;
  function startLoop() {
    if (!hintTimer) hintTimer = setTimeout(() => { if (!done) overlay.classList.add("is-waiting"); }, reduce ? 0 : 1500);
    if (looping || reduce) return;
    looping = true;
    img.classList.add("is-looping");
    loopStart = performance.now();
  }

  function finishLoop() {
    finishing = true;
    const anim = img.getAnimations ? img.getAnimations()[0] : null;
    const t = anim && typeof anim.currentTime === "number" ? anim.currentTime : performance.now() - loopStart;
    const k = t / LOOP_MS;
    const n = Math.floor(k) + (k % 1 > 0.8 ? 2 : 1);
    img.style.animationIterationCount = String(n);
    const finish = () => {
      if (done) return;
      img.classList.remove("is-looping");
      img.style.animationIterationCount = "";
      reveal();
    };
    img.addEventListener("animationend", finish, { once: true });
    setTimeout(finish, (n - k) * LOOP_MS + 120);
  }

  function reveal() {
    if (done) return;
    done = true;
    clearTimeout(enterTimer);
    if (window.pageYOffset) {
      root.style.scrollBehavior = "auto";
      window.scrollTo(0, 0);
      root.style.scrollBehavior = "";
    }
    root.classList.remove("boot-pending");
    if (fx !== "off" && !reduce) {
      root.classList.add("boot-leaving");
      setTimeout(() => {
        root.classList.remove("boot-leaving");
        overlay.style.display = "none";
      }, 480);
    } else {
      overlay.style.display = "none";
    }
    runAfterAssets();
    onEnter();
    openLate();
  }

  function enter() {
    if (clicked) return;
    clicked = true;
    clickAt = performance.now();
    try { localStorage.setItem(VISITED_KEY, "1"); } catch (e) {}
    btn.disabled = true;
    img.classList.add("is-spinning");
    if (fx !== "off" && !reduce) burst(btn);
    const spinDone = () => {
      if (spun) return;
      spun = true;
      spinEndAt = performance.now();
      img.classList.remove("is-spinning");
      tryEnter();
    };
    img.addEventListener("animationend", (e) => { if (e.animationName === "bootSpin") spinDone(); });
    setTimeout(spinDone, SPIN_MS + 60);
  }

  document.addEventListener("hj:cssready", tryEnter);
  btn.addEventListener("click", enter);
  /* 微信、QQ 内置浏览器的 click 不稳定 */
  btn.addEventListener("touchend", (e) => {
    e.preventDefault();
    enter();
  }, { passive: false });
})();
