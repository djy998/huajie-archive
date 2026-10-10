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
   - 判定 Perfect / Great / Good / Just / Miss，没有血量、不会失败；漏掉的音不出声
   - 得分：满分 1,000,000（判定分 70 万 + combo得分 30 万），与曲子长短无关；评级按得分（见「得分」一节）
   - 判定模式（设置里可改）：正常（默认，判定窗随难度收紧）/ 宽松（三档难度都用仙人刺的判定窗）/
     放水（判定窗同宽松，不用点：指针停在气泡附近（距离按点击范围），到点就算弹中）。点击范围和判定模式都是放水 = 自动演奏，不计分
   - 本机纪录（最高分与评级）按 曲目 × 难度 × 判定模式 × 点击范围 分开记
   - 飞花线（设置 → 画面，默认开）：一只萤火虫似的小花沿曲线掠过每个气泡，到点时正好经过该点的那个，身后撒星星（简单显示时拖一条金色的光）
   - 声像固定居中（不跟着左右位置偏）；音量跟随全站音量
   - 界面：大厅（今晚演奏、难度、模式、开始）/ 选曲窗口（搜索、分类与星级筛选、试听）/ 设置窗口（音量、音色、示范旋律、
     点击范围、显示与飞花线、判定模式、判定延迟与校准）/ 玩法说明。Esc、手机返回键都是「回到上一层」
   - 曲目索引 assets/bard/stage/songs.json，每首的谱面 charts/<id>.json 点到才下载（_src/tools/stage-build 从 MIDI 生成） */
(() => {
  const BASE = "assets/bard/stage/";
  const K = {
    song: "hj_stage_song", diff: "hj_stage_diff", learn: "hj_stage_learn", demo: "hj_stage_demo", inst: "hj_stage_inst",
    delay: "hj_stage_delay", judge: "hj_stage_judge", render: "hj_stage_render", range: "hj_stage_range", fly: "hj_stage_fly", anim: "hj_stage_anim", power: "hj_stage_power", line: "hj_stage_line",
    old: ["hj_stage_input", "hj_stage_lanes", "hj_stage_codes"],   // 键盘轨道模式去掉后不再用：操作方式、轨道数、键位
    best: "hj_stage_best3", stars: "hj_stage_stars", cat: "hj_stage_cat",   // best3：百万分制的最高分与评级
    oldBest: "hj_stage_best2",                          // 百万分制以前的纪录：按准确率与最大combo换算后显示
    unlock: "hj_stage_unlock",                          // 曲库密码换来的凭证（全部曲目）
  };
  /* 判定半窗（秒）：Perfect / Great / Good。正常判定按难度收紧；宽松、放水三档难度都用 LOOSE_WIN（= 仙人刺那档） */
  const LOOSE_WIN = [0.18, 0.3, 0.45];
  /* approach：气泡提前多久出现；win：正常判定的半窗；tap：气泡直径占屏幕短边的比例 */
  const DIFFS = [
    { id: "easy", label: "仙人刺", approach: 1.8, win: [0.18, 0.3, 0.45], tap: 0.24 },
    { id: "normal", label: "魔界花", approach: 1.35, win: [0.14, 0.24, 0.36], tap: 0.21 },
    { id: "hard", label: "泰坦", approach: 1.05, win: [0.11, 0.19, 0.29], tap: 0.2 },
  ];
  const JUDGE_MODES = [{ id: "normal", label: "正常" }, { id: "loose", label: "宽松" }, { id: "hover", label: "放水" }];
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
  /* w：判定权重（判定分与准确率都按它算） */
  const JUDGE = [
    { id: "perfect", label: "PERFECT", w: 3, vel: 1 },
    { id: "great", label: "GREAT", w: 2, vel: 0.9 },
    { id: "good", label: "GOOD", w: 1, vel: 0.8 },
    { id: "miss", label: "MISS", w: 0, vel: 0 },
    /* JUST：比 GOOD 早或晚出去一小段（GOOD 半窗的 JUST_RATIO）。给一点分、出声，但断combo */
    { id: "just", label: "JUST", w: 0.5, vel: 0.65 },
  ];
  const JUST = 4;                                       // JUDGE 里的下标（MISS 仍是 3）
  const JUST_RATIO = 1 / 3;                             // 泰坦正常判定约 0.1 秒、魔界花 0.12、仙人刺 / 宽松 0.15
  const justWin = (dm) => dm.win[2] * JUST_RATIO;
  /* 判 MISS 前多等多久：至少 INPUT_GRACE，晚一点的 JUST 也要等得到 */
  const missGrace = (dm) => Math.max(INPUT_GRACE, justWin(dm));
  const GRID = ["perfect", "great", "good", "just", "miss"];   // 结算 / 暂停时各档的排列顺序
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
    line: 0.045, tail: 0.45, pathSamples: 20, samples: 32,   // samples：拖尾取几个点（简单显示时就是几段光条，段越短弯得越圆）
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
    list: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7h11M8 12h11M8 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01"/></svg>',
  };

  const S = {
    built: false, root: null, data: null, tags: [], loading: null, err: "", charts: new Map(), unlocked: false,
    view: "lobby", sheet: "", sheetBack: null,
    song: null, diff: "normal", learn: false, demo: false, inst: "", judge: "normal", render: "normal", range: "normal", fly: false, anim: "frame", power: "auto", lineMode: "lite", fl: null,
    delayMs: 0, stars: 0, cat: "", query: "", cal: null, calMsg: "",
    gen: 0, notes: [], judged: null, hovered: null, next: 0, lo: 60, hi: 72, g: null,
    bg: [], bgAll: [], bgList: [], bgNext: 0, ticks: [], tickNext: 0, firstT: 0, lastT: 0, endT: 0, startT: 0, spb: 0.5,
    playing: false, paused: false, frozen: false, hover: null, waiting: null, frozenT: 0, finished: false,
    score: 0, combo: 0, maxCombo: 0, counts: null, learnHits: 0,
    raf: 0, pump: 0, els: new Map(), pool: [], pops: new Map(), animSync: 0, clockRate: 1, rateSample: null, animForce: false, clock: null, bannerKey: "",
    preview: { id: "", timer: 0, clock: null, list: null, i: 0 },
    bgmWasOn: false, closeTimer: 0, coverTimer: 0, resuming: false, resumeTimer: 0, hist: false, closing: false, needTap: false,
  };

  /* ==== 工具（storage、showToast、siteVolume、bgm 是 main.js 的全局） ==== */
  const $id = (x) => document.getElementById(x);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const num = (v, d) => (v !== null && v !== "" && Number.isFinite(+v) ? +v : d);
  const diffBase = () => DIFFS.find((d) => d.id === S.diff) || DIFFS[1];
  /* 当前难度，win 换成当前判定模式实际用的半窗 */
  const diffMeta = () => { const d = diffBase(); return S.judge === "normal" ? d : { ...d, win: LOOSE_WIN }; };
  const judgeTag = () => (S.judge === "loose" ? " · 宽松判定" : S.judge === "hover" ? " · 放水模式" : "");
  const judgeLabel = () => (JUDGE_MODES.find((m) => m.id === S.judge) || JUDGE_MODES[0]).label;
  const rangeLabel = () => (TAP_RANGES[S.range] || TAP_RANGES.normal).label;
  /* 点击范围和判定模式都是放水：游戏自己弹（自动演奏），不计分、不记纪录 */
  const isAuto = (judge = S.judge, range = S.range) => judge === "hover" && range === "free";
  const scored = () => !S.learn && !isAuto();
  /* ==== 得分 ====
     满分 1,000,000 = 判定分 700,000 + combo得分 300,000，与曲子长短无关（N = 这一档要弹的音数）。
     判定分：每个音的基础分 500000 / N × 判定权重，累加成原始分（全 PERFECT 为 150 万），再按 SCORE.curve 折算：
       原始分 0~50 万按 70%、50 万~100 万按 42%、100 万~150 万按 28%，全 PERFECT 正好 700,000（35 万 + 21 万 + 14 万）。
     combo得分：最大combo / N 分档（SCORE.combo），全连 300,000。每 5% 一档：30% 15 万、40% 18 万、50% 21 万、60% 22 万、70% 23 万、80% 24 万、
       85% 25.5 万、90% 27 万、95% 28.5 万这几个点是原有的，其余各档按它们用保形单调插值（PCHIP，过原点）补齐，取整到千位。
       玩法说明里不写这些细档
     上限：判定模式、点击范围选了宽松 / 放水时总分有上限（capOf）。上限的九成以内照算，往上把剩下的分按比例
       压进最后一成 —— 每个音都还有分，但到不了上限以上 */
  const SCORE = {
    max: 1000000, judge: 700000, base: 500000,
    curve: [[0, 0.7], [500000, 0.42], [1000000, 0.28]],   // [原始分到这里起, 之后每分按多少计]
    combo: [[0.95, 285000], [0.9, 270000], [0.85, 255000], [0.8, 240000], [0.75, 234000], [0.7, 230000], [0.65, 225000],
      [0.6, 220000], [0.55, 216000], [0.5, 210000], [0.45, 197000], [0.4, 180000], [0.35, 166000], [0.3, 150000],
      [0.25, 131000], [0.2, 110000], [0.15, 86000], [0.1, 60000], [0.05, 31000]],   // [最大combo占比超过, combo得分]，从高到低；全连 300000
    full: 300000, knee: 0.9,
  };
  /* 上限按两项的宽松程度：0 正常、1 宽松、2 放水（两项都放水是自动演奏，不计分） */
  const LOOSENESS = { normal: 0, loose: 1, hover: 2, free: 2 };
  const CAPS = { "0,0": 1000000, "0,1": 800000, "1,1": 700000, "0,2": 650000, "1,2": 600000 };
  /* 判定模式算几档宽松：仙人刺的正常判定本来就是宽松那一档的窗口（LOOSE_WIN），选宽松并没有放宽，不算宽松、不降上限 */
  const judgeLoose = (judge = S.judge, diff = S.diff) => (judge === "loose" && diff === "easy" ? 0 : LOOSENESS[judge] || 0);
  function capOf(judge = S.judge, range = S.range, diff = S.diff) {
    const k = [judgeLoose(judge, diff), LOOSENESS[range] || 0].sort().join();
    return CAPS[k] || SCORE.max;
  }
  function judgeScore(sumW, n) {
    if (!n) return 0;
    const raw = (SCORE.base * sumW) / n;
    let out = 0, from = 0, rate = 1;
    for (const [at, r] of SCORE.curve) {
      if (raw <= at) break;
      out += (at - from) * rate;
      from = at;
      rate = r;
    }
    return Math.min(SCORE.judge, Math.round(out + (raw - from) * rate));
  }
  function comboScore(maxCombo, n) {
    if (!n) return 0;
    if (maxCombo >= n) return SCORE.full;
    const r = maxCombo / n;
    const step = SCORE.combo.find(([at]) => r > at);
    return step ? step[1] : 0;
  }
  function capScore(total, cap) {
    if (cap >= SCORE.max) return total;
    const knee = cap * SCORE.knee;
    return total <= knee ? total : knee + ((total - knee) * (cap - knee)) / (SCORE.max - knee);
  }
  /* 准确率（0~1）、最大combo、音数 → 判定分、combo得分、总分 */
  function scoreOf(acc, maxCombo, n, judge, range, diff) {
    const j = judgeScore(acc * 3 * n, n);
    const c = comboScore(maxCombo, n);
    const cap = capOf(judge, range, diff);
    return { judge: j, combo: c, cap, score: Math.round(capScore(j + c, cap)) };
  }
  const sumW = () => { const c = S.counts || {}; return 3 * (c.perfect || 0) + 2 * (c.great || 0) + (c.good || 0) + 0.5 * (c.just || 0); };
  function liveScore() {
    const n = S.notes.length;
    const j = judgeScore(sumW(), n);
    const c = comboScore(S.maxCombo, n);
    return { judge: j, combo: c, score: Math.round(capScore(j + c, capOf())) };
  }
  /* 评级按得分；0 分、学习、自动演奏为「完成」 */
  const RANKS = [[1000000, "Impeccable"], [995000, "SSS+"], [990000, "SSS"], [980000, "SS"], [950000, "S"], [925000, "Almost S"],
    [900000, "A+"], [850000, "A"], [800000, "B+"], [700000, "B"], [600000, "C+"], [500000, "C"], [400000, "D+"], [1, "D"]];
  const rankOf = (score) => (RANKS.find(([at]) => score >= at) || [0, "Complete"])[1];
  const fmtWan = (n) => `${+(n / 10000).toFixed(1)} 万`;
  /* 有上限时的一行说明：「得分上限 80 万（宽松判定）」 */
  function capNote() {
    const cap = capOf();
    if (cap >= SCORE.max) return "";
    const parts = [];
    if (judgeLoose()) parts.push(`${judgeLabel()}判定`);
    if (LOOSENESS[S.range]) parts.push(`${rangeLabel()}范围`);
    return `得分上限 ${fmtWan(cap)}（${parts.join("、")}）`;
  }
  /* 大厅、暂停、演奏中标题下的一行：学习 / 自动演奏 / 判定与点击范围（默认的不写） */
  const modeTag = () => (S.learn ? " · 学习" : isAuto() ? " · 自动演奏" : judgeTag() + (S.range === "normal" ? "" : ` · ${rangeLabel()}范围`));
  /* 本机纪录（最高分与评级）按 曲目:难度:判定模式:点击范围 分开记在 hj_stage_best3。
     百万分制以前的纪录（hj_stage_best2）记着准确率和最大combo，按新公式换算后一起比（准确率只记到 0.1%，换算有几百分的误差）：
     旧键 曲目:难度:判定模式（那时点击范围默认正常）算正常范围；更早的 曲目:难度（加判定模式以前）算宽松判定 + 宽松范围 */
  function oldBestOf(song, diff, judge, range) {
    const all = storage.json(K.oldBest) || {};
    const id = song.id;
    const o = all[`${id}:${diff}:${judge}:${range}`]
      || (range === "normal" ? all[`${id}:${diff}:${judge}`] : null)
      || (judge === "loose" && range === "loose" ? all[`${id}:${diff}`] : null);
    const n = Array.isArray(song.cnt) ? num(song.cnt[DIFFS.findIndex((d) => d.id === diff)], 0) : 0;
    const acc = o ? num(o.acc, NaN) : NaN;
    if (!o || !n || !Number.isFinite(acc) || isAuto(judge, range)) return null;
    const { score } = scoreOf(clamp(acc / 100, 0, 1), clamp(num(o.combo, 0), 0, n), n, judge, range, diff);
    return { score, rank: rankOf(score), old: true };
  }
  function bestOf(song, diff = S.diff, judge = S.judge, range = S.range) {
    if (!song) return null;
    const cur = (storage.json(K.best) || {})[`${song.id}:${diff}:${judge}:${range}`] || null;
    const old = oldBestOf(song, diff, judge, range);
    if (!cur) return old;
    /* 评级只看得分，按现在的分档重新算（旧纪录里存的「完美」「完成」等旧名字也就换成新名字） */
    return old && old.score > num(cur.score, 0) ? old : { ...cur, rank: rankOf(num(cur.score, 0)) };
  }
  /* 选曲列表右下角：这首在这个难度下的最高评级（各判定模式、点击范围里分最高的那条）；all 为 hj_stage_best3 */
  function topRankOf(all, song, diff = S.diff) {
    const prefix = `${song.id}:${diff}:`;
    let top = 0;
    for (const k in all) if (k.startsWith(prefix)) top = Math.max(top, num(all[k] && all[k].score, 0));
    return top > 0 ? rankOf(top) : "";
  }
  const fmtTime = (sec) => { const n = Math.max(0, Math.round(sec)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`; };
  const fmtNum = (n) => Math.round(n).toLocaleString("en-US");
  const midiName = (m) => `${NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
  /* 星级按档：songs.json 的 diffs = [仙人刺, 魔界花, 泰坦]，0.5 ~ 5 星、半星一档（build.py 的 rate_stars）；旧曲库只有 diff（魔界花档） */
  function starsOf(s, diffId = S.diff) {
    const k = Math.max(0, DIFFS.findIndex((d) => d.id === diffId));
    return clamp(Math.round(num(Array.isArray(s.diffs) ? s.diffs[k] : s.diff, 3) * 2) / 2, 0.5, 5);
  }
  /* 五颗星：整星实心、半星左半边实心、其余空心（半星的实心半边由 CSS 盖在空心星上） */
  function starsEl(n, title) {
    return h("span", { class: "hjs-stars", role: "img", title, "aria-label": `${n} 星` },
      [1, 2, 3, 4, 5].map((i) => (n >= i ? h("i", { class: "hjs-star", text: "★" })
        : n >= i - 0.5 ? h("i", { class: "hjs-star is-half", text: "☆" }) : h("i", { class: "hjs-star", text: "☆" }))));
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
    S.fly = getRaw(K.fly, "1") === "1";                // 飞花线默认开
    S.anim = getRaw(K.anim, "frame") === "browser" ? "browser" : "frame";   // 气泡动画：默认逐帧由页面更新
    const power = getRaw(K.power, "auto");
    S.power = power === "on" || power === "off" ? power : "auto";        // 省电画法：开启 / 自动（掉帧多时切换）/ 关闭
    S.lineMode = getRaw(K.line, "lite") === "full" ? "full" : "lite";    // 简单显示的金线：优化（光条）/ 完整（SVG 曲线）
    applyRender();
    S.delayMs = clamp(Math.round(num(getRaw(K.delay, 0), 0) / 5) * 5, -300, 300);
    S.stars = clamp(Math.round(num(getRaw(K.stars, 0), 0) * 2) / 2, 0, 5);   // 0 = 全部，其余按半星筛
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

  /* ==== 曲库：songs.json 只有曲目信息，谱面 charts/<id>.json 点到这首才下载 ====
     songs.json 只列公开的曲目；在选曲窗口的搜索框输入曲库密码按回车，Worker（stage_unlock）核对后发回全部曲目和一张凭证，
     凭证记在本机，之后打开舞台自动换成全部曲目（凭证 30 天有效、每次用都续期；Worker 换了曲库密码就失效） */
  const ver = () => (window.HJ && window.HJ.version) || "1";
  const UNLOCK_WAIT_MS = 4000;                          // 打开舞台时凭证换曲目最多等这么久，超时先用公开曲目
  function setLibrary(json) {
    const list = (Array.isArray(json.songs) ? json.songs : []).filter((s) => s && s.id && s.t);
    if (!list.length) return false;
    S.data = list;
    const tags = Array.isArray(json.tags) ? json.tags.map(String) : [];
    list.forEach((s) => { if (s.tag && !tags.includes(s.tag)) tags.push(s.tag); });
    S.tags = tags.filter((t) => list.some((s) => s.tag === t));
    if (S.cat && !S.tags.includes(S.cat)) S.cat = "";
    const id = getRaw(K.song, "");
    const keep = S.song && list.find((s) => s.id === S.song.id);
    S.song = list.find((s) => s.id === id) || keep || list.find((s) => s.id === json.first) || list[0];
    return true;
  }
  /* 用密码或本机凭证换全部曲目；成功返回 true。失败不提示（搜索框照常搜索） */
  async function unlock(payload) {
    if (typeof callWorker !== "function") return false;
    const res = await callWorker({ action: "stage_unlock", ...payload }, { load: "none" }).catch(() => null);
    if (!res || !res.ok) {
      if (payload.token && res && res.error === "auth") storage.remove(K.unlock);   // 过期或换了密码
      return false;
    }
    if (res.token) setRaw(K.unlock, res.token);
    if (S.view === "play" && S.song) {                  // 演奏中：只换列表，不换正在弹的曲子
      const now = S.song;
      if (!setLibrary(res)) return false;
      S.song = now;
    } else if (!setLibrary(res)) return false;
    S.unlocked = true;
    return true;
  }
  function loadData() {
    if (S.data) return Promise.resolve(true);
    S.loading ??= (async () => {
      try {
        const res = await fetch(`${BASE}songs.json?v=${ver()}`, { cache: "no-cache" });
        if (!res.ok) throw new Error(String(res.status));
        const json = await res.json();
        if (!setLibrary(json)) throw new Error("empty");
        S.err = "";
        const token = getRaw(K.unlock, "");
        if (token && !S.unlocked) {
          const p = unlock({ token });
          const done = await Promise.race([p, new Promise((r) => setTimeout(() => r(null), UNLOCK_WAIT_MS))]);
          if (done === null) p.then((ok) => { if (ok && S.view === "lobby") { S.sheet === "picker" ? renderSheet() : renderLobby(); } });
        }
        return true;
      } catch (e) {
        S.err = "曲库加载失败，请检查网络后重新打开舞台";
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
        h("div", { class: "hjs-combo is-zero", id: "hjsComboBig", "aria-hidden": "true" }, h("b", { id: "hjsComboN", text: "0" }), h("small", { text: "COMBO" })),
        h("header", { class: "hjs-hud", id: "hjsHud" },
          h("div", { class: "hjs-hud-song" }, h("b", { id: "hjsNowT" }), h("small", { id: "hjsNowS" })),
          h("div", { class: "hjs-hud-stats" },
            h("span", { class: "hjs-stat" }, h("b", { id: "hjsScore", text: "0" }), h("small", { id: "hjsScoreL", text: "分数" })),
            h("span", { class: "hjs-stat" }, h("b", { id: "hjsCombo", text: "0" }), h("small", { text: "COMBO" }))),
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
    ["pointermove", "pointerover"].forEach((ev) => play.addEventListener(ev, onHoverMove));
    ["pointerup", "pointercancel", "pointerleave"].forEach((ev) => play.addEventListener(ev, onHoverEnd));
    play.addEventListener("contextmenu", (e) => e.preventDefault());
    /* 安卓上只有手指抬起（pointerup / touchend / click）才算用户操作，按下（pointerdown）不算：音频没在运行时，在抬起时再叫一次 */
    const wakeOnUp = () => { if (bard().audioState?.() !== "running") bard().unlock?.(); };
    ["pointerup", "touchend", "click"].forEach((ev) => root.addEventListener(ev, wakeOnUp, { capture: true, passive: true }));
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("popstate", onPopState);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) return;
      if (S.view === "play" && S.playing && !S.paused) pause();
      stopPreview();
      if (S.cal) stopCal("页面已切至后台，校准中断");
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
    document.documentElement.classList.add("hjs-lock");   // 连 html 一起锁住滚动：手指稍微一滑，手机浏览器的工具栏就会出来 / 收起，整个舞台跟着变高变矮
    /* 舞台淡入盖满后，把下面的网站藏起来、停掉它的动画：被挡住的东西不再参与绘制 */
    S.coverTimer = setTimeout(() => document.body.classList.add("hjs-covered"), 260);
    if (typeof bgm !== "undefined" && bgm.playing) { S.bgmWasOn = true; bgm.pause(); }
    bard().unlock?.();                                  // 顺带把音频会话切到「播放」（iPhone 侧边静音键开着也有声音）
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
      document.documentElement.classList.remove("hjs-lock");
    }, 240);
    bard().release?.();
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
    if (S.cal) { stopCal("校准已取消"); return; }
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
      h("div", { class: "hjs-brand" },
        h("img", { class: "hjs-brand-ico", src: `${BASE}stage-icon.webp`, alt: "", width: 40, height: 40, draggable: "false", decoding: "async" }),
        h("b", { text: "舞台演奏" })),
      h("div", { class: "hjs-bar-btns" },
        iconBtn("help", "玩法说明", () => openSheet("help")),
        iconBtn("gear", "设置", () => openSheet("settings")),
        iconBtn("close", "离开舞台", () => close()))));

    const main = h("div", { class: "hjs-lobby-main" });
    box.append(main);
    if (!S.data) {
      main.append(h("div", { class: "hjs-card hjs-wait" },
        h("p", { class: S.err ? "hjs-err" : "hjs-loading", text: S.err || "曲库加载中…" }),
        S.err ? h("button", { type: "button", class: "hjs-btn", text: "重试", onclick: () => { S.err = ""; renderLobby(); loadData().then(() => renderLobby()); } }) : null));
      return;
    }

    const s = S.song;
    const previewing = S.preview.id === s.id;
    const heroRank = topRankOf(storage.json(K.best) || {}, s);   // 右下角：这首在当前难度下的最高评级
    main.append(h("section", { class: "hjs-card hjs-hero" },
      h("p", { class: "hjs-eyebrow", text: "今晚演奏" }),
      h("h2", { class: "hjs-hero-t", text: s.t }),
      s.o ? h("p", { class: "hjs-hero-o", text: s.o }) : null,
      h("p", { class: "hjs-hero-meta" },
        starsEl(starsOf(s), `${diffMeta().label}难度 ${starsOf(s)} / 5 星`),
        h("span", { text: metaOf(s) }),
        s.tag ? h("span", { class: "hjs-tag", text: s.tag }) : null),
      s.note ? h("p", { class: "hjs-hero-note", text: s.note }) : null,
      h("div", { class: "hjs-hero-btns" },
        h("button", { type: "button", class: `hjs-btn hjs-prev-btn${previewing ? " is-on" : ""}`, id: "hjsLobbyPrev", "aria-pressed": String(previewing), onclick: () => togglePreview(s) },
          h("span", { class: "hjs-btn-ico", html: previewing ? ICON.stop : ICON.play }), h("span", { text: previewing ? "停止试听" : "试听" })),
        h("button", { type: "button", class: "hjs-btn", onclick: () => openSheet("picker") },
          h("span", { class: "hjs-btn-ico", html: ICON.list }), h("span", { text: "更换曲目" })),
        heroRank ? h("span", { class: `hjs-song-rank hjs-hero-rank${heroRank === "Impeccable" ? " is-max" : ""}`, title: `${diffMeta().label}难度最高评级`, text: heroRank }) : null)));

    loadChart(s);                                       // 先把谱面下好，开始、试听时不用等
    const best = bestOf(s);
    const cnt = Array.isArray(s.cnt) ? s.cnt : [];                       // 仙人刺 / 魔界花 / 泰坦各要弹几个音
    const nNow = cnt[DIFFS.findIndex((d) => d.id === S.diff)];
    main.append(h("section", { class: "hjs-card hjs-ctrl" },
      h("div", { class: "hjs-line" }, h("span", { class: "hjs-line-l", text: "难度" }),
        seg("难度", DIFFS.map((d, i) => ({ id: d.id, label: d.label, title: `${starsOf(s, d.id)} 星${cnt[i] ? ` · ${cnt[i]} 个音` : ""}` })), S.diff,
          (v) => { S.diff = v; setRaw(K.diff, v); renderLobby(); })),
      h("div", { class: "hjs-line" }, h("span", { class: "hjs-line-l", text: "模式" }),
        seg("模式", [{ id: "show", label: "演出" }, { id: "learn", label: "学习" }], S.learn ? "learn" : "show",
          (v) => { S.learn = v === "learn"; setRaw(K.learn, S.learn ? "1" : "0"); renderLobby(); })),
      h("p", { class: "hjs-tip", text: isAuto() ? "自动演奏：点击范围与判定模式均为放水，自动弹奏，不计分" + (nNow ? ` · 本难度 ${nNow} 个音` : "")
        : S.learn ? "学习模式：气泡到达判定点时暂停，弹中后继续，不计分" + (nNow ? ` · 本难度 ${nNow} 个音` : "")
          : `按节拍演奏${nNow ? `，本难度 ${nNow} 个音` : ""}` }),
      vol().muted
        ? h("p", { class: "hjs-muted" }, h("span", { text: "当前为静音" }),
          h("button", { type: "button", class: "hjs-link", text: "打开声音", onclick: () => { vol().set(0.55); renderLobby(); } }))
        : null,
      best && scored() ? h("p", { class: "hjs-best", text: `本机纪录（${diffMeta().label} · ${judgeLabel()}判定 · ${rangeLabel()}范围）· ${fmtNum(best.score)} 分 · ${best.rank}` }) : null,
      h("button", { type: "button", class: "hjs-go", id: "hjsGo", onclick: () => startSong() },
        h("span", { class: "hjs-go-ico", html: ICON.play }), h("span", { text: isAuto() ? "自动演奏" : S.learn ? "开始练习" : "开始演奏" }))));
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
      if (!chart) { stopPreview(); toast("谱面加载失败，请检查网络后重试"); return; }
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
    if (kind === "picker") fitPicker($id("hjsSheetCard"));   // 窗口藏着时量不到按钮宽度，显示出来后再量一次
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
    const title = { picker: "选曲", settings: "设置", help: "玩法说明" }[S.sheet];
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
      type: "search", class: "hjs-search-in", placeholder: "搜索曲名 / 歌手 / 出处", value: S.query, "aria-label": "搜索曲目",
      enterkeyhint: "search", autocomplete: "off",
      oninput: () => { S.query = input.value; renderSongList(); },
      /* 回车：可能是曲库密码（对了就换成全部曲目，不对什么也不说，照常搜索） */
      onkeydown: (e) => {
        if (e.key !== "Enter" || e.isComposing || e.keyCode === 229 || S.unlocked) return;
        const text = input.value.trim();
        if (!text || text.length > 64) return;
        e.preventDefault();
        unlock({ password: text }).then((ok) => {
          if (!ok || S.sheet !== "picker") return;
          S.query = "";
          renderSheet();
          toast(`已显示全部曲目（${S.data.length} 首）`);
        });
      },
    });
    card.append(
      h("div", { class: "hjs-search" }, h("span", { class: "hjs-search-ico", html: ICON.search }), input),
      ...(S.tags.length > 1 ? [h("div", { class: "hjs-chips is-cat", role: "radiogroup", "aria-label": "按分类筛选" },   // 原生 append 不能传 null
        ["", ...S.tags].map((t) => h("button", {
          type: "button", class: `hjs-chip${S.cat === t ? " is-on" : ""}`, role: "radio", "aria-checked": String(S.cat === t),
          text: t || "全部分类",
          onclick: () => { S.cat = t; setRaw(K.cat, t); renderSheet(); },
        })))] : []),
      h("div", { class: "hjs-chips", role: "radiogroup", "aria-label": "按难度筛选" },
        [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map((n) => h("button", {
          type: "button", class: `hjs-chip${S.stars === n ? " is-on" : ""}`, role: "radio", "aria-checked": String(S.stars === n),
          text: n ? `${n}★` : "全部", title: n ? `${diffMeta().label}难度 ${n} 星` : "全部难度",
          onclick: () => { S.stars = n; setRaw(K.stars, n); renderSheet(); },
        }))),
      h("div", { class: "hjs-sheet-body hjs-songs", id: "hjsSongs", role: "listbox", "aria-label": "曲目" }),
      h("footer", { class: "hjs-sheet-foot" },
        h("span", { class: "hjs-foot-now", id: "hjsPickNow" }),
        h("button", { type: "button", class: "hjs-btn is-main", text: "确定", onclick: closeSheet })));
    fitPicker(card);
    card.querySelectorAll(".hjs-chips").forEach((row, i) => dragRow(row, i ? "stars" : "cat"));
    renderSongList();
  }
  /* 电脑上宽度够时把选曲窗口加宽到分类、难度按钮一行全露出来；放不下（手机、窄窗口）仍横着滑 */
  function fitPicker(card) {
    if (!card.classList.contains("is-picker")) return;
    card.style.removeProperty("--pick-w");
    if (window.matchMedia("(max-width: 760px)").matches) return;
    const need = Math.max(0, ...Array.from(card.querySelectorAll(".hjs-chips"), (r) => r.scrollWidth));
    if (need) card.style.setProperty("--pick-w", `${Math.ceil(need) + 4}px`);
  }
  /* 分类、星级一行放不下时横着滑：手机手指滑；电脑鼠标按住拖、滚轮也能左右滚；两端还有没露出来的就淡出提示。
     点按钮会重画窗口，记着滑到哪儿（S.chipX），重画后接着在原处，选中的那个也挪进视野 */
  function dragRow(row, key) {
    const keyOf = row.classList.contains("is-cat") ? "cat" : key;
    S.chipX ||= {};
    const edge = () => {
      const max = row.scrollWidth - row.clientWidth;
      row.classList.toggle("is-more-l", row.scrollLeft > 2);
      row.classList.toggle("is-more-r", row.scrollLeft < max - 2);
    };
    row.addEventListener("scroll", () => { S.chipX[keyOf] = row.scrollLeft; edge(); }, { passive: true });
    row.addEventListener("wheel", (e) => {
      if (row.scrollWidth <= row.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      row.scrollLeft += e.deltaY;
    }, { passive: false });
    let drag = null;
    row.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "mouse" || e.button !== 0 || row.scrollWidth <= row.clientWidth) return;
      drag = { x: e.clientX, left: row.scrollLeft, moved: false, id: e.pointerId };
    });
    row.addEventListener("pointermove", (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) < 5) return;
      if (!drag.moved) { drag.moved = true; row.setPointerCapture(e.pointerId); row.classList.add("is-dragging"); }
      row.scrollLeft = drag.left - dx;
    });
    const end = () => {
      if (!drag) return;
      if (drag.moved) {   // 拖过就不算点了一下
        row.addEventListener("click", (ev) => { ev.stopPropagation(); ev.preventDefault(); }, { capture: true, once: true });
        setTimeout(() => row.classList.remove("is-dragging"), 0);
      }
      drag = null;
    };
    row.addEventListener("pointerup", end);
    row.addEventListener("pointercancel", end);
    requestAnimationFrame(() => {
      row.scrollLeft = S.chipX[keyOf] || 0;
      const on = row.querySelector(".is-on");
      if (on && (on.offsetLeft < row.scrollLeft || on.offsetLeft + on.offsetWidth > row.scrollLeft + row.clientWidth)) {
        row.scrollLeft = on.offsetLeft - (row.clientWidth - on.offsetWidth) / 2;
      }
      edge();
    });
  }
  function renderSongList() {
    const box = $id("hjsSongs");
    if (!box) return;
    box.textContent = "";
    const list = filtered();
    $id("hjsCount").textContent = `${list.length} / ${S.data.length} 首`;
    $id("hjsPickNow").textContent = S.song ? `已选：${S.song.t}` : "";
    if (!list.length) { box.append(h("p", { class: "hjs-empty", text: "没有符合条件的曲目" })); return; }
    const bests = storage.json(K.best) || {};
    list.forEach((s) => {
      const top = topRankOf(bests, s);
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
          starsEl(starsOf(s), `${diffMeta().label}难度 ${starsOf(s)} 星`),
          top ? h("span", { class: `hjs-song-rank${top === "Impeccable" ? " is-max" : ""}`, title: `${diffMeta().label}难度最高评级`, text: top }) : null)));
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
    const sel = h("select", { class: "hjs-select", "aria-label": "音色", onchange: () => { S.inst = sel.value; setRaw(K.inst, sel.value); } });
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
      row("音量", h("div", { class: "hjs-vol" }, range, volVal), "与全站音量同步"),
      row("音色", sel, "整首曲目使用该音色；拨弦、钢琴类起音最清晰"),
      row("示范旋律", demo, "轻声播放需弹奏的音，供跟弹参考")));

    /* 画面 */
    const fly = h("input", { type: "checkbox", class: "hjs-switch", checked: S.fly, "aria-label": "飞花线", onchange: () => { S.fly = fly.checked; setRaw(K.fly, S.fly ? "1" : "0"); } });
    body.append(group("画面",
      row("显示", seg("显示", [{ id: "normal", label: "正常显示" }, { id: "simple", label: "简单显示" }], S.render,
        (v) => { S.render = v; setRaw(K.render, v); applyRender(); renderSheet(); }),
      S.render === "simple" ? "去除气泡光晕与文字阴影，飞花线改为光线，音符密集时更流畅" : "音符密集时卡顿可改用简单显示"),
      row("飞花线", fly, "小花沿曲线依次经过各气泡，经过时即为判定点；身后带星光（简单显示时为金色光线）")));

    /* 性能优化：用不上的项置灰（省电画法只去掉气泡光晕，简单显示本来就没有；金线只在简单显示、开着飞花线时才有） */
    const off = (el, why) => {
      if (!why) return el;
      el.classList.add("is-disabled");
      el.querySelectorAll("button").forEach((b) => { b.disabled = true; });
      const hint = el.querySelector(".hjs-set-l small");
      if (hint) hint.textContent = why;
      return el;
    };
    const POWER_HINT = { on: "一直去掉气泡光晕，最省", auto: "掉帧多时自动去掉气泡光晕（默认）", off: "一直保留气泡光晕" };
    body.append(group("性能优化",
      ...(CAN_ANIM ? [row("气泡动画", seg("气泡动画", [{ id: "frame", label: "逐帧" }, { id: "browser", label: "浏览器" }], S.anim,
        (v) => { S.anim = v; setRaw(K.anim, v); renderSheet(); }),
      S.anim === "browser" ? "气泡收缩交给浏览器播放；不同手机效果不同，可对比结算里的性能测试记录" : "气泡收缩每帧由页面更新（默认，多数手机更顺）")] : []),
      off(row("省电画法", seg("省电画法", [{ id: "on", label: "开启" }, { id: "auto", label: "自动" }, { id: "off", label: "关闭" }], S.power,
        (v) => { S.power = v; setRaw(K.power, v); renderSheet(); }), POWER_HINT[S.power]),
      S.render === "simple" ? "简单显示已去掉气泡光晕，此项不起作用" : ""),
      off(row("金线", seg("金线", [{ id: "full", label: "完整" }, { id: "lite", label: "优化" }], S.lineMode,
        (v) => { S.lineMode = v; setRaw(K.line, v); renderSheet(); }),
      S.lineMode === "full" ? "平滑的整条曲线，每帧重画，曲子密时较费" : "由短光条拼成，不用重画，更流畅（默认）"),
      S.render !== "simple" ? "只在简单显示时出现（正常显示为星光）" : !S.fly ? "飞花线已关闭" : "")));

    /* 操作：只有点气泡；点击范围 */
    const rg = TAP_RANGES[S.range];
    body.append(group("操作",
      row("点击范围", seg("点击范围", Object.entries(TAP_RANGES).map(([id, v]) => ({ id, label: v.label })), S.range,
        (v) => { S.range = v; setRaw(K.range, v); renderSheet(); }),
      S.range === "free"
        ? (S.judge === "hover" ? "判定模式也为放水：自动演奏，不计分" : "不限位置：外圈收至判定点的气泡，点击任意位置或按任意键均有效")
        : S.judge === "hover"
          ? `判定模式为放水：指针停在气泡 ${rg.r} 倍直径内即有效`
          : `点击位置在气泡 ${rg.r} 倍直径内有效；附近无其他气泡时，下一个气泡（外圈加粗）放宽至 ${rg.next} 倍`),
      capNote() && scored() ? h("p", { class: "hjs-set-note", text: `当前${capNote()}。按判定模式与点击范围组合：一项宽松 80 万、两项宽松 70 万、一项放水 65 万、宽松 + 放水 60 万；上限的九成以内照常计分，超出部分压缩进最后一成` }) : null));

    /* 时机 */
    const winText = (w) => w.map((x) => x.toFixed(2)).join(" / ");
    const judgeRow = row("判定模式", seg("判定模式", JUDGE_MODES, S.judge, (v) => { S.judge = v; setRaw(K.judge, v); renderSheet(); }),
      S.judge === "hover"
        ? (S.range === "free" ? "点击范围也为放水：自动演奏，不计分" : `无需点击：指针停在气泡 ${(TAP_RANGES[S.range] || TAP_RANGES.normal).r} 倍直径内（随点击范围），到判定点自动算弹中（手机可按住滑动）；判定窗口同宽松`)
        : S.judge === "loose"
          ? `三档难度均按仙人刺判定：PERFECT / GREAT / GOOD 误差分别在 ${winText(LOOSE_WIN)} 秒以内`
          : `随难度收紧，当前「${diffBase().label}」：PERFECT / GREAT / GOOD 误差分别在 ${winText(diffBase().win)} 秒以内`);
    const val = h("b", { class: "hjs-num-v", text: `${S.delayMs > 0 ? "+" : ""}${S.delayMs} ms` });
    const setv = (v) => { S.delayMs = clamp(Math.round(v / 5) * 5, -300, 300); setRaw(K.delay, S.delayMs); val.textContent = `${S.delayMs > 0 ? "+" : ""}${S.delayMs} ms`; };
    const step = (d, label) => h("button", { type: "button", class: "hjs-step", "aria-label": label, text: d > 0 ? "＋" : "－", onclick: () => setv(S.delayMs + d) });
    const timing = [judgeRow, row("判定延迟", h("div", { class: "hjs-num" }, step(-5, "提前 5 毫秒"), val, step(5, "推后 5 毫秒"),
      h("button", { type: "button", class: "hjs-btn hjs-cal-btn", text: S.cal ? "校准中…" : "校准", disabled: !!S.cal, onclick: startCal })),
    "判定持续偏晚时调大，偏早时调小")];
    if (S.cal || S.calMsg) timing.push(calPanel());
    body.append(group("时机", ...timing));

    body.append(h("div", { class: "hjs-set-foot" }, h("button", {
      type: "button", class: "hjs-link", text: "恢复默认设置",
      onclick: () => {
        [K.inst, K.demo, K.delay, K.judge, K.render, K.range, K.fly, K.anim, K.power, K.line].forEach((k) => storage.remove(k));
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
        ["点击气泡即可弹奏，允许少许偏差。使用电脑时，也可将指针移至气泡上后按任意键",
          "MISS 与点空含义不同：MISS 指音符到达判定点时未弹奏，该音不发声，COMBO中断，并计入准确率；点空指点击时附近没有待弹奏的气泡，不扣分，也不中断COMBO，仅在结算时记录次数。点空较多时，通常是点击过早或位置偏离所致",
          "判定模式与点击范围均分为正常、宽松、放水三档。选择宽松或放水时，得分设有上限：一项宽松为 80 万，两项宽松为 70 万，一项放水为 65 万，宽松与放水各一项为 60 万。仙人刺难度的正常判定已与宽松相同，选宽松判定不降上限",
          "得分由判定分（70%）和COMBO得分（30%）两部分组成，判定分根据每个音的判定评价记分，COMBO得分按最大COMBO数评价，因此追求高分请尽可能不要断COMBO。",
          "点击范围与判定模式均设为放水时为自动演奏，不计分。本机纪录按难度、判定模式与点击范围分别保存最高分与评级",
          "若判定持续偏早或偏晚，可在设置的判定延迟一项中进行校准，随提示音点击数次即可",
          "按 Esc 键或手机返回键，可暂停演奏、关闭窗口或返回上一层",
        ].map((t) => h("li", { text: t })))));
  }

  /* ==== 延迟校准：在游戏同一个音频钟上排 10 下「嗒」，跟着按任意键或点圆圈，取后几下偏差的中位数 ==== */
  function calPanel() {
    const c = S.cal;
    const n = c ? c.taps.length : 0;
    return h("div", { class: "hjs-cal" },
      c ? h("button", {
        type: "button", class: "hjs-cal-pad", "aria-label": "随节拍点击此处",
        onpointerdown: (e) => { e.preventDefault(); calTap(); },
        onkeydown: (e) => { if (e.key === " " || e.key === "Enter") e.preventDefault(); },
      }, h("span", { text: "随「嗒」声点击此处" }), h("small", { text: "或按任意键" })) : null,
      c ? h("div", { class: "hjs-cal-dots", "aria-hidden": "true" }, Array.from({ length: CAL.count }, (_, i) => h("i", { class: i < n ? "is-on" : "" }))) : null,
      S.calMsg ? h("p", { class: "hjs-cal-msg", text: S.calMsg }) : null,
      c ? h("button", { type: "button", class: "hjs-link", text: "取消", onclick: () => stopCal("校准已取消") }) : null);
  }
  function startCal() {
    if (S.cal) return;
    stopPreview();
    S.calMsg = "";
    const b = bard();
    if (!b.playMidi) { S.calMsg = "节拍音无法播放，请刷新页面后重试"; renderSheet(); return; }
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
    if (use.length < 4) { stopCal("有效次数不足，请重试：从第三拍起跟随点击"); return; }
    const mid = use.length % 2 ? use[(use.length - 1) / 2] : (use[use.length / 2 - 1] + use[use.length / 2]) / 2;
    const ms = clamp(Math.round((mid * 1000) / 5) * 5, -300, 300);
    S.delayMs = ms;
    setRaw(K.delay, ms);
    const d = Math.round(mid * 1000);
    stopCal(Math.abs(d) < 8 ? "时机准确，判定延迟保持 0 附近" : `平均偏${d > 0 ? "晚" : "早"} ${Math.abs(d)} ms，判定延迟已设为 ${ms > 0 ? "+" : ""}${ms} ms`);
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
    S.hovered = new Float32Array(S.notes.length).fill(NaN);
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

  function geometry(dm) {
    const w = S.root.clientWidth || window.innerWidth;
    const hh = S.root.clientHeight || window.innerHeight;
    const size = clamp(Math.min(w, hh) * dm.tap, 66, 118);
    const inset = safeInsets();
    const hud = $id("hjsHud").offsetHeight || 56;
    const top = hud + size * 0.62 + 10;
    const bottom = Math.max(top + 80, hh - size * 0.62 - 14 - inset.bottom);
    return { w, h: hh, size, top, bottom };
  }
  function layout() {
    const dm = diffMeta();
    S.g = geometry(dm);
    $id("hjsNotes").style.setProperty("--size", `${S.g.size.toFixed(1)}px`);

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

  /* 窗口变了：手机浏览器的工具栏出来 / 收起只改高度，这时已经在屏幕上和马上要出来的气泡一个都不动（不然手指正对着的气泡会突然挪开，
     点下去算点偏），后面的按新高度等比例挪一下；宽度变了（横竖屏切换）才整首重新摆。等窗口停下来 120 ms 再做，免得连着重算 */
  function onResize() {
    if (S.view !== "play" || !S.notes.length) return;
    clearTimeout(S.resizeTimer);
    S.resizeTimer = setTimeout(relayout, 120);
  }
  function relayout() {
    if (S.view !== "play" || !S.notes.length || !S.g) return;
    const dm = diffMeta();
    const g = geometry(dm);
    if (S.diag) S.diag.resizes += 1;
    if (Math.abs(g.w - S.g.w) > 1 || Math.abs(g.size - S.g.size) > 0.5) { layout(); return; }
    if (Math.abs(g.h - S.g.h) < 1) return;
    const old = S.g;
    const keep = (S.frozen ? S.frozenT : songTime()) + dm.approach + 0.6;
    const k = (g.bottom - g.top) / Math.max(1, old.bottom - old.top);
    for (const n of S.notes) {
      if (n.t <= keep || S.els.has(n.idx)) continue;
      n.y = g.top + (n.y - old.top) * k;
    }
    S.g = g;
    flyLayout();
  }

  /* ==== 开始 / 结束 ==== */
  function resetRun() {
    S.score = 0;
    S.combo = 0;
    S.maxCombo = 0;
    S.learnHits = 0;
    S.counts = { perfect: 0, great: 0, good: 0, just: 0, miss: 0 };
    S.offs = [];                                        // 每次弹中的偏差（秒，正 = 晚），结算时给个平均
    /* 手感诊断：掉帧、点按排队时间。base：本机一帧多长（开头 120 帧的中位数，按屏幕刷新率）；drop：比 base 长一半以上的帧；
       buckets：每 4 秒歌曲时间里掉了几帧，结算时指出最卡的一段；max：最长一帧 */
    S.diag = { frames: 0, slow: 0, last: 0, waits: [], tsBad: false, lite: false, warm: [], base: 0, n: 0, drop: 0, max: 0, buckets: new Map(),
      busy: 0, busyN: 0, busyMax: 0, longs: 0, longMax: 0, resizes: 0, secs: new Map(), longList: [], fixes: 0, ghostList: [] };
    S.rec = [];                                         // 每个音的结果（性能测试记录导出用）
    if (S.root) S.root.classList.toggle("is-lite", S.power === "on");   // 省电画法：开启时一开始就用；自动时掉帧多了才切
    S.clockRate = 1;
    S.rateSample = null;
    S.tapCtx = null;   // busy：每帧主线程上 tick 自己花的时间；longs：50 ms 以上的长任务
    S.ghosts = 0;                                       // 点气泡时点空的次数
    S.ghostWhy = { early: 0, late: 0, off: 0, again: 0 };         // 点空的原因：早了（附近的气泡还没到判定窗）/ 晚了 / 时间对但点偏了
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
        toast("谱面加载失败，请检查网络后重试");
        return;
      }
      prepare(s, chart);
      layout();
      prewarm();
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
      banner("点击屏幕开始", "is-wait");
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
    watchLongTasks(true);
    loop();
  }
  /* 长任务（主线程一口气占用 50 ms 以上，期间画面和点按都会卡住）：浏览器支持时记下次数和最长一次，给结算的诊断行 */
  function watchLongTasks(on) {
    if (S.longObs) { S.longObs.disconnect(); S.longObs = null; }
    if (!on || typeof PerformanceObserver === "undefined" || !(PerformanceObserver.supportedEntryTypes || []).includes("longtask")) return;
    S.longObs = new PerformanceObserver((list) => {
      const dg = S.diag;
      if (!dg || !S.playing || S.paused) return;
      const pos = Math.max(0, clockRaw(S.clock) - S.clock.lat);
      for (const e of list.getEntries()) {
        dg.longs += 1;
        dg.longMax = Math.max(dg.longMax, e.duration);
        if (dg.longList.length < 400) dg.longList.push([pos, e.duration]);
        const b = secBucket(pos);
        if (b) { b.lt += 1; b.ltMax = Math.max(b.ltMax, e.duration); }
      }
    });
    try { S.longObs.observe({ type: "longtask" }); } catch (e) { S.longObs = null; }
  }

  function stopPlay() {
    stopResumeCount();
    cancelAnimationFrame(S.raf);
    S.raf = 0;
    clearInterval(S.pump);
    clearTimeout(S.resizeTimer);
    watchLongTasks(false);
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

  function tick(ts) {
    S.raf = 0;
    if (!S.playing || S.paused) return;
    const t0 = performance.now();
    noteFrame(ts);
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
        if (t < n.t + dm.win[2] + missGrace(dm)) break;
        miss(n);
        S.next += 1;
      }
      if (!S.frozen) { scheduleSounds(); countIn(t); }
    }
    if (S.judge === "hover" && (S.hover || S.range === "free")) hoverCheck(t, dm);
    draw(t, dm);
    syncAnims(t);
    if (S.fl) flyFrame(t);
    $id("hjsProg").style.transform = `scaleX(${clamp(t / (S.endT + 1), 0, 1).toFixed(4)})`;
    if (S.diag) {
      const spent = performance.now() - t0;
      S.diag.busy += spent;
      S.diag.busyN += 1;
      if (spent > S.diag.busyMax) S.diag.busyMax = spent;
      const b = secBucket(t);
      if (b) b.busy += spent;
    }
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

  /* 画气泡：位置在布局时就定好。收缩（外圈缩小渐亮、核心略放大、音名渐亮、出场淡入）交给 Web Animations，
     由合成线程按屏幕刷新率自己走（120 Hz 屏也是每帧都动），主线程每帧不用再一个个改样式，点按、出声忙的那几帧也不会让气泡顿住；
     动画的进度每隔一会儿（syncAnims）对一次音频钟。浏览器不支持时退回每帧改样式（setK） */
  function draw(t, dm) {
    const ap = dm.approach;
    let nextIdx = -1;
    for (let i = S.next; i < S.notes.length; i++) if (S.judged[S.notes[i].idx] < 0) { nextIdx = S.notes[i].idx; break; }
    for (let i = Math.max(0, S.next - 4); i < S.notes.length; i++) {
      const n = S.notes[i];
      const dt = n.t - t;
      if (dt > ap) break;
      if (S.judged[n.idx] >= 0 || dt < -0.6) { S.els.get(n.idx)?.classList.remove("is-next"); continue; }
      const el = S.els.get(n.idx) || noteEl(n, t, ap);
      const next = n.idx === nextIdx && dt <= NEXT_LEAD;   // 下一个该弹的：快到点时外圈才加粗
      if (next !== el._next) { el._next = next; el.classList.toggle("is-next", next); }
      if (!el._anims) {
        setK(el, clamp(1 - dt / ap, 0, 1));
        const op = dt > ap - 0.22 ? clamp((ap - dt) / 0.22, 0, 1).toFixed(2) : "";
        if (op !== el._op) { el._op = op; el.style.opacity = op; }
      }
    }
  }
  const CAN_ANIM = typeof Element !== "undefined" && typeof Element.prototype.animate === "function"
    && typeof Animation !== "undefined" && typeof Animation.prototype.commitStyles === "function";
  /* 收缩动画：和 setK 同一条曲线（k 从 0 到 1 线性），时长 = 气泡提前出现的时间；fill 停在到点时的样子，等判定 */
  function startAnims(el, t, ap) {
    const dur = ap * 1000;
    const opt = { duration: dur, easing: "linear", fill: "forwards" };
    const fade = Math.min(0.99, 0.22 / ap);
    el._anims = [
      el.animate([{ opacity: 0 }, { opacity: 1, offset: fade }, { opacity: 1 }], opt),
      el._ring.animate([{ transform: "scale(2.3)", opacity: 0.3 }, { transform: "scale(1)", opacity: 1 }], opt),
      el._core.animate([{ transform: "scale(0.84)" }, { transform: "scale(1)" }], opt),
      el._name.animate([{ opacity: 0 }, { opacity: 0, offset: 0.45 }, { opacity: 1, offset: 0.95 }, { opacity: 1 }], opt),
    ];
    seekAnims(el, t, true);
  }
  /* 对时：差得多（暂停、停住、刚出来）直接跳到该在的位置；平时只差几毫秒到几十毫秒，就把播放速度微调几个百分点、半秒左右慢慢追上，
     不一下跳过去（120 Hz 屏上气泡突然跳一下也看得出来） */
  function seekAnims(el, t, hard) {
    const want = Math.max(0, (t - el._t0) * 1000);
    const hold = S.frozen || S.paused;
    const now = performance.now();
    /* 动画的 currentTime 是这一帧开始时的值，比此刻（脚本读钟时）早一点，比较前把这段补上 */
    const tl = document.timeline && Number.isFinite(document.timeline.currentTime) ? document.timeline.currentTime : now;
    const lag = Math.max(0, now - tl);
    for (const a of el._anims) {
      if (hold) {
        if (a.playState === "running") a.pause();
        if (Math.abs((a.currentTime || 0) - want) > 1) a.currentTime = want;
        continue;
      }
      if (a.playState === "paused") { a.play(); hard = true; }
      const err = want - lag * a.playbackRate - (a.currentTime || 0);
      if (hard || Math.abs(err) > 120) {
        /* 用 startTime 定在浏览器动画钟上（不用 currentTime：新建 / 刚继续的动画要等下一帧才开始走，设 currentTime 会整整慢一帧） */
        if (a.playbackRate !== S.clockRate) a.playbackRate = S.clockRate;
        a.startTime = now - want / S.clockRate;
        continue;
      }
      /* 基础速度 = 歌曲钟相对浏览器动画钟的快慢（音频钟和系统钟常差零点几个百分点，syncAnims 里量）；
         另外差 10 ms 以上（脚本读钟本来就比这一帧开始晚几毫秒）才按差多少再加减一点，约 0.6 秒追平 */
      const off = Math.abs(err) >= 10;
      const rate = S.clockRate * (off ? clamp(1 + err / 600, 0.9, 1.1) : 1);
      if (Math.abs(rate - a.playbackRate) > 0.002) {
        if (a.updatePlaybackRate) a.updatePlaybackRate(rate); else a.playbackRate = rate;
        if (off && S.diag) { S.diag.fixes += 1; const b = secBucket(t); if (b) b.fix += 1; }
      }
    }
  }
  /* 每 250 ms 把动画进度对回音频钟一次（停住、暂停、跳回时马上对） */
  function syncAnims(t) {
    const now = performance.now();
    if (!S.frozen && !S.animForce && now - S.animSync < 250) return;
    /* 量歌曲钟走得比浏览器钟快还是慢：两次对时之间（没停、没暂停）各走了多少，慢慢平均 */
    const rs = S.rateSample;
    if (!S.frozen && !S.paused && rs && now - rs.now > 200 && now - rs.now < 2000 && !S.animForce) {
      const r = (t - rs.t) / ((now - rs.now) / 1000);
      if (r > 0.9 && r < 1.1) S.clockRate = clamp(S.clockRate * 0.85 + r * 0.15, 0.97, 1.03);
    }
    S.rateSample = S.frozen || S.paused ? null : { t, now };
    const hard = S.animForce;
    S.animSync = now;
    S.animForce = false;
    S.els.forEach((el) => { if (el._anims) seekAnims(el, t, hard); });
  }
  function pauseAnims() {
    S.animForce = true;
    S.els.forEach((el) => el._anims?.forEach((a) => a.pause()));
  }
  /* 动画停在当前的样子写成行内样式再撤掉，命中 / 漏掉的 CSS 动画从这里接着演 */
  function endAnims(el) {
    if (!el._anims) return;
    for (const a of el._anims) {
      try { a.commitStyles(); } catch (e) {}
      a.cancel();
    }
    el._anims = null;
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
  /* 开演前先备好：一批气泡元素（藏着）、每种判定字各一个，第一次用到时不用现建图层、现画字 */
  function prewarm() {
    const want = Math.min(POOL_MAX, 24);
    while (S.pool.length < want) {
      const el = makeNoteEl();
      el.style.visibility = "hidden";
      S.pool.push(el);
    }
    if (!CAN_ANIM) return;
    const box = $id("hjsJudge");
    const labels = scored() ? JUDGE.map((j) => [j.label, `is-${j.id}`]).concat([["MISS", "is-miss"]]) : [[S.learn ? "WELL" : "AUTO", "is-ok"], ["MISS", "is-miss"]];
    for (const [label, cls] of labels) {
      const key = `${label}|${cls}`;
      if (S.pops.get(key)?.isConnected) continue;
      const p = h("div", { class: `hjs-pop is-pooled ${cls}` }, h("b", { text: label }), h("em", { hidden: true }));
      box.append(p);
      S.pops.set(key, p);
    }
  }
  /* 气泡元素循环使用：弹完 / 漏掉的收起来留给后面的音，不反复建、拆（每个气泡有四层，建拆层在密集段很费） */
  const POOL_MAX = 40;
  function makeNoteEl() {
    const ring = h("i", { class: "hjs-ring" });
    const core = h("i", { class: "hjs-core" });
    const name = h("i", { class: "hjs-name" });
    const el = h("div", { class: "hjs-note" }, ring, core, name);
    Object.assign(el, { _ring: ring, _core: core, _name: name });
    $id("hjsNotes").appendChild(el);
    return el;
  }
  function noteEl(n, t, ap) {
    const el = S.pool.shift() || makeNoteEl();
    Object.assign(el, { _k: -1, _next: false, _op: null, _anims: null, _t0: n.t - (ap || diffMeta().approach) });
    el.className = "hjs-note";
    for (const x of [el, el._ring, el._core, el._name]) { x.style.removeProperty("opacity"); x.style.removeProperty("transform"); }
    el.style.visibility = "";
    if (el._name.textContent !== midiName(n.m)) el._name.textContent = midiName(n.m);
    el.style.setProperty("--c", PALETTE[n.c]);
    el.style.zIndex = String(S.notes.length - n.idx);   // 先到的叠在上面
    placeEl(el, n);
    S.els.set(n.idx, el);
    if (CAN_ANIM && S.anim === "browser" && Number.isFinite(t)) startAnims(el, t, ap);
    return el;
  }
  function dropEl(n, cls, ms) {
    const el = S.els.get(n.idx);
    if (!el) return;
    S.els.delete(n.idx);
    endAnims(el);
    el.classList.remove("is-wait", "is-next");
    el.classList.add(cls);
    const gen = S.gen;
    setTimeout(() => {
      if (!el.isConnected || gen !== S.gen || S.pool.length >= POOL_MAX) { el.remove(); return; }
      el.style.visibility = "hidden";
      el.classList.remove("is-hit", "is-miss");
      S.pool.push(el);
    }, ms);
  }
  function clearNotes() {
    const f = $id("hjsNotes");
    S.els.forEach(endAnims);
    if (f) f.textContent = "";
    S.els.clear();
    S.pool = [];
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
    const segs = [];
    const stars = [];
    let path = null, grad = null;
    if (line && S.lineMode === "full") {
      box.insertAdjacentHTML("beforeend", '<svg class="hjs-fly-svg" aria-hidden="true"><defs><linearGradient id="hjsFlyGrad" gradientUnits="userSpaceOnUse">'
        + '<stop offset="0" stop-color="#fff6d8" stop-opacity=".95"/><stop offset=".4" stop-color="#ffd27a" stop-opacity=".6"/>'
        + '<stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></linearGradient></defs>'
        + '<path fill="none" stroke="url(#hjsFlyGrad)" stroke-linecap="round" stroke-linejoin="round"/></svg>');
      path = box.querySelector("path");
      grad = box.querySelector("linearGradient");
    } else if (line) {
      for (let k = 0; k < FLY.samples; k++) {
        const el = h("i", { class: "hjs-fly-seg" });
        box.append(el);
        segs.push(el);
      }
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
      flower, line, segs, path, grad, stars, live: [], si: 0, calm, curve: [], x: 0, y: 0, placed: false, movedAt: -Infinity,
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
    box.style.setProperty("--fly-line", `${(S.g.size * FLY.line).toFixed(2)}px`);
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
  /* 简单显示：沿花在过去 tail 秒里走过的路取点，相邻两点之间各放一小段光（一条细的圆头光条），从花这头往尾巴渐隐。
     光条是事先画好的固定元素（各自常驻一层），每帧只改它们的 transform / opacity —— 不再每帧重画一条 SVG 曲线
     （那样整条线经过的地方每帧都要重新栅格化，曲子越快线越长，手机越卡）。花停下、线收拢之后全部隐藏一次就不再改 */
  const SEG_W = 100;                                   // 光条的原始长度（px），每段按实际长度横向缩放
  function flyLine(f, t, moved) {
    if (f.path) { flyPath(f, t, moved); return; }
    const hide = () => {
      if (!f.lineOn) return;
      f.lineOn = false;
      for (const el of f.segs) el.style.opacity = "0";
    };
    if (!moved && t - f.movedAt > FLY.tail + 0.05) { hide(); return; }
    const pts = [[f.x, f.y]];
    for (let k = 1; k <= FLY.samples; k++) pts.push(flyAt(f.curve, t - (FLY.tail * k) / FLY.samples));
    const tail = pts[pts.length - 1];
    if (Math.hypot(tail[0] - f.x, tail[1] - f.y) < 1) { hide(); return; }
    const n = f.segs.length;
    for (let k = 0; k < n; k++) {
      const [x0, y0] = pts[k];
      const [x1, y1] = pts[k + 1];
      const len = Math.hypot(x1 - x0, y1 - y0);
      const st = f.segs[k].style;
      if (len < 0.3) { if (st.opacity !== "0") st.opacity = "0"; continue; }
      const a = Math.atan2(y1 - y0, x1 - x0);
      const u = k / n;
      st.transform = `translate3d(${x0.toFixed(1)}px, ${y0.toFixed(1)}px, 0) rotate(${a.toFixed(3)}rad) scaleX(${((len + 0.5 / (window.devicePixelRatio || 1)) / SEG_W).toFixed(3)})`;   // 各段多出半个屏幕像素，补上接缝处的抗锯齿边，不亮不暗
      st.opacity = (0.95 * (1 - u) * (1 - u * 0.35)).toFixed(2);
    }
    f.lineOn = true;
    f.draws += 1;
  }

  /* 金线「完整」：整条平滑曲线（SVG 路径，相邻点的中点用二次曲线连起来），从花这头往尾巴渐隐；每帧重画，曲子密时比光条费 */
  function flyPath(f, t, moved) {
    const clear = () => { if (f.lineOn) { f.lineOn = false; f.path.setAttribute("d", ""); } };
    if (!moved && t - f.movedAt > FLY.tail + 0.05) { clear(); return; }
    const N = FLY.pathSamples;
    const pts = [[f.x, f.y]];
    for (let k = 1; k <= N; k++) pts.push(flyAt(f.curve, t - (FLY.tail * k) / N));
    const tail = pts[pts.length - 1];
    if (Math.hypot(tail[0] - f.x, tail[1] - f.y) < 1) { clear(); return; }
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
    const p = hoverPos(e);
    if (S.judge === "hover" || e.pointerType === "mouse") S.hover = p;
    if (S.needTap) { e.preventDefault(); startSong(); return; }
    if (S.view !== "play" || !S.playing || S.paused) return;
    e.preventDefault();
    if (S.resuming) return;                             // 继续前的倒数：点了不算
    if (isAuto()) return;                               // 自动演奏：点了也不算
    tapAt(p.x, p.y, e);
  }
  /* 记下指针在哪（鼠标一直跟着；手指按着时才算，抬起就清掉）：
     放水判定每帧由 hoverCheck 看它停在哪个气泡上；按键盘任意键＝在鼠标处点一下（onKeyDown）。
     pointerover 也记：暂停卡、设置窗关掉后鼠标没动，浏览器只补发进出事件、不发 pointermove，不记的话指针位置一直是空的 */
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
  /* 放水判定：指针在气泡附近（离中心不到点击范围的 r 个气泡直径，和点气泡一样），气泡到点（外圈缩到核心）那一下自动算弹中；指针来晚了，还在判定窗里就按晚了多少算。
     到点前指针在它上面停过（GREAT 窗以内），到点时已经移去下一个气泡了，也照样在到点那一下弹中，
     按最后一次离开时还差多久算判定（S.hovered 记着这个时间差）—— 不然鼠标得一直停到正好到点，稍早一点挪开就成了 MISS。
     点击范围也是放水（自动演奏）时不看指针，到点的都算 */
  function hoverCheck(t, dm) {
    const g = S.g;
    if (!g) return;
    const free = S.range === "free";
    const R = g.size * (TAP_RANGES[S.range] || TAP_RANGES.normal).r;
    const hv = S.hover;
    const on = (n) => free || (!!hv && Math.hypot(n.x - hv.x, n.y - hv.y) <= R);
    if (S.frozen && S.waiting) {
      if (on(S.waiting)) learnHit(S.waiting);
      return;
    }
    let landed = false;                                 // 指针正停着的气泡一帧只弹一个（自动演奏除外：同一刻的和弦一起弹）
    for (let i = Math.max(0, S.next - 4); i < S.notes.length; i++) {
      const n = S.notes[i];
      const dt = n.t - t;
      if (dt > dm.win[1]) break;
      if (S.judged[n.idx] >= 0 || dt < -dm.win[2]) continue;
      const here = on(n);
      if (dt > 0) {
        if (here && !free) S.hovered[n.idx] = dt;
        continue;
      }
      if (here) {
        if (landed && !free) continue;
        hit(n, tierOf(-dt, dm), -dt);
        landed = true;
        continue;
      }
      const early = S.hovered[n.idx];
      if (early >= 0) hit(n, tierOf(early, dm), -early);
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
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); stopCal("校准已取消"); return; }
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
    /* 手指正点在气泡上（离圆心不到 0.6 个气泡直径）就算这个，哪怕旁边还有更早的音：
       密集段里气泡挨得近，按「最早的那个」算，点 B 会被算到旁边的 A 上，下一下再点 A 就扑空成了点偏。
       压在一起的几个里取最早的（先到的叠在上面，看到的就是它） */
    const on = cands.find((c) => c.d <= 0.6);
    if (on) return on.n;
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
    S.tapCtx = { x, y, t, wait: e && Number(e.timeStamp) ? (performance.now() - e.timeStamp) / 1000 : null };
    if (best) { hit(best, tierOf(Math.abs(best.t - t), dm), t - best.t); S.tapCtx = null; return; }
    /* 正常规则都没算到：比 GOOD 早或晚出去不到 justWin 秒（GOOD 半窗的三分之一）、点在范围里的那个（时间最近的）算 JUST。
       只在这一下本来要算点空时才看，不会抢走判定窗里的音，防多米诺的规则不受影响 */
    const J = dm.win[2] + justWin(dm);
    let jn = null;
    for (let i = Math.max(0, S.next - 4); i < S.notes.length; i++) {
      const n = S.notes[i];
      const dt = n.t - t;
      if (dt > J) break;
      if (S.judged[n.idx] >= 0 || dt < -J || Math.abs(dt) <= dm.win[2]) continue;
      if (!free && Math.hypot(n.x - x, n.y - y) > R) continue;
      if (!jn || Math.abs(dt) < Math.abs(jn.t - t)) jn = n;
    }
    if (jn) { hit(jn, JUST, t - jn.t); S.tapCtx = null; return; }
    S.tapCtx = null;
    S.ghosts += 1;
    const why = ghostWhy(x, y, t, dm, R);
    S.ghostWhy[why] += 1;
    if (S.diag && S.diag.ghostList.length < 300) {
      /* 点空时离得最近的（时间上）还没弹的音：它在哪、差多少 */
      let near = null;
      for (let i = Math.max(0, S.next - 8); i < S.notes.length; i++) {
        const n = S.notes[i];
        if (n.t - t > 1.5) break;
        if (S.judged[n.idx] >= 0) continue;
        if (!near || Math.abs(n.t - t) < Math.abs(near.t - t)) near = n;
      }
      S.diag.ghostList.push({ t, x, y, why, near: near ? near.idx : -1, dt: near ? t - near.t : null, d: near ? Math.hypot(near.x - x, near.y - y) / g.size : null });
    }
    ghost(x, y);
  }
  /* 点空是为什么：判定窗里有没弹的气泡（只是离得远）= 点偏了；否则看点按处附近最近的那个没弹的气泡是在后面（早了）还是前面（晚了） */
  function ghostWhy(x, y, t, dm, R) {
    /* 点的正是刚弹掉（0.6 秒内）的那个气泡：多点了一下（手指在气泡上停留、两指连点，或上一下被算到了它头上） */
    if (S.rec && S.g) {
      for (let i = Math.max(0, S.next - 12); i < S.notes.length; i++) {
        const n = S.notes[i];
        if (n.t - t > 0.6) break;
        const r = S.rec[n.idx];
        if (!r || r.r === 3 || !Number.isFinite(r.off)) continue;
        if (Math.abs(n.t + r.off - t) <= 0.6 && Math.hypot(n.x - x, n.y - y) <= S.g.size * 0.7) return "again";
      }
    }
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
    el.style.translate = `${x.toFixed(1)}px ${y.toFixed(1)}px`;   // 位置放在 translate 上：缩放动画的 scale 只绕圈心缩放，不会把位置一起放大缩小
    $id("hjsNotes").appendChild(el);
    setTimeout(() => el.remove(), 420);
  }

  /* ==== 判定 ==== */
  function hit(n, tier, off) {
    S.judged[n.idx] = tier;
    if (S.rec) {
      const c = S.tapCtx;
      S.rec[n.idx] = { r: tier, off, how: c ? "点" : S.learn ? "学" : S.judge === "hover" ? "停" : "自动", d: c && S.g ? Math.hypot(n.x - c.x, n.y - c.y) / S.g.size : null, w: c ? c.wait : null };
    }
    if (Number.isFinite(off) && scored()) S.offs.push(off);
    bard().playMidi?.(n.m, JUDGE[tier].vel, instId(), 0, 0);
    dropEl(n, "is-hit", 300);
    if (tier === JUST) S.combo = 0;                     // JUST：出声、给一点分，但断combo
    else S.combo += 1;
    S.maxCombo = Math.max(S.maxCombo, S.combo);
    S.counts[JUDGE[tier].id] += 1;
    if (!scored()) {                                    // 学习模式、自动演奏：不计分，只数弹了几个
      S.learnHits += 1;
      popJudge(S.learn ? "WELL" : "AUTO", "is-ok");
    } else {
      S.score = liveScore().score;
      popJudge(JUDGE[tier].label, `is-${JUDGE[tier].id}`, off);
    }
    while (S.next < S.notes.length && S.judged[S.notes[S.next].idx] >= 0) S.next += 1;
    updateHud();
  }
  function miss(n) {
    S.judged[n.idx] = 3;
    if (S.rec) S.rec[n.idx] = { r: 3 };
    dropEl(n, "is-miss", 320);
    S.combo = 0;
    S.counts.miss += 1;
    popJudge("MISS", "is-miss");
    updateHud();
  }

  /* 判定字：每种各留一个常驻元素（字已经画好），弹一下只重放它的动画（Web Animations，只动透明度和位移），
     不再每次删掉重建 —— 密集段每秒要弹十几次，重建要重新排版、重画带阴影的大字 */
  const POP_KF = [
    { opacity: 0, transform: "translateY(8px) scale(.86)" },
    { opacity: 1, transform: "translateY(0) scale(1.06)", offset: 0.18 },
    { opacity: 1, transform: "translateY(-4px) scale(1)", offset: 0.7 },
    { opacity: 0, transform: "translateY(-10px) scale(1)" },
  ];
  function popJudge(label, cls, off) {
    const box = $id("hjsJudge");
    const ms = Number.isFinite(off) ? Math.round(off * 1000) : 0;
    /* 不是 PERFECT 时标出早还是晚，一直「晚」就该去校准了 */
    const note = Math.abs(ms) >= 20 && cls !== "is-perfect" ? `${ms > 0 ? "晚" : "早"} ${Math.abs(ms)} ms` : "";
    if (!CAN_ANIM) {
      box.textContent = "";
      box.append(h("div", { class: `hjs-pop ${cls}` }, h("b", { text: label }),
        note ? h("em", { class: ms > 0 ? "is-late" : "is-early", text: note }) : null));
      return;
    }
    const key = `${label}|${cls}`;
    let p = S.pops.get(key);
    if (!p || !p.isConnected) {
      p = h("div", { class: `hjs-pop is-pooled ${cls}` }, h("b", { text: label }), h("em", { hidden: true }));
      box.append(p);
      S.pops.set(key, p);
    }
    S.pops.forEach((q) => { if (q !== p && q._anim && q._anim.playState === "running") q._anim.finish(); });
    const em = p.lastChild;
    if (em.textContent !== note) {
      em.textContent = note;
      em.className = note ? (ms > 0 ? "is-late" : "is-early") : "";
      em.hidden = !note;
    }
    p._anim?.cancel();
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    p._anim = p.animate(POP_KF, calm ? { duration: 900, easing: "linear", fill: "forwards" } : { duration: 600, easing: "cubic-bezier(.2, .8, .3, 1)", fill: "forwards" });
  }

  /* 记帧间隔：按浏览器给的这一帧的时间戳（和屏幕刷新对齐）算，不用脚本开始跑的时刻（那个会忽早忽晚，120 Hz 屏会被量成 144、165 Hz）。
     手机画不动（连续掉帧）时自动切到省电画法（去掉光晕阴影）；另按本机刷新率记掉帧（单独掉一帧也算）、每秒一格，给结算的性能测试记录用 */
  function noteFrame(ts) {
    const dg = S.diag;
    if (!dg) return;
    const now = Number.isFinite(ts) && ts > 0 ? ts : performance.now();
    if (dg.last && now - dg.last < 1000 && now > dg.last) {
      dg.frames += 1;
      const iv = now - dg.last;
      if (iv > 34) dg.slow += 1;
      if (!dg.lite && S.power === "auto" && dg.frames >= 90 && dg.slow / dg.frames > 0.2) {
        dg.lite = true;
        S.root.classList.add("is-lite");
      }
      if (!dg.base) {
        dg.warm.push(iv);
        if (dg.warm.length >= 120) { dg.base = frameBase(dg.warm); dg.warm = null; }
      } else {
        dg.n += 1;
        dg.max = Math.max(dg.max, iv);
        const pos = Math.max(0, clockRaw(S.clock) - S.clock.lat);
        const b = secBucket(pos);
        if (b) { b.f += 1; if (iv > b.mx) b.mx = iv; }
        if (iv > dg.base * 1.5) {
          dg.drop += 1;
          if (b) b.d += 1;
          const k = Math.floor(pos / 4);
          dg.buckets.set(k, (dg.buckets.get(k) || 0) + 1);
          /* 高刷屏（90 Hz 以上）上面的 34 ms 门槛几乎碰不到：按本机刷新率算，掉帧超过四分之一也切省电画法 */
          if (!dg.lite && S.power === "auto" && dg.n >= 240 && dg.base < 12 && dg.drop / dg.n > 0.25) {
            dg.lite = true;
            S.root.classList.add("is-lite");
          }
        }
      }
    }
    dg.last = now;
  }
  /* 性能测试记录：歌曲时间每秒一格 —— 帧数、掉帧、最长一帧、主线程花在 tick 上的时间、长任务、动画对时 */
  function secBucket(t) {
    const dg = S.diag;
    if (!dg || !dg.secs || !Number.isFinite(t) || t < -5) return null;
    const k = Math.floor(t);
    let b = dg.secs.get(k);
    if (!b) { b = { f: 0, d: 0, mx: 0, busy: 0, lt: 0, ltMax: 0, fix: 0 }; dg.secs.set(k, b); }
    return b;
  }

  /* 一帧本该多长：开头 120 帧间隔的中位数（帧时间戳和屏幕刷新对齐，正常的帧都在同一个值上），再贴到最近的常见刷新率 */
  function frameBase(ivs) {
    const v = ivs.slice().sort((a, b) => a - b)[Math.floor(ivs.length / 2)];
    const hz = 1000 / v;
    const near = [60, 75, 90, 120, 144, 165].reduce((a, b) => (Math.abs(b - hz) < Math.abs(a - hz) ? b : a));
    return Math.abs(near - hz) / near < 0.1 ? 1000 / near : v;
  }

  function updateHud() {
    const total = S.notes.length;
    $id("hjsScoreL").textContent = S.learn ? "已弹对" : isAuto() ? "自动演奏" : "分数";
    $id("hjsScore").textContent = scored() ? fmtNum(S.score) : `${S.learnHits}/${total}`;
    $id("hjsCombo").textContent = String(S.combo);
    /* 判定字下方常驻的combo数：一直显示，涨了跳一下，断了变暗 */
    const big = $id("hjsComboBig");
    const n = $id("hjsComboN");
    if (n.textContent !== String(S.combo)) {
      const up = S.combo > +n.textContent;
      n.textContent = String(S.combo);
      big.classList.toggle("is-zero", S.combo === 0);
      /* 跳一下用 Web Animations，不用「删类 → 读 offsetWidth → 加类」：那样每涨一次combo都强制排版一次，密集段更卡 */
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

  /* 准确率：PERFECT 3、GREAT 2、GOOD 1、JUST 0.5、MISS 0，除以满分（已判定的音） */
  const doneCount = () => { const c = S.counts || {}; return (c.perfect + c.great + c.good + c.just + c.miss) || 0; };
  function accPct() {
    const done = doneCount();
    return done ? (sumW() / (3 * done)) * 100 : 100;
  }
  /* 分数的组成：「判定分 63.2 万 + combo得分 27 万」，有上限时再写上限 */
  function scoreParts() {
    const p = liveScore();
    return `判定分 ${fmtNum(p.judge)} + COMBO得分 ${fmtNum(p.combo)}${capNote() ? ` · ${capNote()}` : ""}`;
  }
  /* 各档计数的格子（结算、暂停共用） */
  const resGrid = () => h("div", { class: "hjs-res-grid" }, GRID.map((id) => {
    const j = JUDGE.find((x) => x.id === id);
    return h("div", { class: `hjs-cell is-${id}` }, h("b", { text: String(S.counts[id]) }), h("small", { text: j.label }));
  }));

  /* ==== 学习模式：停在这一拍等玩家 ==== */
  function freeze(n) {
    S.frozen = true;
    S.waiting = n;
    S.frozenT = n.t;
    /* 钟停下并退回这一拍：补音只排到这一拍之前，弹中后从这里接着走，你弹的这一下和后面的音对得上 */
    clockStop(S.clock);
    S.clock.base = n.t;
    const ap = diffMeta().approach;
    const el = S.els.get(n.idx) || noteEl(n, n.t, ap);
    if (el._anims) seekAnims(el, n.t, true);
    else { setK(el, 1); el._op = ""; el.style.opacity = ""; }
    S.animForce = true;
    el.classList.add("is-wait");
    banner(S.range === "free" ? "点击屏幕" : "点击亮起的气泡", "is-hint");
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
    S.animForce = true;                                 // 停住的气泡下一帧接着缩
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
    pauseAnims();
    setPauseIcon(true);
    /* 到目前为止的成绩：进度、分数、准确率、combo、各档计数、点空 */
    const pos = Math.max(0, clockRaw(S.clock));
    const done = doneCount();
    const stats = scored()
      ? [h("div", { class: "hjs-res-big hjs-pause-score", text: fmtNum(S.score) }),
        h("p", { class: "hjs-res-sub", text: `准确率 ${done ? `${accPct().toFixed(1)}%` : "—"} · COMBO ${S.combo} · 最大COMBO ${S.maxCombo}${S.ghosts ? ` · 点空 ${S.ghosts} 次` : ""}` }),
        h("p", { class: "hjs-res-sub hjs-res-parts", text: scoreParts() }),
        resGrid()]
      : [h("div", { class: "hjs-res-big hjs-pause-score", text: `${S.learnHits} / ${S.notes.length}` })];
    modal(h("div", { class: "hjs-card hjs-res" },
      h("h3", { class: "hjs-res-title", text: "已暂停" }),
      h("p", { class: "hjs-res-sub", text: `${S.song.t} · ${diffMeta().label}${modeTag()}` }),
      h("p", { class: "hjs-res-sub hjs-pause-pos", text: `进度 ${fmtTime(pos)} / ${fmtTime(S.endT)}` }),
      ...stats,
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
        S.animForce = true;
        if (!S.frozen) resumeAudio();
        else banner(S.range === "free" ? "点击屏幕" : "点击亮起的气泡", "is-hint");
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
        h("div", { class: "hjs-res-rank is-done is-long" }, h("span", { text: rankOf(0) })),
        h("div", { class: "hjs-res-big", text: `${S.learnHits} / ${total}` }),
        h("p", { class: "hjs-res-sub", text: S.learn ? "学习模式不计分，熟练后可切换至演出模式"
          : "点击范围与判定模式均为放水：自动演奏，不计分、不记录。如需自行弹奏，请在设置中修改其中一项" }));
    } else {
      S.score = liveScore().score;
      const rank = rankOf(S.score);
      const isNew = saveBest(pct);
      const fullCombo = total > 0 && S.maxCombo >= total;   // 一个 MISS 都没有，combo从头连到尾
      card.append(
        ...(fullCombo ? [h("div", { class: "hjs-res-fc", text: "FULL COMBO!" })] : []),   // 原生 append 会把 null 写成文字，不能传 null
        h("div", { class: `hjs-res-rank${rank === "Impeccable" ? " is-max" : ""}${rank.length > 4 ? " is-long" : ""}` }, h("span", { text: rank }), isNew ? h("em", { text: "新纪录" }) : null),
        h("div", { class: "hjs-res-big", text: fmtNum(S.score) }),
        h("p", { class: "hjs-res-sub", text: `准确率 ${pct.toFixed(1)}% · 最大COMBO ${S.maxCombo} / ${total}` }),
        h("p", { class: `hjs-res-sub hjs-res-parts${capNote() ? " hjs-res-mult" : ""}`, text: scoreParts() }),
        timingNote(),
        resGrid());
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
    const parts = o.length >= 8 ? [Math.abs(ms) < 10 ? "平均时机准确" : `平均偏${ms > 0 ? "晚" : "早"} ${Math.abs(ms)} ms`] : [];
    if (S.ghosts) {
      const w = S.ghostWhy;
      const why = [w.early && `偏早 ${w.early}`, w.late && `偏晚 ${w.late}`, w.off && `点偏 ${w.off}`, w.again && `重复点 ${w.again}`].filter(Boolean).join(" · ");
      parts.push(`点空 ${S.ghosts} 次（${why}）`);
    }
    /* 设备诊断：声音输出延迟、点按排队时间、掉帧比例（反馈问题时把这一行发过来） */
    const dg = S.diag || {};
    const w = (dg.waits || []).slice().sort((a, b) => a - b);
    const dev = [
      `输出延迟 ${Math.round((S.clock ? S.clock.lat : 0) * 1000)} ms`,
      dg.tsBad ? "点按时间戳不可用" : w.length ? `点按排队 ${Math.round(w[Math.floor(w.length / 2)] * 1000)} ms` : null,
      dg.frames ? frameNote(dg) : null,
      dg.busyN ? `主线程每帧 ${(dg.busy / dg.busyN).toFixed(1)} ms（最多 ${Math.round(dg.busyMax)} ms）` : null,
      dg.longs ? `长任务 ${dg.longs} 次（最长 ${Math.round(dg.longMax)} ms）` : null,
      dg.resizes ? `窗口大小变了 ${dg.resizes} 次` : null,
      S.delayMs ? `判定延迟 ${S.delayMs > 0 ? "+" : ""}${S.delayMs} ms` : null,
      S.render === "simple" ? "简单显示" : null,
      dg.lite ? "已自动省电" : S.power === "on" && S.render !== "simple" ? "省电画法" : null,
      bard().audioState && bard().audioState() !== "running" ? `音频 ${bard().audioState()}` : null,
    ].filter(Boolean).join(" · ");
    /* 设备诊断收进「性能测试记录」（默认收起），展开后可以导出这一局每个音的详细情况 */
    const perf = h("details", { class: "hjs-perf" },
      h("summary", { text: "性能测试记录" }),
      h("div", { class: "hjs-perf-body" },
        h("ul", { class: "hjs-perf-list" }, dev.split(" · ").map((x) => h("li", { text: x }))),
        h("button", { type: "button", class: "hjs-btn hjs-perf-export", text: "导出 txt", onclick: exportPerf })));
    return h("div", { class: "hjs-res-diagbox" },
      parts.length ? h("p", { class: "hjs-res-sub hjs-res-timing", text: parts.join(" · ") }) : null,
      perf);
  }

  /* 导出这一局的性能测试记录：设备与设置、汇总、每秒的帧情况、长任务、点空、每个音的结果。纯文本，发给开发者诊断用 */
  function perfText() {
    const dg = S.diag || {};
    const g = S.g || {};
    const dm = diffMeta();
    const ms = (v) => (Number.isFinite(v) ? `${Math.round(v * 1000)}` : "");
    const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : "");
    const pad = (v, n) => String(v).padEnd(n);
    const L = [];
    L.push("花舞之街 · 舞台演奏 性能测试记录");
    L.push(`时间：${new Date().toLocaleString("zh-CN", { hour12: false })}　版本：${typeof HJ !== "undefined" && HJ.version ? HJ.version : ""}`);
    L.push(`曲目：${S.song ? `${S.song.t}（${S.song.id}）` : ""}　难度：${dm.label}　判定：${judgeLabel()}　范围：${rangeLabel()}${S.learn ? "　学习模式" : ""}`);
    L.push(`画面：${S.render === "simple" ? "简单显示" : "正常显示"}　飞花线：${S.fly ? "开" : "关"}　音色：${S.inst || "跟随模拟器"}　判定延迟：${S.delayMs} ms　示范旋律：${S.demo ? "开" : "关"}`);
    L.push(`浏览器：${navigator.userAgent}`);
    L.push(`屏幕：${screen.width}×${screen.height} @${window.devicePixelRatio}x　舞台：${Math.round(g.w || 0)}×${Math.round(g.h || 0)}　气泡直径：${f1(g.size)} px`);
    L.push(`刷新率：${dg.base ? `${Math.round(1000 / dg.base)} Hz（一帧 ${dg.base.toFixed(2)} ms）` : "未测出"}　气泡动画：${CAN_ANIM && S.anim === "browser" ? "浏览器" : "逐帧"}　省电画法：${{ on: "开启", auto: "自动", off: "关闭" }[S.power]}${dg.lite ? "（已自动切换）" : ""}　金线：${S.lineMode === "full" ? "完整" : "优化"}`);
    L.push(`音频：${bard().audioState ? bard().audioState() : ""}　输出延迟：${ms(S.clock ? S.clock.lat : NaN)} ms`);
    L.push("");
    L.push("【汇总】");
    L.push(`得分 ${fmtNum(S.score)}　准确率 ${accPct().toFixed(1)}%　最大COMBO ${S.maxCombo} / ${S.notes.length}`);
    L.push(`PERFECT ${S.counts.perfect}　GREAT ${S.counts.great}　GOOD ${S.counts.good}　JUST ${S.counts.just}　MISS ${S.counts.miss}　点空 ${S.ghosts}（偏早 ${S.ghostWhy.early}，偏晚 ${S.ghostWhy.late}，点偏 ${S.ghostWhy.off}，重复点 ${S.ghostWhy.again || 0}）`);
    L.push(`帧：${dg.n || 0} 帧，掉帧 ${dg.drop || 0}（${dg.n ? ((100 * dg.drop) / dg.n).toFixed(1) : 0}%），最长一帧 ${Math.round(dg.max || 0)} ms`);
    L.push(`主线程（舞台每帧）：平均 ${dg.busyN ? (dg.busy / dg.busyN).toFixed(2) : 0} ms，最多 ${Math.round(dg.busyMax || 0)} ms　长任务：${dg.longs || 0} 次，最长 ${Math.round(dg.longMax || 0)} ms`);
    L.push(`动画对时（调速）：${dg.fixes || 0} 次　歌曲钟 / 动画钟：${S.clockRate.toFixed(4)}　窗口大小变化：${dg.resizes || 0} 次`);
    const w = (dg.waits || []).slice().sort((a, b) => a - b);
    if (w.length) L.push(`点按排队：中位 ${ms(w[Math.floor(w.length / 2)])} ms，最长 ${ms(w[w.length - 1])} ms`);
    L.push("");
    L.push("【每秒】秒 | 帧数 | 掉帧 | 最长一帧ms | 主线程ms | 长任务(最长ms) | 对时");
    [...(dg.secs || new Map()).entries()].sort((a, b) => a[0] - b[0]).forEach(([k, b]) => {
      L.push(`${pad(k < 0 ? `-${fmtTime(-k)}` : fmtTime(k), 6)}| ${pad(b.f, 5)}| ${pad(b.d, 5)}| ${pad(Math.round(b.mx), 11)}| ${pad(b.busy.toFixed(1), 9)}| ${pad(b.lt ? `${b.lt}(${Math.round(b.ltMax)})` : "0", 15)}| ${b.fix}`);
    });
    if (dg.longList && dg.longList.length) {
      L.push("");
      L.push("【长任务】歌曲时间 | 时长ms");
      dg.longList.forEach(([t, d]) => L.push(`${t.toFixed(2)} | ${Math.round(d)}`));
    }
    if (dg.ghostList && dg.ghostList.length) {
      L.push("");
      L.push("【点空】歌曲时间 | 原因 | 点按位置 | 最近的音 | 差多少秒 | 距离(气泡直径)");
      const WHY = { early: "偏早", late: "偏晚", off: "点偏", again: "重复点" };
      dg.ghostList.forEach((q) => {
        const n = q.near >= 0 ? S.notes.find((m) => m.idx === q.near) : null;
        L.push(`${q.t.toFixed(3)} | ${WHY[q.why] || q.why} | ${Math.round(q.x)},${Math.round(q.y)} | ${n ? `#${n.idx + 1} ${midiName(n.m)} @${n.t.toFixed(3)} (${Math.round(n.x)},${Math.round(n.y)})` : "-"} | ${Number.isFinite(q.dt) ? (q.dt >= 0 ? "+" : "") + q.dt.toFixed(3) : ""} | ${f1(q.d)}`);
      });
    }
    L.push("");
    L.push("【每个音】序号 | 时间s | 音 | 位置 | 结果 | 偏差ms(+晚) | 方式 | 距离(气泡直径) | 点按排队ms");
    const RES = ["PERFECT", "GREAT", "GOOD", "MISS", "JUST"];
    S.notes.forEach((n) => {
      const r = S.rec && S.rec[n.idx];
      L.push(`${pad(n.idx + 1, 5)}| ${pad(n.t.toFixed(3), 8)}| ${pad(midiName(n.m), 4)}| ${pad(`${Math.round(n.x)},${Math.round(n.y)}`, 9)}| ${pad(r ? RES[r.r] : "—", 8)}| ${pad(r && Number.isFinite(r.off) ? (r.off >= 0 ? "+" : "") + ms(r.off) : "", 7)}| ${pad(r && r.how ? r.how : "", 3)}| ${pad(r && Number.isFinite(r.d) ? r.d.toFixed(2) : "", 5)}| ${r && Number.isFinite(r.w) ? ms(r.w) : ""}`);
    });
    return L.join("\n");
  }
  function exportPerf() {
    const text = perfText();
    const stamp = new Date();
    const p2 = (v) => String(v).padStart(2, "0");
    const name = `舞台演奏记录_${(S.song && S.song.t) || "曲目"}_${stamp.getFullYear()}${p2(stamp.getMonth() + 1)}${p2(stamp.getDate())}_${p2(stamp.getHours())}${p2(stamp.getMinutes())}.txt`;
    try {
      const url = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/plain;charset=utf-8" }));
      const a = h("a", { href: url, download: name });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast("已导出性能测试记录");
    } catch (e) {
      toast("导出失败，请换个浏览器再试");
    }
  }
  /* 掉帧：按本机刷新率算（单独掉一帧也算），再标出最卡的那 4 秒在哪、最长一帧多久 */
  function frameNote(dg) {
    const lite = dg.lite ? "（已切换省电画法）" : "";
    if (!dg.base || !dg.n) return `掉帧 ${Math.round((100 * dg.slow) / dg.frames)}%${lite}`;
    const pct = (100 * dg.drop) / dg.n;
    let worst = null;
    dg.buckets.forEach((c, k) => { if (!worst || c > worst.c) worst = { k, c }; });
    const where = worst && worst.c >= 3 ? `，最多在 ${fmtTime(worst.k * 4)}~${fmtTime(worst.k * 4 + 4)}（${worst.c} 帧）` : "";
    return `掉帧 ${pct < 1 && dg.drop ? "<1" : Math.round(pct)}%（${Math.round(1000 / dg.base)} Hz${where}，最长一帧 ${Math.round(dg.max)} ms）${lite}`;
  }
  /* 最高分与评级（评级随得分）；准确率、最大combo一起记着备查 */
  function saveBest(pct) {
    const all = storage.json(K.best) || {};
    const key = `${S.song.id}:${S.diff}:${S.judge}:${S.range}`;
    const old = bestOf(S.song);
    if (old && S.score <= num(old.score, 0)) return false;
    all[key] = { score: S.score, rank: rankOf(S.score), acc: +pct.toFixed(1), combo: S.maxCombo, at: Date.now() };
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
        cap: capOf(), fly: S.fly, flyPos: S.fl && S.fl.placed ? { x: S.fl.x, y: S.fl.y, pts: S.fl.curve.length, line: S.fl.line, stars: S.fl.live.length, draws: S.fl.draws } : null,
        resuming: S.resuming, spb: S.spb, ghostWhy: S.ghostWhy,
        cat: S.cat, tags: S.tags, preview: S.preview.id, cal: !!S.cal, clock: S.clock && { run: S.clock.run, base: S.clock.base },
        startT: S.startT, endT: S.endT, pos: S.clock ? clockRaw(S.clock) : 0,
      };
    },
  };
})();
