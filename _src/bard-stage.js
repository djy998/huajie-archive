/* 花舞之街 · 舞台演奏（音游）。吟游诗人模拟器「高级功能」里的按钮按需加载（bard.js → loadLateScript），全屏演出。
   - 玩法：谱面上的每个音是一个气泡，出现在这个音的高度上（越往上音越高），外圈一边收缩一边等你，
     外圈缩到和核心重合的那一下就是判定点。弹中就用模拟器的乐器发出这个音 —— 旋律由你弹，伴奏自动播放
   - 两种操作（设置里可改，默认按设备自动选）：
     · 点气泡（手机、平板）：直接点气泡，点在旁边一点也算（判定半径约一个气泡直径）；气泡沿着旋律左右铺开，不会叠在一起
     · 键盘轨道（电脑）：屏幕按宽度分成 2~4 条轨道（自动或手选），音越低越靠左，气泡在哪条轨道就按那条的键；
       按 e.code 认键，开着中文输入法也能弹；鼠标点轨道也行
   - 时钟：伴奏 <audio>.currentTime 平滑后再减去判定延迟；暂停、切后台、学习模式都靠暂停伴奏，不会错拍
   - 谱面省掉的旋律音（轻松难度约省一半）由游戏按时间用轻音补上，旋律始终完整；
     开了「示范旋律」就改放示范轨，示范轨没加载上时整条旋律用轻音代替
   - 开头有四拍轻声预备拍（3·2·1），第一个气泡前就知道速度
   - 学习模式：不计分，气泡缩到判定点还没弹，音乐就停在这一拍，弹中才继续
   - 判定四档 Perfect / Great / Good / Miss，没有血量、不会失败；漏掉的音不出声
   - 声像固定居中（不跟着左右位置偏）；伴奏音量跟随全站音量
   - 界面：大厅（当前曲目、难度、模式、开始）/ 选曲窗口（搜索、星级筛选、试听）/ 设置窗口（音量、音色、示范旋律、
     操作方式、轨道与键位、判定延迟与校准）/ 玩法说明。Esc、手机返回键都是「回到上一层」
   - 曲库、谱面与音轨在 assets/bard/stage/（_src/tools/stage-build 生成） */
(() => {
  const BASE = "assets/bard/stage/";
  const K = {
    song: "hj_stage_song", diff: "hj_stage_diff", learn: "hj_stage_learn", demo: "hj_stage_demo", inst: "hj_stage_inst",
    input: "hj_stage_input", lanes: "hj_stage_lanes", codes: "hj_stage_codes", delay: "hj_stage_delay",
    best: "hj_stage_best", stars: "hj_stage_stars",
  };
  /* approach：气泡提前多久出现；win：Perfect / Great / Good 的判定半窗（秒）；size：键盘模式气泡占轨道宽的比例；tap：点气泡模式占屏幕短边的比例 */
  const DIFFS = [
    { id: "easy", label: "轻松", approach: 1.8, win: [0.15, 0.25, 0.36], size: 0.44, tap: 0.24 },
    { id: "normal", label: "标准", approach: 1.35, win: [0.11, 0.19, 0.29], size: 0.38, tap: 0.21 },
    { id: "hard", label: "挑战", approach: 1.05, win: [0.08, 0.14, 0.22], size: 0.32, tap: 0.19 },
  ];
  const JUDGE = [
    { id: "perfect", label: "PERFECT", pts: 300, vel: 1 },
    { id: "great", label: "GREAT", pts: 200, vel: 0.9 },
    { id: "good", label: "GOOD", pts: 100, vel: 0.8 },
    { id: "miss", label: "MISS", pts: 0, vel: 0 },
  ];
  const BG_VEL = 0.4;                 // 补音（谱面省掉的旋律音）的力度
  const TICK = { midi: 88, vel: 0.32, inst: "harp" };   // 预备拍
  const CAL = { lead: 1.2, gap: 0.6, count: 10 };       // metronome.mp3 的拍点（tools/stage-build/metronome.py）
  const LMIN = 2, LMAX = 4;
  const DEF_CODES = { 2: ["KeyF", "KeyJ"], 3: ["KeyF", "Space", "KeyJ"], 4: ["KeyD", "KeyF", "KeyJ", "KeyK"] };
  const BINDABLE = /^(Key[A-Z]|Digit\d|Numpad\d|Space|Arrow(Left|Right|Up|Down)|Semicolon|Quote|Comma|Period|Slash|Backslash|BracketLeft|BracketRight|Minus|Equal|Backquote|ShiftLeft|ShiftRight)$/;
  const CODE_LABEL = {
    Space: "空格", ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓", Semicolon: ";", Quote: "'", Comma: ",",
    Period: ".", Slash: "/", Backslash: "\\", BracketLeft: "[", BracketRight: "]", Minus: "-", Equal: "=", Backquote: "`",
    ShiftLeft: "左 Shift", ShiftRight: "右 Shift",
  };
  /* 曲目示范轨的音色 → 模拟器里最接近的乐器（音色选「跟随曲目」时用） */
  const SONG_INST = {
    piano: "piano", violin: "violin", flute: "flute", brass: "horn", trumpet: "trumpet", reed: "clarinet", harp: "harp",
    pizz: "fiddle", lute: "lute", organ: "clarinet", cello: "cello", musicbox: "harp", celesta: "harp", fife: "fife",
    sax: "sax", panpipes: "panpipes",
  };
  const BAND_COLORS = ["241 192 122", "239 163 180", "198 174 245", "150 212 232"];   // 低 → 高
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
    built: false, root: null, data: null, loading: null, err: "",
    view: "lobby", sheet: "", sheetBack: null,
    song: null, diff: "normal", learn: false, demo: false, inst: "", input: "auto", lanesPref: "auto",
    codes: null, delayMs: 0, stars: 0, query: "", binding: -1, cal: null, calMsg: "",
    gen: 0, mode: "tap", lanes: 4, notes: [], judged: null, next: 0, lo: 60, hi: 72, g: null,
    bg: [], bgAll: [], bgList: [], bgNext: 0, ticks: [], tickNext: 0, firstT: 0, lastT: 0, anchor: 0, spb: 0.5,
    playing: false, paused: false, frozen: false, waiting: null, frozenT: 0, finished: false, perfState: "",
    score: 0, combo: 0, maxCombo: 0, counts: null, learnHits: 0,
    raf: 0, els: new Map(), ck: {}, bannerKey: "",
    acc: null, perf: null, calAudio: null,
    preview: { id: "", timer: 0 }, bgmWasOn: false, closeTimer: 0, hist: false, closing: false, needTap: false,
  };

  /* ==== 工具（storage、showToast、siteVolume、bgm 是 main.js 的全局） ==== */
  const $id = (x) => document.getElementById(x);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const num = (v, d) => (v !== null && v !== "" && Number.isFinite(+v) ? +v : d);
  const coarse = () => matchMedia("(pointer: coarse)").matches;
  const diffMeta = () => DIFFS.find((d) => d.id === S.diff) || DIFFS[1];
  const fmtTime = (sec) => { const n = Math.max(0, Math.round(sec)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`; };
  const fmtNum = (n) => Math.round(n).toLocaleString("en-US");
  const midiName = (m) => `${NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
  const codeLabel = (c) => CODE_LABEL[c] || (/^Key/.test(c) ? c.slice(3) : /^Digit/.test(c) ? c.slice(5) : /^Numpad/.test(c) ? `小键盘 ${c.slice(6)}` : c);
  const starText = (n) => "★".repeat(clamp(n, 1, 5)) + "☆".repeat(5 - clamp(n, 1, 5));
  const tempoOf = (s) => {
    const map = Array.isArray(s.tempo) && s.tempo.length ? s.tempo : [[0, 120]];
    const a = Math.round(map[0][1] || 120);
    const b = Math.round(map[map.length - 1][1] || a);
    return a === b ? `${a} 拍/分` : `${a}→${b} 拍/分`;
  };
  const getRaw = (k, d) => { const v = storage.get(k); return v === null ? d : v; };
  const setRaw = (k, v) => storage.set(k, v);
  const toast = (m) => { try { showToast(m); } catch (e) {} };
  const VOL_STUB = { level: 0.8, muted: false, set() {}, attach(el) { el.volume = 0.8; } };
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

  /* ==== 时钟：<audio>.currentTime 在部分浏览器更新得粗，用 performance.now() 补帧间，再慢慢校回去 ==== */
  function audioClock(el, ck) {
    const now = performance.now();
    const raw = el.currentTime || 0;
    if (el.paused || !ck.on) {
      Object.assign(ck, { on: !el.paused, t: raw, raw, now, rawAt: now });
      return raw;
    }
    let t = ck.t + ((now - ck.now) / 1000) * (el.playbackRate || 1);
    if (raw !== ck.raw) {
      ck.raw = raw;
      ck.rawAt = now;
      const err = raw - t;
      t = Math.abs(err) > 0.06 ? raw : t + err * 0.2;
    } else if (now - ck.rawAt > 250) {
      t = Math.min(t, raw + 0.05);   // 伴奏卡在缓冲里：不能跑到声音前面
    }
    ck.t = t;
    ck.now = now;
    return t;
  }
  const songTime = () => audioClock(S.acc, S.ck) - S.delayMs / 1000;

  /* ==== 偏好 ==== */
  function readPrefs() {
    const diff = getRaw(K.diff, "normal");
    S.diff = DIFFS.some((d) => d.id === diff) ? diff : "normal";
    S.learn = getRaw(K.learn, "0") === "1";
    S.demo = getRaw(K.demo, "0") === "1";
    S.inst = getRaw(K.inst, "");
    S.input = ["auto", "tap", "keys"].includes(getRaw(K.input, "auto")) ? getRaw(K.input, "auto") : "auto";
    const ln = getRaw(K.lanes, "auto");
    S.lanesPref = ln === "auto" ? "auto" : String(clamp(num(ln, 4), LMIN, LMAX));
    S.delayMs = clamp(Math.round(num(getRaw(K.delay, 0), 0) / 5) * 5, -300, 300);
    S.stars = clamp(num(getRaw(K.stars, 0), 0), 0, 5);
    const saved = storage.json(K.codes) || {};
    S.codes = {};
    for (let n = LMIN; n <= LMAX; n++) {
      const got = Array.isArray(saved[n]) ? saved[n] : [];
      const list = DEF_CODES[n].map((d, i) => (typeof got[i] === "string" && BINDABLE.test(got[i]) ? got[i] : d));
      S.codes[n] = new Set(list).size === list.length ? list : DEF_CODES[n].slice();
    }
  }
  const instIds = () => (bard().instruments || []).map((i) => i.id);
  function instId() {
    if (S.inst === "song") return SONG_INST[S.song && S.song.inst] || "piano";
    if (S.inst && instIds().includes(S.inst)) return S.inst;
    return (bard().instName && bard().instName()) || "piano";
  }
  const modeNow = () => (S.input === "tap" || S.input === "keys" ? S.input : coarse() ? "tap" : "keys");
  function lanesFor(w) {
    if (S.lanesPref !== "auto") return clamp(+S.lanesPref, LMIN, LMAX);
    return w < 760 ? 2 : w < 1180 ? 3 : 4;
  }
  const lanesNow = () => lanesFor((S.root && S.root.clientWidth) || window.innerWidth);

  /* ==== 曲库 ==== */
  function loadData() {
    if (S.data) return Promise.resolve(true);
    S.loading ??= (async () => {
      try {
        const ver = (window.HJ && window.HJ.version) || "1";
        const res = await fetch(`${BASE}songs.json?v=${ver}`, { cache: "no-cache" });
        if (!res.ok) throw new Error(String(res.status));
        const json = await res.json();
        const list = (Array.isArray(json.songs) ? json.songs : []).filter((s) => s && s.id && s.notes && Array.isArray(s.notes.normal) && s.notes.normal.length);
        if (!list.length) throw new Error("empty");
        S.data = list;
        S.err = "";
        const id = getRaw(K.song, "");
        S.song = list.find((s) => s.id === id) || list[0];
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
  function filtered() {
    const q = S.query.trim().toLowerCase();
    return (S.data || []).filter((s) => {
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

    const mkAudio = () => {
      const a = new Audio();
      a.preload = "auto";
      a.setAttribute("aria-hidden", "true");
      root.appendChild(a);
      try { vol().attach(a); } catch (e) {}
      return a;
    };
    S.acc = mkAudio();
    S.perf = mkAudio();
    S.calAudio = mkAudio();
    S.acc.addEventListener("ended", () => { if (S.view === "play" && S.playing && !S.finished) finish(); });
    S.acc.addEventListener("pause", () => { if (S.preview.id) { S.preview.id = ""; paintPreview(); } });
    S.calAudio.addEventListener("ended", () => { if (S.cal) finishCal(); });

    const play = $id("hjsPlay");
    play.addEventListener("pointerdown", onPlayPointer);
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
        h("span", { text: `${s.c || "传统曲调"} · ${fmtTime(s.dur)} · ${tempoOf(s)}` }),
        s.tag ? h("span", { class: "hjs-tag", text: s.tag }) : null),
      s.note ? h("p", { class: "hjs-hero-note", text: s.note }) : null,
      h("div", { class: "hjs-hero-btns" },
        h("button", { type: "button", class: `hjs-btn hjs-prev-btn${previewing ? " is-on" : ""}`, id: "hjsLobbyPrev", "aria-pressed": String(previewing), onclick: () => togglePreview(s) },
          h("span", { class: "hjs-btn-ico", html: previewing ? ICON.stop : ICON.play }), h("span", { text: previewing ? "停止试听" : "试听" })),
        h("button", { type: "button", class: "hjs-btn", onclick: () => openSheet("picker") },
          h("span", { class: "hjs-btn-ico", html: ICON.list }), h("span", { text: "换一首" })))));

    const mode = modeNow();
    const lanes = lanesNow();
    const best = (storage.json(K.best) || {})[`${s.id}:${S.diff}`];
    main.append(h("section", { class: "hjs-card hjs-ctrl" },
      h("div", { class: "hjs-line" }, h("span", { class: "hjs-line-l", text: "难度" }),
        seg("难度", DIFFS.map((d) => ({ id: d.id, label: d.label })), S.diff, (v) => { S.diff = v; setRaw(K.diff, v); renderLobby(); })),
      h("div", { class: "hjs-line" }, h("span", { class: "hjs-line-l", text: "模式" }),
        seg("模式", [{ id: "show", label: "演出" }, { id: "learn", label: "学习" }], S.learn ? "learn" : "show",
          (v) => { S.learn = v === "learn"; setRaw(K.learn, S.learn ? "1" : "0"); renderLobby(); })),
      h("p", { class: "hjs-tip", text: S.learn ? "学习模式：气泡缩到判定点就停下等你弹，弹中再继续，不计分" : "演出模式：跟着节拍弹，按准确度给评级" }),
      vol().muted
        ? h("p", { class: "hjs-muted" }, h("span", { text: "现在是静音，听不到伴奏" }),
          h("button", { type: "button", class: "hjs-link", text: "打开声音", onclick: () => { vol().set(0.55); renderLobby(); } }))
        : null,
      best && !S.learn ? h("p", { class: "hjs-best", text: `本机纪录 · ${fmtNum(best.score)} 分 · ${best.rank} · ${best.acc}%` }) : null,
      h("button", { type: "button", class: "hjs-go", id: "hjsGo", onclick: () => startSong() },
        h("span", { class: "hjs-go-ico", html: ICON.play }), h("span", { text: S.learn ? "开始练习" : "开始演奏" })),
      h("p", { class: "hjs-ctrl-tip" },
        mode === "keys"
          ? [h("span", { text: "键盘" }), ...S.codes[lanes].map(kbd), h("span", { text: `· ${lanes} 条轨道 · Esc 暂停` })]
          : [h("span", { text: "直接点气泡演奏 · 点在旁边一点也算" })])));
  }

  /* ==== 试听：从第一个音开始放 8 秒伴奏 ==== */
  function togglePreview(s) {
    if (S.preview.id === s.id) { stopPreview(); return; }
    stopPreview();
    if (S.view !== "lobby" || !s) return;
    const a = S.acc;
    try {
      a.src = BASE + s.acc;
      a.currentTime = Math.max(0, num(s.lead, 0) - 0.15);
    } catch (e) {}
    a.volume = vol().level * 0.75;
    S.preview.id = s.id;
    paintPreview();
    a.play().then(() => {
      if (S.preview.id !== s.id) return;
      try { if (a.currentTime < num(s.lead, 0) - 0.5) a.currentTime = Math.max(0, num(s.lead, 0) - 0.15); } catch (e) {}
      clearTimeout(S.preview.timer);
      S.preview.timer = setTimeout(stopPreview, 8000);
    }, () => {
      if (S.preview.id === s.id) { S.preview.id = ""; paintPreview(); }
    });
  }
  function stopPreview() {
    clearTimeout(S.preview.timer);
    if (!S.preview.id) return;
    S.preview.id = "";
    try { S.acc.pause(); } catch (e) {}
    try { S.acc.volume = vol().level; } catch (e) {}
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
      type: "search", class: "hjs-search-in", placeholder: "搜曲名 / 作曲家 / 风格", value: S.query, "aria-label": "搜索曲目",
      enterkeyhint: "search", autocomplete: "off",
      oninput: () => { S.query = input.value; renderSongList(); },
    });
    card.append(
      h("div", { class: "hjs-search" }, h("span", { class: "hjs-search-ico", html: ICON.search }), input),
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
          h("small", { text: `${s.c || "传统曲调"} · ${fmtTime(s.dur)} · ${tempoOf(s)}` })),
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
    sel.append(h("option", { value: "song", text: "跟随曲目（和示范旋律同音色）" }));
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
      row("音色", sel, "你弹出来的音；拨弦、钢琴类起音最利落"),
      row("示范旋律", demo, "伴奏之上再放一条完整主旋律，可以照着弹")));

    /* 操作 */
    const mode = modeNow();
    const lanes = lanesNow();
    const opRows = [
      row("操作方式", seg("操作方式", [
        { id: "auto", label: "自动" }, { id: "tap", label: "点气泡" }, { id: "keys", label: "键盘" },
      ], S.input, (v) => { S.input = v; setRaw(K.input, v); renderSheet(); }), `现在：${mode === "tap" ? "点气泡" : "键盘轨道"}`),
    ];
    if (mode === "keys") {
      opRows.push(row("轨道数", seg("轨道数", [
        { id: "auto", label: "自动" }, { id: "2", label: "2" }, { id: "3", label: "3" }, { id: "4", label: "4" },
      ], S.lanesPref, (v) => { S.lanesPref = v; setRaw(K.lanes, v); renderSheet(); }), S.lanesPref === "auto" ? `按屏幕宽度，现在 ${lanes} 条` : "屏幕均分，音越低越靠左"));
      opRows.push(row("键位", h("div", { class: "hjs-keyrow" }, S.codes[lanes].map((c, i) => h("button", {
        type: "button", class: `hjs-keybtn${S.binding === i ? " is-bind" : ""}`, title: `第 ${i + 1} 条轨道`,
        text: S.binding === i ? "按新键…" : codeLabel(c),
        onclick: () => { S.binding = S.binding === i ? -1 : i; renderSheet(); },
      }))), S.binding >= 0 ? "按一个键（Esc 取消）；和别的轨道重了会自动对调" : "点一下再按新键"));
    }
    body.append(group("操作", ...opRows));

    /* 时机 */
    const val = h("b", { class: "hjs-num-v", text: `${S.delayMs > 0 ? "+" : ""}${S.delayMs} ms` });
    const setv = (v) => { S.delayMs = clamp(Math.round(v / 5) * 5, -300, 300); setRaw(K.delay, S.delayMs); val.textContent = `${S.delayMs > 0 ? "+" : ""}${S.delayMs} ms`; };
    const step = (d, label) => h("button", { type: "button", class: "hjs-step", "aria-label": label, text: d > 0 ? "＋" : "－", onclick: () => setv(S.delayMs + d) });
    const timing = [row("判定延迟", h("div", { class: "hjs-num" }, step(-5, "提前 5 毫秒"), val, step(5, "推后 5 毫秒"),
      h("button", { type: "button", class: "hjs-btn hjs-cal-btn", text: S.cal ? "校准中…" : "校准", disabled: !!S.cal, onclick: startCal })),
    "总觉得自己按准了却判晚 → 加；判早 → 减")];
    if (S.cal || S.calMsg) timing.push(calPanel());
    body.append(group("时机", ...timing));

    body.append(h("div", { class: "hjs-set-foot" }, h("button", {
      type: "button", class: "hjs-link", text: "恢复默认设置",
      onclick: () => {
        [K.inst, K.demo, K.input, K.lanes, K.codes, K.delay].forEach((k) => storage.remove(k));
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
        ["气泡出现在它那个音的高度上（越往上音越高），外圈会慢慢收缩；外圈缩到和核心重合的那一下，弹它就会发出这个音。旋律是你弹出来的，伴奏自动播放",
          "手机、平板：直接点气泡，点在旁边一点也算",
          "电脑：屏幕按宽度分成几条轨道，气泡落在哪条轨道就按那条的键（大厅下方有键位提示，设置里能改）",
          "开头会有四下轻轻的预备拍；漏掉的音不会响，轻松难度省掉的音游戏会用轻音替你补上",
          "学习模式：气泡到点还没弹，音乐就停下来等你，弹中再继续，不计分",
          "总觉得判定偏早或偏晚：设置 → 判定延迟 → 校准，跟着「嗒」声按几下就好",
          "Esc（手机上是返回键）：暂停 / 关窗口 / 回到上一层",
        ].map((t) => h("li", { text: t })))));
  }

  /* ==== 延迟校准：放 10 下「嗒」，跟着按任意键或点圆圈，取后几下偏差的中位数 ==== */
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
    const a = S.calAudio;
    S.cal = { taps: [], ck: {} };
    try { a.src = `${BASE}metronome.mp3?v=${(window.HJ && window.HJ.version) || "1"}`; a.currentTime = 0; } catch (e) {}
    a.play().catch(() => stopCal("节拍音没放出来，检查一下网络或音量"));
    renderSheet();
  }
  function calTap() {
    const c = S.cal;
    if (!c) return;
    const t = audioClock(S.calAudio, c.ck);
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
    S.cal = null;
    try { S.calAudio.pause(); } catch (e) {}
    if (msg !== undefined) S.calMsg = msg;
    if (S.sheet === "settings") renderSheet();
  }

  /* ==== 谱面与布局 ==== */
  function prepare(s) {
    const dm = diffMeta();
    const raw = (s.notes && s.notes[dm.id]) || s.notes.normal;
    S.notes = raw.map(([t, m], i) => ({ t: +t, m: +m, idx: i, lane: 0, band: 0, x: 0, y: 0 }));
    S.lo = num(s.range && s.range[0], 60);
    S.hi = Math.max(num(s.range && s.range[1], 72), S.lo + 1);
    S.mode = modeNow();
    S.lanes = S.mode === "keys" ? lanesNow() : 0;
    const span = S.hi - S.lo + 1;
    S.notes.forEach((n) => {
      const k = clamp((n.m - S.lo) / span, 0, 0.9999);
      n.band = Math.floor(k * 4);
      n.lane = S.lanes ? Math.floor(k * S.lanes) : 0;
    });
    S.judged = new Int8Array(S.notes.length).fill(-1);
    S.next = 0;
    S.firstT = S.notes.length ? S.notes[0].t : 0;
    S.lastT = S.notes.length ? S.notes[S.notes.length - 1].t : 0;

    /* 补音：完整旋律里谱面没有的音；示范轨挂了时用整条旋律 */
    const key = (t, m) => `${(+t).toFixed(3)}|${m}`;
    const inChart = new Set(raw.map(([t, m]) => key(t, m)));
    const mel = (Array.isArray(s.mel) ? s.mel : []).map(([t, m]) => ({ t: +t, m: +m })).sort((a, b) => a.t - b.t);
    S.bgAll = mel;
    S.bg = mel.filter((n) => !inChart.has(key(n.t, n.m)));

    /* 预备拍：伴奏第一拍（lead）之前四拍 */
    const bpm = num(Array.isArray(s.tempo) && s.tempo[0] && s.tempo[0][1], 120);
    S.spb = 60 / clamp(bpm, 30, 260);
    while (S.spb < 0.42) S.spb *= 2;        // 太快的曲子按两拍一下数
    S.anchor = clamp(num(s.lead, S.firstT), 0, S.firstT || 0);
    S.ticks = [];
    for (let k = 1; k <= 4; k++) { const t = S.anchor - k * S.spb; if (t >= 0.15) S.ticks.unshift({ t, m: TICK.midi }); }
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

    const span = Math.max(S.hi - S.lo, 10);
    const pad = (span - (S.hi - S.lo)) / 2;
    S.notes.forEach((n) => { n.y = bottom - clamp((n.m - S.lo + pad) / span, 0, 1) * (bottom - top); });

    if (keys) {
      /* 同一条轨道里音高相近、又挨得很近的两个音：左右错开一点，免得叠成一个 */
      const last = [];
      const d = Math.max(0, Math.min(laneW * 0.32, (laneW - size) / 2));
      S.notes.forEach((n) => {
        const p = last[n.lane];
        let off = 0;
        if (p && n.t - p.t < dm.approach && Math.abs(p.y - n.y) < size * 0.75) off = p.off > 0 ? -d : d;
        n.off = off;
        n.x = laneW * (n.lane + 0.5) + off;
        last[n.lane] = n;
      });
    } else {
      /* 点气泡：沿着旋律左右来回铺开，间隔按时间走，最少隔一个气泡 */
      const margin = size * 0.72 + 8;
      const usable = Math.max(1, w - margin * 2);
      const v = usable / 3;
      const sMin = Math.min(usable, size * 1.1);
      const sMax = Math.max(sMin, usable * 0.5);
      let x = margin + usable / 2;
      let dir = 1;
      let prev = null;
      S.notes.forEach((n) => {
        if (prev) {
          const stepX = clamp((n.t - prev.t) * v, sMin, sMax);
          let nx = x + dir * stepX;
          if (nx > margin + usable || nx < margin) { dir = -dir; nx = x + dir * stepX; }
          x = clamp(nx, margin, margin + usable);
        }
        n.x = x;
        prev = n;
      });
    }
    S.els.forEach((el, idx) => placeEl(el, S.notes[idx]));
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
    S.playing = false;
    S.paused = false;
    S.frozen = false;
    S.waiting = null;
    S.finished = false;
    S.needTap = false;
    S.bgNext = 0;
    S.tickNext = 0;
    S.ck = {};
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
    prepare(s);
    $id("hjsNowT").textContent = s.t;
    $id("hjsNowS").textContent = `${diffMeta().label}${S.learn ? " · 学习" : ""}`;
    setPauseIcon(false);
    layout();
    updateHud();
    $id("hjsProg").style.transform = "scaleX(0)";
    banner("准备中…", "is-wait");
    try { document.activeElement && document.activeElement.blur && document.activeElement.blur(); } catch (e) {}

    const b = bard();
    b.unlock?.();
    b.prepare?.(instId());

    /* 两条音轨都在这次点击里 play()，iOS 才放行 */
    const acc = S.acc;
    const perf = S.perf;
    try { acc.volume = vol().level; perf.volume = vol().level; } catch (e) {}
    acc.src = BASE + s.acc;
    S.perfState = "";
    S.bgList = S.bg;
    let pp = null;
    if (S.demo) {
      perf.src = BASE + s.perf;
      S.perfState = "wait";
      S.bgList = [];
      pp = perf.play();
    }
    const pa = acc.play();
    pa.then(() => {
      if (gen !== S.gen) return;
      if (S.perfState === "ok") syncPerf();
      begin();
    }, (err) => {
      if (gen !== S.gen) return;
      try { perf.pause(); } catch (e) {}
      if (err && err.name === "NotAllowedError") {
        S.needTap = true;
        banner("点一下屏幕开始", "is-wait");
      } else {
        backToLobby();
        toast("伴奏没加载上，检查一下网络再试");
      }
    });
    if (pp) {
      pp.then(() => {
        if (gen !== S.gen) return;
        S.perfState = "ok";
        if (S.playing) syncPerf();
        else if (acc.paused) { try { perf.pause(); } catch (e) {} }
      }, () => {
        if (gen !== S.gen) return;
        S.perfState = "fail";
        useBgFallback();
        toast("示范旋律没加载上，先用轻音代替");
      });
    }
    setTimeout(() => {
      if (gen === S.gen && S.view === "play" && !S.playing && !S.needTap && !S.finished && !S.paused) {
        backToLobby();
        toast("伴奏加载太久了，换个网络再试");
      }
    }, 20000);
  }

  function begin() {
    S.playing = true;
    S.ck = {};
    S.bannerKey = "";
    banner("", "");
    loop();
  }
  function syncPerf() {
    try {
      S.perf.currentTime = S.acc.currentTime;
      if (S.perf.paused && !S.acc.paused) S.perf.play().catch(() => {});
    } catch (e) {}
  }
  function useBgFallback() {
    const t = S.playing ? songTime() : 0;
    S.bgList = S.bgAll;
    S.bgNext = S.bgList.findIndex((n) => n.t >= t - 0.02);
    if (S.bgNext < 0) S.bgNext = S.bgList.length;
  }

  function stopAudio() {
    try { S.acc.pause(); } catch (e) {}
    try { S.perf.pause(); } catch (e) {}
  }
  function stopPlay() {
    cancelAnimationFrame(S.raf);
    S.raf = 0;
    S.playing = false;
    S.paused = false;
    S.frozen = false;
    S.waiting = null;
    stopAudio();
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
        if (t < n.t + dm.win[2]) break;
        miss(n);
        S.next += 1;
      }
      if (!S.frozen) { scheduleSounds(t); countIn(t); }
    }
    draw(t, dm);
    $id("hjsProg").style.transform = `scaleX(${clamp(t / (S.lastT + 1), 0, 1).toFixed(4)})`;
    if (!S.finished && S.next >= S.notes.length && t > S.lastT + 1.6) { finish(); return; }
    S.raf = requestAnimationFrame(tick);
  }

  /* 补音与预备拍：提前一点排进 Web Audio，准点出声；学习模式不越过下一个要弹的音 */
  function scheduleSounds(t) {
    const play = bard().playMidi;
    if (!play) return;
    const inst = instId();
    const limit = S.learn ? nextDueT() : Infinity;
    const list = S.bgList;
    while (S.bgNext < list.length) {
      const n = list[S.bgNext];
      if (n.t > t + 0.05 || n.t >= limit - 0.001) break;
      S.bgNext += 1;
      if (n.t < t - 0.1) continue;
      play(n.m, BG_VEL, inst, 0, Math.max(0, n.t - t));
    }
    while (S.tickNext < S.ticks.length) {
      const n = S.ticks[S.tickNext];
      if (n.t > t + 0.05) break;
      S.tickNext += 1;
      if (n.t < t - 0.1) continue;
      play(n.m, TICK.vel, TICK.inst, 0, Math.max(0, n.t - t));
    }
  }
  function nextDueT() {
    for (let i = S.next; i < S.notes.length; i++) if (S.judged[S.notes[i].idx] < 0) return S.notes[i].t;
    return Infinity;
  }
  /* 第一个气泡前的 3·2·1 */
  function countIn(t) {
    const left = S.anchor - t;
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
    for (let i = Math.max(0, S.next - 4); i < S.notes.length; i++) {
      const n = S.notes[i];
      const dt = n.t - t;
      if (dt > ap) break;
      if (S.judged[n.idx] >= 0 || dt < -0.4) continue;
      const el = S.els.get(n.idx) || noteEl(n);
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
    el.style.setProperty("--c", BAND_COLORS[n.band]);
    placeEl(el, n);
    $id("hjsNotes").appendChild(el);
    S.els.set(n.idx, el);
    return el;
  }
  function dropEl(n, cls, ms) {
    const el = S.els.get(n.idx);
    if (!el) return;
    S.els.delete(n.idx);
    el.classList.remove("is-wait");
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
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (S.needTap) { e.preventDefault(); startSong(); return; }
    if (S.view !== "play" || !S.playing || S.paused) return;
    e.preventDefault();
    const r = S.root.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (S.mode === "keys") {
      const lane = clamp(Math.floor(x / S.g.laneW), 0, S.lanes - 1);
      flashLane(lane);
      press(lane);
    } else {
      tapAt(x, y);
    }
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
      if (!S.playing || S.paused || S.mode !== "keys" || e.ctrlKey || e.metaKey || e.altKey) return;
      const lane = S.codes[S.lanes].indexOf(e.code);
      if (lane < 0) return;
      e.preventDefault();
      if (e.repeat) return;
      flashLane(lane, true);
      press(lane);
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

  /* 键盘：这条轨道里离现在最近、还在判定窗内的音 */
  function press(lane) {
    if (S.frozen && S.waiting) {
      if (S.waiting.lane === lane) learnHit(S.waiting);
      return;
    }
    const dm = diffMeta();
    const t = songTime();
    let best = null;
    let bestD = Infinity;
    for (let i = Math.max(0, S.next - 4); i < S.notes.length; i++) {
      const n = S.notes[i];
      if (n.t - t > dm.win[2]) break;
      if (n.lane !== lane || S.judged[n.idx] >= 0) continue;
      const d = Math.abs(n.t - t);
      if (d <= dm.win[2] && d < bestD) { bestD = d; best = n; }
    }
    if (best) hit(best, tierOf(bestD, dm));
  }

  /* 点气泡：判定窗内、离点按处一个气泡直径以内的音，时间越准、离得越近越优先 */
  function tapAt(x, y) {
    const g = S.g;
    const R = g.size * 1.05;
    if (S.frozen && S.waiting) {
      const n = S.waiting;
      if (Math.hypot(n.x - x, n.y - y) <= R * 1.5) learnHit(n);
      else ghost(x, y);
      return;
    }
    const dm = diffMeta();
    const t = songTime();
    let best = null;
    let bestScore = Infinity;
    for (let i = Math.max(0, S.next - 4); i < S.notes.length; i++) {
      const n = S.notes[i];
      const dt = n.t - t;
      if (dt > dm.win[2]) break;
      if (S.judged[n.idx] >= 0 || dt < -dm.win[2]) continue;
      const d = Math.hypot(n.x - x, n.y - y);
      if (d > R) continue;
      const score = Math.abs(dt) / dm.win[2] + (d / R) * 0.35;
      if (score < bestScore) { bestScore = score; best = n; }
    }
    if (best) hit(best, tierOf(Math.abs(best.t - t), dm));
    else ghost(x, y);
  }
  function ghost(x, y) {
    const el = h("div", { class: "hjs-ghost" });
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    $id("hjsNotes").appendChild(el);
    setTimeout(() => el.remove(), 420);
  }

  /* ==== 判定 ==== */
  function hit(n, tier) {
    S.judged[n.idx] = tier;
    bard().playMidi?.(n.m, JUDGE[tier].vel, instId(), 0, 0);
    dropEl(n, "is-hit", 300);
    S.combo += 1;
    S.maxCombo = Math.max(S.maxCombo, S.combo);
    S.counts[JUDGE[tier].id] += 1;
    if (S.learn) {
      S.learnHits += 1;
      popJudge("对了", "is-ok");
    } else {
      S.score += Math.round(JUDGE[tier].pts * (1 + Math.min(S.combo, 60) / 120));
      popJudge(JUDGE[tier].label, `is-${JUDGE[tier].id}`);
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

  function popJudge(label, cls) {
    const box = $id("hjsJudge");
    box.textContent = "";
    box.append(h("div", { class: `hjs-pop ${cls}` },
      h("b", { text: label }),
      S.combo >= 2 && cls !== "is-miss" && cls !== "is-wait" ? h("small", { text: `${S.combo} 连击` }) : null));
  }

  function updateHud() {
    const total = S.notes.length;
    $id("hjsScoreL").textContent = S.learn ? "已弹对" : "分数";
    $id("hjsScore").textContent = S.learn ? `${S.learnHits}/${total}` : fmtNum(S.score);
    $id("hjsCombo").textContent = String(S.combo);
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
    stopAudio();
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
    S.ck = {};
    S.acc.play().catch(() => {});
    if (S.perfState === "ok") syncPerf();
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
    stopAudio();
    setPauseIcon(true);
    modal(h("div", { class: "hjs-card hjs-res" },
      h("h3", { class: "hjs-res-title", text: "已暂停" }),
      h("p", { class: "hjs-res-sub", text: `${S.song.t} · ${diffMeta().label}${S.learn ? " · 学习" : ""}` }),
      h("div", { class: "hjs-res-btns" },
        h("button", { type: "button", class: "hjs-btn is-main", text: "继续", onclick: resume }),
        h("button", { type: "button", class: "hjs-btn", text: "重来", onclick: () => startSong() }),
        h("button", { type: "button", class: "hjs-btn", text: "回大厅", onclick: backToLobby }))));
  }
  function resume() {
    if (!S.paused) return;
    S.paused = false;
    $id("hjsModal").hidden = true;
    setPauseIcon(false);
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
    banner("", "");
    const total = S.notes.length;
    const pct = accPct();
    const card = h("div", { class: "hjs-card hjs-res" }, h("h3", { class: "hjs-res-title", text: "演出结束" }), h("p", { class: "hjs-res-song", text: `${S.song.t} · ${diffMeta().label}` }));
    if (S.learn) {
      card.append(
        h("div", { class: "hjs-res-big", text: `${S.learnHits} / ${total}` }),
        h("p", { class: "hjs-res-sub", text: "学习模式不计分。弹熟了就切到「演出」，正式来一次" }));
    } else {
      const isNew = saveBest(pct);
      card.append(
        h("div", { class: "hjs-res-rank" }, h("span", { text: rankOf(pct) }), isNew ? h("em", { text: "新纪录" }) : null),
        h("div", { class: "hjs-res-big", text: fmtNum(S.score) }),
        h("p", { class: "hjs-res-sub", text: `准确率 ${pct.toFixed(1)}% · 最大连击 ${S.maxCombo}` }),
        h("div", { class: "hjs-res-grid" }, JUDGE.map((j) => h("div", { class: `hjs-cell is-${j.id}` }, h("b", { text: String(S.counts[j.id]) }), h("small", { text: j.label })))));
    }
    card.append(h("div", { class: "hjs-res-btns" },
      h("button", { type: "button", class: "hjs-btn is-main", text: "再来一次", onclick: () => startSong() }),
      h("button", { type: "button", class: "hjs-btn", text: "下一首", onclick: () => { nextSong(); startSong(); } }),
      h("button", { type: "button", class: "hjs-btn", text: "回大厅", onclick: backToLobby })));
    modal(card);
  }
  function saveBest(pct) {
    const all = storage.json(K.best) || {};
    const key = `${S.song.id}:${S.diff}`;
    const v = { score: S.score, acc: +pct.toFixed(1), rank: rankOf(pct), combo: S.maxCombo };
    const old = all[key];
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
        bg: S.bgList, score: S.score, combo: S.combo, counts: S.counts, delayMs: S.delayMs, codes: S.codes, g: S.g,
      };
    },
  };
})();
