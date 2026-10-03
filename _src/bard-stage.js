/* 花舞之街 · 舞台演奏（音游）。吟游诗人模拟器「高级功能」里的按钮按需加载（bard.js → loadLateScript），全屏演出。
   - 曲子全部来自 MIDI（吟游诗人演奏用的单乐器 MIDI）：谱面挑出来的音是气泡，由你弹；MIDI 里其余的音
     （和声、谱面省掉的旋律音）由游戏按时间用轻音补上，整首曲子始终完整。不再有伴奏 / 示范音轨
   - 玩法：每个气泡出现在这个音的高度上（越往上音越高），外圈一边收缩一边等你，
     外圈缩到和核心重合的那一下就是判定点。弹中就用模拟器的乐器发出这个音
   - 两种操作（设置里可改，默认点气泡；选「自动」时按设备选）：
     · 点气泡（手机、平板）：直接点气泡，点在旁边一点也算（判定半径约一个气泡直径）；气泡沿着旋律左右铺开，不会叠在一起；
       电脑上鼠标指着气泡按键盘任意键也算点（放水模式不用按）
     · 键盘轨道（电脑）：屏幕按宽度分成 2~4 条轨道（自动或手选），气泡在哪条轨道就按那条的键；
       按 e.code 认键，开着中文输入法也能弹；鼠标点轨道也行
   - 时钟：模拟器 AudioContext 的 currentTime（补音也排在这个钟上），帧间用 performance.now() 补齐；
     画面与判定 = 音频位置 − 输出延迟 − 判定延迟。暂停、切后台、学习模式都是停这个钟，不会错拍
   - 「示范旋律」：你要弹的音也先轻轻放出来，可以照着弹
   - 开头有四拍轻声预备拍（3·2·1），第一个气泡前就知道速度
   - 学习模式：不计分，气泡缩到判定点还没弹，音乐就停在这一拍，弹中才继续
   - 判定四档 Perfect / Great / Good / Miss，没有血量、不会失败；漏掉的音不出声
   - 判定模式（设置里可改）：正常（默认，判定窗随难度收紧）/ 宽松（三档难度都用轻松的判定窗）/
     放水（判定窗同宽松，不用点：指针停在气泡上，到点就算弹中）。本机纪录按 曲目 × 难度 × 判定模式 分开记
   - 声像固定居中（不跟着左右位置偏）；音量跟随全站音量
   - 界面：大厅（当前曲目、难度、模式、开始）/ 选曲窗口（搜索、分类与星级筛选、试听）/ 设置窗口（音量、音色、示范旋律、
     操作方式、轨道与键位、判定模式、判定延迟与校准）/ 玩法说明。Esc、手机返回键都是「回到上一层」
   - 曲目索引 assets/bard/stage/songs.json，每首的谱面 charts/<id>.json 点到才下载（_src/tools/stage-build 从 MIDI 生成） */
(() => {
  const BASE = "assets/bard/stage/";
  const K = {
    song: "hj_stage_song", diff: "hj_stage_diff", learn: "hj_stage_learn", demo: "hj_stage_demo", inst: "hj_stage_inst",
    input: "hj_stage_input", lanes: "hj_stage_lanes", codes: "hj_stage_codes", delay: "hj_stage_delay", judge: "hj_stage_judge", render: "hj_stage_render", range: "hj_stage_range",
    best: "hj_stage_best2", stars: "hj_stage_stars", cat: "hj_stage_cat",   // best2：换成 MIDI 曲库后重新记
  };
  /* 判定半窗（秒）：Perfect / Great / Good。正常判定按难度收紧；宽松、放水三档难度都用 LOOSE_WIN（= 轻松那档） */
  const LOOSE_WIN = [0.18, 0.3, 0.45];
  /* approach：气泡提前多久出现；win：正常判定的半窗；size：键盘模式气泡占轨道宽的比例；tap：点气泡模式占屏幕短边的比例 */
  const DIFFS = [
    { id: "easy", label: "轻松", approach: 1.8, win: [0.18, 0.3, 0.45], size: 0.44, tap: 0.24 },
    { id: "normal", label: "标准", approach: 1.35, win: [0.14, 0.24, 0.36], size: 0.38, tap: 0.21 },
    { id: "hard", label: "挑战", approach: 1.05, win: [0.11, 0.19, 0.29], size: 0.32, tap: 0.2 },
  ];
  const JUDGE_MODES = [{ id: "normal", label: "正常" }, { id: "loose", label: "宽松" }, { id: "hover", label: "放水" }];
  const HOVER_R = 0.8;                                  // 放水模式：指针离气泡中心不到这么多个气泡直径就算「在气泡上」
  /* 输入：判 MISS 再多等 INPUT_GRACE 秒，免得排队中的点按还没处理、音就先被判漏了。TAP_R：点气泡的判定半径（气泡直径的倍数）
     点按排队的时间用 e.timeStamp 补回来，但最多补 TS_MAX 秒；有的手机浏览器（如一些 App 内置浏览器）的 timeStamp
     不是 performance.now 的时基，一旦对不上就整局不再用 */
  const INPUT_GRACE = 0.1;
  const TS_MAX = 0.05;
  /* 点击范围（设置里选）：r 为判定半径、next 为「下一个该弹的（外圈加粗那个）附近没别的气泡可算时」的放宽半径，都是气泡直径的倍数 */
  const TAP_RANGES = { normal: { label: "正常", r: 1.4, next: 1.7 }, loose: { label: "宽松", r: 1.7, next: 2.2 } };
  const NEXT_LEAD = 0.3;                                // 下一个该弹的气泡离判定点不到这么多秒才加粗外圈（太早加粗会让人一亮就点、早一拍）
  const JUDGE = [
    { id: "perfect", label: "PERFECT", pts: 300, vel: 1 },
    { id: "great", label: "GREAT", pts: 200, vel: 0.9 },
    { id: "good", label: "GOOD", pts: 100, vel: 0.8 },
    { id: "miss", label: "MISS", pts: 0, vel: 0 },
  ];
  const LEVEL = { easy: 3, normal: 2, hard: 1 };       // 谱面里 lvl ≥ 这个数的音由玩家弹（charts/<id>.json）
  const BG_VEL = 0.4;                 // 补音（谱面以外的音）的力度
  const DEMO_VEL = 0.5;               // 示范旋律：你要弹的音先放一遍的力度
  const PREVIEW = { sec: 8, vel: 0.6 };                 // 试听：从第一个音起放 8 秒
  const AHEAD = 0.12;                 // 补音提前多少秒排进 Web Audio
  const TICK = { midi: 88, vel: 0.32, inst: "harp" };   // 预备拍、校准的「嗒」
  const CAL = { lead: 1.2, gap: 0.6, count: 10 };       // 校准：第一下在 1.2 秒，之后每 0.6 秒一下
  const LMIN = 2, LMAX = 4;
  const DEF_CODES = { 2: ["KeyF", "KeyJ"], 3: ["KeyF", "Space", "KeyJ"], 4: ["KeyD", "KeyF", "KeyJ", "KeyK"] };
  const BINDABLE = /^(Key[A-Z]|Digit\d|Numpad\d|Space|Arrow(Left|Right|Up|Down)|Semicolon|Quote|Comma|Period|Slash|Backslash|BracketLeft|BracketRight|Minus|Equal|Backquote|ShiftLeft|ShiftRight)$/;
  const CODE_LABEL = {
    Space: "空格", ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓", Semicolon: ";", Quote: "'", Comma: ",",
    Period: ".", Slash: "/", Backslash: "\\", BracketLeft: "[", BracketRight: "]", Minus: "-", Equal: "=", Backquote: "`",
    ShiftLeft: "左 Shift", ShiftRight: "右 Shift",
  };
  const BAND_COLORS = ["241 192 122", "239 163 180", "198 174 245", "150 212 232"];   // 按音高：低 → 高
  const PALETTE = [...BAND_COLORS, "150 226 180", "246 150 120"];   // 后两色只在挨得近、撞色时补位
  const NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
  const ICON = {
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>',
    gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/></svg>',
    help: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.6"/><path d="M9.6 9.6a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.5"/><path d="M12 16.9v.2"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6.5v11M15 6.5v11"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="f" d="M8.5 6v12l10-6z"/></svg>',
    stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect class="f" x="7.5" y="7.5" width="9" height="9" rx="1.5"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="M19.5 19.5l-4-4"/></svg>',
    note: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 17.5V6.5l10-2v11"/><circle class="f" cx="6.6" cy="17.6" r="2.4"/><circle class="f" cx="16.6" cy="15.6" r="2.4"/></svg>',
    list: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7h11M8 12h11M8 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01"/></svg>',
  };

  const S = {
    built: false, root: null, data: null, tags: [], loading: null, err: "", charts: new Map(),
    view: "lobby", sheet: "", sheetBack: null,
    song: null, diff: "normal", learn: false, demo: false, inst: "", input: "tap", lanesPref: "auto", judge: "normal", render: "normal", range: "normal",
    codes: null, delayMs: 0, stars: 0, cat: "", query: "", binding: -1, cal: null, calMsg: "",
    gen: 0, mode: "tap", lanes: 4, notes: [], judged: null, next: 0, lo: 60, hi: 72, g: null,
    bg: [], bgAll: [], bgList: [], bgNext: 0, ticks: [], tickNext: 0, firstT: 0, lastT: 0, endT: 0, startT: 0, spb: 0.5,
    playing: false, paused: false, frozen: false, hover: null, waiting: null, frozenT: 0, finished: false,
    score: 0, combo: 0, maxCombo: 0, counts: null, learnHits: 0,
    raf: 0, pump: 0, els: new Map(), clock: null, bannerKey: "",
    preview: { id: "", timer: 0, clock: null, list: null, i: 0 },
    bgmWasOn: false, closeTimer: 0, hist: false, closing: false, needTap: false,
  };

  /* ==== 工具（storage、showToast、siteVolume、bgm 是 main.js 的全局） ==== */
  const $id = (x) => document.getElementById(x);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const num = (v, d) => (v !== null && v !== "" && Number.isFinite(+v) ? +v : d);
  const coarse = () => matchMedia("(pointer: coarse)").matches;
  const diffBase = () => DIFFS.find((d) => d.id === S.diff) || DIFFS[1];
  /* 当前难度，win 换成当前判定模式实际用的半窗 */
  const diffMeta = () => { const d = diffBase(); return S.judge === "normal" ? d : { ...d, win: LOOSE_WIN }; };
  const judgeTag = () => (S.judge === "loose" ? " · 宽松判定" : S.judge === "hover" ? " · 放水模式" : "");
  const judgeLabel = () => (JUDGE_MODES.find((m) => m.id === S.judge) || JUDGE_MODES[0]).label;
  /* 本机纪录按 曲目:难度:判定模式 分开记；加判定模式以前的旧纪录（曲目:难度）是按轻松那档判定弹的，算进宽松 */
  function bestOf(all, id, diff, judge) {
    return all[`${id}:${diff}:${judge}`] || (judge === "loose" ? all[`${id}:${diff}`] : null) || null;
  }
  const fmtTime = (sec) => { const n = Math.max(0, Math.round(sec)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`; };
  const fmtNum = (n) => Math.round(n).toLocaleString("en-US");
  const midiName = (m) => `${NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
  const codeLabel = (c) => CODE_LABEL[c] || (/^Key/.test(c) ? c.slice(3) : /^Digit/.test(c) ? c.slice(5) : /^Numpad/.test(c) ? `小键盘 ${c.slice(6)}` : c);
  const starText = (n) => "★".repeat(clamp(n, 1, 5)) + "☆".repeat(5 - clamp(n, 1, 5));
  /* est：MIDI 没对齐节拍网格，速度是估出来的 */
  const tempoOf = (s) => (num(s.bpm, 0) > 0 ? `${s.est ? "约 " : ""}${Math.round(s.bpm)} 拍/分` : "");
  const metaOf = (s) => [s.c, fmtTime(num(s.dur, 0)), tempoOf(s)].filter(Boolean).join(" · ");
  const getRaw = (k, d) => { const v = storage.get(k); return v === null ? d : v; };
  const setRaw = (k, v) => storage.set(k, v);
  const toast = (m) => { try { showToast(m); } catch (e) {} };
  const VOL_STUB = { level: 0.8, muted: false, set() {} };
  const vol = () => (typeof siteVolume !== "undefined" ? siteVolume : VOL_STUB);
  const bard = () => window.HJBard || {};

  /* 小号 DOM 构造：h("button", { class, text, onclick, … }, ...子节点) */
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v === undefined || v === null || v === false) continue;
        if (k === "class") el.className = v;
        else if (k === "text") el.textContent = String(v);
        else if (k === "html") el.innerHTML = v;              // 只用于本文件里的固定图标
        else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
        else if (k === "value" || k === "checked" || k === "disabled" || k === "hidden" || k === "type") el[k] = v;
        else el.setAttribute(k, v === true ? "" : String(v));
      }
    }
    kids.flat().forEach((c) => { if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : String(c)); });
    return el;
  }
  const iconBtn = (icon, label, onclick, cls = "") => h("button", { type: "button", class: `hjs-ibtn ${cls}`.trim(), "aria-label": label, title: label, html: ICON[icon], onclick });

  /* ==== 时钟 ====
     音频时间取模拟器 AudioContext 的 currentTime（bard.js 的 HJBard.clock），补音也排在它上面，所以声音和气泡不会慢慢错开；
     模拟器太旧、没有这个接口时退回 performance.now()。
     一首歌一个钟：位置 = base + (音频时间 − at)，停住时位置 = base；lat 为开钟时的输出延迟（声音从排上到听见的时间） */
  function rawClock() {
    const c = bard().clock?.();
    return c && Number.isFinite(c.t) ? c : { t: performance.now() / 1000, lat: 0, running: true };
  }
  const makeClock = (base) => ({ run: false, base, at: 0, lat: 0, sm: null });
  function clockStart(c) {
    const r = rawClock();
    c.at = r.t;
    c.lat = num(r.lat, 0);
    c.run = true;
    c.sm = null;
  }
  /* 精确位置（排程用） */
  const clockRaw = (c, r = rawClock()) => (c.run ? c.base + (r.t - c.at) : c.base);
  function clockStop(c) {
    if (!c || !c.run) return;
    c.base = clockRaw(c);
    c.run = false;
    c.sm = null;
  }
  /* 画面用的位置：currentTime 在部分浏览器更新得粗，用 performance.now() 补帧间，再慢慢校回去 */
  function clockPos(c) {
    if (!c.run) return c.base;
    const r = rawClock();
    const raw = clockRaw(c, r);
    const now = performance.now();
    const sm = c.sm;
    if (!sm || !r.running) {
      c.sm = { t: raw, raw, now, rawAt: now };
      return raw;
    }
    let t = sm.t + (now - sm.now) / 1000;
    if (raw !== sm.raw) {
      sm.raw = raw;
      sm.rawAt = now;
      const err = raw - t;
      t = Math.abs(err) > 0.06 ? raw : t + err * 0.2;
    } else if (now - sm.rawAt > 250) {
      t = Math.min(t, raw + 0.05);      // 音频卡住了：画面不能跑到声音前面
    }
    sm.t = t;
    sm.now = now;
    return t;
  }
  /* 画面与判定的时间：听到的位置，再减去玩家自己的判定延迟 */
  const songTime = () => clockPos(S.clock) - S.clock.lat - S.delayMs / 1000;

  /* ==== 偏好 ==== */
  function readPrefs() {
    const diff = getRaw(K.diff, "normal");
    S.diff = DIFFS.some((d) => d.id === diff) ? diff : "normal";
    S.learn = getRaw(K.learn, "0") === "1";
    S.demo = getRaw(K.demo, "0") === "1";
    S.inst = getRaw(K.inst, "");
    const input = getRaw(K.input, "tap");
    S.input = ["auto", "tap", "keys"].includes(input) ? input : "tap";
    const judge = getRaw(K.judge, "normal");
    S.judge = JUDGE_MODES.some((m) => m.id === judge) ? judge : "normal";
    S.render = getRaw(K.render, "normal") === "simple" ? "simple" : "normal";
    S.range = getRaw(K.range, "normal") === "loose" ? "loose" : "normal";
    applyRender();
    const ln = getRaw(K.lanes, "auto");
    S.lanesPref = ln === "auto" ? "auto" : String(clamp(num(ln, 4), LMIN, LMAX));
    S.delayMs = clamp(Math.round(num(getRaw(K.delay, 0), 0) / 5) * 5, -300, 300);
    S.stars = clamp(num(getRaw(K.stars, 0), 0), 0, 5);
    S.cat = String(getRaw(K.cat, "") || "");
    const saved = storage.json(K.codes) || {};
    S.codes = {};
    for (let n = LMIN; n <= LMAX; n++) {
      const got = Array.isArray(saved[n]) ? saved[n] : [];
      const list = DEF_CODES[n].map((d, i) => (typeof got[i] === "string" && BINDABLE.test(got[i]) ? got[i] : d));
      S.codes[n] = new Set(list).size === list.length ? list : DEF_CODES[n].slice();
    }
  }
  /* 画面：简单显示去掉气泡光晕、音名与判定字的模糊阴影（.hjs.is-simple），密集段更省 */
  function applyRender() {
    if (S.root) S.root.classList.toggle("is-simple", S.render === "simple");
  }
  const instIds = () => (bard().instruments || []).map((i) => i.id);
  function instId() {
    if (S.inst === "song") return S.song && instIds().includes(S.song.inst) ? S.song.inst : "piano";
    if (S.inst && instIds().includes(S.inst)) return S.inst;
    return (bard().instName && bard().instName()) || "piano";
  }
  const modeNow = () => (S.input === "tap" || S.input === "keys" ? S.input : coarse() ? "tap" : "keys");
  function lanesFor(w) {
    if (S.lanesPref !== "auto") return clamp(+S.lanesPref, LMIN, LMAX);
    return w < 760 ? 2 : w < 1180 ? 3 : 4;
  }
  const lanesNow = () => lanesFor((S.root && S.root.clientWidth) || window.innerWidth);

  /* ==== 曲库：songs.json 只有曲目信息，谱面 charts/<id>.json 点到这首才下载 ==== */
  const ver = () => (window.HJ && window.HJ.version) || "1";
  function loadData() {
    if (S.data) return Promise.resolve(true);
    S.loading ??= (async () => {
      try {
        const res = await fetch(`${BASE}songs.json?v=${ver()}`, { cache: "no-cache" });
        if (!res.ok) throw new Error(String(res.status));
        const json = await res.json();
        const list = (Array.isArray(json.songs) ? json.songs : []).filter((s) => s && s.id && s.t);
        if (!list.length) throw new Error("empty");
        S.data = list;
        const tags = Array.isArray(json.tags) ? json.tags.map(String) : [];
        list.forEach((s) => { if (s.tag && !tags.includes(s.tag)) tags.push(s.tag); });
        S.tags = tags.filter((t) => list.some((s) => s.tag === t));
        if (S.cat && !S.tags.includes(S.cat)) S.cat = "";
        S.err = "";
        const id = getRaw(K.song, "");
        S.song = list.find((s) => s.id === id) || list.find((s) => s.id === json.first) || list[0];
        return true;
      } catch (e) {
        S.err = "曲库没读到，检查一下网络，关掉舞台再打开试试";
        return false;
      } finally {
        S.loading = null;
      }
    })();
    return S.loading;
  }
  /* 谱面：[[距上一个音的毫秒, 音高, 级别], …] → [{ t 秒, m, l }]；同一首只下载一次，失败了下次再试 */
  function loadChart(s) {
    if (!s) return Promise.resolve(null);
    if (S.charts.has(s.id)) return S.charts.get(s.id);
    const p = fetch(`${BASE}charts/${encodeURIComponent(s.id)}.json?v=${ver()}`)
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((json) => {
        let ms = 0;
        const notes = (Array.isArray(json.n) ? json.n : []).map((row) => {
          ms += num(row[0], 0);
          return { t: ms / 1000, m: num(row[1], 60), l: num(row[2], 0) };
        });
        if (!notes.length) throw new Error("empty");
        return { notes };
      })
      .catch(() => { S.charts.delete(s.id); return null; });
    S.charts.set(s.id, p);
    return p;
  }

  function filtered() {
    const q = S.query.trim().toLowerCase();
    return (S.data || []).filter((s) => {
      if (S.cat && s.tag !== S.cat) return false;
      if (S.stars && clamp(num(s.diff, 3), 1, 5) !== S.stars) return false;
      if (!q) return true;
      return [s.t, s.o, s.c, s.tag].some((x) => String(x || "").toLowerCase().includes(q));
    });
  }
  function pickSong(s) {
    S.song = s;
    setRaw(K.song, s.id);
  }

  /* ==== 外壳 ==== */
  function build() {
    if (S.built) return;
    const root = h("div", { class: "hjs", id: "hjStage", hidden: true, role: "dialog", "aria-modal": "true", "aria-label": "舞台演奏" });
    root.append(
      h("div", { class: "hjs-bg", "aria-hidden": "true" }),
      h("div", { class: "hjs-veil", "aria-hidden": "true" }),
      h("i", { class: "hjs-safe", id: "hjsSafe", "aria-hidden": "true" }),
      h("section", { class: "hjs-lobby", id: "hjsLobby", "aria-label": "大厅" }),
      h("section", { class: "hjs-play", id: "hjsPlay", hidden: true, "aria-label": "演奏中" },
        h("div", { class: "hjs-lanes", id: "hjsLanes", "aria-hidden": "true" }),
        h("div", { class: "hjs-notes", id: "hjsNotes", "aria-hidden": "true" }),
        h("div", { class: "hjs-judge", id: "hjsJudge", "aria-live": "polite" }),
        h("div", { class: "hjs-banner", id: "hjsBanner", "aria-live": "polite" }),
        h("div", { class: "hjs-combo is-zero", id: "hjsComboBig", "aria-hidden": "true" }, h("b", { id: "hjsComboN", text: "0" }), h("small", { text: "连击" })),
        h("div", { class: "hjs-caps", id: "hjsCaps", "aria-hidden": "true" }),
        h("header", { class: "hjs-hud", id: "hjsHud" },
          h("div", { class: "hjs-hud-song" }, h("b", { id: "hjsNowT" }), h("small", { id: "hjsNowS" })),
          h("div", { class: "hjs-hud-stats" },
            h("span", { class: "hjs-stat" }, h("b", { id: "hjsScore", text: "0" }), h("small", { id: "hjsScoreL", text: "分数" })),
            h("span", { class: "hjs-stat" }, h("b", { id: "hjsCombo", text: "0" }), h("small", { text: "连击" }))),
          iconBtn("pause", "暂停", () => (S.paused ? resume() : pause()), "hjs-pause"),
          iconBtn("close", "回到大厅", () => backToLobby()),
          h("i", { class: "hjs-prog", "aria-hidden": "true" }, h("i", { id: "hjsProg" })))),
      h("div", { class: "hjs-modal", id: "hjsModal", hidden: true }),
      h("div", { class: "hjs-sheet", id: "hjsSheet", hidden: true, onpointerdown: (e) => { if (e.target.id === "hjsSheet") closeSheet(); } },
        h("div", { class: "hjs-sheet-card", id: "hjsSheetCard", role: "dialog", "aria-modal": "true" })),
    );
    document.body.appendChild(root);
    S.root = root;

    const play = $id("hjsPlay");
    play.addEventListener("pointerdown", onPlayPointer);
    play.addEventListener("pointermove", onHoverMove);
    ["pointerup", "pointercancel", "pointerleave"].forEach((ev) => play.addEventListener(ev, onHoverEnd));
    play.addEventListener("contextmenu", (e) => e.preventDefault());
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("popstate", onPopState);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) return;
      if (S.view === "play" && S.playing && !S.paused) pause();
      stopPreview();
      if (S.cal) stopCal("切到后台了，校准中断");
    });
    S.built = true;
  }

  /* ==== 开关 ==== */
  function open() {
    build();
    clearTimeout(S.closeTimer);
    readPrefs();
    const r = S.root;
    r.classList.remove("is-leaving");
    r.hidden = false;
    void r.offsetWidth;
    r.classList.add("is-in");
    document.body.classList.add("hjs-open");
    if (typeof bgm !== "undefined" && bgm.playing) { S.bgmWasOn = true; bgm.pause(); }
    try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) {}
    bard().unlock?.();
    pushHist();
    S.view = "lobby";
    showView();
    renderLobby();
    if (!S.data) loadData().then(() => { if (S.view === "lobby" && !r.hidden) renderLobby(); });
    requestAnimationFrame(() => { const go = $id("hjsGo"); if (go) go.focus({ preventScroll: true }); });
  }

  function close(fromPop) {
    if (!S.root || S.root.hidden) return;
    S.gen += 1;
    stopCal();
    stopPreview();
    S.binding = -1;
    stopPlay();
    hideSheet();
    const r = S.root;
    r.classList.remove("is-in");
    r.classList.add("is-leaving");
    clearTimeout(S.closeTimer);
    S.closeTimer = setTimeout(() => {
      r.classList.remove("is-leaving");
      r.hidden = true;
      document.body.classList.remove("hjs-open");
    }, 240);
    try { if (navigator.audioSession) navigator.audioSession.type = "auto"; } catch (e) {}
    if (S.bgmWasOn) {
      S.bgmWasOn = false;
      try { if (!vol().muted) bgm.play(); } catch (e) {}
    }
    if (S.hist && !fromPop) {
      S.closing = true;
      try { history.back(); } catch (e) {}
      setTimeout(() => { S.closing = false; }, 400);
    }
    S.hist = false;
  }

  /* 手机返回键：回到上一层，不直接离开网站 */
  function pushHist() {
    try {
      if (!(history.state && history.state.hjStage)) history.pushState({ hjStage: 1 }, "");
      S.hist = true;
    } catch (e) { S.hist = false; }
  }
  function onPopState() {
    if (!S.root || S.root.hidden || S.closing) return;
    S.hist = false;
    if (S.binding >= 0 || S.cal || S.sheet) goBack();
    else if (S.view === "play") {
      if (S.playing && !S.paused && !S.finished) pause();
      else backToLobby();
    } else {
      close(true);
      return;
    }
    pushHist();
  }

  /* Esc：一层一层往回退 */
  function goBack() {
    if (S.binding >= 0) { S.binding = -1; renderSheet(); return; }
    if (S.cal) { stopCal("校准取消了"); return; }
    if (S.sheet) { closeSheet(); return; }
    if (S.view === "play") {
      if (S.finished) backToLobby();
      else if (S.paused) resume();
      else if (S.playing) pause();
      else backToLobby();
      return;
    }
    close();
  }

  function showView() {
    const play = S.view === "play";
    $id("hjsLobby").hidden = play;
    $id("hjsPlay").hidden = !play;
    S.root.classList.toggle("is-playing", play);
    if (!play) $id("hjsModal").hidden = true;
  }

  /* ==== 大厅 ==== */
  function seg(label, items, val, onPick, cls = "") {
    return h("div", { class: `hjs-seg ${cls}`.trim(), role: "radiogroup", "aria-label": label },
      items.map((it) => h("button", {
        type: "button", class: `hjs-seg-b${it.id === val ? " is-on" : ""}`, role: "radio", "aria-checked": String(it.id === val),
        title: it.title, text: it.label, onclick: () => { if (it.id !== val) onPick(it.id); },
      })));
  }
  const kbd = (code) => h("kbd", { class: "hjs-kbd", text: codeLabel(code) });

  function renderLobby() {
    const box = $id("hjsLobby");
    if (!box) return;
    box.textContent = "";
    box.append(h("header", { class: "hjs-bar" },
      h("div", { class: "hjs-brand" }, h("span", { class: "hjs-brand-ico", html: ICON.note }), h("b", { text: "舞台演奏" })),
      h("div", { class: "hjs-bar-btns" },
        iconBtn("help", "怎么玩", () => openSheet("help")),
        iconBtn("gear", "设置", () => openSheet("settings")),
        iconBtn("close", "离开舞台", () => close()))));

    const main = h("div", { class: "hjs-lobby-main" });
    box.append(main);
    if (!S.data) {
      main.append(h("div", { class: "hjs-card hjs-wait" },
        h("p", { class: S.err ? "hjs-err" : "hjs-loading", text: S.err || "正在把曲库搬上舞台…" }),
        S.err ? h("button", { type: "button", class: "hjs-btn", text: "再试一次", onclick: () => { S.err = ""; renderLobby(); loadData().then(() => renderLobby()); } }) : null));
      return;
    }

    const s = S.song;
    const previewing = S.preview.id === s.id;
    main.append(h("section", { class: "hjs-card hjs-hero" },
      h("p", { class: "hjs-eyebrow", text: "今晚演奏" }),
      h("h2", { class: "hjs-hero-t", text: s.t }),
      s.o ? h("p", { class: "hjs-hero-o", text: s.o }) : null,
      h("p", { class: "hjs-hero-meta" },
        h("span", { class: "hjs-stars", title: `难度 ${clamp(num(s.diff, 3), 1, 5)} / 5`, text: starText(num(s.diff, 3)) }),
        h("span", { text: metaOf(s) }),
        s.tag ? h("span", { class: "hjs-tag", text: s.tag }) : null),
      s.note ? h("p", { class: "hjs-hero-note", text: s.note }) : null,
      h("div", { class: "hjs-hero-btns" },
        h("button", { type: "button", class: `hjs-btn hjs-prev-btn${previewing ? " is-on" : ""}`, id: "hjsLobbyPrev", "aria-pressed": String(previewing), onclick: () => togglePreview(s) },
          h("span", { class: "hjs-btn-ico", html: previewing ? ICON.stop : ICON.play }), h("span", { text: previewing ? "停止试听" : "试听" })),
        h("button", { type: "button", class: "hjs-btn", onclick: () => openSheet("picker") },
          h("span", { class: "hjs-btn-ico", html: ICON.list }), h("span", { text: "换一首" })))));

    loadChart(s);                                       // 先把谱面下好，开始、试听时不用等
    const mode = modeNow();
    const lanes = lanesNow();
    const best = bestOf(storage.json(K.best) || {}, s.id, S.diff, S.judge);
    const cnt = Array.isArray(s.cnt) ? s.cnt : [];                       // 轻松 / 标准 / 挑战各要弹几个音
    const nNow = cnt[DIFFS.findIndex((d) => d.id === S.diff)];
    main.append(h("section", { class: "hjs-card hjs-ctrl" },
      h("div", { class: "hjs-line" }, h("span", { class: "hjs-line-l", text: "难度" }),
        seg("难度", DIFFS.map((d, i) => ({ id: d.id, label: d.label, title: cnt[i] ? `${cnt[i]} 个音要弹` : undefined })), S.diff,
          (v) => { S.diff = v; setRaw(K.diff, v); renderLobby(); })),
      h("div", { class: "hjs-line" }, h("span", { class: "hjs-line-l", text: "模式" }),
        seg("模式", [{ id: "show", label: "演出" }, { id: "learn", label: "学习" }], S.learn ? "learn" : "show",
          (v) => { S.learn = v === "learn"; setRaw(K.learn, S.learn ? "1" : "0"); renderLobby(); })),
      h("p", { class: "hjs-tip", text: (S.learn ? "学习模式：气泡缩到判定点就停下等你弹，弹中再继续，不计分" : "演出模式：跟着节拍弹，按准确度给评级")
        + (nNow ? ` · 这一档 ${nNow} 个音` : "") }),
      vol().muted
        ? h("p", { class: "hjs-muted" }, h("span", { text: "现在是静音，听不到声音" }),
          h("button", { type: "button", class: "hjs-link", text: "打开声音", onclick: () => { vol().set(0.55); renderLobby(); } }))
        : null,
      best && !S.learn ? h("p", { class: "hjs-best", text: `本机纪录（${diffMeta().label} · ${judgeLabel()}判定）· ${fmtNum(best.score)} 分 · ${best.rank} · ${best.acc}%` }) : null,
      h("button", { type: "button", class: "hjs-go", id: "hjsGo", onclick: () => startSong() },
        h("span", { class: "hjs-go-ico", html: ICON.play }), h("span", { text: S.learn ? "开始练习" : "开始演奏" })),
      h("p", { class: "hjs-ctrl-tip" },
        mode === "keys"
          ? [h("span", { text: "键盘" }), ...S.codes[lanes].map(kbd), h("span", { text: `· ${lanes} 条轨道 · Esc 暂停` })]
          : S.judge === "hover"
            ? [h("span", { text: "放水模式：不用点气泡，鼠标移到气泡上就算" })]
            : [h("span", { text: coarse() ? "直接点气泡演奏 · 点在旁边一点也算" : "直接点气泡演奏 · 鼠标指着气泡按任意键也算" })])));
  }

  /* ==== 试听：用选中的音色把 MIDI 从第一个音起放 8 秒（要弹的音稍响） ==== */
  function togglePreview(s) {
    if (S.preview.id === s.id) { stopPreview(); return; }
    stopPreview();
    if (S.view !== "lobby" || !s) return;
    const pv = S.preview;
    pv.id = s.id;
    paintPreview();
    const b = bard();
    b.unlock?.();                                       // 在这次点击里叫醒音频
    b.prepare?.(instId());
    loadChart(s).then((chart) => {
      if (pv.id !== s.id) return;
      if (!chart) { stopPreview(); toast("谱面没加载上，检查一下网络再试"); return; }
      pv.list = chart.notes.filter((n) => n.t <= PREVIEW.sec);
      pv.i = 0;
      pv.clock = makeClock(-0.1);
      clockStart(pv.clock);
      pv.timer = setInterval(previewTick, 50);
      previewTick();
    });
  }
  function previewTick() {
    const pv = S.preview;
    if (!pv.id || !pv.clock) return;
    const play = bard().playMidi;
    const inst = instId();
    const pos = clockRaw(pv.clock);
    while (pv.i < pv.list.length && pv.list[pv.i].t <= pos + 0.25) {
      const n = pv.list[pv.i++];
      if (play && n.t >= pos - 0.1) play(n.m, n.l > 0 ? PREVIEW.vel : PREVIEW.vel * 0.7, inst, 0, Math.max(0, n.t - pos));
    }
    if (pv.i >= pv.list.length && pos > (pv.list.length ? pv.list[pv.list.length - 1].t : 0) + 1) stopPreview();
  }
  function stopPreview() {
    const pv = S.preview;
    clearInterval(pv.timer);
    pv.timer = 0;
    if (!pv.id) return;
    pv.id = "";
    pv.clock = null;
    pv.list = null;
    paintPreview();
  }
  function paintPreview() {
    if (S.sheet === "picker") document.querySelectorAll(".hjs-song").forEach((r) => r.classList.toggle("is-preview", r.dataset.id === S.preview.id));
    const b = $id("hjsLobbyPrev");
    if (b && S.song) {
      const on = S.preview.id === S.song.id;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-pressed", String(on));
      b.firstChild.innerHTML = on ? ICON.stop : ICON.play;
      b.lastChild.textContent = on ? "停止试听" : "试听";
    }
  }

  /* ==== 窗口：选曲 / 设置 / 玩法 ==== */
  function openSheet(kind) {
    if (kind === "picker" && !S.data) return;
    S.binding = -1;
    S.sheetBack = document.activeElement;
    S.sheet = kind;
    renderSheet();
    const sh = $id("hjsSheet");
    sh.hidden = false;
    void sh.offsetWidth;
    sh.classList.add("is-in");
    requestAnimationFrame(() => {
      const card = $id("hjsSheetCard");
      const on = kind === "picker" ? card.querySelector(".hjs-song.is-on") : null;
      const list = on && on.parentElement;
      /* 只滚列表自己：scrollIntoView 在手机上会连带把整个视口推上去 */
      if (list) list.scrollTop = Math.max(0, on.offsetTop - list.offsetTop - (list.clientHeight - on.offsetHeight) / 2);
      const first = on || card.querySelector(".hjs-sheet-x");
      if (first) first.focus({ preventScroll: true });
    });
  }
  function hideSheet() {
    const sh = $id("hjsSheet");
    if (!sh) return;
    sh.classList.remove("is-in");
    sh.hidden = true;
    S.sheet = "";
  }
  function closeSheet() {
    if (!S.sheet) return;
    const kind = S.sheet;
    stopCal();
    S.binding = -1;
    if (kind === "picker") stopPreview();
    hideSheet();
    if (S.view === "lobby") renderLobby();
    const back = kind === "picker" ? $id("hjsGo") : S.sheetBack;
    try { if (back && back.isConnected) back.focus({ preventScroll: true }); else $id("hjsGo")?.focus({ preventScroll: true }); } catch (e) {}
  }
  function renderSheet() {
    const card = $id("hjsSheetCard");
    if (!card || !S.sheet) return;
    const keep = card.querySelector(".hjs-sheet-body");
    const scroll = keep ? keep.scrollTop : 0;
    card.textContent = "";
    card.className = `hjs-sheet-card is-${S.sheet}`;
    const title = { picker: "选曲", settings: "设置", help: "怎么玩" }[S.sheet];
    card.setAttribute("aria-label", title);
    card.append(h("header", { class: "hjs-sheet-head" },
      h("b", { text: title }),
      S.sheet === "picker" ? h("span", { class: "hjs-count", id: "hjsCount" }) : null,
      iconBtn("close", "关闭", closeSheet, "hjs-sheet-x")));
    if (S.sheet === "picker") renderPicker(card);
    else if (S.sheet === "settings") renderSettings(card);
    else renderHelp(card);
    const body = card.querySelector(".hjs-sheet-body");
    if (body && S.sheet !== "picker") body.scrollTop = scroll;
  }

  function renderPicker(card) {
    const input = h("input", {
      type: "search", class: "hjs-search-in", placeholder: "搜曲名 / 歌手 / 出处", value: S.query, "aria-label": "搜索曲目",
      enterkeyhint: "search", autocomplete: "off",
      oninput: () => { S.query = input.value; renderSongList(); },
    });
    card.append(
      h("div", { class: "hjs-search" }, h("span", { class: "hjs-search-ico", html: ICON.search }), input),
      S.tags.length > 1 ? h("div", { class: "hjs-chips is-cat", role: "radiogroup", "aria-label": "按分类筛选" },
        ["", ...S.tags].map((t) => h("button", {
          type: "button", class: `hjs-chip${S.cat === t ? " is-on" : ""}`, role: "radio", "aria-checked": String(S.cat === t),
          text: t || "全部分类",
          onclick: () => { S.cat = t; setRaw(K.cat, t); renderSheet(); },
        }))) : null,
      h("div", { class: "hjs-chips", role: "radiogroup", "aria-label": "按难度筛选" },
        [0, 1, 2, 3, 4, 5].map((n) => h("button", {
          type: "button", class: `hjs-chip${S.stars === n ? " is-on" : ""}`, role: "radio", "aria-checked": String(S.stars === n),
          text: n ? `${"★".repeat(n)}` : "全部", title: n ? `难度 ${n} 星` : "全部难度",
          onclick: () => { S.stars = n; setRaw(K.stars, n); renderSheet(); },
        }))),
      h("div", { class: "hjs-sheet-body hjs-songs", id: "hjsSongs", role: "listbox", "aria-label": "曲目" }),
      h("footer", { class: "hjs-sheet-foot" },
        h("span", { class: "hjs-foot-now", id: "hjsPickNow" }),
        h("button", { type: "button", class: "hjs-btn is-main", text: "就弹这首", onclick: closeSheet })));
    renderSongList();
  }
  function renderSongList() {
    const box = $id("hjsSongs");
    if (!box) return;
    box.textContent = "";
    const list = filtered();
    $id("hjsCount").textContent = `${list.length} / ${S.data.length} 首`;
    $id("hjsPickNow").textContent = S.song ? `已选：${S.song.t}` : "";
    if (!list.length) { box.append(h("p", { class: "hjs-empty", text: "没有找到这样的曲子，换个关键词试试" })); return; }
    list.forEach((s) => {
      const on = S.song && S.song.id === s.id;
      box.append(h("button", {
        type: "button", class: `hjs-song${on ? " is-on" : ""}${S.preview.id === s.id ? " is-preview" : ""}`, role: "option",
        "aria-selected": String(on), "data-id": s.id,
        onclick: () => {
          const same = S.song && S.song.id === s.id;
          pickSong(s);
          box.querySelectorAll(".hjs-song").forEach((r) => { const me = r.dataset.id === s.id; r.classList.toggle("is-on", me); r.setAttribute("aria-selected", String(me)); });
          $id("hjsPickNow").textContent = `已选：${s.t}`;
          if (!same || S.preview.id !== s.id) togglePreview(s);
          else stopPreview();
        },
        ondblclick: () => { pickSong(s); closeSheet(); },
      },
        h("span", { class: "hjs-song-main" },
          h("b", { text: s.t }),
          h("small", { text: metaOf(s) })),
        s.tag ? h("span", { class: "hjs-tag", text: s.tag }) : null,
        h("span", { class: "hjs-song-side" },
          h("span", { class: "hjs-eq", "aria-hidden": "true" }, h("i"), h("i"), h("i")),
          h("span", { class: "hjs-stars", text: starText(num(s.diff, 3)) }))));
    });
  }

  function renderSettings(card) {
    const body = h("div", { class: "hjs-sheet-body hjs-set" });
    card.append(body);
    const row = (label, ctrl, hint) => h("div", { class: "hjs-set-row" },
      h("div", { class: "hjs-set-l" }, h("b", { text: label }), hint ? h("small", { text: hint }) : null),
      h("div", { class: "hjs-set-c" }, ctrl));
    const group = (title, ...rows) => h("section", { class: "hjs-set-g" }, h("h4", { text: title }), rows);

    /* 声音 */
    const volVal = h("output", { class: "hjs-vol-v", text: `${Math.round(vol().level * 100)}` });
    const range = h("input", {
      type: "range", class: "hjs-range", min: "0", max: "100", step: "5", value: String(Math.round(vol().level * 100)), "aria-label": "音量",
      oninput: () => { vol().set(+range.value / 100); volVal.textContent = range.value; },
    });
    const sel = h("select", { class: "hjs-select", "aria-label": "弹出来的音色", onchange: () => { S.inst = sel.value; setRaw(K.inst, sel.value); } });
    sel.append(h("option", { value: "", text: `跟随模拟器（${(bard().instruments || []).find((i) => i.id === (bard().instName && bard().instName()))?.name || "钢琴"}）` }));
    sel.append(h("option", { value: "song", text: "跟随曲目（MIDI 原本的乐器）" }));
    const groups = new Map();
    (bard().instruments || [{ id: "piano", name: "钢琴", group: "弦乐" }]).forEach((i) => {
      if (!groups.has(i.group)) groups.set(i.group, h("optgroup", { label: i.group || "乐器" }));
      groups.get(i.group).append(h("option", { value: i.id, text: i.name }));
    });
    groups.forEach((g) => sel.append(g));
    sel.value = S.inst === "song" || instIds().includes(S.inst) ? S.inst : "";
    const demo = h("input", { type: "checkbox", class: "hjs-switch", checked: S.demo, "aria-label": "示范旋律", onchange: () => { S.demo = demo.checked; setRaw(K.demo, S.demo ? "1" : "0"); } });
    body.append(group("声音",
      row("音量", h("div", { class: "hjs-vol" }, range, volVal), "和全站音量是同一个"),
      row("音色", sel, "整首曲子都用它；拨弦、钢琴类起音最利落"),
      row("示范旋律", demo, "你要弹的音也先轻轻放出来，可以照着弹")));

    /* 操作 */
    const mode = modeNow();
    const lanes = lanesNow();
    const opRows = [
      row("操作方式", seg("操作方式", [
        { id: "auto", label: "自动" }, { id: "tap", label: "点气泡" }, { id: "keys", label: "键盘" },
      ], S.input, (v) => { S.input = v; setRaw(K.input, v); renderSheet(); }), `现在：${mode === "tap" ? "点气泡" : "键盘轨道"}`),
    ];
    if (mode === "tap") {
      const rg = TAP_RANGES[S.range];
      opRows.push(row("点击范围", seg("点击范围", Object.entries(TAP_RANGES).map(([id, v]) => ({ id, label: v.label })), S.range,
        (v) => { S.range = v; setRaw(K.range, v); renderSheet(); }),
      `点在气泡 ${rg.r} 个直径以内算点中；附近没别的气泡时，下一个该点的（外圈加粗）偏出 ${rg.next} 个也算`));
    }
    if (mode === "keys") {
      opRows.push(row("轨道数", seg("轨道数", [
        { id: "auto", label: "自动" }, { id: "2", label: "2" }, { id: "3", label: "3" }, { id: "4", label: "4" },
      ], S.lanesPref, (v) => { S.lanesPref = v; setRaw(K.lanes, v); renderSheet(); }), S.lanesPref === "auto" ? `按屏幕宽度，现在 ${lanes} 条` : "屏幕均分，气泡落在哪条就按哪个键"));
      opRows.push(row("键位", h("div", { class: "hjs-keyrow" }, S.codes[lanes].map((c, i) => h("button", {
        type: "button", class: `hjs-keybtn${S.binding === i ? " is-bind" : ""}`, title: `第 ${i + 1} 条轨道`,
        text: S.binding === i ? "按新键…" : codeLabel(c),
        onclick: () => { S.binding = S.binding === i ? -1 : i; renderSheet(); },
      }))), S.binding >= 0 ? "按一个键（Esc 取消）；和别的轨道重了会自动对调" : "点一下再按新键"));
    }
    body.append(group("操作", ...opRows));

    /* 画面 */
    body.append(group("画面",
      row("显示", seg("显示", [{ id: "normal", label: "正常显示" }, { id: "simple", label: "简单显示" }], S.render,
        (v) => { S.render = v; setRaw(K.render, v); applyRender(); renderSheet(); }),
      S.render === "simple" ? "去掉了气泡光晕和文字的模糊阴影，副歌等密集处更流畅" : "觉得密集处有点卡，可以换成简单显示")));

    /* 时机 */
    const winText = (w) => w.map((x) => x.toFixed(2)).join(" / ");
    const judgeRow = row("判定模式", seg("判定模式", JUDGE_MODES, S.judge, (v) => { S.judge = v; setRaw(K.judge, v); renderSheet(); }),
      S.judge === "hover"
        ? "不用点：鼠标移到气泡上停着，到点自动算弹中（手机上手指按住滑过去也行）；判定同宽松"
        : S.judge === "loose"
          ? `三档难度都按轻松判定：PERFECT / GREAT / GOOD 各差 ${winText(LOOSE_WIN)} 秒以内`
          : `按难度收紧，现在「${diffBase().label}」：PERFECT / GREAT / GOOD 各差 ${winText(diffBase().win)} 秒以内`);
    const val = h("b", { class: "hjs-num-v", text: `${S.delayMs > 0 ? "+" : ""}${S.delayMs} ms` });
    const setv = (v) => { S.delayMs = clamp(Math.round(v / 5) * 5, -300, 300); setRaw(K.delay, S.delayMs); val.textContent = `${S.delayMs > 0 ? "+" : ""}${S.delayMs} ms`; };
    const step = (d, label) => h("button", { type: "button", class: "hjs-step", "aria-label": label, text: d > 0 ? "＋" : "－", onclick: () => setv(S.delayMs + d) });
    const timing = [judgeRow, row("判定延迟", h("div", { class: "hjs-num" }, step(-5, "提前 5 毫秒"), val, step(5, "推后 5 毫秒"),
      h("button", { type: "button", class: "hjs-btn hjs-cal-btn", text: S.cal ? "校准中…" : "校准", disabled: !!S.cal, onclick: startCal })),
    "总觉得自己按准了却判晚 → 加；判早 → 减")];
    if (S.cal || S.calMsg) timing.push(calPanel());
    body.append(group("时机", ...timing));

    body.append(h("div", { class: "hjs-set-foot" }, h("button", {
      type: "button", class: "hjs-link", text: "恢复默认设置",
      onclick: () => {
        [K.inst, K.demo, K.input, K.lanes, K.codes, K.delay, K.judge, K.render, K.range].forEach((k) => storage.remove(k));
        readPrefs();
        S.calMsg = "";
        renderSheet();
        toast("设置已恢复默认");
      },
    })));
  }

  function renderHelp(card) {
    card.append(h("div", { class: "hjs-sheet-body hjs-help" },
      h("ol", {},
        ["气泡出现在它那个音的高度上（越往上音越高），外圈会慢慢收缩；外圈缩到和核心重合的那一下，弹它就会发出这个音",
          "每首曲子都是一份 MIDI：气泡是你要弹的音，其余的音（和声、这一档省掉的旋律）游戏会用轻音按时补上",
          "手机、平板：直接点气泡，点在旁边一点也算",
          "电脑选点气泡时：鼠标指着气泡，按键盘任意键也算点了它（放水模式不用按，移上去就行）",
          "电脑：屏幕按宽度分成几条轨道，气泡落在哪条轨道就按那条的键（大厅下方有键位提示，设置里能改）",
          "开头会有四下轻轻的预备拍",
          "MISS 和「点空」不一样：MISS 是某个音到点了你没弹到 —— 这个音不响、连击断、算进准确率；「点空」是你点了，但附近没有正好该弹的气泡 —— 不扣分、不断连击，只在结算里记个次数。点空多，通常是点早了一拍或点偏了",
          "看外圈：外圈缩到和气泡重合、气泡里的音名最亮的那一下点最准；下一个该弹的气泡快到点时外圈会加粗",
          "学习模式：气泡到点还没弹，音乐就停下来等你，弹中再继续，不计分",
          "判定模式（设置里改）：正常 —— 难度越高判定越严；宽松 —— 三档难度都按轻松判定；放水 —— 不用点，把鼠标移到气泡上停着，到点就算弹中。本机纪录按难度和判定模式分开记",
          "总觉得判定偏早或偏晚：设置 → 判定延迟 → 校准，跟着「嗒」声按几下就好",
          "Esc（手机上是返回键）：暂停 / 关窗口 / 回到上一层",
        ].map((t) => h("li", { text: t })))));
  }

  /* ==== 延迟校准：在游戏同一个音频钟上排 10 下「嗒」，跟着按任意键或点圆圈，取后几下偏差的中位数 ==== */
  function calPanel() {
    const c = S.cal;
    const n = c ? c.taps.length : 0;
    return h("div", { class: "hjs-cal" },
      c ? h("button", {
        type: "button", class: "hjs-cal-pad", "aria-label": "跟着节拍点这里",
        onpointerdown: (e) => { e.preventDefault(); calTap(); },
        onkeydown: (e) => { if (e.key === " " || e.key === "Enter") e.preventDefault(); },
      }, h("span", { text: "跟着「嗒」声点这里" }), h("small", { text: "或按键盘任意键" })) : null,
      c ? h("div", { class: "hjs-cal-dots", "aria-hidden": "true" }, Array.from({ length: CAL.count }, (_, i) => h("i", { class: i < n ? "is-on" : "" }))) : null,
      S.calMsg ? h("p", { class: "hjs-cal-msg", text: S.calMsg }) : null,
      c ? h("button", { type: "button", class: "hjs-link", text: "取消", onclick: () => stopCal("校准取消了") }) : null);
  }
  function startCal() {
    if (S.cal) return;
    stopPreview();
    S.binding = -1;
    S.calMsg = "";
    const b = bard();
    if (!b.playMidi) { S.calMsg = "节拍音放不出来，刷新页面再试"; renderSheet(); return; }
    b.unlock?.();
    const clock = makeClock(0);
    clockStart(clock);
    S.cal = { taps: [], clock, k: 0, timer: setInterval(calStep, 50) };
    calStep();
    renderSheet();
  }
  /* 边走边排（提前 0.25 秒），取消了就不会再响 */
  function calStep() {
    const c = S.cal;
    if (!c) return;
    const pos = clockRaw(c.clock);
    for (; c.k < CAL.count && CAL.lead + c.k * CAL.gap <= pos + 0.25; c.k++) {
      bard().playMidi?.(TICK.midi, 0.7, TICK.inst, 0, Math.max(0, CAL.lead + c.k * CAL.gap - pos));
    }
    if (pos >= CAL.lead + CAL.gap * (CAL.count - 1) + 0.6) finishCal();
  }
  function calTap() {
    const c = S.cal;
    if (!c) return;
    const t = clockPos(c.clock) - c.clock.lat;          // 听到的位置
    const k = Math.round((t - CAL.lead) / CAL.gap);
    if (k < 0 || k >= CAL.count || c.taps.some((x) => x.k === k)) return;
    const d = t - (CAL.lead + k * CAL.gap);
    if (Math.abs(d) > 0.28) return;
    c.taps.push({ k, d });
    const dots = document.querySelectorAll(".hjs-cal-dots i");
    if (dots[c.taps.length - 1]) dots[c.taps.length - 1].classList.add("is-on");
    const pad = document.querySelector(".hjs-cal-pad");
    if (pad) { pad.classList.remove("is-hit"); void pad.offsetWidth; pad.classList.add("is-hit"); }
  }
  function finishCal() {
    const c = S.cal;
    if (!c) return;
    const use = c.taps.filter((x) => x.k >= 2).map((x) => x.d).sort((a, b) => a - b);
    if (use.length < 4) { stopCal("只测到几下，再试一次：从第三下开始跟着按"); return; }
    const mid = use.length % 2 ? use[(use.length - 1) / 2] : (use[use.length / 2 - 1] + use[use.length / 2]) / 2;
    const ms = clamp(Math.round((mid * 1000) / 5) * 5, -300, 300);
    S.delayMs = ms;
    setRaw(K.delay, ms);
    const d = Math.round(mid * 1000);
    stopCal(Math.abs(d) < 8 ? "很准！判定延迟设为 0 附近" : `你平均${d > 0 ? "晚" : "早"} ${Math.abs(d)} ms，判定延迟已设为 ${ms > 0 ? "+" : ""}${ms} ms`);
  }
  function stopCal(msg) {
    if (!S.cal && msg === undefined) return;
    if (S.cal) clearInterval(S.cal.timer);
    S.cal = null;
    if (msg !== undefined) S.calMsg = msg;
    if (S.sheet === "settings") renderSheet();
  }

  /* ==== 谱面与布局 ==== */
  function prepare(s, chart) {
    const dm = diffMeta();
    const need = LEVEL[dm.id] || 2;
    const all = chart.notes;
    /* 级别够的音由玩家弹，其余的（和声、这一档省掉的旋律）是补音；开了示范旋律就连要弹的音也先轻轻放一遍 */
    S.notes = [];
    S.bg = [];
    all.forEach((n) => {
      if (n.l >= need) S.notes.push({ t: n.t, m: n.m, idx: S.notes.length, lane: -1, band: 0, c: 0, x: 0, y: 0 });
      else S.bg.push({ t: n.t, m: n.m, v: BG_VEL });
    });
    S.bgAll = all.map((n) => ({ t: n.t, m: n.m, v: n.l >= need ? DEMO_VEL : BG_VEL }));
    S.bgList = S.demo ? S.bgAll : S.bg;
    S.lo = num(s.range && s.range[0], 60);
    S.hi = Math.max(num(s.range && s.range[1], 72), S.lo + 1);
    S.mode = modeNow();
    S.lanes = S.mode === "keys" ? lanesNow() : 0;
    const span = S.hi - S.lo + 1;
    S.notes.forEach((n) => {
      const k = clamp((n.m - S.lo) / span, 0, 0.9999);
      n.band = Math.floor(k * 4);
      n.lane = S.lanes ? -1 : 0;                // 键盘轨道在第一次 layout 时排好，之后改窗口大小也不变
    });
    S.judged = new Int8Array(S.notes.length).fill(-1);
    S.next = 0;
    S.firstT = S.notes.length ? S.notes[0].t : 0;
    S.lastT = S.notes.length ? S.notes[S.notes.length - 1].t : 0;
    S.endT = Math.max(S.lastT, all.length ? all[all.length - 1].t : 0);

    /* 预备拍：曲子第一个音（0 秒）之前四拍；钟从负数开始走，第一个气泡也有完整的收缩时间 */
    let spb = num(s.beat, 0) > 0 ? num(s.beat, 0.5) : 60 / clamp(num(s.bpm, 120), 30, 260);
    spb = clamp(spb, 0.2, 2);
    while (spb < 0.42) spb *= 2;            // 太快的曲子按两拍一下数
    S.spb = spb;
    S.ticks = [4, 3, 2, 1].map((k) => ({ t: -k * spb, m: TICK.midi }));
    S.startT = Math.min(-4 * spb - 0.6, S.firstT - dm.approach - 0.4);
    S.clock = makeClock(S.startT);
    return dm;
  }

  function safeInsets() {
    const cs = getComputedStyle($id("hjsSafe"));
    return { top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0 };
  }

  function layout() {
    renderLanes();                            // 先放好轨道与键帽，下面才量得到键帽高度
    const dm = diffMeta();
    const w = S.root.clientWidth || window.innerWidth;
    const hh = S.root.clientHeight || window.innerHeight;
    const keys = S.mode === "keys";
    const laneW = keys ? w / S.lanes : w;
    const size = keys ? clamp(laneW * dm.size, 52, 124) : clamp(Math.min(w, hh) * dm.tap, 66, 118);
    const inset = safeInsets();
    const hud = $id("hjsHud").offsetHeight || 56;
    const caps = keys ? ($id("hjsCaps").offsetHeight || 64) : 0;
    const top = hud + size * 0.62 + 10;
    const bottom = Math.max(top + 80, hh - caps - size * 0.62 - 14 - (keys ? 0 : inset.bottom));
    S.g = { w, h: hh, laneW, size, top, bottom };
    $id("hjsNotes").style.setProperty("--size", `${size.toFixed(1)}px`);

    placeNotes(S.g, dm);
    S.els.forEach((el, idx) => { placeEl(el, S.notes[idx]); el.style.setProperty("--c", PALETTE[S.notes[idx].c]); });
  }

  /* ==== 气泡摆放（谱面的几条规矩）====
     - 同时在屏幕上的气泡尽量不重叠：每个音在一组候选位置里挑代价最小的一个；实在太密也只会擦边，不会整个叠在一起
     - 待在视线里：下一个气泡就出现在上一个旁边（间隔越久离得稍远，最远约 2.3 个气泡），整体往屏幕中间收，
       不会一会儿左边一会儿右边、一会儿顶上一会儿底下
     - 高度跟着旋律的走向：音往上走，气泡往上挪（每半音约 0.18 个气泡，一步最多 1.4 个），而不是按绝对音高铺满整屏
     - 点气泡：尽量顺着一个方向走，不急转回头
     - 键盘：轨道不按音高划分，换轨尽量就近；快速连打（间隔 < 0.2 秒）不连按同一个键、两只手交替
     - 挨得近（同时在场、中心距离不到 1.8 个气泡）的两个气泡一定不同色；先到的气泡叠在上面 */
  function placeNotes(g, dm) {
    const keys = S.mode === "keys";
    const { w, size, top, bottom, laneW } = g;
    const W = dm.approach + 0.35;                       // 两个音同时在屏幕上的最大时间差（出现 → 判定完消失）
    const DMIN = size * 1.15;
    const margin = size * 0.72 + 8;
    const left = margin;
    const right = Math.max(margin + 1, w - margin);
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;
    const PULL = size * 2.4;                            // 离中心超过这么远，往回拉的力度明显变大
    const mid = (S.lo + S.hi) / 2;
    const d = keys ? Math.max(0, Math.min(laneW * 0.3, (laneW - size) / 2)) : 0;
    const xOffs = d > 2 ? [0, -d, d] : [0];
    const L = S.lanes;
    const hand = (l) => (L === 3 ? (l === 1 ? -1 : l > 1 ? 1 : 0) : l < L / 2 ? 0 : 1);   // 三条轨道时中间是拇指（空格）
    const ANG = Array.from({ length: 16 }, (_, k) => (k * Math.PI) / 8);
    const notes = S.notes;
    let j0 = 0;
    notes.forEach((n, i) => {
      while (j0 < i && n.t - notes[j0].t >= W) j0 += 1;
      const near = notes.slice(j0, i);
      const p = i ? notes[i - 1] : null;
      const pp = i > 1 ? notes[i - 2] : null;
      const dt = p ? n.t - p.t : 9;
      const step = p ? n.m - p.m : 0;
      const yWant = p ? p.y - clamp(step * 0.18, -1.4, 1.4) * size : cy - clamp((n.m - mid) * 0.12, -1.5, 1.5) * size;
      const want = clamp(size * (1.2 + dt), size * 1.3, size * 2.3);   // 点气泡：和上一个隔多远
      let best = null;
      let bestCost = Infinity;
      const tryAt = (x0, y0, lane, cost) => {
        const x = keys ? x0 : clamp(x0, left, right);
        const y = clamp(y0, top, bottom);
        let c = cost + (0.35 * Math.abs(y - yWant)) / size;
        const r = (keys ? Math.abs(y - cy) : Math.hypot(x - cx, y - cy)) / PULL;
        c += 0.9 * r * r;                               // 往中间收
        if (p && step && Math.abs(p.y - y) > size * 0.2 && Math.sign(p.y - y) !== Math.sign(step)) c += 0.8;   // 音往上走气泡别往下
        if (p && !keys) {
          const jump = Math.hypot(x - p.x, y - p.y);
          c += (0.7 * Math.abs(jump - want)) / size;
          if (pp) {                                     // 别急转回头
            const ax = p.x - pp.x, ay = p.y - pp.y, bx = x - p.x, by = y - p.y;
            const cos = (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by) || 1);
            if (cos < -0.5) c += 0.4;
          }
        }
        if (c >= bestCost) return;
        for (const q of near) {
          const dist = Math.hypot(q.x - x, q.y - y);
          const tw = 1 - (0.5 * (n.t - q.t)) / W;          // 时间越近越要紧
          if (dist < DMIN) c += 60 * tw * (1 + (4 * (DMIN - dist)) / DMIN);
          else if (dist < size * 1.6) c += (0.8 * tw * (size * 1.6 - dist)) / size;
          if (c >= bestCost) return;
        }
        bestCost = c;
        best = { x, y, lane };
      };
      if (keys) {
        const fixed = n.lane >= 0;
        const lanes = fixed ? [n.lane] : Array.from({ length: L }, (_, l) => l);
        const ys = [0, -0.5, 0.5, -1, 1, -1.5, 1.5, -2.2, 2.2, -3, 3].map((k) => yWant + k * size);
        for (const l of lanes) {
          let lc = 0;
          if (!fixed && p) {
            const wantL = step === 0 ? 0 : Math.sign(step) * Math.min(L - 1, Math.max(1, Math.round(Math.abs(step) / 5)));
            lc += 0.5 * Math.abs(l - p.lane - wantL);
            lc += 0.7 * Math.max(0, Math.abs(l - p.lane) - 1);          // 换轨尽量就近，别一下跨过半个屏幕
            if (l === p.lane) lc += dt < 0.2 ? 4 : dt < 0.3 ? 1.5 : 0;
            if (dt < 0.2 && hand(l) >= 0 && hand(l) === hand(p.lane)) lc += 1.2;
            lc += 0.12 * near.filter((q) => q.lane === l).length;   // 别老挤在同一条
          } else if (!fixed) {
            lc += 0.5 * Math.abs(l - Math.floor(clamp((n.m - S.lo) / (S.hi - S.lo + 1), 0, 0.9999) * L));
          }
          for (const xo of xOffs) for (const y of ys) tryAt(laneW * (l + 0.5) + xo, y, l, lc + (xo ? 0.15 : 0));
        }
        /* 太密：在这些轨道的整个高度上找空位 */
        if (bestCost > 30) {
          for (const l of lanes) for (const xo of xOffs) for (let gy = top; gy <= bottom; gy += size * 0.5) tryAt(laneW * (l + 0.5) + xo, gy, l, 1 + (fixed ? 0 : 0.5 * Math.abs(l - (p ? p.lane : l))));
        }
      } else if (!p) {
        for (const k of [0, -0.6, 0.6, -1.2, 1.2]) tryAt(cx + k * size, yWant, 0, 0);
      } else {
        for (const a of ANG) for (const f of [0.85, 1, 1.25]) tryAt(p.x + Math.cos(a) * want * f, p.y + Math.sin(a) * want * f, 0, 0);
        /* 附近全被占了（极密的段落）：再往外找一圈，还不行就在整个屏幕上找空位（宁可远一点也不叠） */
        if (bestCost > 30) for (const a of ANG) for (const f of [1.6, 2.1]) tryAt(p.x + Math.cos(a) * want * f, p.y + Math.sin(a) * want * f, 0, 0.5);
        if (bestCost > 30) {
          for (let gx = 0; gx <= 8; gx++) for (let gy = top; gy <= bottom; gy += size * 0.55) tryAt(left + ((right - left) * gx) / 8, gy, 0, 1);
        }
      }
      n.x = best.x;
      n.y = best.y;
      if (keys) n.lane = best.lane;
      /* 颜色：默认按音高分四色；和挨得近的气泡撞色就换一种 */
      const taken = new Set(near.filter((q) => Math.hypot(q.x - n.x, q.y - n.y) < size * 1.8).map((q) => q.c));
      n.c = n.band;
      for (let k = 0; k < PALETTE.length && taken.has(n.c); k++) n.c = (n.band + 1 + k) % PALETTE.length;
    });
  }

  function renderLanes() {
    const lanesBox = $id("hjsLanes");
    const caps = $id("hjsCaps");
    const keys = S.mode === "keys";
    S.root.classList.toggle("is-keys", keys);
    lanesBox.textContent = "";
    caps.textContent = "";
    if (!keys) return;
    lanesBox.style.setProperty("--n", String(S.lanes));
    caps.style.setProperty("--n", String(S.lanes));
    for (let i = 0; i < S.lanes; i++) {
      lanesBox.append(h("div", { class: "hjs-lane", "data-lane": String(i) }));
      caps.append(h("div", { class: "hjs-cap", "data-lane": String(i) }, h("span", { text: codeLabel(S.codes[S.lanes][i]) })));
    }
  }

  function onResize() {
    if (S.view === "play" && S.notes.length) layout();
    else if (S.view === "lobby" && !S.root.hidden) {
      if (S.sheet === "settings" && modeNow() === "keys") renderSheet();
    }
  }

  /* ==== 开始 / 结束 ==== */
  function resetRun() {
    S.score = 0;
    S.combo = 0;
    S.maxCombo = 0;
    S.learnHits = 0;
    S.counts = { perfect: 0, great: 0, good: 0, miss: 0 };
    S.offs = [];                                        // 每次弹中的偏差（秒，正 = 晚），结算时给个平均
    /* 手感诊断：掉帧、点按排队时间。base：本机一帧多长（开头 120 帧的中位数，按屏幕刷新率）；drop：比 base 长一半以上的帧；
       buckets：每 4 秒歌曲时间里掉了几帧，结算时指出最卡的一段；max：最长一帧 */
    S.diag = { frames: 0, slow: 0, last: 0, waits: [], tsBad: false, lite: false, warm: [], base: 0, n: 0, drop: 0, max: 0, buckets: new Map() };
    S.ghosts = 0;                                       // 点气泡时点空的次数
    S.playing = false;
    S.paused = false;
    S.frozen = false;
    S.waiting = null;
    S.finished = false;
    S.needTap = false;
    S.bgNext = 0;
    S.tickNext = 0;
  }

  function startSong() {
    if (!S.data) return;
    if (!S.song) { openSheet("picker"); return; }
    stopPreview();
    stopCal();
    if (S.sheet) hideSheet();
    const s = S.song;
    const gen = ++S.gen;
    stopPlay();
    resetRun();
    S.view = "play";
    showView();
    $id("hjsModal").hidden = true;
    S.notes = [];
    $id("hjsNowT").textContent = s.t;
    $id("hjsNowS").textContent = `${diffMeta().label}${S.learn ? " · 学习" : judgeTag()}`;
    setPauseIcon(false);
    updateHud();
    $id("hjsProg").style.transform = "scaleX(0)";
    banner("准备中…", "is-wait");
    try { document.activeElement && document.activeElement.blur && document.activeElement.blur(); } catch (e) {}

    /* 在这次点击里叫醒音频（iOS 要求），谱面下好、音频跑起来再开钟 */
    const b = bard();
    b.unlock?.();
    b.prepare?.(instId());
    loadChart(s).then((chart) => {
      if (gen !== S.gen || S.view !== "play") return;
      if (!chart) {
        backToLobby();
        toast("谱面没加载上，检查一下网络再试");
        return;
      }
      prepare(s, chart);
      layout();
      updateHud();
      waitAudio(gen, performance.now());
    });
  }

  /* 音频叫不醒（浏览器拦着自动出声）就请玩家点一下屏幕，点的那一下会重新开始 */
  function waitAudio(gen, since) {
    if (gen !== S.gen || S.view !== "play" || S.playing) return;
    if (rawClock().running) { begin(); return; }
    if (performance.now() - since > 1500) {
      S.needTap = true;
      banner("点一下屏幕开始", "is-wait");
      return;
    }
    setTimeout(() => waitAudio(gen, since), 50);
  }

  function begin() {
    S.playing = true;
    S.bannerKey = "";
    banner("", "");
    clockStart(S.clock);
    /* 排音另用一个计时器：画面掉帧（低端机卡顿、窗口被挡住时浏览器压低帧率）也不会漏掉补音 */
    clearInterval(S.pump);
    S.pump = setInterval(scheduleSounds, 25);
    loop();
  }

  function stopPlay() {
    cancelAnimationFrame(S.raf);
    S.raf = 0;
    clearInterval(S.pump);
    S.playing = false;
    S.paused = false;
    S.frozen = false;
    S.waiting = null;
    clockStop(S.clock);
    clearNotes();
  }

  function backToLobby() {
    S.gen += 1;
    stopPlay();
    S.finished = false;
    S.needTap = false;
    $id("hjsModal").hidden = true;
    banner("", "");
    S.view = "lobby";
    showView();
    renderLobby();
    requestAnimationFrame(() => $id("hjsGo")?.focus({ preventScroll: true }));
  }

  function nextSong() {
    const list = filtered();
    const pool = list.some((s) => s.id === S.song.id) ? list : S.data;
    const i = pool.findIndex((s) => s.id === S.song.id);
    pickSong(pool[(i + 1) % pool.length]);
  }

  /* ==== 主循环 ==== */
  function loop() {
    cancelAnimationFrame(S.raf);
    S.raf = requestAnimationFrame(tick);
  }

  function tick() {
    S.raf = 0;
    if (!S.playing || S.paused) return;
    noteFrame();
    const dm = diffMeta();
    let t = S.frozen ? S.frozenT : songTime();
    if (!S.frozen) {
      while (S.next < S.notes.length) {
        const n = S.notes[S.next];
        if (S.judged[n.idx] >= 0) { S.next += 1; continue; }
        if (S.learn) {
          if (t >= n.t) { freeze(n); t = n.t; }
          break;
        }
        if (t < n.t + dm.win[2] + INPUT_GRACE) break;
        miss(n);
        S.next += 1;
      }
      if (!S.frozen) { scheduleSounds(); countIn(t); }
    }
    if (S.judge === "hover" && S.hover) hoverCheck(t, dm);
    draw(t, dm);
    $id("hjsProg").style.transform = `scaleX(${clamp(t / (S.endT + 1), 0, 1).toFixed(4)})`;
    if (!S.finished && S.next >= S.notes.length && t > S.endT + 1.6) { finish(); return; }
    S.raf = requestAnimationFrame(tick);
  }

  /* 补音与预备拍：按音频钟的精确位置提前 AHEAD 秒排进 Web Audio，准点出声；学习模式不越过下一个要弹的音 */
  function scheduleSounds() {
    const play = bard().playMidi;
    if (!play || !S.clock || !S.clock.run || !S.playing) return;
    const pos = clockRaw(S.clock);
    const inst = instId();
    const limit = S.learn ? nextDueT() : Infinity;
    const list = S.bgList;
    while (S.bgNext < list.length) {
      const n = list[S.bgNext];
      if (n.t > pos + AHEAD || n.t >= limit - 0.001) break;
      S.bgNext += 1;
      if (n.t < pos - 0.1) continue;
      play(n.m, n.v, inst, 0, Math.max(0, n.t - pos));
    }
    while (S.tickNext < S.ticks.length) {
      const n = S.ticks[S.tickNext];
      if (n.t > pos + AHEAD) break;
      S.tickNext += 1;
      if (n.t < pos - 0.1) continue;
      play(n.m, TICK.vel, TICK.inst, 0, Math.max(0, n.t - pos));
    }
  }
  function nextDueT() {
    for (let i = S.next; i < S.notes.length; i++) if (S.judged[S.notes[i].idx] < 0) return S.notes[i].t;
    return Infinity;
  }
  /* 曲子第一个音（0 秒）前的 3·2·1 */
  function countIn(t) {
    const left = -t;
    if (left > 0 && left <= S.spb * 3 + 0.05) {
      const n = Math.ceil(left / S.spb - 0.02);
      banner(String(clamp(n, 1, 3)), "is-count", `c${n}`);
    } else if (S.bannerKey && S.bannerKey.startsWith("c")) {
      banner("", "");
    }
  }

  /* 画气泡：位置在布局时就定好，每帧只改收缩进度 */
  function draw(t, dm) {
    const ap = dm.approach;
    let nextIdx = -1;
    for (let i = S.next; i < S.notes.length; i++) if (S.judged[S.notes[i].idx] < 0) { nextIdx = S.notes[i].idx; break; }
    for (let i = Math.max(0, S.next - 4); i < S.notes.length; i++) {
      const n = S.notes[i];
      const dt = n.t - t;
      if (dt > ap) break;
      if (S.judged[n.idx] >= 0 || dt < -0.6) { S.els.get(n.idx)?.classList.remove("is-next"); continue; }
      const el = S.els.get(n.idx) || noteEl(n);
      el.classList.toggle("is-next", n.idx === nextIdx && dt <= NEXT_LEAD);   // 下一个该弹的：快到点时外圈才加粗
      const k = clamp(1 - dt / ap, 0, 1);
      el.style.setProperty("--k", k.toFixed(3));
      el.style.opacity = dt > ap - 0.22 ? clamp((ap - dt) / 0.22, 0, 1).toFixed(2) : "";
    }
  }
  function placeEl(el, n) {
    if (!n) return;
    el.style.transform = `translate3d(${n.x.toFixed(1)}px, ${n.y.toFixed(1)}px, 0)`;
  }
  function noteEl(n) {
    const el = h("div", { class: "hjs-note" }, h("i", { class: "hjs-ring" }), h("i", { class: "hjs-core" }), h("i", { class: "hjs-name", text: midiName(n.m) }));
    el.style.setProperty("--c", PALETTE[n.c]);
    el.style.zIndex = String(S.notes.length - n.idx);   // 先到的叠在上面
    placeEl(el, n);
    $id("hjsNotes").appendChild(el);
    S.els.set(n.idx, el);
    return el;
  }
  function dropEl(n, cls, ms) {
    const el = S.els.get(n.idx);
    if (!el) return;
    S.els.delete(n.idx);
    el.classList.remove("is-wait", "is-next");
    el.classList.add(cls);
    setTimeout(() => el.remove(), ms);
  }
  function clearNotes() {
    const f = $id("hjsNotes");
    if (f) f.textContent = "";
    S.els.clear();
  }

  /* ==== 输入 ==== */
  function onPlayPointer(e) {
    if (e.target.closest && e.target.closest("button")) return;
    if (e.pointerType === "mouse" && e.button !== 0 && e.button !== 2) return;   // 左右键都算点
    if (S.needTap) { e.preventDefault(); startSong(); return; }
    if (S.view !== "play" || !S.playing || S.paused) return;
    e.preventDefault();
    if (S.judge === "hover" || e.pointerType === "mouse") S.hover = hoverPos(e);
    const r = S.root.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (S.mode === "keys") {
      const lane = clamp(Math.floor(x / S.g.laneW), 0, S.lanes - 1);
      flashLane(lane);
      press(lane, e);
    } else {
      tapAt(x, y, e);
    }
  }
  /* 记下指针在哪（鼠标一直跟着；手指按着时才算，抬起就清掉）：
     放水模式每帧由 hoverCheck 看它停在哪个气泡上；电脑点气泡时按键盘任意键＝在鼠标处点一下（onKeyDown） */
  function hoverPos(e) {
    const r = S.root.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function onHoverMove(e) {
    if (e.pointerType !== "mouse" && (S.judge !== "hover" || !e.buttons)) return;
    S.hover = hoverPos(e);
  }
  function onHoverEnd(e) {
    if (e.type === "pointerleave" || e.pointerType !== "mouse") S.hover = null;
  }
  /* 指针在气泡上：气泡到点（外圈缩到核心）那一下自动算弹中；指针来晚了，还在判定窗里就按晚了多少算 */
  function hoverCheck(t, dm) {
    const g = S.g;
    if (!g) return;
    const R = g.size * HOVER_R;
    const { x, y } = S.hover;
    if (S.frozen && S.waiting) {
      if (Math.hypot(S.waiting.x - x, S.waiting.y - y) <= R) learnHit(S.waiting);
      return;
    }
    for (let i = Math.max(0, S.next - 4); i < S.notes.length; i++) {
      const n = S.notes[i];
      const dt = n.t - t;
      if (dt > 0) break;
      if (S.judged[n.idx] >= 0 || dt < -dm.win[2]) continue;
      if (Math.hypot(n.x - x, n.y - y) <= R) { hit(n, tierOf(-dt, dm), -dt); return; }
    }
  }
  /* 事件发生时的歌曲时间：处理得晚了（主线程忙）就往回扣一点（最多 TS_MAX 秒） */
  function inputTime(e) {
    const t = songTime();
    const dg = S.diag;
    const ts = e && Number(e.timeStamp);
    if (!dg || dg.tsBad || !ts) return t;
    const wait = (performance.now() - ts) / 1000;
    if (!(wait > -0.02 && wait < 1)) { dg.tsBad = true; return t; }   // 时基对不上（或 1970 年起的老格式）：这局不用了
    if (dg.waits.length < 400) dg.waits.push(wait);
    return t - clamp(wait, 0, TS_MAX);
  }

  function onKeyDown(e) {
    if (!S.root || S.root.hidden) return;
    if (S.binding >= 0) {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") { S.binding = -1; renderSheet(); return; }
      if (!BINDABLE.test(e.code)) { toast("这个键不能用，换一个字母、数字或空格"); return; }
      const list = S.codes[lanesNow()];
      const other = list.indexOf(e.code);
      if (other >= 0 && other !== S.binding) list[other] = list[S.binding];
      list[S.binding] = e.code;
      storage.set(K.codes, JSON.stringify(S.codes));
      S.binding = -1;
      renderSheet();
      return;
    }
    if (S.cal) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); stopCal("校准取消了"); return; }
      if (e.repeat || e.key === "Tab") return;
      e.preventDefault();
      calTap();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      goBack();
      return;
    }
    if (S.view === "play") {
      if (S.needTap && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); startSong(); return; }
      if (!S.playing || S.paused || e.ctrlKey || e.metaKey || e.altKey) return;
      if (S.mode === "tap") {
        /* 电脑点气泡（放水模式除外）：鼠标指着气泡按任意键＝在鼠标处点一下 */
        if (S.judge === "hover" || !S.hover || /^(F\d+|Tab|CapsLock|Control|Alt|Meta|ContextMenu)$/.test(e.key)) return;
        e.preventDefault();
        if (!e.repeat) tapAt(S.hover.x, S.hover.y, e);
        return;
      }
      const lane = S.codes[S.lanes].indexOf(e.code);
      if (lane < 0) return;
      e.preventDefault();
      if (e.repeat) return;
      flashLane(lane, true);
      press(lane, e);
      return;
    }
    if (S.view === "lobby" && !S.sheet && e.key === "Enter") {
      const tag = e.target && e.target.tagName;
      if (tag === "BUTTON" || tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      e.preventDefault();
      startSong();
    }
  }
  function onKeyUp(e) {
    if (!S.root || S.root.hidden || S.view !== "play" || S.mode !== "keys") return;
    const lane = S.codes[S.lanes].indexOf(e.code);
    if (lane >= 0) document.querySelector(`.hjs-cap[data-lane="${lane}"]`)?.classList.remove("is-down");
  }
  function flashLane(lane, hold) {
    const cap = document.querySelector(`.hjs-cap[data-lane="${lane}"]`);
    const ln = document.querySelector(`.hjs-lane[data-lane="${lane}"]`);
    if (cap) { cap.classList.add("is-down"); if (!hold) setTimeout(() => cap.classList.remove("is-down"), 110); }
    if (ln) { ln.classList.remove("is-lit"); void ln.offsetWidth; ln.classList.add("is-lit"); }
  }

  const tierOf = (d, dm) => (d <= dm.win[0] ? 0 : d <= dm.win[1] ? 1 : 2);

  /* 一次点按算给哪个音：先到先得 —— 判定窗里最早还没弹的那个。不然气泡挨得近、点得稍晚一点时，
     这一下会被算给下一个音，后面每一下都跟着错一个（多出 GOOD 和 MISS）。只有两种情况跳过最早那个：
     · 点在后面某个气泡正中（0.45 个气泡以内），离最早那个却有 1.3 个气泡以上 —— 就是想点后面那个
     · 最早那个已经晚过 GREAT 窗，后面那个时间更准、位置也不比它远 —— 前一个留给判漏
     cands：[{ n, d }]，按时间先后，d 为离点按处多少个气泡（键盘为 0） */
  function pickNote(cands, t, dm) {
    if (!cands.length) return null;
    const first = cands[0];
    for (let i = 1; i < cands.length; i++) {
      const c = cands[i];
      if (c.d <= 0.45 && first.d >= 1.3 && c.d + 0.5 <= first.d) return c.n;
      if (first.n.t - t < -dm.win[1] && Math.abs(c.n.t - t) < Math.abs(first.n.t - t) && c.d <= first.d + 0.3) return c.n;
    }
    return first.n;
  }

  /* 键盘：这条轨道里离现在最近、还在判定窗内的音 */
  function press(lane, e) {
    if (S.frozen && S.waiting) {
      if (S.waiting.lane === lane) learnHit(S.waiting);
      return;
    }
    const dm = diffMeta();
    const t = inputTime(e);
    const cands = [];
    for (let i = Math.max(0, S.next - 4); i < S.notes.length; i++) {
      const n = S.notes[i];
      if (n.t - t > dm.win[2]) break;
      if (n.lane !== lane || S.judged[n.idx] >= 0 || n.t - t < -dm.win[2]) continue;
      cands.push({ n, d: 0 });
    }
    const best = pickNote(cands, t, dm);
    if (best) hit(best, tierOf(Math.abs(best.t - t), dm), t - best.t);
  }

  /* 点气泡：判定窗内、离点按处判定半径（TAP_RANGES 的 r 个气泡直径）以内的音，时间越准、离得越近越优先；
     一个都没有时，下一个该弹的音在 next 个气泡直径以内也算 */
  function tapAt(x, y, e) {
    const g = S.g;
    const rg = TAP_RANGES[S.range] || TAP_RANGES.normal;
    const R = g.size * rg.r;
    if (S.frozen && S.waiting) {
      const n = S.waiting;
      if (Math.hypot(n.x - x, n.y - y) <= R * 1.5) learnHit(n);
      else ghost(x, y);
      return;
    }
    const dm = diffMeta();
    const t = inputTime(e);
    const cands = [];
    for (let i = Math.max(0, S.next - 4); i < S.notes.length; i++) {
      const n = S.notes[i];
      const dt = n.t - t;
      if (dt > dm.win[2]) break;
      if (S.judged[n.idx] >= 0 || dt < -dm.win[2]) continue;
      const d = Math.hypot(n.x - x, n.y - y);
      if (d <= R) cands.push({ n, d: d / g.size });
    }
    let best = pickNote(cands, t, dm);
    if (!best) {
      for (let i = S.next; i < S.notes.length; i++) {
        const n = S.notes[i];
        if (S.judged[n.idx] >= 0 || n.t - t < -dm.win[2]) continue;   // 已经过了判定窗、等着判漏的不算
        if (n.t - t <= dm.win[2] && Math.hypot(n.x - x, n.y - y) <= g.size * rg.next) best = n;
        break;
      }
    }
    if (best) hit(best, tierOf(Math.abs(best.t - t), dm), t - best.t);
    else { S.ghosts += 1; ghost(x, y); }
  }
  function ghost(x, y) {
    const el = h("div", { class: "hjs-ghost" });
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    $id("hjsNotes").appendChild(el);
    setTimeout(() => el.remove(), 420);
  }

  /* ==== 判定 ==== */
  function hit(n, tier, off) {
    S.judged[n.idx] = tier;
    if (Number.isFinite(off) && !S.learn) S.offs.push(off);
    bard().playMidi?.(n.m, JUDGE[tier].vel, instId(), 0, 0);
    dropEl(n, "is-hit", 300);
    S.combo += 1;
    S.maxCombo = Math.max(S.maxCombo, S.combo);
    S.counts[JUDGE[tier].id] += 1;
    if (S.learn) {
      S.learnHits += 1;
      popJudge("WELL", "is-ok");
    } else {
      S.score += Math.round(JUDGE[tier].pts * (1 + Math.min(S.combo, 60) / 120));
      popJudge(JUDGE[tier].label, `is-${JUDGE[tier].id}`, off);
    }
    while (S.next < S.notes.length && S.judged[S.notes[S.next].idx] >= 0) S.next += 1;
    updateHud();
  }
  function miss(n) {
    S.judged[n.idx] = 3;
    dropEl(n, "is-miss", 320);
    S.combo = 0;
    S.counts.miss += 1;
    popJudge("MISS", "is-miss");
    updateHud();
  }

  function popJudge(label, cls, off) {
    const box = $id("hjsJudge");
    box.textContent = "";
    const ms = Number.isFinite(off) ? Math.round(off * 1000) : 0;
    box.append(h("div", { class: `hjs-pop ${cls}` },
      h("b", { text: label }),
      /* 不是 PERFECT 时标出早还是晚，一直「晚」就该去校准了 */
      Math.abs(ms) >= 20 && cls !== "is-perfect" ? h("em", { class: ms > 0 ? "is-late" : "is-early", text: `${ms > 0 ? "晚" : "早"} ${Math.abs(ms)} ms` }) : null));
  }

  /* 记帧间隔：手机画不动（连续掉帧）时自动切到省电画法（去掉光晕阴影），气泡收缩不再卡顿；
     另按本机刷新率记掉帧（单独掉一帧也算）给结算的诊断行用 */
  function noteFrame() {
    const dg = S.diag;
    if (!dg) return;
    const now = performance.now();
    if (dg.last && now - dg.last < 1000) {
      dg.frames += 1;
      if (now - dg.last > 34) dg.slow += 1;
      if (!dg.lite && dg.frames >= 90 && dg.slow / dg.frames > 0.2) {
        dg.lite = true;
        S.root.classList.add("is-lite");
      }
      const iv = now - dg.last;
      if (!dg.base) {
        dg.warm.push(iv);
        if (dg.warm.length >= 120) { dg.warm.sort((a, b) => a - b); dg.base = dg.warm[60]; dg.warm = null; }
      } else {
        dg.n += 1;
        dg.max = Math.max(dg.max, iv);
        if (iv > dg.base * 1.5) {
          dg.drop += 1;
          const k = Math.floor(Math.max(0, clockRaw(S.clock) - S.clock.lat) / 4);
          dg.buckets.set(k, (dg.buckets.get(k) || 0) + 1);
        }
      }
    }
    dg.last = now;
  }

  function updateHud() {
    const total = S.notes.length;
    $id("hjsScoreL").textContent = S.learn ? "已弹对" : "分数";
    $id("hjsScore").textContent = S.learn ? `${S.learnHits}/${total}` : fmtNum(S.score);
    $id("hjsCombo").textContent = String(S.combo);
    /* 判定字下方常驻的连击数：一直显示，涨了跳一下，断了变暗 */
    const big = $id("hjsComboBig");
    const n = $id("hjsComboN");
    if (n.textContent !== String(S.combo)) {
      const up = S.combo > +n.textContent;
      n.textContent = String(S.combo);
      big.classList.toggle("is-zero", S.combo === 0);
      /* 跳一下用 Web Animations，不用「删类 → 读 offsetWidth → 加类」：那样每涨一次连击都强制排版一次，密集段更卡 */
      if (up && n.animate && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
        n.animate([{ transform: "scale(1.22)" }, { transform: "none" }], { duration: 220, easing: "ease-out" });
      }
    }
  }

  function banner(text, cls, key) {
    const b = $id("hjsBanner");
    const k = key || text;
    if (S.bannerKey === k && text) return;
    S.bannerKey = text ? k : "";
    b.className = `hjs-banner ${cls || ""}`.trim();
    b.textContent = "";
    if (text) b.append(h("span", { text }));
  }

  function accPct() {
    const c = S.counts || {};
    const done = c.perfect + c.great + c.good + c.miss;
    if (!done) return 100;
    return ((3 * c.perfect + 2 * c.great + c.good) / (3 * done)) * 100;
  }
  const rankOf = (p) => (p >= 98 ? "SS" : p >= 93 ? "S" : p >= 85 ? "A" : p >= 72 ? "B" : p >= 55 ? "C" : "D");

  /* ==== 学习模式：停在这一拍等玩家 ==== */
  function freeze(n) {
    S.frozen = true;
    S.waiting = n;
    S.frozenT = n.t;
    /* 钟停下并退回这一拍：补音只排到这一拍之前，弹中后从这里接着走，你弹的这一下和后面的音对得上 */
    clockStop(S.clock);
    S.clock.base = n.t;
    const el = S.els.get(n.idx) || noteEl(n);
    el.style.setProperty("--k", "1");
    el.style.opacity = "";
    el.classList.add("is-wait");
    banner(S.mode === "keys" ? `按 ${codeLabel(S.codes[S.lanes][n.lane])}` : "点亮着的气泡", "is-hint");
  }
  function learnHit(n) {
    hit(n, 0);
    for (let i = S.next; i < S.notes.length; i++) {
      const m = S.notes[i];
      if (S.judged[m.idx] >= 0) continue;
      if (m.t <= S.frozenT + 0.001) { freeze(m); return; }
      break;
    }
    S.frozen = false;
    S.waiting = null;
    banner("", "");
    resumeAudio();
  }
  function resumeAudio() {
    clockStart(S.clock);
  }

  /* ==== 暂停 / 结算 ==== */
  function setPauseIcon(paused) {
    const b = document.querySelector(".hjs-pause");
    if (!b) return;
    b.innerHTML = paused ? ICON.play : ICON.pause;
    b.setAttribute("aria-label", paused ? "继续" : "暂停");
    b.title = paused ? "继续" : "暂停";
  }
  function pause() {
    if (S.view !== "play" || !S.playing || S.paused || S.finished) return;
    S.paused = true;
    cancelAnimationFrame(S.raf);
    S.raf = 0;
    clockStop(S.clock);
    setPauseIcon(true);
    modal(h("div", { class: "hjs-card hjs-res" },
      h("h3", { class: "hjs-res-title", text: "已暂停" }),
      h("p", { class: "hjs-res-sub", text: `${S.song.t} · ${diffMeta().label}${S.learn ? " · 学习" : judgeTag()}` }),
      h("div", { class: "hjs-res-btns" },
        h("button", { type: "button", class: "hjs-btn is-main", text: "继续", onclick: resume }),
        h("button", { type: "button", class: "hjs-btn", text: "重来", onclick: () => startSong() }),
        h("button", { type: "button", class: "hjs-btn", text: "停止演奏", onclick: backToLobby }))));
  }
  function resume() {
    if (!S.paused) return;
    S.paused = false;
    $id("hjsModal").hidden = true;
    setPauseIcon(false);
    bard().unlock?.();                                  // 切后台时系统可能把音频挂起了
    if (!S.frozen) resumeAudio();
    loop();
  }
  function modal(card) {
    const m = $id("hjsModal");
    m.textContent = "";
    m.append(card);
    m.hidden = false;
    requestAnimationFrame(() => m.querySelector(".is-main")?.focus({ preventScroll: true }));
  }

  function finish() {
    if (S.finished) return;
    S.finished = true;
    S.playing = false;
    cancelAnimationFrame(S.raf);
    S.raf = 0;
    clearInterval(S.pump);
    banner("", "");
    const total = S.notes.length;
    const pct = accPct();
    const tag = (k, v) => h("span", { class: "hjs-res-tag" }, h("small", { text: k }), h("b", { text: v }));
    const card = h("div", { class: "hjs-card hjs-res" }, h("h3", { class: "hjs-res-title", text: "演出结束" }), h("p", { class: "hjs-res-song", text: S.song.t }),
      h("div", { class: "hjs-res-tags" }, tag("难度", diffMeta().label), tag("判定", judgeLabel()), S.learn ? tag("模式", "学习") : null));
    if (S.learn) {
      card.append(
        h("div", { class: "hjs-res-big", text: `${S.learnHits} / ${total}` }),
        h("p", { class: "hjs-res-sub", text: "学习模式不计分。弹熟了就切到「演出」，正式来一次" }));
    } else {
      const isNew = saveBest(pct);
      const fullCombo = total > 0 && S.maxCombo >= total;   // 一个 MISS 都没有，连击从头连到尾
      card.append(
        ...(fullCombo ? [h("div", { class: "hjs-res-fc", text: "FULL COMBO!" })] : []),   // 原生 append 会把 null 写成文字，不能传 null
        h("div", { class: "hjs-res-rank" }, h("span", { text: rankOf(pct) }), isNew ? h("em", { text: "新纪录" }) : null),
        h("div", { class: "hjs-res-big", text: fmtNum(S.score) }),
        h("p", { class: "hjs-res-sub", text: `准确率 ${pct.toFixed(1)}% · 最大连击 ${S.maxCombo}` }),
        timingNote(),
        h("div", { class: "hjs-res-grid" }, JUDGE.map((j) => h("div", { class: `hjs-cell is-${j.id}` }, h("b", { text: String(S.counts[j.id]) }), h("small", { text: j.label })))));
    }
    card.append(h("div", { class: "hjs-res-btns" },
      h("button", { type: "button", class: "hjs-btn is-main", text: "再来一次", onclick: () => startSong() }),
      h("button", { type: "button", class: "hjs-btn", text: "下一首", onclick: () => { nextSong(); startSong(); } }),
      h("button", { type: "button", class: "hjs-btn", text: "回大厅", onclick: backToLobby })));
    modal(card);
  }
  /* 结算里的手感诊断：平均早晚、点空几下 */
  function timingNote() {
    const o = (S.offs || []).slice().sort((a, b) => a - b);
    const ms = o.length ? Math.round(o[Math.floor(o.length / 2)] * 1000) : 0;
    const parts = [Math.abs(ms) < 10 ? "手感很准，平均几乎不早不晚" : `平均偏${ms > 0 ? "晚" : "早"} ${Math.abs(ms)} ms`];
    if (S.mode === "tap" && S.ghosts) parts.push(`点空 ${S.ghosts} 下`);
    /* 设备诊断：声音输出延迟、点按排队时间、掉帧比例（反馈问题时把这一行发过来） */
    const dg = S.diag || {};
    const w = (dg.waits || []).slice().sort((a, b) => a - b);
    const dev = [
      `输出延迟 ${Math.round((S.clock ? S.clock.lat : 0) * 1000)} ms`,
      dg.tsBad ? "点按时间戳不可用" : w.length ? `点按排队 ${Math.round(w[Math.floor(w.length / 2)] * 1000)} ms` : null,
      dg.frames ? frameNote(dg) : null,
      S.delayMs ? `判定延迟 ${S.delayMs > 0 ? "+" : ""}${S.delayMs} ms` : null,
      S.render === "simple" ? "简单显示" : null,
      S.mode === "tap" && S.range === "loose" ? "宽松点击范围" : null,
    ].filter(Boolean).join(" · ");
    return h("div", {},
      o.length >= 8 ? h("p", { class: "hjs-res-sub hjs-res-timing", text: parts.join(" · ") }) : null,
      h("p", { class: "hjs-res-diag", text: dev }));
  }
  /* 掉帧：按本机刷新率算（单独掉一帧也算），再标出最卡的那 4 秒在哪、最长一帧多久 */
  function frameNote(dg) {
    const lite = dg.lite ? "（已切省电画法）" : "";
    if (!dg.base || !dg.n) return `掉帧 ${Math.round((100 * dg.slow) / dg.frames)}%${lite}`;
    const pct = (100 * dg.drop) / dg.n;
    let worst = null;
    dg.buckets.forEach((c, k) => { if (!worst || c > worst.c) worst = { k, c }; });
    const where = worst && worst.c >= 3 ? `，最多在 ${fmtTime(worst.k * 4)}~${fmtTime(worst.k * 4 + 4)}（${worst.c} 帧）` : "";
    return `掉帧 ${pct < 1 && dg.drop ? "<1" : Math.round(pct)}%（${Math.round(1000 / dg.base)} Hz${where}，最长一帧 ${Math.round(dg.max)} ms）${lite}`;
  }
  function saveBest(pct) {
    const all = storage.json(K.best) || {};
    const key = `${S.song.id}:${S.diff}:${S.judge}`;
    const v = { score: S.score, acc: +pct.toFixed(1), rank: rankOf(pct), combo: S.maxCombo, diff: S.diff, judge: S.judge };
    const old = bestOf(all, S.song.id, S.diff, S.judge);
    if (old && v.score <= num(old.score, 0)) return false;
    all[key] = v;
    storage.set(K.best, JSON.stringify(all));
    return true;
  }

  window.HJStage = {
    open,
    close: () => close(),
    /* 冒烟测试用的只读快照 */
    get state() {
      return {
        view: S.view, sheet: S.sheet, mode: S.mode, lanes: S.lanes, playing: S.playing, paused: S.paused, frozen: S.frozen,
        finished: S.finished, song: S.song && S.song.id, notes: S.notes, judged: S.judged ? Array.from(S.judged) : [],
        bg: S.bgList, score: S.score, combo: S.combo, maxCombo: S.maxCombo, judge: S.judge, render: S.render, counts: S.counts, delayMs: S.delayMs, codes: S.codes, g: S.g,
        cat: S.cat, tags: S.tags, preview: S.preview.id, cal: !!S.cal, clock: S.clock && { run: S.clock.run, base: S.clock.base },
        startT: S.startT, endT: S.endT, pos: S.clock ? clockRaw(S.clock) : 0,
      };
    },
  };
})();
