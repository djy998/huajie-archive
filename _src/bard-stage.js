/* 花舞之街 · 舞台演奏（音游）。吟游诗人模拟器「高级功能」里的按钮按需加载（bard.js → loadLateScript），全屏演出。
   - 曲子全部来自 MIDI（吟游诗人演奏用的单乐器 MIDI）：谱面挑出来的音是气泡，由你弹；MIDI 里其余的音
     （和声、谱面省掉的旋律音）由游戏按时间用轻音补上，整首曲子始终完整。不再有伴奏 / 示范音轨
   - 玩法：每个气泡出现在这个音的高度上（越往上音越高），外圈一边收缩一边等你，
     外圈缩到和核心重合的那一下就是判定点。弹中就用模拟器的乐器发出这个音
   - 操作：点气泡（手机、平板、电脑都一样；键盘轨道模式反直觉，已去掉）。点在旁边一点也算；气泡沿着旋律左右铺开，不会叠在一起；
     电脑上鼠标指着气泡按键盘任意键也算点。点击范围（设置里可改）：正常 / 宽松 / 放水（不看位置：外圈收到点的那个，
     点屏幕任意位置或按任意键都算）
   - 时钟：模拟器 AudioContext 的 currentTime（补音也排在这个钟上），帧间用 performance.now() 补齐；
     画面与判定 = 音频位置 − 输出延迟 − 判定延迟。暂停、切后台、学习模式都是停这个钟，不会错拍
   - 「示范旋律」：你要弹的音也先轻轻放出来，可以照着弹
   - 开头有四拍轻声预备拍（3·2·1），第一个气泡前就知道速度
   - 学习模式：不计分，气泡缩到判定点还没弹，音乐就停在这一拍，弹中才继续
   - 判定四档 Perfect / Great / Good / Miss，没有血量、不会失败；漏掉的音不出声
   - 判定模式（设置里可改）：正常（默认，判定窗随难度收紧）/ 宽松（三档难度都用轻松的判定窗）/
     放水（判定窗同宽松，不用点：指针停在气泡上，到点就算弹中）。点击范围和判定模式都是放水 = 自动演奏，不计分
   - 本机纪录按 曲目 × 难度 × 判定模式 × 点击范围 分开记
   - 飞花线（设置 → 画面，默认关）：一只萤火虫似的小花沿曲线掠过每个气泡，到点时正好经过该点的那个，身后撒星星（简单显示时拖一条金色的光）
   - 声像固定居中（不跟着左右位置偏）；音量跟随全站音量
   - 界面：大厅（当前曲目、难度、模式、开始）/ 选曲窗口（搜索、分类与星级筛选、试听）/ 设置窗口（音量、音色、示范旋律、
     点击范围、显示与飞花线、判定模式、判定延迟与校准）/ 玩法说明。Esc、手机返回键都是「回到上一层」
   - 曲目索引 assets/bard/stage/songs.json，每首的谱面 charts/<id>.json 点到才下载（_src/tools/stage-build 从 MIDI 生成） */
(() => {
  const BASE = "assets/bard/stage/";
  const K = {
    song: "hj_stage_song", diff: "hj_stage_diff", learn: "hj_stage_learn", demo: "hj_stage_demo", inst: "hj_stage_inst",
    delay: "hj_stage_delay", judge: "hj_stage_judge", render: "hj_stage_render", range: "hj_stage_range", fly: "hj_stage_fly",
    old: ["hj_stage_input", "hj_stage_lanes", "hj_stage_codes"],   // 键盘轨道模式去掉后不再用：操作方式、轨道数、键位
    best: "hj_stage_best2", stars: "hj_stage_stars", cat: "hj_stage_cat",   // best2：换成 MIDI 曲库后重新记
  };
  /* 判定半窗（秒）：Perfect / Great / Good。正常判定按难度收紧；宽松、放水三档难度都用 LOOSE_WIN（= 轻松那档） */
  const LOOSE_WIN = [0.18, 0.3, 0.45];
  /* approach：气泡提前多久出现；win：正常判定的半窗；tap：气泡直径占屏幕短边的比例 */
  const DIFFS = [
    { id: "easy", label: "轻松", approach: 1.8, win: [0.18, 0.3, 0.45], tap: 0.24 },
    { id: "normal", label: "标准", approach: 1.35, win: [0.14, 0.24, 0.36], tap: 0.21 },
    { id: "hard", label: "挑战", approach: 1.05, win: [0.11, 0.19, 0.29], tap: 0.2 },
  ];
  const JUDGE_MODES = [{ id: "normal", label: "正常" }, { id: "loose", label: "宽松" }, { id: "hover", label: "放水" }];
  const HOVER_R = 0.8;                                  // 放水模式：指针离气泡中心不到这么多个气泡直径就算「在气泡上」
  /* 输入：判 MISS 再多等 INPUT_GRACE 秒，免得排队中的点按还没处理、音就先被判漏了。TAP_R：点气泡的判定半径（气泡直径的倍数）
     点按排队的时间用 e.timeStamp 补回来，但最多补 TS_MAX 秒；有的手机浏览器（如一些 App 内置浏览器）的 timeStamp
     不是 performance.now 的时基，一旦对不上就整局不再用 */
  const INPUT_GRACE = 0.1;
  const TS_MAX = 0.05;
  /* 点击范围（设置里选）：r 为判定半径、next 为「下一个该弹的（外圈加粗那个）附近没别的气泡可算时」的放宽半径，都是气泡直径的倍数；
     放水（free）不看位置：判定窗里最早那个，点哪儿、按什么键都算 */
  const TAP_RANGES = {
    normal: { label: "正常", r: 1.4, next: 1.7 },
    loose: { label: "宽松", r: 1.7, next: 2.2 },
    free: { label: "放水", r: Infinity, next: Infinity },
  };
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
  /* 飞花线：像一只小萤火虫，沿一条平滑的曲线掠过每个气泡，在这个气泡该判定的那一刻正好经过它（ahead：提前多少秒经过，0 = 正好判定时）。
     正常显示：身后撒星星 —— 同时最多 stars 颗，花至少挪了 gap 个气泡直径、离上一颗至少 every 毫秒才撒，每颗停留 life 毫秒；
     简单显示：身后拖一条细细的金线 —— 取花在过去 tail 秒里走过的 samples 个点，连成平滑曲线（一条 SVG 路径），越往尾巴越淡。
     flower / star / line：花、星星的大小和线的粗细（气泡直径的倍数）；spin：花转一圈几秒 */
  const FLY = {
    ahead: 0, flower: 0.24, spin: 6,
    star: 0.13, stars: 16, every: 55, gap: 0.05, life: [850, 1150], kinds: 3,
    line: 0.045, tail: 0.45, samples: 20,
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
    song: null, diff: "normal", learn: false, demo: false, inst: "", judge: "normal", render: "normal", range: "normal", fly: false, fl: null,
    delayMs: 0, stars: 0, cat: "", query: "", cal: null, calMsg: "",
    gen: 0, notes: [], judged: null, next: 0, lo: 60, hi: 72, g: null,
    bg: [], bgAll: [], bgList: [], bgNext: 0, ticks: [], tickNext: 0, firstT: 0, lastT: 0, endT: 0, startT: 0, spb: 0.5,
    playing: false, paused: false, frozen: false, hover: null, waiting: null, frozenT: 0, finished: false,
    score: 0, combo: 0, maxCombo: 0, counts: null, learnHits: 0,
    raf: 0, pump: 0, els: new Map(), clock: null, bannerKey: "",
    preview: { id: "", timer: 0, clock: null, list: null, i: 0 },
    bgmWasOn: false, closeTimer: 0, coverTimer: 0, resuming: false, resumeTimer: 0, hist: false, closing: false, needTap: false,
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
  const rangeLabel = () => (TAP_RANGES[S.range] || TAP_RANGES.normal).label;
  /* 点击范围和判定模式都是放水：游戏自己弹（自动演奏），不计分、不记纪录 */
  const isAuto = () => S.judge === "hover" && S.range === "free";
  const scored = () => !S.learn && !isAuto();
  /* 得分倍率：判定模式、点击范围各自宽松扣 20%、放水扣 50%，两项相加（宽松 + 宽松 = ×0.6，放水 + 宽松 = ×0.3） */
  const SCORE_CUT = { normal: 0, loose: 0.2, hover: 0.5, free: 0.5 };
  const scoreMult = () => Math.max(0, 1 - (SCORE_CUT[S.judge] || 0) - (SCORE_CUT[S.range] || 0));
  function multNote() {
    const m = scoreMult();
    if (m >= 1) return "";
    const parts = [];
    if (SCORE_CUT[S.judge]) parts.push(`${judgeLabel()}判定 −${SCORE_CUT[S.judge] * 100}%`);
    if (SCORE_CUT[S.range]) parts.push(`${rangeLabel()}范围 −${SCORE_CUT[S.range] * 100}%`);
    return `得分 ×${+m.toFixed(2)}（${parts.join("、")}）`;
  }
  /* 大厅、暂停、演奏中标题下的一行：学习 / 自动演奏 / 判定与点击范围（默认的不写） */
  const modeTag = () => (S.learn ? " · 学习" : isAuto() ? " · 自动演奏" : judgeTag() + (S.range === "normal" ? "" : ` · ${rangeLabel()}范围`));
  /* 本机纪录按 曲目:难度:判定模式:点击范围 分开记。旧纪录：曲目:难度:判定模式（那时点击范围默认正常）算正常范围；
     更早的 曲目:难度（加判定模式以前：按轻松那档判定、1.7 个气泡的范围）算宽松判定 + 宽松范围 */
  function bestOf(all, id, diff, judge, range) {
    return all[`${id}:${diff}:${judge}:${range}`]
      || (range === "normal" ? all[`${id}:${diff}:${judge}`] : null)
      || (judge === "loose" && range === "loose" ? all[`${id}:${diff}`] : null) || null;
  }
  const fmtTime = (sec) => { const n = Math.max(0, Math.round(sec)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`; };
  const fmtNum = (n) => Math.round(n).toLocaleString("en-US");
  const midiName = (m) => `${NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
  const starText = (n) => "★".repeat(clamp(n, 1, 5)) + "☆".repeat(5 - clamp(n, 1, 5));
  /* 星级按档：songs.json 的 diffs = [轻松, 标准, 挑战]（轻松 1~3、标准 2~4、挑战 3~5 星）；旧曲库只有 diff（标准档） */
  function starsOf(s, diffId = S.diff) {
    const k = Math.max(0, DIFFS.findIndex((d) => d.id === diffId));
    return clamp(num(Array.isArray(s.diffs) ? s.diffs[k] : s.diff, 3), 1, 5);
  }
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
    S.inst = getRaw(K.inst, "song");                    // 默认跟随曲目（MIDI 原本的乐器）；"" 为跟随模拟器
    const judge = getRaw(K.judge, "normal");
    S.judge = JUDGE_MODES.some((m) => m.id === judge) ? judge : "normal";
    S.render = getRaw(K.render, "normal") === "simple" ? "simple" : "normal";
    const range = getRaw(K.range, "normal");
    S.range = Object.prototype.hasOwnProperty.call(TAP_RANGES, range) ? range : "normal";
    S.fly = getRaw(K.fly, "0") === "1";
    applyRender();
    S.delayMs = clamp(Math.round(num(getRaw(K.delay, 0), 0) / 5) * 5, -300, 300);
    S.stars = clamp(num(getRaw(K.stars, 0), 0), 0, 5);
    S.cat = String(getRaw(K.cat, "") || "");
    K.old.forEach((k) => storage.remove(k));
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
      if (S.stars && starsOf(s) !== S.stars) return false;
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
        h("div", { class: "hjs-fly", id: "hjsFly", hidden: true, "aria-hidden": "true" }),
        h("div", { class: "hjs-notes", id: "hjsNotes", "aria-hidden": "true" }),
        h("div", { class: "hjs-judge", id: "hjsJudge", "aria-live": "polite" }),
        h("div", { class: "hjs-banner", id: "hjsBanner", "aria-live": "polite" }),
        h("div", { class: "hjs-combo is-zero", id: "hjsComboBig", "aria-hidden": "true" }, h("b", { id: "hjsComboN", text: "0" }), h("small", { text: "连击" })),
        h("header", { class: "hjs-hud", id: "hjsHud" },
          h("div", { class: "hjs-hud-song" }, h("b", { id: "hjsNowT" }), h("small", { id: "hjsNowS" })),
          h("div", { class: "hjs-hud-stats" },
            h("span", { class: "hjs-stat" }, h("b", { id: "hjsScore", text: "0" }), h("small", { id: "hjsScoreL", text: "分数" })),
            h("span", { class: "hjs-stat" }, h("b", { id: "hjsCombo", text: "0" }), h("small", { text: "连击" }))),
          iconBtn("pause", "暂停", () => (S.paused ? resume() : pause()), "hjs-pause"),
          iconBtn("close", "结束演奏", () => backToLobby()),
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
    /* 舞台淡入盖满后，把下面的网站藏起来、停掉它的动画：被挡住的东西不再参与绘制 */
    S.coverTimer = setTimeout(() => document.body.classList.add("hjs-covered"), 260);
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
    stopPlay();
    hideSheet();
    const r = S.root;
    clearTimeout(S.coverTimer);
    document.body.classList.remove("hjs-covered");
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
    if (S.cal || S.sheet) goBack();
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
        h("span", { class: "hjs-stars", title: `${diffMeta().label}难度 ${starsOf(s)} / 5 星`, text: starText(starsOf(s)) }),
        h("span", { text: metaOf(s) }),
        s.tag ? h("span", { class: "hjs-tag", text: s.tag }) : null),
      s.note ? h("p", { class: "hjs-hero-note", text: s.note }) : null,
      h("div", { class: "hjs-hero-btns" },
        h("button", { type: "button", class: `hjs-btn hjs-prev-btn${previewing ? " is-on" : ""}`, id: "hjsLobbyPrev", "aria-pressed": String(previewing), onclick: () => togglePreview(s) },
          h("span", { class: "hjs-btn-ico", html: previewing ? ICON.stop : ICON.play }), h("span", { text: previewing ? "停止试听" : "试听" })),
        h("button", { type: "button", class: "hjs-btn", onclick: () => openSheet("picker") },
          h("span", { class: "hjs-btn-ico", html: ICON.list }), h("span", { text: "换一首" })))));

    loadChart(s);                                       // 先把谱面下好，开始、试听时不用等
    const best = bestOf(storage.json(K.best) || {}, s.id, S.diff, S.judge, S.range);
    const cnt = Array.isArray(s.cnt) ? s.cnt : [];                       // 轻松 / 标准 / 挑战各要弹几个音
    const nNow = cnt[DIFFS.findIndex((d) => d.id === S.diff)];
    main.append(h("section", { class: "hjs-card hjs-ctrl" },
      h("div", { class: "hjs-line" }, h("span", { class: "hjs-line-l", text: "难度" }),
        seg("难度", DIFFS.map((d, i) => ({ id: d.id, label: d.label, title: `${starsOf(s, d.id)} 星${cnt[i] ? ` · ${cnt[i]} 个音要弹` : ""}` })), S.diff,
          (v) => { S.diff = v; setRaw(K.diff, v); renderLobby(); })),
      h("div", { class: "hjs-line" }, h("span", { class: "hjs-line-l", text: "模式" }),
        seg("模式", [{ id: "show", label: "演出" }, { id: "learn", label: "学习" }], S.learn ? "learn" : "show",
          (v) => { S.learn = v === "learn"; setRaw(K.learn, S.learn ? "1" : "0"); renderLobby(); })),
      h("p", { class: "hjs-tip", text: (isAuto() ? "自动演奏：点击范围和判定模式都是放水，游戏自己弹，不计分"
        : S.learn ? "学习模式：气泡缩到判定点就停下等你弹，弹中再继续，不计分" : "演出模式：跟着节拍弹，按准确度给评级")
        + (nNow ? ` · 这一档 ${nNow} 个音` : "") + (scored() && multNote() ? ` · ${multNote()}` : "") }),
      vol().muted
        ? h("p", { class: "hjs-muted" }, h("span", { text: "现在是静音，听不到声音" }),
          h("button", { type: "button", class: "hjs-link", text: "打开声音", onclick: () => { vol().set(0.55); renderLobby(); } }))
        : null,
      best && scored() ? h("p", { class: "hjs-best", text: `本机纪录（${diffMeta().label} · ${judgeLabel()}判定 · ${rangeLabel()}范围）· ${fmtNum(best.score)} 分 · ${best.rank} · ${best.acc}%` }) : null,
      h("button", { type: "button", class: "hjs-go", id: "hjsGo", onclick: () => startSong() },
        h("span", { class: "hjs-go-ico", html: ICON.play }), h("span", { text: isAuto() ? "自动演奏" : S.learn ? "开始练习" : "开始演奏" })),
      h("p", { class: "hjs-ctrl-tip" }, h("span", {
        text: isAuto() ? "坐着听就好；想自己弹，到设置里把点击范围或判定模式改回来"
          : S.judge === "hover" ? "放水判定：不用点气泡，鼠标移到气泡上就算"
            : S.range === "free" ? "放水范围：外圈收到点时，点屏幕任意位置或按任意键都算"
              : coarse() ? "直接点气泡演奏 · 点在旁边一点也算" : "直接点气泡演奏 · 鼠标指着气泡按任意键也算",
      }))));
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
          text: n ? `${"★".repeat(n)}` : "全部", title: n ? `${diffMeta().label}难度 ${n} 星` : "全部难度",
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
    $id("hjsCount").textContent = `${list.length} / ${S.data.length} 首 · 星级按${diffMeta().label}`;
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
          h("span", { class: "hjs-stars", title: `${diffMeta().label}难度 ${starsOf(s)} 星`, text: starText(starsOf(s)) }))));
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

    /* 操作：只有点气泡；点击范围 */
    const rg = TAP_RANGES[S.range];
    body.append(group("操作",
      row("点击范围", seg("点击范围", Object.entries(TAP_RANGES).map(([id, v]) => ({ id, label: v.label })), S.range,
        (v) => { S.range = v; setRaw(K.range, v); renderSheet(); }),
      S.range === "free"
        ? (S.judge === "hover" ? "判定模式也是放水：自动演奏，游戏自己弹，不计分" : "不看位置：外圈收到点的那个气泡，点屏幕任意位置或按任意键都算")
        : `点在气泡 ${rg.r} 个直径以内算点中；附近没别的气泡时，下一个该点的（外圈加粗）偏出 ${rg.next} 个也算`),
      multNote() && scored() ? h("p", { class: "hjs-set-note", text: `现在${multNote()}。宽松各扣 20%、放水各扣 50%，判定模式和点击范围两项相加` }) : null));

    /* 画面 */
    const fly = h("input", { type: "checkbox", class: "hjs-switch", checked: S.fly, "aria-label": "飞花线", onchange: () => { S.fly = fly.checked; setRaw(K.fly, S.fly ? "1" : "0"); } });
    body.append(group("画面",
      row("显示", seg("显示", [{ id: "normal", label: "正常显示" }, { id: "simple", label: "简单显示" }], S.render,
        (v) => { S.render = v; setRaw(K.render, v); applyRender(); renderSheet(); }),
      S.render === "simple" ? "去掉了气泡光晕和文字的模糊阴影，飞花线的星星换成一条光，密集处更流畅" : "觉得密集处有点卡，可以换成简单显示"),
      row("飞花线", fly, "一只萤火虫似的小花，到点时正好飞到该点的气泡；身后撒星星（简单显示时是一条金色的光）")));

    /* 时机 */
    const winText = (w) => w.map((x) => x.toFixed(2)).join(" / ");
    const judgeRow = row("判定模式", seg("判定模式", JUDGE_MODES, S.judge, (v) => { S.judge = v; setRaw(K.judge, v); renderSheet(); }),
      S.judge === "hover"
        ? (S.range === "free" ? "点击范围也是放水：自动演奏，游戏自己弹，不计分" : "不用点：鼠标移到气泡上停着，到点自动算弹中（手机上手指按住滑过去也行）；判定同宽松")
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
        [K.inst, K.demo, K.delay, K.judge, K.render, K.range, K.fly].forEach((k) => storage.remove(k));
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
          "直接点气泡，点在旁边一点也算；电脑上也可以鼠标指着气泡，按键盘任意键",
          "点击范围（设置里改）：正常 —— 点在气泡附近；宽松 —— 范围更大；放水 —— 不看位置，外圈收到点的那个，点屏幕任意位置或按任意键都算",
          "开头会有四下轻轻的预备拍",
          "星级：每首曲子三档各有星级（轻松 1~3、标准 2~4、挑战 3~5 星），按同一档在曲库里的疏密排；大厅和选曲窗口显示的是当前所选难度的星级",
          "MISS 和「点空」不一样：MISS 是某个音到点了你没弹到 —— 这个音不响、连击断、算进准确率；「点空」是你点了，但附近没有正好该弹的气泡 —— 不扣分、不断连击，只在结算里记个次数。点空多，通常是点早了一拍或点偏了",
          "看外圈：外圈缩到和气泡重合、气泡里的音名最亮的那一下点最准；下一个该弹的气泡快到点时外圈会加粗",
          "学习模式：气泡到点还没弹，音乐就停下来等你，弹中再继续，不计分",
          "判定模式（设置里改）：正常 —— 难度越高判定越严；宽松 —— 三档难度都按轻松判定；放水 —— 不用点，把鼠标移到气泡上停着，到点就算弹中",
          "点击范围和判定模式都选放水：自动演奏，游戏自己弹，不计分。本机纪录按难度、判定模式、点击范围分开记",
          "得分：判定模式、点击范围各自选宽松扣 20%、选放水扣 50%，两项相加（比如都选宽松是 ×0.6）",
          "飞花线（设置 → 画面）：一只萤火虫似的小花沿着曲线掠过每个气泡，到点时正好飞到该点的那个，身后撒星星（简单显示时是一条金色的光）",
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
      if (n.l >= need) S.notes.push({ t: n.t, m: n.m, idx: S.notes.length, band: 0, c: 0, x: 0, y: 0 });
      else S.bg.push({ t: n.t, m: n.m, v: BG_VEL });
    });
    S.bgAll = all.map((n) => ({ t: n.t, m: n.m, v: n.l >= need ? DEMO_VEL : BG_VEL }));
    S.bgList = S.demo ? S.bgAll : S.bg;
    S.lo = num(s.range && s.range[0], 60);
    S.hi = Math.max(num(s.range && s.range[1], 72), S.lo + 1);
    const span = S.hi - S.lo + 1;
    S.notes.forEach((n) => { n.band = Math.floor(clamp((n.m - S.lo) / span, 0, 0.9999) * 4); });
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
    const dm = diffMeta();
    const w = S.root.clientWidth || window.innerWidth;
    const hh = S.root.clientHeight || window.innerHeight;
    const size = clamp(Math.min(w, hh) * dm.tap, 66, 118);
    const inset = safeInsets();
    const hud = $id("hjsHud").offsetHeight || 56;
    const top = hud + size * 0.62 + 10;
    const bottom = Math.max(top + 80, hh - size * 0.62 - 14 - inset.bottom);
    S.g = { w, h: hh, size, top, bottom };
    $id("hjsNotes").style.setProperty("--size", `${size.toFixed(1)}px`);

    placeNotes(S.g, dm);
    S.els.forEach((el, idx) => { placeEl(el, S.notes[idx]); el.style.setProperty("--c", PALETTE[S.notes[idx].c]); });
    flyLayout();
  }

  /* ==== 气泡摆放（谱面的几条规矩）====
     - 同时在屏幕上的气泡尽量不重叠：每个音在一组候选位置里挑代价最小的一个；实在太密也只会擦边，不会整个叠在一起
     - 待在视线里：下一个气泡就出现在上一个旁边（间隔越久离得稍远，最远约 2.3 个气泡），整体往屏幕中间收，
       不会一会儿左边一会儿右边、一会儿顶上一会儿底下
     - 高度跟着旋律的走向：音往上走，气泡往上挪（每半音约 0.18 个气泡，一步最多 1.4 个），而不是按绝对音高铺满整屏
     - 尽量顺着一个方向走，不急转回头
     - 挨得近（同时在场、中心距离不到 1.8 个气泡）的两个气泡一定不同色；先到的气泡叠在上面 */
  function placeNotes(g, dm) {
    const { w, size, top, bottom } = g;
    const W = dm.approach + 0.35;                       // 两个音同时在屏幕上的最大时间差（出现 → 判定完消失）
    const DMIN = size * 1.15;
    const margin = size * 0.72 + 8;
    const left = margin;
    const right = Math.max(margin + 1, w - margin);
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;
    const PULL = size * 2.4;                            // 离中心超过这么远，往回拉的力度明显变大
    const mid = (S.lo + S.hi) / 2;
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
      const want = clamp(size * (1.2 + dt), size * 1.3, size * 2.3);   // 和上一个隔多远
      let best = null;
      let bestCost = Infinity;
      const tryAt = (x0, y0, cost) => {
        const x = clamp(x0, left, right);
        const y = clamp(y0, top, bottom);
        let c = cost + (0.35 * Math.abs(y - yWant)) / size;
        const r = Math.hypot(x - cx, y - cy) / PULL;
        c += 0.9 * r * r;                               // 往中间收
        if (p && step && Math.abs(p.y - y) > size * 0.2 && Math.sign(p.y - y) !== Math.sign(step)) c += 0.8;   // 音往上走气泡别往下
        if (p) {
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
        best = { x, y };
      };
      if (!p) {
        for (const k of [0, -0.6, 0.6, -1.2, 1.2]) tryAt(cx + k * size, yWant, 0);
      } else {
        for (const a of ANG) for (const f of [0.85, 1, 1.25]) tryAt(p.x + Math.cos(a) * want * f, p.y + Math.sin(a) * want * f, 0);
        /* 附近全被占了（极密的段落）：再往外找一圈，还不行就在整个屏幕上找空位（宁可远一点也不叠） */
        if (bestCost > 30) for (const a of ANG) for (const f of [1.6, 2.1]) tryAt(p.x + Math.cos(a) * want * f, p.y + Math.sin(a) * want * f, 0.5);
        if (bestCost > 30) {
          for (let gx = 0; gx <= 8; gx++) for (let gy = top; gy <= bottom; gy += size * 0.55) tryAt(left + ((right - left) * gx) / 8, gy, 1);
        }
      }
      n.x = best.x;
      n.y = best.y;
      /* 颜色：默认按音高分四色；和挨得近的气泡撞色就换一种 */
      const taken = new Set(near.filter((q) => Math.hypot(q.x - n.x, q.y - n.y) < size * 1.8).map((q) => q.c));
      n.c = n.band;
      for (let k = 0; k < PALETTE.length && taken.has(n.c); k++) n.c = (n.band + 1 + k) % PALETTE.length;
    });
  }

  function onResize() {
    if (S.view === "play" && S.notes.length) layout();
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
    S.ghostWhy = { early: 0, late: 0, off: 0 };         // 点空的原因：早了（附近的气泡还没到判定窗）/ 晚了 / 时间对但点偏了
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
    $id("hjsNowS").textContent = `${diffMeta().label}${modeTag()}`;
    setPauseIcon(false);
    flyReset();
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
      warmSounds().then(() => {
        if (gen !== S.gen || S.view !== "play") return;
        waitAudio(gen, performance.now());
      });
    });
  }

  /* 开演前把要用的都备好，预备拍开始前就做完：音色与音高（bard.js 的 HJBard.warm：要弹的音、补音、预备拍），
     开了飞花线还要把花和星星两张图下载、解码好（不然第一次画时才解码，预备拍里会顿一下）。
     超过 0.35 秒没好就出全屏转圈的莫古力（main.js 的 trackLoad），已经备过的曲子几乎不用等 */
  function warmSounds() {
    const warm = bard().warm;
    const midis = [...S.notes, ...S.bgList].map((n) => n.m);
    const imgs = S.fl ? ["fly-flower.webp", "fly-stars.webp"].map((name) => {
      const img = flyImage(name);
      /* 最多等 2.5 秒：页面在后台时浏览器会一直不解码，不能卡在这里 */
      const wait = new Promise((r) => setTimeout(r, 2500));
      return img.decode ? Promise.race([img.decode().catch(() => {}), wait]) : Promise.resolve();
    }) : [];
    const job = Promise.all([...(warm ? [warm(instId(), midis), warm(TICK.inst, [TICK.midi])] : []), ...imgs]).catch(() => {});
    if (!warm && !imgs.length) return Promise.resolve();
    banner("准备音色…", "is-wait");
    return typeof trackLoad === "function" ? trackLoad(job, "block") : job;
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
    stopResumeCount();
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
    if (S.judge === "hover" && (S.hover || S.range === "free")) hoverCheck(t, dm);
    draw(t, dm);
    if (S.fl) flyFrame(t);
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
      const next = n.idx === nextIdx && dt <= NEXT_LEAD;   // 下一个该弹的：快到点时外圈才加粗
      if (next !== el._next) { el._next = next; el.classList.toggle("is-next", next); }
      setK(el, clamp(1 - dt / ap, 0, 1));
      const op = dt > ap - 0.22 ? clamp((ap - dt) / 0.22, 0, 1).toFixed(2) : "";
      if (op !== el._op) { el._op = op; el.style.opacity = op; }
    }
  }
  /* 收缩进度 k（0 → 1）：外圈由大缩到和核心重合、渐亮，核心略放大，音名过半后渐亮、到点最亮。
     直接改这三层的 transform / opacity（都是常驻的单独一层，只合成不重画、不会一会儿建层一会儿拆层），
     不用 CSS 变量（改变量会让整个气泡连同音名一起重算样式、重画文字） */
  function setK(el, k) {
    if (Math.abs(k - el._k) < 0.002) return;
    el._k = k;
    el._ring.style.transform = `scale(${(1 + (1 - k) * 1.3).toFixed(3)})`;
    el._ring.style.opacity = (0.3 + k * 0.7).toFixed(3);
    el._core.style.transform = `scale(${(0.84 + k * 0.16).toFixed(3)})`;
    el._name.style.opacity = clamp((k - 0.45) * 2, 0, 1).toFixed(3);
  }
  function placeEl(el, n) {
    if (!n) return;
    el.style.transform = `translate3d(${n.x.toFixed(1)}px, ${n.y.toFixed(1)}px, 0)`;
  }
  function noteEl(n) {
    const ring = h("i", { class: "hjs-ring" });
    const core = h("i", { class: "hjs-core" });
    const name = h("i", { class: "hjs-name", text: midiName(n.m) });
    const el = h("div", { class: "hjs-note" }, ring, core, name);
    Object.assign(el, { _ring: ring, _core: core, _name: name, _k: -1, _next: false, _op: null });
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

  /* ==== 飞花线：一只小萤火虫一样的花，沿平滑曲线掠过每个气泡；正常显示身后撒星星，简单显示拖一条细金线（设置 → 画面，默认关）====
     路径开演前算好：各气泡（同一刻的和弦只取第一个）按时间连成 Catmull-Rom 曲线，每段的三次式系数在布局时一次算完，
     演奏时每帧只代入时间；花在气泡该判定的那一刻正好经过它，两个气泡之间按时间匀速走。
     省着画：花、星星都是固定的元素（各自常驻一层），每帧只由这里写 transform / opacity，不跑 CSS 动画、不用 Web Animations
     （那样浏览器会把上面的元素都拆成单独的层）；线是一条 SVG 路径，每帧只改它的形状。不用整屏 canvas（有的手机上整屏重画很慢，
     会拖慢点按处理）。花停着、星星散完、线收拢时什么都不改。整层在气泡下面，不挡音名 */
  const flyImg = {};
  function flyImage(name) {
    if (!flyImg[name]) {
      const img = new Image();
      img.decoding = "async";
      img.src = `${BASE}${name}`;
      flyImg[name] = img;
    }
    return flyImg[name];
  }
  function flyReset() {
    const box = $id("hjsFly");
    if (!box) return;
    box.textContent = "";
    box.hidden = !S.fly;
    S.fl = null;
    if (!S.fly) return;
    const line = S.render === "simple";
    let path = null, grad = null;
    const stars = [];
    if (line) {
      box.insertAdjacentHTML("beforeend", '<svg class="hjs-fly-svg" aria-hidden="true"><defs><linearGradient id="hjsFlyGrad" gradientUnits="userSpaceOnUse">'
        + '<stop offset="0" stop-color="#fff6d8" stop-opacity=".95"/><stop offset=".4" stop-color="#ffd27a" stop-opacity=".6"/>'
        + '<stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></linearGradient></defs>'
        + '<path fill="none" stroke="url(#hjsFlyGrad)" stroke-linecap="round" stroke-linejoin="round"/></svg>');
      path = box.querySelector("path");
      grad = box.querySelector("linearGradient");
    } else {
      flyImage("fly-stars.webp");
      for (let k = 0; k < FLY.stars; k++) {
        const el = h("i", { class: "hjs-fly-star" });
        box.append(el);
        stars.push({ el, on: false });
      }
    }
    flyImage("fly-flower.webp");
    const flower = h("i", { class: "hjs-fly-flower" }, h("i"));
    box.append(flower);
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    S.fl = {
      flower, line, path, grad, stars, live: [], si: 0, calm, curve: [], x: 0, y: 0, placed: false, movedAt: -Infinity,
      sx: 0, sy: 0, lastSpawn: 0, lineOn: false, draws: 0,
    };
  }
  /* 气泡位置定好（或改了窗口大小重排）之后：重算大小，把整条路径每一段的系数算好 */
  function flyLayout() {
    const f = S.fl;
    if (!f || !S.g) return;
    const box = $id("hjsFly");
    box.style.setProperty("--fly", `${(S.g.size * FLY.flower).toFixed(1)}px`);
    box.style.setProperty("--star", `${(S.g.size * FLY.star).toFixed(1)}px`);
    if (f.path) f.path.setAttribute("stroke-width", (S.g.size * FLY.line).toFixed(2));
    const pts = [];
    for (const n of S.notes) {
      const t = n.t - FLY.ahead;
      if (pts.length && t - pts[pts.length - 1].t < 0.03) continue;
      pts.push({ t, x: n.x, y: n.y });
    }
    f.curve = pts.map((p1, k) => {
      const p0 = pts[k - 1] || p1, p2 = pts[k + 1] || p1, p3 = pts[k + 2] || p2;
      const co = (a, b, c, d) => [b, 0.5 * (c - a), 0.5 * (2 * a - 5 * b + 4 * c - d), 0.5 * (3 * b - a - 3 * c + d)];
      return { t: p1.t, dt: p2 === p1 ? 0 : p2.t - p1.t, cx: co(p0.x, p1.x, p2.x, p3.x), cy: co(p0.y, p1.y, p2.y, p3.y) };
    });
    f.placed = false;
    f.movedAt = -Infinity;
  }
  /* 曲线上 t 时刻的位置：二分找到 t 落在哪一段，代入这一段的三次式 */
  function flyAt(curve, t) {
    if (t <= curve[0].t) return [curve[0].cx[0], curve[0].cy[0]];
    let lo = 0, hi = curve.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (curve[mid].t <= t) lo = mid; else hi = mid - 1;
    }
    const c = curve[lo];
    if (!c.dt) return [c.cx[0], c.cy[0]];
    const u = Math.min(1, (t - c.t) / c.dt);
    const ev = (q) => q[0] + u * (q[1] + u * (q[2] + u * q[3]));
    return [ev(c.cx), ev(c.cy)];
  }
  function flyFrame(t) {
    const f = S.fl;
    if (!f.curve.length || !S.g) return;
    const now = performance.now();
    const [x, y] = flyAt(f.curve, t);
    const moved = !f.placed || Math.abs(x - f.x) + Math.abs(y - f.y) >= 0.05;
    if (moved) {
      f.x = x;
      f.y = y;
      f.movedAt = t;
      if (!f.placed) { f.placed = true; f.sx = x; f.sy = y; }
      /* 花：位置和转角写在同一个 transform 里（不用 CSS 转圈动画）；停着时不转 */
      const a = f.calm ? 0 : ((now / 1000 / FLY.spin) % 1) * 360;
      f.flower.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${a.toFixed(1)}deg)`;
      f.draws += 1;
      if (!f.line && !f.calm) flySpawn(f, now);
    }
    if (f.line) flyLine(f, t, moved);
    else if (f.live.length) flyStars(f, now);
  }
  /* 正常显示：花离上一颗星够远、隔得够久才撒一颗；池子用完就复用最早那颗 */
  function flySpawn(f, now) {
    const d = Math.hypot(f.x - f.sx, f.y - f.sy);
    if (d < S.g.size * FLY.gap || now - f.lastSpawn < FLY.every) return;
    const ux = (f.x - f.sx) / d, uy = (f.y - f.sy) / d;
    const s = S.g.size;
    const side = (Math.random() - 0.5) * s * 0.12;
    const x0 = f.x - ux * s * 0.08 - uy * side;
    const y0 = f.y - uy * s * 0.08 + ux * side;
    const slot = f.stars[f.si];
    f.si = (f.si + 1) % f.stars.length;
    f.live = f.live.filter((p) => p.slot !== slot);
    slot.el.style.backgroundPosition = `${Math.floor(Math.random() * FLY.kinds) * 50}% 0`;
    f.live.push({
      slot, born: now, life: FLY.life[0] + Math.random() * (FLY.life[1] - FLY.life[0]),
      x0, y0, x1: x0 - ux * s * 0.06, y1: y0 - uy * s * 0.06 + s * (0.1 + Math.random() * 0.1),
      rot: Math.random() * 90 - 45, sc: 0.6 + Math.random() * 0.6,
    });
    f.sx = f.x;
    f.sy = f.y;
    f.lastSpawn = now;
  }
  /* 星星：每帧算一下还亮着的那几颗该在哪、多大多亮；散完的那颗把透明度归零一次就不再管 */
  function flyStars(f, now) {
    f.draws += 1;
    f.live = f.live.filter((p) => {
      const u = (now - p.born) / p.life;
      const st = p.slot.el.style;
      if (u >= 1) { st.opacity = "0"; return false; }
      const e = 1 - (1 - u) * (1 - u);                // 先快后慢
      st.transform = `translate3d(${(p.x0 + (p.x1 - p.x0) * e).toFixed(1)}px, ${(p.y0 + (p.y1 - p.y0) * e).toFixed(1)}px, 0) rotate(${(p.rot + 50 * u).toFixed(0)}deg) scale(${(p.sc * (1 - 0.7 * u)).toFixed(2)})`;
      st.opacity = (0.95 * (1 - u)).toFixed(2);
      return true;
    });
  }
  /* 简单显示：沿花在过去 tail 秒里走过的路取点，用相邻点的中点做二次曲线连起来（没有折角），从花这头往尾巴渐隐；
     花停下、线收拢之后清空一次就不再改 */
  function flyLine(f, t, moved) {
    if (!moved && t - f.movedAt > FLY.tail + 0.05) {
      if (f.lineOn) { f.lineOn = false; f.path.setAttribute("d", ""); }
      return;
    }
    const pts = [[f.x, f.y]];
    for (let k = 1; k <= FLY.samples; k++) pts.push(flyAt(f.curve, t - (FLY.tail * k) / FLY.samples));
    const tail = pts[pts.length - 1];
    if (Math.hypot(tail[0] - f.x, tail[1] - f.y) < 1) {
      if (f.lineOn) { f.lineOn = false; f.path.setAttribute("d", ""); }
      return;
    }
    let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let k = 1; k < pts.length - 1; k++) {
      d += `Q${pts[k][0].toFixed(1)} ${pts[k][1].toFixed(1)} ${((pts[k][0] + pts[k + 1][0]) / 2).toFixed(1)} ${((pts[k][1] + pts[k + 1][1]) / 2).toFixed(1)}`;
    }
    d += `L${tail[0].toFixed(1)} ${tail[1].toFixed(1)}`;
    f.path.setAttribute("d", d);
    f.grad.setAttribute("x1", f.x.toFixed(1));
    f.grad.setAttribute("y1", f.y.toFixed(1));
    f.grad.setAttribute("x2", tail[0].toFixed(1));
    f.grad.setAttribute("y2", tail[1].toFixed(1));
    f.lineOn = true;
    f.draws += 1;
  }

  /* ==== 输入 ==== */
  function onPlayPointer(e) {
    if (e.target.closest && e.target.closest("button")) return;
    if (e.pointerType === "mouse" && e.button !== 0 && e.button !== 2) return;   // 左右键都算点
    if (S.needTap) { e.preventDefault(); startSong(); return; }
    if (S.view !== "play" || !S.playing || S.paused) return;
    e.preventDefault();
    if (S.resuming) return;                             // 继续前的倒数：点了不算
    const p = hoverPos(e);
    if (S.judge === "hover" || e.pointerType === "mouse") S.hover = p;
    if (isAuto()) return;                               // 自动演奏：点了也不算
    tapAt(p.x, p.y, e);
  }
  /* 记下指针在哪（鼠标一直跟着；手指按着时才算，抬起就清掉）：
     放水判定每帧由 hoverCheck 看它停在哪个气泡上；按键盘任意键＝在鼠标处点一下（onKeyDown） */
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
  /* 放水判定：指针在气泡上，气泡到点（外圈缩到核心）那一下自动算弹中；指针来晚了，还在判定窗里就按晚了多少算。
     点击范围也是放水（自动演奏）时不看指针，到点的都算 */
  function hoverCheck(t, dm) {
    const g = S.g;
    if (!g) return;
    const free = S.range === "free";
    const R = g.size * HOVER_R;
    const on = (n) => free || (S.hover && Math.hypot(n.x - S.hover.x, n.y - S.hover.y) <= R);
    if (S.frozen && S.waiting) {
      if (on(S.waiting)) learnHit(S.waiting);
      return;
    }
    for (let i = Math.max(0, S.next - 4); i < S.notes.length; i++) {
      const n = S.notes[i];
      const dt = n.t - t;
      if (dt > 0) break;
      if (S.judged[n.idx] >= 0 || dt < -dm.win[2]) continue;
      if (on(n)) {
        hit(n, tierOf(-dt, dm), -dt);
        if (!free) return;                              // 自动演奏：同一刻的和弦一起弹
      }
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
      if (!S.playing || S.paused || S.resuming || e.ctrlKey || e.metaKey || e.altKey) return;
      /* 按任意键＝在鼠标处点一下；放水范围不看位置，没动过鼠标也行。放水判定（含自动演奏）不用按 */
      if (S.judge === "hover" || /^(F\d+|Tab|CapsLock|Control|Alt|Meta|ContextMenu)$/.test(e.key)) return;
      const free = S.range === "free";
      if (!S.hover && !free) return;
      e.preventDefault();
      if (e.repeat) return;
      const p = S.hover || { x: S.g ? S.g.w / 2 : 0, y: S.g ? (S.g.top + S.g.bottom) / 2 : 0 };
      tapAt(p.x, p.y, e);
      return;
    }
    if (S.view === "lobby" && !S.sheet && e.key === "Enter") {
      const tag = e.target && e.target.tagName;
      if (tag === "BUTTON" || tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      e.preventDefault();
      startSong();
    }
  }

  const tierOf = (d, dm) => (d <= dm.win[0] ? 0 : d <= dm.win[1] ? 1 : 2);

  /* 一次点按算给哪个音：先到先得 —— 判定窗里最早还没弹的那个。不然气泡挨得近、点得稍晚一点时，
     这一下会被算给下一个音，后面每一下都跟着错一个（多出 GOOD 和 MISS）。只有两种情况跳过最早那个：
     · 点在后面某个气泡正中（0.45 个气泡以内），离最早那个却有 1.3 个气泡以上 —— 就是想点后面那个
     · 最早那个已经晚过 GREAT 窗，后面那个时间更准、位置也不比它远 —— 前一个留给判漏
     cands：[{ n, d }]，按时间先后，d 为离点按处多少个气泡（放水范围为 0） */
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

  /* 点气泡：判定窗内、离点按处判定半径（TAP_RANGES 的 r 个气泡直径）以内的音，时间越准、离得越近越优先；
     一个都没有时，下一个该弹的音在 next 个气泡直径以内也算。放水范围不看位置 */
  function tapAt(x, y, e) {
    const g = S.g;
    const rg = TAP_RANGES[S.range] || TAP_RANGES.normal;
    const free = S.range === "free";
    const R = g.size * rg.r;
    if (S.frozen && S.waiting) {
      const n = S.waiting;
      if (free || Math.hypot(n.x - x, n.y - y) <= R * 1.5) learnHit(n);
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
      const d = free ? 0 : Math.hypot(n.x - x, n.y - y);
      if (d <= R) cands.push({ n, d: d / g.size });
    }
    let best = pickNote(cands, t, dm);
    if (!best && !free) {
      for (let i = S.next; i < S.notes.length; i++) {
        const n = S.notes[i];
        if (S.judged[n.idx] >= 0 || n.t - t < -dm.win[2]) continue;   // 已经过了判定窗、等着判漏的不算
        if (n.t - t <= dm.win[2] && Math.hypot(n.x - x, n.y - y) <= g.size * rg.next) best = n;
        break;
      }
    }
    if (best) hit(best, tierOf(Math.abs(best.t - t), dm), t - best.t);
    else { S.ghosts += 1; S.ghostWhy[ghostWhy(x, y, t, dm, R)] += 1; ghost(x, y); }
  }
  /* 点空是为什么：判定窗里有没弹的气泡（只是离得远）= 点偏了；否则看点按处附近最近的那个没弹的气泡是在后面（早了）还是前面（晚了） */
  function ghostWhy(x, y, t, dm, R) {
    let near = null;
    for (let i = Math.max(0, S.next - 8); i < S.notes.length; i++) {
      const n = S.notes[i];
      if (n.t - t > 1.5) break;
      if (S.judged[n.idx] >= 0 && n.t - t < -dm.win[2]) continue;
      if (Math.abs(n.t - t) <= dm.win[2] && S.judged[n.idx] < 0) return "off";
      if (Math.hypot(n.x - x, n.y - y) <= R && (!near || Math.abs(n.t - t) < Math.abs(near.t - t))) near = n;
    }
    return near && near.t < t ? "late" : "early";
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
    if (Number.isFinite(off) && scored()) S.offs.push(off);
    bard().playMidi?.(n.m, JUDGE[tier].vel, instId(), 0, 0);
    dropEl(n, "is-hit", 300);
    S.combo += 1;
    S.maxCombo = Math.max(S.maxCombo, S.combo);
    S.counts[JUDGE[tier].id] += 1;
    if (!scored()) {                                    // 学习模式、自动演奏：不计分，只数弹了几个
      S.learnHits += 1;
      popJudge(S.learn ? "WELL" : "AUTO", "is-ok");
    } else {
      S.score += Math.round(JUDGE[tier].pts * (1 + Math.min(S.combo, 60) / 120) * scoreMult());
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
        if (dg.warm.length >= 120) { dg.base = frameBase(dg.warm); dg.warm = null; }
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

  /* 一帧本该多长：开头 120 帧里较快的那些（第 15 百分位，开头就卡也不会估成低刷新率），再贴到最近的常见刷新率 */
  function frameBase(ivs) {
    const v = ivs.slice().sort((a, b) => a - b)[Math.floor(ivs.length * 0.15)];
    const hz = 1000 / v;
    const near = [60, 75, 90, 120, 144, 165].reduce((a, b) => (Math.abs(b - hz) < Math.abs(a - hz) ? b : a));
    return Math.abs(near - hz) / near < 0.1 ? 1000 / near : v;
  }

  function updateHud() {
    const total = S.notes.length;
    $id("hjsScoreL").textContent = S.learn ? "已弹对" : isAuto() ? "自动演奏" : "分数";
    $id("hjsScore").textContent = scored() ? fmtNum(S.score) : `${S.learnHits}/${total}`;
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
    setK(el, 1);
    el._op = "";
    el.style.opacity = "";
    el.classList.add("is-wait");
    banner(S.range === "free" ? "点一下屏幕" : "点亮着的气泡", "is-hint");
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
    stopResumeCount();
    S.paused = true;
    cancelAnimationFrame(S.raf);
    S.raf = 0;
    clockStop(S.clock);
    setPauseIcon(true);
    modal(h("div", { class: "hjs-card hjs-res" },
      h("h3", { class: "hjs-res-title", text: "已暂停" }),
      h("p", { class: "hjs-res-sub", text: `${S.song.t} · ${diffMeta().label}${modeTag()}` }),
      h("div", { class: "hjs-res-btns" },
        h("button", { type: "button", class: "hjs-btn is-main", text: "继续", onclick: resume }),
        h("button", { type: "button", class: "hjs-btn", text: "重来", onclick: () => startSong() }),
        h("button", { type: "button", class: "hjs-btn", text: "停止演奏", onclick: backToLobby }))));
  }
  /* 继续：和开头一样的预备拍 —— 按曲子的拍子响四下「嗒」，后三下显示 3·2·1，再过一拍接着走。
     这期间钟不走、点了不算；倒数时又按暂停 / 切后台，就回到暂停 */
  function resume() {
    if (!S.paused) return;
    S.paused = false;
    $id("hjsModal").hidden = true;
    setPauseIcon(false);
    bard().unlock?.();                                  // 切后台时系统可能把音频挂起了
    const gap = S.spb * 1000;
    let n = 4;
    S.resuming = true;
    banner("", "");
    const step = () => {
      if (!S.resuming) return;
      if (n === 0) {
        S.resuming = false;
        banner("", "");
        if (S.diag) S.diag.last = 0;                    // 倒数这段不算掉帧
        if (!S.frozen) resumeAudio();
        else banner(S.range === "free" ? "点一下屏幕" : "点亮着的气泡", "is-hint");
        loop();
        return;
      }
      if (n <= 3) banner(String(n), "is-count", `r${n}`);
      bard().playMidi?.(TICK.midi, TICK.vel, TICK.inst, 0, 0);
      n -= 1;
      S.resumeTimer = setTimeout(step, gap);
    };
    step();
  }
  function stopResumeCount() {
    clearTimeout(S.resumeTimer);
    if (S.resuming) { S.resuming = false; banner("", ""); }
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
      h("div", { class: "hjs-res-tags" }, tag("难度", diffMeta().label), tag("判定", judgeLabel()), tag("范围", rangeLabel()),
        S.learn ? tag("模式", "学习") : isAuto() ? tag("模式", "自动演奏") : null));
    if (!scored()) {
      card.append(
        h("div", { class: "hjs-res-big", text: `${S.learnHits} / ${total}` }),
        h("p", { class: "hjs-res-sub", text: S.learn ? "学习模式不计分。弹熟了就切到「演出」，正式来一次"
          : "点击范围和判定模式都是放水：自动演奏，不计分、不记纪录。想自己弹，到设置里把其中一个改回来" }));
    } else {
      const isNew = saveBest(pct);
      const fullCombo = total > 0 && S.maxCombo >= total;   // 一个 MISS 都没有，连击从头连到尾
      card.append(
        ...(fullCombo ? [h("div", { class: "hjs-res-fc", text: "FULL COMBO!" })] : []),   // 原生 append 会把 null 写成文字，不能传 null
        h("div", { class: "hjs-res-rank" }, h("span", { text: rankOf(pct) }), isNew ? h("em", { text: "新纪录" }) : null),
        h("div", { class: "hjs-res-big", text: fmtNum(S.score) }),
        h("p", { class: "hjs-res-sub", text: `准确率 ${pct.toFixed(1)}% · 最大连击 ${S.maxCombo}` }),
        ...(multNote() ? [h("p", { class: "hjs-res-sub hjs-res-mult", text: multNote() })] : []),   // 原生 append 不能传 null
        timingNote(),
        h("div", { class: "hjs-res-grid" }, JUDGE.map((j) => h("div", { class: `hjs-cell is-${j.id}` }, h("b", { text: String(S.counts[j.id]) }), h("small", { text: j.label })))));
    }
    card.append(h("div", { class: "hjs-res-btns" },
      h("button", { type: "button", class: "hjs-btn is-main", text: "再来一次", onclick: () => startSong() }),
      h("button", { type: "button", class: "hjs-btn", text: "下一首", onclick: () => { nextSong(); startSong(); } }),
      h("button", { type: "button", class: "hjs-btn", text: "结束演奏", onclick: backToLobby })));
    modal(card);
  }
  /* 结算里的手感诊断：平均早晚、点空几下 */
  function timingNote() {
    const o = (S.offs || []).slice().sort((a, b) => a - b);
    const ms = o.length ? Math.round(o[Math.floor(o.length / 2)] * 1000) : 0;
    const parts = o.length >= 8 ? [Math.abs(ms) < 10 ? "手感很准，平均几乎不早不晚" : `平均偏${ms > 0 ? "晚" : "早"} ${Math.abs(ms)} ms`] : [];
    if (S.ghosts) {
      const w = S.ghostWhy;
      const why = [w.early && `早了 ${w.early}`, w.late && `晚了 ${w.late}`, w.off && `点偏 ${w.off}`].filter(Boolean).join(" · ");
      parts.push(`点空 ${S.ghosts} 下（${why}）`);
    }
    /* 设备诊断：声音输出延迟、点按排队时间、掉帧比例（反馈问题时把这一行发过来） */
    const dg = S.diag || {};
    const w = (dg.waits || []).slice().sort((a, b) => a - b);
    const dev = [
      `输出延迟 ${Math.round((S.clock ? S.clock.lat : 0) * 1000)} ms`,
      dg.tsBad ? "点按时间戳不可用" : w.length ? `点按排队 ${Math.round(w[Math.floor(w.length / 2)] * 1000)} ms` : null,
      dg.frames ? frameNote(dg) : null,
      S.delayMs ? `判定延迟 ${S.delayMs > 0 ? "+" : ""}${S.delayMs} ms` : null,
      S.render === "simple" ? "简单显示" : null,
    ].filter(Boolean).join(" · ");
    return h("div", {},
      parts.length ? h("p", { class: "hjs-res-sub hjs-res-timing", text: parts.join(" · ") }) : null,
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
    const key = `${S.song.id}:${S.diff}:${S.judge}:${S.range}`;
    const v = { score: S.score, acc: +pct.toFixed(1), rank: rankOf(pct), combo: S.maxCombo, diff: S.diff, judge: S.judge, range: S.range };
    const old = bestOf(all, S.song.id, S.diff, S.judge, S.range);
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
        view: S.view, sheet: S.sheet, range: S.range, auto: isAuto(), playing: S.playing, paused: S.paused, frozen: S.frozen,
        finished: S.finished, song: S.song && S.song.id, notes: S.notes, judged: S.judged ? Array.from(S.judged) : [],
        bg: S.bgList, score: S.score, combo: S.combo, maxCombo: S.maxCombo, judge: S.judge, render: S.render, counts: S.counts, delayMs: S.delayMs, g: S.g,
        mult: scoreMult(), fly: S.fly, flyPos: S.fl && S.fl.placed ? { x: S.fl.x, y: S.fl.y, pts: S.fl.curve.length, line: S.fl.line, stars: S.fl.live.length, draws: S.fl.draws } : null,
        resuming: S.resuming, spb: S.spb, ghostWhy: S.ghostWhy,
        cat: S.cat, tags: S.tags, preview: S.preview.id, cal: !!S.cal, clock: S.clock && { run: S.clock.run, base: S.clock.base },
        startT: S.startT, endT: S.endT, pos: S.clock ? clockRaw(S.clock) : 0,
      };
    },
  };
})();
