/* 花舞之街 · 花街拼图。从「更多」打开时按需加载，依赖 main.js 的工具（$、callWorker、storage、showToast…）
   - 原图：花街介绍相册（INFO_GALLERY），每局随机抽一张
   - 难度：鱼信 / 鱼丽 / 光风院霁月；模式：休闲（正计时）/ 限时（倒计时），两者独立
   - 限时模式鱼丽及以上通关时，用一代花语（Worker 站点密钥）生成通关码，不带「听花语：」前缀
   - 中断继续（管理页开关，默认关闭）：开启时进度保存在本机，关掉页面或切走后可从中断处继续
   - 大赛拼图（管理页设置时段、难度、图片）：正计时，通关后填写游戏 ID 登记成绩并生成一代通关码
   坐标约定：每个拼块组的局部坐标即原图坐标，组只记录原图左上角在桌面上的位置 (x, y)；
   两组位置一致即拼对，合并只需把拼块搬进同一个组 */
(() => {
  const STORE_SAVE = "hj_puzzle_save";
  const STORE_LAST = "hj_puzzle_last";
  const STORE_PREF = "hj_puzzle_pref";
  const STORE_PLAYER = "hj_puzzle_player";
  const SAVE_VERSION = 1;
  const CODE_PREFIX = "听花语：";

  /* target：块数（Worker 的 PUZZLE_PIECES 与此一致）；limitMin：限时模式的倒计时（分钟） */
  const DIFFS = {
    easy:   { name: "鱼信",       level: "简单", target: 36,  limitMin: 7 },
    normal: { name: "鱼丽",       level: "普通", target: 60,  limitMin: 15 },
    hard:   { name: "光风院霁月", level: "困难", target: 128, limitMin: 35 },
  };
  const DIFF_KEYS = Object.keys(DIFFS);
  const MODES = { casual: "休闲", timed: "限时" };
  const CODE_DIFFS = ["normal", "hard"];   // 限时模式下可获得通关码的难度

  const TAB = 0.085;      // 凸起大小（相对边长）
  const JITTER = 0.035;
  const PAD = 0.34;       // 拼块画布四周留给凸起的边距（相对短边）
  const SHADOW_SCALE = 0.3;

  const CODE_ERRORS = {
    algo_changed: "服务器还没开放拼图通关码（需要更新 Worker），成绩已保存在本机",
    closed: "服务器还没开放拼图通关码（需要更新 Worker），成绩已保存在本机",
    rate_limited: "操作太频繁了，歇一会儿再点「重新生成」",
    net: "连接失败，检查网络后点「重新生成」",
    no_js: "花语字典没加载出来，检查网络后点「重新生成」",
  };
  const SUBMIT_ERRORS = {
    bad_player: "请填写游戏 ID（20 字以内）",
    token_used: "这一局已经登记过了",
    contest_over: "大赛已经结束，这局成绩无法登记",
    token_expired: "这一局开局太久，成绩无法登记",
    bad_token: "这一局的开局信息无效，无法登记",
    bad_elapsed: "成绩校验没有通过，无法登记",
    rate_limited: "操作太频繁了，歇一会儿再试",
    unknown_action: "服务器还没开放大赛登记（需要更新 Worker）",
  };
  const SUBMIT_FINAL = ["token_used", "contest_over", "token_expired", "bad_token", "bad_elapsed"];   // 再试也不会成功
  const CONTEST_DEFAULT_TITLE = "花街拼图大赛";

  /* ==== 小工具 ==== */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const shuffle = (list) => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };
  function fmtClock(ms, tenths) {
    const t = Math.max(0, ms);
    const total = Math.floor(t / 1000);
    const h = Math.floor(total / 3600);
    const s = `${h ? h + ":" + pad2(Math.floor(total / 60) % 60) : pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
    return tenths ? `${s}.${Math.floor(t / 100) % 10}` : s;
  }
  const el = (tag, cls, attrs) => Object.assign(document.createElement(tag), cls ? { className: cls } : {}, attrs || {});
  const modeLabel = (g) => (g.overtime ? "限时（已超时，正计时）" : MODES[g.mode]);
  const imgNo = (src) => (/(\d+)\.\w+$/.exec(src || "") || [])[1] || "?";

  /* 块数固定为 target：在它的因数分解里挑拼块最接近正方形的行列 */
  function gridFor(diffKey, ar) {
    const target = DIFFS[diffKey].target;
    let best = null;
    for (let cols = 2; cols <= target / 2; cols++) {
      if (target % cols) continue;
      const rows = target / cols;
      const score = Math.abs(Math.log((ar * rows) / cols));
      if (!best || score < best.score) best = { cols, rows, score };
    }
    return best ? { cols: best.cols, rows: best.rows } : { cols: target, rows: 1 };
  }

  /* ==== 站点设置：中断继续与大赛（打开拼图时向 Worker 取一次） ==== */
  const PZ = { resume: false, contest: null, loaded: false };
  const isContestSrc = (src) => /\/image\/announcements\/[\w-]+\.(?:webp|jpg|png)$/.test(src || "");
  const contestImageUrl = (key) => new URL(`image/${key}`, workerBase()).href;
  const nowMs = () => (typeof hjNow === "function" ? hjNow() : Date.now());

  function applyState(st, fromServer) {
    PZ.resume = !!st?.resume;
    const c = st?.contest;
    PZ.contest = c && DIFFS[c.diff] && c.image && Number(c.end) > Number(c.start) ? c : null;
    if (fromServer) PZ.loaded = true;
  }

  async function refreshState() {
    const data = await callWorker({ action: "puzzle_state" });
    if (data && data.ok) applyState(data, true);
    else if (data && data.error === "unknown_action") applyState(null, true);   // 旧版 Worker
    else return;
    if (built && !$("pzSetup").hidden && !$("pzCards").hidden) renderSetup();
  }

  /* ==== 拼块形状 ==== */
  /* 一条边：10 个点 [沿边比例, 垂直比例]，组成 3 段三次贝塞尔；平边为 null */
  function makeEdge(rnd) {
    const j = () => (rnd() * 2 - 1) * JITTER;
    const flip = rnd() < 0.5 ? -1 : 1;
    const t = TAB * (0.9 + rnd() * 0.25);
    const a = j(), b = j(), c = j(), d = j(), e = j();
    return [
      [0, 0], [0.2, a], [0.5 + b + d, -t + c], [0.5 - t + b, t + c],
      [0.5 - 2 * t + b - d, 3 * t + c], [0.5 + 2 * t + b - d, 3 * t + c], [0.5 + t + b, t + c],
      [0.5 + b + d, -t + c], [0.8, e], [1, 0],
    ].map(([l, w]) => [l, w * flip]);
  }

  function makeEdges(cols, rows, seed) {
    const rnd = mulberry32(seed);
    const h = [], v = [];
    for (let r = 0; r <= rows; r++) {
      h.push([]);
      for (let c = 0; c < cols; c++) h[r].push(r === 0 || r === rows ? null : makeEdge(rnd));
    }
    for (let r = 0; r < rows; r++) {
      v.push([]);
      for (let c = 0; c <= cols; c++) v[r].push(c === 0 || c === cols ? null : makeEdge(rnd));
    }
    return { h, v };
  }

  /* 拼块轮廓，原图坐标 */
  function piecePath(g, c, r) {
    const { pw, ph, edges } = g;
    const p = new Path2D();
    const x0 = c * pw, y0 = r * ph, x1 = x0 + pw, y1 = y0 + ph;
    const curve = (pts) => {
      for (let i = 1; i < 10; i += 3) p.bezierCurveTo(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], pts[i + 2][0], pts[i + 2][1]);
    };
    const hPts = (e, y, rev) => {
      const pts = e.map(([l, w]) => [x0 + l * pw, y + w * ph]);
      return rev ? pts.reverse() : pts;
    };
    const vPts = (e, x, rev) => {
      const pts = e.map(([l, w]) => [x + w * pw, y0 + l * ph]);
      return rev ? pts.reverse() : pts;
    };
    p.moveTo(x0, y0);
    const top = edges.h[r][c];
    if (top) curve(hPts(top, y0, false)); else p.lineTo(x1, y0);
    const right = edges.v[r][c + 1];
    if (right) curve(vPts(right, x1, false)); else p.lineTo(x1, y1);
    const bottom = edges.h[r + 1][c];
    if (bottom) curve(hPts(bottom, y1, true)); else p.lineTo(x0, y1);
    const left = edges.v[r][c];
    if (left) curve(vPts(left, x0, true)); else p.lineTo(x0, y0);
    p.closePath();
    return p;
  }

  /* 画一块：图片 + 浮雕边，另画一张低分辨率的影子 */
  function renderPiece(g, piece) {
    const { pw, ph, pad, img } = g;
    const w = Math.ceil(pw + pad * 2), h = Math.ceil(ph + pad * 2);
    const ox = piece.c * pw - pad, oy = piece.r * ph - pad;
    const cv = el("canvas", "pz-piece");
    cv.width = w;
    cv.height = h;
    Object.assign(cv.style, { left: ox + "px", top: oy + "px", width: w + "px", height: h + "px" });
    const ctx = cv.getContext("2d");
    const unit = Math.min(pw, ph);
    const bevel = Math.max(1.2, unit * 0.022);
    ctx.translate(-ox, -oy);
    ctx.save();
    ctx.clip(piece.path);
    ctx.drawImage(img, 0, 0, g.W, g.H);
    ctx.lineJoin = "round";
    ctx.lineWidth = bevel * 2;
    ctx.translate(bevel * 0.7, bevel * 0.7);
    ctx.strokeStyle = "rgba(255,255,255,.42)";
    ctx.stroke(piece.path);
    ctx.translate(-bevel * 1.4, -bevel * 1.4);
    ctx.strokeStyle = "rgba(0,0,0,.38)";
    ctx.stroke(piece.path);
    ctx.restore();
    ctx.lineWidth = Math.max(0.8, unit * 0.007);
    ctx.strokeStyle = "rgba(20,14,8,.32)";
    ctx.stroke(piece.path);

    const k = SHADOW_SCALE;
    const m = unit * 0.12;
    const sw = Math.ceil((w + m * 2) * k), sh = Math.ceil((h + m * 2) * k);
    const sc = el("canvas", "pz-shadow");
    sc.width = sw;
    sc.height = sh;
    Object.assign(sc.style, { left: ox - m + "px", top: oy - m + "px", width: sw / k + "px", height: sh / k + "px" });
    const sx = sc.getContext("2d");
    const far = 4000;
    sx.shadowColor = "rgba(0,0,0,.55)";
    sx.shadowBlur = Math.max(1.5, unit * 0.05 * k);
    sx.shadowOffsetX = far;
    sx.scale(k, k);
    sx.translate(-ox + m - far / k, -oy + m);
    sx.fill(piece.path);
    return { cv, sc };
  }

  /* 毛毡桌面纹理 */
  let feltUrl = "";
  function feltTexture() {
    if (feltUrl) return feltUrl;
    const size = 160;
    const cv = el("canvas", "", { width: size, height: size });
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#77736f";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 260; i++) {
      const x = Math.random() * size, y = Math.random() * size, r = 4 + Math.random() * 14;
      const light = Math.random() < 0.5;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, light ? "rgba(255,255,255,.07)" : "rgba(0,0,0,.08)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
        ctx.save();
        ctx.translate(dx, dy);
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
        ctx.restore();
      }
    }
    const data = ctx.getImageData(0, 0, size, size);
    for (let i = 0; i < data.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 14;
      data.data[i] += n; data.data[i + 1] += n; data.data[i + 2] += n;
    }
    ctx.putImageData(data, 0, 0);
    feltUrl = cv.toDataURL("image/png");
    return feltUrl;
  }

  /* 吸附提示音，跟随全站音量 */
  let audioCtx = null;
  function clickSound() {
    const vol = typeof siteVolume !== "undefined" ? siteVolume.level : 0;
    if (!vol) return;
    try {
      audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(880, t);
      osc.frequency.exponentialRampToValueAtTime(420, t + 0.06);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18 * vol, t + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.1);
    } catch (e) {}
  }

  /* ==== 界面 ==== */
  const ICONS = {
    eye: '<path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
    fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    plus: '<circle cx="11" cy="11" r="6.5"/><path d="M11 8v6M8 11h6M16 16l4 4"/>',
    minus: '<circle cx="11" cy="11" r="6.5"/><path d="M8 11h6M16 16l4 4"/>',
    edge: '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M9 9h6v6H9z" stroke-dasharray="2 2"/>',
    pause: '<path d="M9 6v12M15 6v12"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
  };
  const icon = (name) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

  const ROOT_HTML = `
<div class="pz-stage" id="pzStage">
  <div class="pz-table" id="pzTable"></div>
</div>
<div class="pz-hud" id="pzHud" hidden>
  <div class="pz-stats">
    <span class="pz-chip pz-timer" id="pzTimer" role="timer" aria-live="off">00:00</span>
    <span class="pz-chip pz-prog" id="pzProg">0%</span>
  </div>
  <div class="pz-tools">
    <button type="button" class="pz-tool" id="pzPreviewBtn" aria-pressed="false" aria-label="查看原图" title="查看原图">${icon("eye")}</button>
    <button type="button" class="pz-tool" id="pzEdgeBtn" aria-pressed="false" aria-label="只看边框块" title="只看边框块">${icon("edge")}</button>
    <button type="button" class="pz-tool pz-zoom" id="pzZoomOut" aria-label="缩小" title="缩小">${icon("minus")}</button>
    <button type="button" class="pz-tool pz-zoom" id="pzZoomIn" aria-label="放大" title="放大">${icon("plus")}</button>
    <button type="button" class="pz-tool" id="pzFitBtn" aria-label="适应屏幕" title="适应屏幕">${icon("fit")}</button>
    <button type="button" class="pz-tool" id="pzPauseBtn" aria-label="暂停" title="暂停">${icon("pause")}</button>
  </div>
</div>
<div class="pz-preview" id="pzPreview" hidden><img id="pzPreviewImg" alt="原图" draggable="false"></div>
<div class="pz-loading" id="pzLoading" hidden>洗牌中…</div>
<div class="pz-cards" id="pzCards">
  <div class="gate-card pz-card" id="pzSetup">
    <h2>花街拼图</h2>
    <p class="hint">每局从花街相册里随机抽一张图</p>
    <div class="pz-contest" id="pzContestBox" hidden>
      <p class="pz-contest-title" id="pzContestTitle"></p>
      <p class="pz-contest-meta" id="pzContestMeta"></p>
      <div class="pz-btn-row"><button type="button" class="pz-primary" id="pzContestBtn">参加大赛</button></div>
    </div>
    <div class="pz-resume" id="pzResumeBox" hidden>
      <button type="button" class="pz-primary" id="pzResumeBtn">继续上次的拼图</button>
      <p class="pz-resume-meta" id="pzResumeMeta"></p>
    </div>
    <span class="pz-label">难度</span>
    <div class="alarm-seg pz-seg" id="pzDiffSeg">
      ${DIFF_KEYS.map((k) => `<label><input type="radio" name="pzDiff" value="${k}"><span class="pz-seg-name">${DIFFS[k].name}</span><small class="pz-seg-sub" data-diff-sub="${k}"></small></label>`).join("")}
    </div>
    <span class="pz-label">模式</span>
    <div class="alarm-seg pz-seg" id="pzModeSeg">
      <label><input type="radio" name="pzMode" value="casual"><span class="pz-seg-name">休闲</span><small class="pz-seg-sub">正计时</small></label>
      <label><input type="radio" name="pzMode" value="timed"><span class="pz-seg-name">限时</span><small class="pz-seg-sub" id="pzTimedSub"></small></label>
    </div>
    <p class="alarm-hint pz-setup-hint" id="pzSetupHint"></p>
    <div class="pz-btn-row"><button type="button" class="pz-primary" id="pzStartBtn">开始拼图</button></div>
    <div class="pz-last" id="pzLastBox" hidden></div>
    <details class="pz-help">
      <summary>怎么玩</summary>
      <ul>
        <li>拖动拼块，相邻的拼块靠近时会自动吸附；全部拼成一整张即通关</li>
        <li>拖动空白处移动桌面；滚轮或双指捏合缩放</li>
        <li>右上角可以查看原图、只显示边框块、适应屏幕或暂停</li>
        <li id="pzHelpSave"></li>
        <li>限时模式下，鱼丽、光风院霁月难度通关可获得通关码</li>
        <li>大赛开放期间，这里会出现大赛入口；大赛为正计时，通关后填写游戏 ID 登记成绩并获得通关码</li>
      </ul>
    </details>
  </div>

  <div class="gate-card pz-card" id="pzPauseCard" hidden>
    <h2>暂停中</h2>
    <p class="hint" id="pzPauseMeta"></p>
    <div class="pz-btn-col">
      <button type="button" class="pz-primary" id="pzContinueBtn">继续拼图</button>
      <button type="button" id="pzRestartBtn">放弃本局，重新选择</button>
      <button type="button" id="pzQuitBtn">先离开（进度已保存）</button>
    </div>
  </div>

  <div class="gate-card pz-card" id="pzTimeUpCard" hidden>
    <h2>时间到~</h2>
    <p class="hint" id="pzTimeUpMeta"></p>
    <div class="pz-btn-col">
      <button type="button" class="pz-primary" id="pzOvertimeBtn">转为正计时，继续拼完</button>
      <button type="button" id="pzRetryBtn">重新选择</button>
      <button type="button" id="pzTimeUpQuitBtn">离开</button>
    </div>
  </div>

  <div class="gate-card pz-card" id="pzResultCard" hidden>
    <h2>恭喜通关！</h2>
    <dl class="pz-result-list" id="pzResultList"></dl>
    <div class="pz-code pz-submit" id="pzSubmitBox" hidden>
      <p class="pz-code-title">登记大赛成绩</p>
      <p class="pz-submit-hint">填写你的游戏 ID，登记后自动生成通关码</p>
      <input type="text" class="pz-player" id="pzPlayerInput" maxlength="20" placeholder="游戏 ID（20 字以内）" autocomplete="off" spellcheck="false">
      <div class="pz-btn-row"><button type="button" class="pz-primary" id="pzSubmitBtn">登记成绩</button></div>
      <p class="pz-code-msg" id="pzSubmitMsg" hidden></p>
    </div>
    <div class="pz-code" id="pzCodeBox" hidden>
      <p class="pz-code-title" id="pzCodeTitle">通关码</p>
      <p class="pz-code-text" id="pzCodeText"></p>
      <p class="pz-code-msg" id="pzCodeMsg" hidden></p>
      <div class="pz-btn-row">
        <button type="button" id="pzCodeCopyBtn" hidden>复制通关码</button>
        <button type="button" id="pzCodeRetryBtn" hidden>重新生成</button>
      </div>
    </div>
    <div class="pz-btn-row">
      <button type="button" class="pz-primary" id="pzAgainBtn">再来一局</button>
      <button type="button" id="pzAdmireBtn">欣赏完整图片</button>
    </div>
  </div>
</div>`;

  let built = false;
  let G = null;            // 当前一局
  let view = { x: 0, y: 0, s: 1, fit: 1 };
  let timerIv = 0;
  let saveTimer = 0;
  let lastRecord = null;   // 本次打开的通关记录（生成通关码用）

  const card = (id) => {
    ["pzSetup", "pzPauseCard", "pzTimeUpCard", "pzResultCard"].forEach((c) => { $(c).hidden = c !== id; });
    $("pzCards").hidden = !id;
    if (id) playFadeOnly($(id));
    syncClock();
  };
  const cardOpen = () => !$("pzCards").hidden;

  function build() {
    if (built) return;
    built = true;
    const root = $("puzzleRoot");
    root.innerHTML = ROOT_HTML;
    $("pzStage").style.backgroundImage = `url('${feltTexture()}')`;
    DIFF_KEYS.forEach((k) => {
      const { cols, rows } = gridFor(k, 16 / 9);
      root.querySelector(`[data-diff-sub="${k}"]`).textContent = `${cols * rows}块`;
    });
    const pref = storage.json(STORE_PREF) || {};
    setRadio("pzDiff", DIFFS[pref.diff] ? pref.diff : "easy");
    setRadio("pzMode", MODES[pref.mode] ? pref.mode : "casual");
    ["pzDiffSeg", "pzModeSeg"].forEach((id) => $(id).addEventListener("change", syncSetup));
    syncSetup();

    $("pzStartBtn").addEventListener("click", () => startNew());
    $("pzContestBtn").addEventListener("click", startContest);
    $("pzSubmitBtn").addEventListener("click", () => lastRecord && submitFromResult(lastRecord));
    $("pzPlayerInput").addEventListener("keydown", (e) => { if (e.key === "Enter") $("pzSubmitBtn").click(); });
    $("pzResumeBtn").addEventListener("click", resumeSaved);
    $("pzPauseBtn").addEventListener("click", pause);
    $("pzContinueBtn").addEventListener("click", resume);
    $("pzRestartBtn").addEventListener("click", () => {
      if (!confirmTwice($("pzRestartBtn"), "再点一次确认放弃")) return;
      abandon();
    });
    $("pzQuitBtn").addEventListener("click", () => {
      if (!PZ.resume && !confirmTwice($("pzQuitBtn"), "再点一次退出（本局不保存）")) return;
      closePuzzle();
    });
    $("pzOvertimeBtn").addEventListener("click", () => {
      G.mode = "casual";
      G.overtime = true;
      card(null);
      syncHud();
      saveSoon();
    });
    $("pzRetryBtn").addEventListener("click", abandon);
    $("pzTimeUpQuitBtn").addEventListener("click", () => closePuzzle());
    $("pzAgainBtn").addEventListener("click", () => { destroyGame(); showSetup(); });
    $("pzAdmireBtn").addEventListener("click", () => { card(null); fitView(true); });
    $("pzCodeCopyBtn").addEventListener("click", () => copyText($("pzCodeText").textContent, "通关码已复制", "复制失败，请长按通关码手动复制"));
    $("pzCodeRetryBtn").addEventListener("click", () => lastRecord && generateCode(lastRecord));
    $("pzZoomIn").addEventListener("click", () => zoomBy(1.3));
    $("pzZoomOut").addEventListener("click", () => zoomBy(1 / 1.3));
    $("pzFitBtn").addEventListener("click", () => fitView(true));
    $("pzPreviewBtn").addEventListener("click", () => togglePreview());
    $("pzPreview").addEventListener("click", () => togglePreview(false));
    $("pzEdgeBtn").addEventListener("click", toggleEdges);
    initInput();
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", () => {
      syncClock();
      if (document.hidden) saveNow();
    });
    window.addEventListener("pagehide", saveNow);
  }

  function setRadio(name, value) {
    document.querySelectorAll(`input[name="${name}"]`).forEach((r) => { r.checked = r.value === value; });
  }
  const radioValue = (name) => document.querySelector(`input[name="${name}"]:checked`)?.value;

  /* 危险操作点两次才生效 */
  function confirmTwice(btn, tip) {
    if (btn.dataset.armed && Date.now() - Number(btn.dataset.armed) < 3000) {
      delete btn.dataset.armed;
      btn.textContent = btn.dataset.label;
      return true;
    }
    btn.dataset.label ??= btn.textContent;
    btn.dataset.armed = String(Date.now());
    btn.textContent = tip;
    setTimeout(() => {
      if (btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = btn.dataset.label; }
    }, 3000);
    return false;
  }

  function syncSetup() {
    syncSegments($("pzDiffSeg"));
    syncSegments($("pzModeSeg"));
    const diff = radioValue("pzDiff");
    const mode = radioValue("pzMode");
    $("pzTimedSub").textContent = `倒计时 ${DIFFS[diff].limitMin} 分钟`;
    const tips = [];
    if (mode === "timed") {
      tips.push(CODE_DIFFS.includes(diff) ? "限时内通关可获得通关码" : "鱼丽及以上难度限时通关可获得通关码");
    } else {
      tips.push("慢慢拼，不限时间");
    }
    if (PZ.resume && storage.json(STORE_SAVE)) tips.push("开始新的一局会覆盖未完成的拼图");
    $("pzSetupHint").textContent = tips.join("；");
    storage.set(STORE_PREF, JSON.stringify({ ...(storage.json(STORE_PREF) || {}), diff, mode }));
  }

  function renderSetup() {
    /* 中断继续关着时不提供继续；确认关着（读到了服务器设置）才清掉旧进度 */
    if (PZ.loaded && !PZ.resume) storage.remove(STORE_SAVE);
    const save = PZ.resume ? validSave(storage.json(STORE_SAVE)) : null;
    $("pzResumeBox").hidden = !save;
    if (save) {
      const d = DIFFS[save.diff];
      const total = save.cols * save.rows;
      const prog = Math.round(((total - save.groups.length) / Math.max(1, total - 1)) * 100);
      const time = save.mode === "timed" ? `剩余 ${fmtClock(Math.ceil((d.limitMin * 60000 - save.elapsed) / 1000) * 1000)}` : `已用 ${fmtClock(save.elapsed)}`;
      $("pzResumeMeta").textContent = save.contest
        ? `大赛 · ${save.contest.title} · ${d.name} · 已用 ${fmtClock(save.elapsed)} · 完成 ${prog}%`
        : `${d.name} · ${modeLabel(save)} · ${time} · 完成 ${prog}%`;
    }
    $("pzHelpSave").textContent = PZ.resume
      ? "进度自动保存在本机，关掉页面后可以继续；切到后台时计时暂停"
      : "切到后台时计时暂停；关掉拼图即放弃本局";
    renderContest();
    renderLast();
    syncSetup();
  }

  function showSetup() {
    renderSetup();
    $("pzHud").hidden = true;
    togglePreview(false);
    card("pzSetup");
  }

  /* 大赛入口：未开始时显示开始时间，到点自动刷新 */
  let contestTimer = 0;
  function renderContest() {
    clearTimeout(contestTimer);
    const c = PZ.contest;
    const now = nowMs();
    const show = !!c && Number(c.end) > now;
    $("pzContestBox").hidden = !show;
    if (!show) return;
    const d = DIFFS[c.diff];
    const started = now >= Number(c.start);
    $("pzContestTitle").textContent = c.title || CONTEST_DEFAULT_TITLE;
    const day = (ms) => formatCnTime(ms).slice(formatCnTime(ms).slice(0, 4) === formatCnTime(now).slice(0, 4) ? 5 : 0);   // 同一年不写年份
    $("pzContestMeta").textContent = `${day(Number(c.start))} – ${day(Number(c.end))}\n${d.name} ${d.target}块 · 正计时`;
    const btn = $("pzContestBtn");
    btn.disabled = !started;
    btn.textContent = started ? "参加大赛" : "尚未开始";
    const wait = started ? Number(c.end) - now : Number(c.start) - now;
    if (wait > 0 && wait < 3600000) contestTimer = setTimeout(() => { if (!$("pzSetup").hidden) renderContest(); }, wait + 500);
  }

  function renderLast() {
    const last = storage.json(STORE_LAST);
    const box = $("pzLastBox");
    box.hidden = !last;
    if (!last) return;
    if (last.contest) return renderLastContest(box, last);
    const d = DIFFS[last.diff] || DIFFS.easy;
    box.innerHTML = `<p class="pz-last-title">最近一次通关</p>
      <p class="pz-last-meta">${escapeHtml(`${d.name} · ${MODES[last.mode] || ""} · 耗时 ${fmtClock(last.ms, true)} · ${formatCnTime(last.at)}`)}</p>
      ${last.code ? `<p class="pz-code-text pz-last-code">${escapeHtml(last.code)}</p>
      <div class="pz-btn-row"><button type="button" id="pzLastCopyBtn">复制通关码</button></div>`
        : last.eligible ? `<div class="pz-btn-row"><button type="button" id="pzLastGenBtn">生成通关码</button></div><p class="pz-code-msg" id="pzLastMsg" hidden></p>` : ""}`;
    $("pzLastCopyBtn")?.addEventListener("click", () => copyText(last.code, "通关码已复制", "复制失败，请长按通关码手动复制"));
    $("pzLastGenBtn")?.addEventListener("click", async (e) => {
      e.currentTarget.disabled = true;
      const res = await sealCode(last);
      if (res.ok) {
        renderLast();
        showToast("通关码已生成");
      } else {
        e.currentTarget.disabled = false;
        setMsg($("pzLastMsg"), res.msg);
      }
    });
  }

  /* 最近一次是大赛：没登记的可以补登记，登记过的可以复制或补生成通关码 */
  function renderLastContest(box, last) {
    const d = DIFFS[last.diff] || DIFFS.easy;
    const meta = `${last.contest.title || CONTEST_DEFAULT_TITLE} · ${d.name} · 耗时 ${fmtClock(last.ms, true)} · ${formatCnTime(last.at)}`;
    let body = "";
    if (last.submitted) {
      body = `<p class="pz-last-meta">${escapeHtml(`已登记 · 登记号 No.${last.no} · ${last.player}`)}</p>`
        + (last.code ? `<p class="pz-code-text pz-last-code">${escapeHtml(last.code)}</p>
          <div class="pz-btn-row"><button type="button" id="pzLastCopyBtn">复制通关码</button></div>`
          : `<div class="pz-btn-row"><button type="button" id="pzLastGenBtn">生成通关码</button></div><p class="pz-code-msg" id="pzLastMsg" hidden></p>`);
    } else if (last.failed) {
      body = `<p class="pz-code-msg">${escapeHtml(last.failed)}</p>`;
    } else {
      body = `<input type="text" class="pz-player" id="pzLastPlayer" maxlength="20" placeholder="游戏 ID（20 字以内）" autocomplete="off" spellcheck="false">
        <div class="pz-btn-row"><button type="button" class="pz-primary" id="pzLastSubmitBtn">登记成绩</button></div>
        <p class="pz-code-msg" id="pzLastMsg" hidden></p>`;
    }
    box.innerHTML = `<p class="pz-last-title">最近一次大赛通关</p><p class="pz-last-meta">${escapeHtml(meta)}</p>${body}`;
    $("pzLastCopyBtn")?.addEventListener("click", () => copyText(last.code, "通关码已复制", "复制失败，请长按通关码手动复制"));
    $("pzLastGenBtn")?.addEventListener("click", async (e) => {
      e.currentTarget.disabled = true;
      const res = await sealCode(last);
      if (res.ok) { renderLast(); showToast("通关码已生成"); return; }
      e.currentTarget.disabled = false;
      setMsg($("pzLastMsg"), res.msg);
    });
    const input = $("pzLastPlayer");
    if (!input) return;
    input.value = storage.get(STORE_PLAYER) || "";
    $("pzLastSubmitBtn").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      setMsg($("pzLastMsg"), "登记中…");
      const res = await submitContest(last, input.value);
      if (!res.ok) {
        btn.disabled = false;
        setMsg($("pzLastMsg"), res.msg);
        if (res.final) renderLast();
        return;
      }
      setMsg($("pzLastMsg"), "登记成功，正在生成通关码…");
      await sealCode(last);
      renderLast();
      showToast(`登记成功！登记号 No.${last.no}`);
    });
  }

  /* ==== 大赛 ==== */
  async function startContest() {
    const btn = $("pzContestBtn");
    btn.disabled = true;
    const data = await callWorker({ action: "puzzle_contest_start" });
    btn.disabled = false;
    if (!data || !data.ok || !DIFFS[data.diff] || !data.image || !data.token) {
      showToast(!data ? "连接失败，检查一下网络再试"
        : data.error === "contest_closed" ? "大赛还没开始或已经结束"
        : data.error === "rate_limited" ? "操作太频繁了，歇一会儿再试"
        : "大赛暂时进不去，稍后再试");
      refreshState();
      return;
    }
    await setupGame({
      src: contestImageUrl(data.image), diff: data.diff, mode: "casual", seed: (Math.random() * 2 ** 31) >>> 0, elapsed: 0,
      contest: { token: data.token, rev: Number(data.rev) || 0, title: data.title || CONTEST_DEFAULT_TITLE, end: Number(data.end) || 0 },
    });
  }

  /* 登记成绩：成功后记下登记号；再试也不会成功的错误记进 failed */
  async function submitContest(rec, rawPlayer) {
    const player = String(rawPlayer || "").trim();
    if (!player || player.length > 20) return { ok: false, msg: SUBMIT_ERRORS.bad_player };
    const data = await callWorker({ action: "puzzle_contest_submit", token: rec.contest.token, player, elapsed: rec.ms });
    if (!data) return { ok: false, msg: "连接失败，检查网络后再点一次" };
    if (!data.ok) {
      const msg = SUBMIT_ERRORS[data.error] || "登记失败，稍后再试";
      const final = SUBMIT_FINAL.includes(data.error);
      if (final) {
        rec.failed = msg;
        saveLast(rec);
      }
      return { ok: false, msg, final };
    }
    Object.assign(rec, { submitted: true, no: Number(data.no), player: data.player || player });
    storage.set(STORE_PLAYER, player);
    saveLast(rec);
    return { ok: true };
  }

  async function submitFromResult(rec) {
    const btn = $("pzSubmitBtn");
    btn.disabled = true;
    setMsg($("pzSubmitMsg"), "登记中…");
    const res = await submitContest(rec, $("pzPlayerInput").value);
    btn.disabled = false;
    if (lastRecord !== rec) return;
    if (!res.ok) {
      setMsg($("pzSubmitMsg"), res.msg);
      if (res.final) btn.disabled = true;
      return;
    }
    setMsg($("pzSubmitMsg"), "");
    $("pzSubmitBox").hidden = true;
    $("pzCodeBox").hidden = false;
    generateCode(rec);
  }

  /* 最近一次通关记录（以通关时刻对应） */
  function saveLast(rec) {
    const last = storage.json(STORE_LAST);
    if (!last || last.at === rec.at) storage.set(STORE_LAST, JSON.stringify(rec));
  }

  /* ==== 开局 ==== */
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.decoding = "async";
      im.onload = () => (im.decode ? im.decode().catch(() => {}) : Promise.resolve()).then(() => resolve(im));
      im.onerror = () => reject(new Error("img"));
      im.src = src;
    });
  }

  function pickImage() {
    const list = INFO_GALLERY;
    const prev = (storage.json(STORE_PREF) || {}).lastIdx;
    let idx = Math.floor(Math.random() * list.length);
    if (list.length > 1 && idx === prev) idx = (idx + 1 + Math.floor(Math.random() * (list.length - 1))) % list.length;
    storage.set(STORE_PREF, JSON.stringify({ ...(storage.json(STORE_PREF) || {}), lastIdx: idx }));
    return idx;
  }

  /* 桌面大小：面积约为原图的 2.8 倍，形状贴近屏幕，至少容得下整张图 */
  function tableSize(W, H) {
    const vw = innerWidth, vh = innerHeight;
    const area = W * H * 2.8;
    const ar = clamp(vw / Math.max(1, vh), 0.5, 2.4);
    let tw = Math.sqrt(area * ar), th = area / tw;
    if (tw < W * 1.18) { tw = W * 1.18; th = Math.max(th, area / tw); }
    if (th < H * 1.3) { th = H * 1.3; tw = Math.max(tw, area / th); }
    return { tw: Math.round(tw), th: Math.round(th) };
  }

  async function startNew() {
    const diff = radioValue("pzDiff");
    const mode = radioValue("pzMode");
    const idx = pickImage();
    await setupGame({ idx, src: INFO_GALLERY[idx], diff, mode, seed: (Math.random() * 2 ** 31) >>> 0, elapsed: 0 });
  }

  function validSave(s) {
    if (!s || s.v !== SAVE_VERSION || !DIFFS[s.diff] || !MODES[s.mode] || !Array.isArray(s.groups)) return null;
    if (!(s.cols >= 2 && s.rows >= 2 && s.tw > 0 && s.th > 0)) return null;
    if (s.contest && (typeof s.contest.token !== "string" || !isContestSrc(s.src))) return null;
    const total = s.cols * s.rows;
    const seen = new Set();
    for (const g of s.groups) {
      if (!Array.isArray(g) || !Number.isFinite(g[0]) || !Number.isFinite(g[1]) || !Array.isArray(g[2])) return null;
      for (const i of g[2]) {
        if (!Number.isInteger(i) || i < 0 || i >= total || seen.has(i)) return null;
        seen.add(i);
      }
    }
    return seen.size === total ? s : null;
  }

  async function resumeSaved() {
    const s = validSave(storage.json(STORE_SAVE));
    if (!s) { storage.remove(STORE_SAVE); showSetup(); return; }
    await setupGame(s);
  }

  let loading = false;
  async function setupGame(opts) {
    if (loading) return;
    loading = true;
    try { await setupGameInner(opts); } finally { loading = false; }
  }

  async function setupGameInner(opts) {
    destroyGame();
    card(null);
    $("pzLoading").hidden = false;
    $("pzLoading").textContent = "图片加载中…";
    let img;
    const src = opts.contest ? opts.src : INFO_GALLERY.includes(opts.src) ? opts.src : INFO_GALLERY[0];
    try {
      if (opts.contest && !isContestSrc(src)) throw new Error("img");
      img = await loadImage(src);
    } catch (e) {
      $("pzLoading").hidden = true;
      showSetup();
      showToast("图片没加载出来，检查一下网络再试");
      return;
    }
    if ($("puzzleOverlay").hidden) { $("pzLoading").hidden = true; return; }
    $("pzLoading").textContent = "洗牌中…";
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

    const W = img.naturalWidth, H = img.naturalHeight;
    const grid = opts.cols ? { cols: opts.cols, rows: opts.rows } : gridFor(opts.diff, W / H);
    const size = opts.tw ? { tw: opts.tw, th: opts.th } : tableSize(W, H);
    const pw = W / grid.cols, ph = H / grid.rows;
    G = {
      img, src, idx: INFO_GALLERY.indexOf(src), diff: opts.diff, mode: opts.mode, overtime: !!opts.overtime,
      seed: opts.seed, W, H, cols: grid.cols, rows: grid.rows, pw, ph, pad: Math.ceil(Math.min(pw, ph) * PAD),
      tw: size.tw, th: size.th, elapsed: Number(opts.elapsed) || 0, limit: DIFFS[opts.diff].limitMin * 60000,
      pieces: [], groups: [], z: 1, done: false, timeUp: false, running: false, tickAt: 0, edgesOnly: false,
      contest: opts.contest || null,
    };
    G.edges = makeEdges(G.cols, G.rows, G.seed);
    const table = $("pzTable");
    table.style.width = G.tw + "px";
    table.style.height = G.th + "px";
    table.classList.remove("is-edges", "is-done");
    $("pzEdgeBtn").setAttribute("aria-pressed", "false");
    $("pzPreviewImg").src = src;

    for (let r = 0; r < G.rows; r++) {
      for (let c = 0; c < G.cols; c++) {
        const piece = { i: r * G.cols + c, c, r, g: null };
        piece.path = piecePath(G, c, r);
        piece.edge = c === 0 || r === 0 || c === G.cols - 1 || r === G.rows - 1;
        Object.assign(piece, renderPiece(G, piece));
        if (piece.edge) piece.cv.classList.add("is-edge");
        G.pieces.push(piece);
      }
    }
    const frag = document.createDocumentFragment();
    if (opts.groups) {
      opts.groups.forEach(([x, y, ids]) => frag.appendChild(makeGroup(ids.map((i) => G.pieces[i]), x, y).el));
    } else {
      scatter().forEach(([piece, x, y]) => frag.appendChild(makeGroup([piece], x, y).el));
    }
    table.appendChild(frag);
    $("pzLoading").hidden = true;
    $("pzHud").hidden = false;
    fitView(false);
    syncHud();
    saveNow();
    if (G.groups.length === 1) return finish();
    if (G.mode === "timed" && G.elapsed >= G.limit && !G.overtime) return timeUp();
    syncClock();
    startTimer();
  }

  /* 拼块散在桌面四周，中间留出拼图区 */
  function scatter() {
    const { tw, th, W, H, pw, ph, pad } = G;
    const zone = { x0: (tw - W * 1.04) / 2, y0: (th - H * 1.04) / 2, x1: (tw + W * 1.04) / 2, y1: (th + H * 1.04) / 2 };
    const n = G.pieces.length;
    let cw = pw + pad * 0.9, ch = ph + pad * 0.9;
    let cells = [];
    for (let tries = 0; tries < 12; tries++) {
      cells = [];
      const nx = Math.floor((tw - pad * 2) / cw), ny = Math.floor((th - pad * 2) / ch);
      const ox = (tw - nx * cw) / 2, oy = (th - ny * ch) / 2;
      for (let iy = 0; iy < ny; iy++) {
        for (let ix = 0; ix < nx; ix++) {
          const cx = ox + (ix + 0.5) * cw, cy = oy + (iy + 0.5) * ch;
          const inZone = cx > zone.x0 - pw * 0.3 && cx < zone.x1 + pw * 0.3 && cy > zone.y0 - ph * 0.3 && cy < zone.y1 + ph * 0.3;
          if (!inZone) cells.push([cx, cy]);
        }
      }
      if (cells.length >= n) break;
      cw *= 0.9;
      ch *= 0.9;
    }
    shuffle(cells);
    return shuffle(G.pieces.slice()).map((piece, k) => {
      const [cx, cy] = cells[k % Math.max(1, cells.length)] || [Math.random() * tw, Math.random() * th];
      const jx = (Math.random() - 0.5) * pw * 0.25, jy = (Math.random() - 0.5) * ph * 0.25;
      const x = clamp(cx + jx - pw / 2, pad, tw - pw - pad) - piece.c * pw;
      const y = clamp(cy + jy - ph / 2, pad, th - ph - pad) - piece.r * ph;
      return [piece, x, y];
    });
  }

  function makeGroup(pieces, x, y) {
    const g = { el: el("div", "pz-group"), sh: el("div", "pz-sh-layer"), pc: el("div", "pz-pc-layer"), pieces: [], x, y };
    g.el.append(g.sh, g.pc);
    pieces.forEach((p) => addToGroup(g, p));
    g.el.style.zIndex = String(G.z++);
    placeGroup(g);
    G.groups.push(g);
    return g;
  }

  function addToGroup(g, p) {
    p.g = g;
    g.pieces.push(p);
    g.sh.appendChild(p.sc);
    g.pc.appendChild(p.cv);
    if (p.edge && !g.hasEdge) {
      g.hasEdge = true;
      g.el.classList.add("has-edge");
    }
    updateBounds(g);
  }

  function updateBounds(g) {
    let c0 = Infinity, r0 = Infinity, c1 = -Infinity, r1 = -Infinity;
    g.pieces.forEach((p) => {
      c0 = Math.min(c0, p.c); r0 = Math.min(r0, p.r); c1 = Math.max(c1, p.c); r1 = Math.max(r1, p.r);
    });
    g.b = { x0: c0 * G.pw, y0: r0 * G.ph, x1: (c1 + 1) * G.pw, y1: (r1 + 1) * G.ph };
  }

  const placeGroup = (g) => { g.el.style.transform = `translate3d(${g.x}px,${g.y}px,0)`; };

  /* 整组留在桌面内 */
  function clampGroup(g) {
    const m = G.pad * 0.5;
    g.x = clamp(g.x, m - g.b.x0, G.tw - m - g.b.x1);
    g.y = clamp(g.y, m - g.b.y0, G.th - m - g.b.y1);
  }

  function raise(g) {
    g.el.style.zIndex = String(G.z++);
  }

  /* 松手后吸附：与相邻拼块所在组的位置差在容差内即合并 */
  function snap(g) {
    const tol = clamp(Math.max(G.pw * 0.2, 16 / view.s), 0, Math.min(G.pw, G.ph) * 0.42);
    let merged = 0;
    for (let again = true; again;) {
      again = false;
      for (const p of g.pieces) {
        for (const q of neighbors(p)) {
          const h = q.g;
          if (h === g || Math.abs(h.x - g.x) > tol || Math.abs(h.y - g.y) > tol) continue;
          g.x = h.x;
          g.y = h.y;
          h.pieces.slice().forEach((piece) => addToGroup(g, piece));
          h.el.remove();
          G.groups.splice(G.groups.indexOf(h), 1);
          merged++;
          again = true;
          break;
        }
        if (again) break;
      }
    }
    clampGroup(g);
    placeGroup(g);
    if (merged) {
      clickSound();
      g.el.classList.remove("is-snapped");
      void g.el.offsetWidth;
      g.el.classList.add("is-snapped");
      syncHud();
      if (G.groups.length === 1) finish();
    }
    return merged;
  }

  function neighbors(p) {
    const out = [];
    const at = (c, r) => G.pieces[r * G.cols + c];
    if (p.c > 0) out.push(at(p.c - 1, p.r));
    if (p.c < G.cols - 1) out.push(at(p.c + 1, p.r));
    if (p.r > 0) out.push(at(p.c, p.r - 1));
    if (p.r < G.rows - 1) out.push(at(p.c, p.r + 1));
    return out;
  }

  function destroyGame() {
    stopTimer();
    clearTimeout(saveTimer);
    if (G) G.pieces.forEach((p) => { p.cv.width = p.cv.height = 0; p.sc.width = p.sc.height = 0; });
    G = null;
    drag = null;
    if (built) $("pzTable").innerHTML = "";
  }

  function abandon() {
    storage.remove(STORE_SAVE);
    destroyGame();
    showSetup();
  }

  /* ==== 视图：平移与缩放 ==== */
  const stageRect = () => $("pzStage").getBoundingClientRect();

  function hudInset() {
    const hud = $("pzHud");
    return hud.hidden ? 0 : hud.getBoundingClientRect().bottom;
  }

  function fitView(animate) {
    if (!G) return;
    const r = stageRect();
    const top = Math.min(hudInset(), r.height * 0.3);
    const pad = 8;
    const s = Math.min((r.width - pad * 2) / G.tw, (r.height - top - pad * 2) / G.th);
    view.fit = s;
    view.s = s;
    view.x = (r.width - G.tw * s) / 2;
    view.y = top + (r.height - top - G.th * s) / 2;
    applyView(animate);
  }

  const minScale = () => view.fit * 0.75;
  const maxScale = () => Math.max(view.fit * 8, 2.2);

  function applyView(animate) {
    const t = $("pzTable");
    t.classList.toggle("is-animating", !!animate && !prefersReducedMotion());
    clampView();
    t.style.transform = `translate3d(${view.x}px,${view.y}px,0) scale(${view.s})`;
    if (animate) setTimeout(() => t.classList.remove("is-animating"), 260);
  }

  /* 桌面至少留 30% 在屏幕内 */
  function clampView() {
    if (!G) return;
    const r = stageRect();
    const w = G.tw * view.s, h = G.th * view.s;
    const keepX = Math.min(w, r.width) * 0.3, keepY = Math.min(h, r.height) * 0.3;
    view.x = clamp(view.x, keepX - w, r.width - keepX);
    view.y = clamp(view.y, keepY - h, r.height - keepY);
  }

  function zoomAt(sx, sy, s) {
    const ns = clamp(s, minScale(), maxScale());
    view.x = sx - ((sx - view.x) / view.s) * ns;
    view.y = sy - ((sy - view.y) / view.s) * ns;
    view.s = ns;
    applyView(false);
  }

  function zoomBy(k) {
    const r = stageRect();
    const t = $("pzTable");
    zoomAt(r.width / 2, r.height / 2, view.s * k);
    if (!prefersReducedMotion()) {
      t.classList.add("is-animating");
      setTimeout(() => t.classList.remove("is-animating"), 260);
    }
  }

  function onResize() {
    if (!G || $("puzzleOverlay").hidden) return;
    const oldFit = view.fit;
    const ratio = oldFit ? view.s / oldFit : 1;
    fitView(false);
    if (ratio > 1.01) {
      const r = stageRect();
      zoomAt(r.width / 2, r.height / 2, view.fit * ratio);
    }
  }

  /* ==== 指针：拖拼块、拖桌面、双指缩放 ==== */
  const pointers = new Map();
  let drag = null;       // { g, id, dx, dy }
  let pan = null;        // { id, x, y, vx, vy }
  let pinch = null;      // { dist, s, cx, cy, vx, vy }
  let moveRaf = 0;
  const hitCtx = document.createElement("canvas").getContext("2d");

  function toWorld(cx, cy) {
    const r = stageRect();
    return { x: (cx - r.left - view.x) / view.s, y: (cy - r.top - view.y) / view.s, sx: cx - r.left, sy: cy - r.top };
  }

  /* 从最上层往下找；触屏放宽到拼块主体附近 */
  function hitTest(wx, wy, loose) {
    const groups = G.groups.slice().sort((a, b) => Number(b.el.style.zIndex) - Number(a.el.style.zIndex));
    const slack = loose ? 10 / view.s : 0;
    let near = null;
    for (const g of groups) {
      if (G.edgesOnly && !g.hasEdge) continue;
      const lx = wx - g.x, ly = wy - g.y;
      if (lx < g.b.x0 - G.pad || lx > g.b.x1 + G.pad || ly < g.b.y0 - G.pad || ly > g.b.y1 + G.pad) continue;
      for (const p of g.pieces) {
        const x0 = p.c * G.pw, y0 = p.r * G.ph;
        if (lx < x0 - G.pad || lx > x0 + G.pw + G.pad || ly < y0 - G.pad || ly > y0 + G.ph + G.pad) continue;
        if (hitCtx.isPointInPath(p.path, lx, ly)) return g;
        if (!near && slack && lx > x0 - slack && lx < x0 + G.pw + slack && ly > y0 - slack && ly < y0 + G.ph + slack) near = g;
      }
    }
    return near;
  }

  function initInput() {
    const stage = $("pzStage");
    stage.addEventListener("pointerdown", onDown);
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerup", onUp);
    stage.addEventListener("pointercancel", onUp);
    stage.addEventListener("lostpointercapture", (e) => { if (pointers.has(e.pointerId)) onUp(e); });
    stage.addEventListener("wheel", (e) => {
      if (!G) return;
      e.preventDefault();
      const w = toWorld(e.clientX, e.clientY);
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomAt(w.sx, w.sy, view.s * Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0018)));
    }, { passive: false });
    stage.addEventListener("contextmenu", (e) => e.preventDefault());
    /* Safari 的 gesture 事件会触发整页缩放 */
    ["gesturestart", "gesturechange"].forEach((t) => stage.addEventListener(t, (e) => e.preventDefault()));
  }

  function onDown(e) {
    if (!G || cardOpen() || (e.pointerType === "mouse" && e.button !== 0)) return;
    if (!$("pzPreview").hidden && e.pointerType !== "mouse") togglePreview(false);
    try { $("pzStage").setPointerCapture(e.pointerId); } catch (err) {}
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      if (drag) dropDrag();
      pan = null;
      startPinch();
      return;
    }
    if (pointers.size > 2) return;
    const w = toWorld(e.clientX, e.clientY);
    const g = G.done ? null : hitTest(w.x, w.y, e.pointerType !== "mouse");
    if (g) {
      raise(g);
      drag = { g, id: e.pointerId, dx: w.x - g.x, dy: w.y - g.y };
      g.el.classList.add("is-lifted");
      $("pzStage").classList.add("is-dragging");
    } else {
      pan = { id: e.pointerId, x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
      $("pzStage").classList.add("is-panning");
    }
  }

  function startPinch() {
    const [a, b] = [...pointers.values()];
    const r = stageRect();
    pinch = {
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: view.s,
      cx: (a.x + b.x) / 2 - r.left, cy: (a.y + b.y) / 2 - r.top, vx: view.x, vy: view.y,
    };
  }

  function onMove(e) {
    const pt = pointers.get(e.pointerId);
    if (!pt) return;
    pt.x = e.clientX;
    pt.y = e.clientY;
    if (!moveRaf) moveRaf = requestAnimationFrame(flushMove);
  }

  function flushMove() {
    moveRaf = 0;
    if (!G) return;
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const r = stageRect();
      const cx = (a.x + b.x) / 2 - r.left, cy = (a.y + b.y) / 2 - r.top;
      const ns = clamp(pinch.s * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.dist), minScale(), maxScale());
      view.s = ns;
      view.x = cx - ((pinch.cx - pinch.vx) / pinch.s) * ns;
      view.y = cy - ((pinch.cy - pinch.vy) / pinch.s) * ns;
      applyView(false);
      return;
    }
    if (drag) {
      const pt = pointers.get(drag.id);
      if (!pt) return;
      const w = toWorld(pt.x, pt.y);
      drag.g.x = w.x - drag.dx;
      drag.g.y = w.y - drag.dy;
      placeGroup(drag.g);
      edgeScroll(pt);
      return;
    }
    if (pan) {
      const pt = pointers.get(pan.id);
      if (!pt) return;
      view.x = pan.vx + (pt.x - pan.x);
      view.y = pan.vy + (pt.y - pan.y);
      applyView(false);
    }
  }

  /* 拖到屏幕边缘时桌面跟着移动 */
  let edgeRaf = 0;
  function edgeScroll(pt) {
    const r = stageRect();
    const zone = Math.min(48, r.width * 0.08);
    const vx = pt.x - r.left < zone ? 1 : r.right - pt.x < zone ? -1 : 0;
    const vy = pt.y - r.top < zone + hudInset() * 0.5 ? 1 : r.bottom - pt.y < zone ? -1 : 0;
    cancelAnimationFrame(edgeRaf);
    if (!vx && !vy) return;
    edgeRaf = requestAnimationFrame(() => {
      if (!drag) return;
      view.x += vx * 9;
      view.y += vy * 9;
      applyView(false);
      flushMove();
    });
  }

  function onUp(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    try { $("pzStage").releasePointerCapture(e.pointerId); } catch (err) {}
    if (drag && drag.id === e.pointerId) dropDrag();
    if (pan && pan.id === e.pointerId) pan = null;
    if (pinch && pointers.size < 2) {
      pinch = null;
      const rest = [...pointers.entries()][0];
      if (rest) pan = { id: rest[0], x: rest[1].x, y: rest[1].y, vx: view.x, vy: view.y };
    }
    if (!pointers.size) $("pzStage").classList.remove("is-panning", "is-dragging");
  }

  function dropDrag() {
    cancelAnimationFrame(edgeRaf);
    if (moveRaf) { cancelAnimationFrame(moveRaf); moveRaf = 0; flushMove(); }
    const g = drag.g;
    drag = null;
    g.el.classList.remove("is-lifted");
    $("pzStage").classList.remove("is-dragging");
    if (!G || !G.groups.includes(g)) return;
    snap(g);
    saveSoon();
  }

  /* ==== 工具按钮 ==== */
  function togglePreview(force) {
    const box = $("pzPreview");
    const on = force === undefined ? box.hidden : !!force;
    box.hidden = !on;
    if (on) box.style.top = Math.round(hudInset() + 8) + "px";
    $("pzPreviewBtn").setAttribute("aria-pressed", String(on));
    $("pzPreviewBtn").classList.toggle("is-on", on);
  }

  function toggleEdges() {
    if (!G) return;
    G.edgesOnly = !G.edgesOnly;
    $("pzTable").classList.toggle("is-edges", G.edgesOnly);
    $("pzEdgeBtn").setAttribute("aria-pressed", String(G.edgesOnly));
    $("pzEdgeBtn").classList.toggle("is-on", G.edgesOnly);
    showToast(G.edgesOnly ? "只显示边框块" : "显示全部拼块");
  }

  /* ==== 计时 ==== */
  /* 只在画面可见、没有弹出卡片时计时 */
  function syncClock() {
    if (!G) return;
    const now = performance.now();
    if (G.running) G.elapsed += now - G.tickAt;
    G.tickAt = now;
    G.running = !G.done && !G.timeUp && !document.hidden && !cardOpen() && !$("puzzleOverlay").hidden;
  }

  function startTimer() {
    stopTimer();
    timerIv = setInterval(tick, 200);
    tick();
  }
  function stopTimer() {
    clearInterval(timerIv);
    timerIv = 0;
  }

  let lastAutoSave = 0;
  function tick() {
    if (!G) return;
    syncClock();
    syncTimerText();
    if (G.mode === "timed" && !G.overtime && G.elapsed >= G.limit && !G.done) timeUp();
    else if (G.running && performance.now() - lastAutoSave > 10000) {
      lastAutoSave = performance.now();
      saveNow();
    }
  }

  function syncTimerText() {
    const t = $("pzTimer");
    if (G.mode === "timed" && !G.overtime) {
      const left = G.limit - G.elapsed;
      t.textContent = fmtClock(Math.ceil(left / 1000) * 1000);
      t.classList.toggle("is-urgent", left < 60000);
    } else {
      t.textContent = fmtClock(G.elapsed);
      t.classList.remove("is-urgent");
    }
    t.title = G.mode === "timed" && !G.overtime ? "剩余时间" : "已用时间";
  }

  function syncHud() {
    if (!G) return;
    const total = G.pieces.length;
    const prog = Math.floor(((total - G.groups.length) / Math.max(1, total - 1)) * 100);
    $("pzProg").innerHTML = `<span class="pz-prog-name">${escapeHtml(G.contest ? "大赛" : DIFFS[G.diff].name)} · </span>${prog}%`;
    $("pzProg").title = `${total} 块，还剩 ${G.groups.length} 组`;
    syncTimerText();
  }

  function pause() {
    if (!G) return;
    if (G.done) { card("pzResultCard"); return; }
    const d = DIFFS[G.diff];
    $("pzPauseMeta").textContent = G.contest
      ? `${G.contest.title} · ${d.name} · ${G.pieces.length} 块 · 计时已暂停`
      : `${d.name} · ${modeLabel(G)} · ${G.pieces.length} 块 · 计时已暂停`;
    const quit = $("pzQuitBtn");
    delete quit.dataset.armed;
    delete quit.dataset.label;
    quit.textContent = PZ.resume ? "先离开（进度已保存）" : "退出本局（不保存）";
    card("pzPauseCard");
    saveNow();
  }

  function resume() {
    card(null);
  }

  function timeUp() {
    syncClock();
    G.elapsed = G.limit;
    const total = G.pieces.length;
    const prog = Math.floor(((total - G.groups.length) / Math.max(1, total - 1)) * 100);
    $("pzTimeUpMeta").textContent = `${DIFFS[G.diff].limitMin} 分钟到了，完成了 ${prog}%。可以转为正计时继续拼完（不再获得通关码）`;
    G.overtime = true;
    G.mode = "casual";
    syncTimerText();
    saveNow();
    card("pzTimeUpCard");
  }

  /* ==== 保存与恢复 ==== */
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 400);
  }

  function saveNow() {
    clearTimeout(saveTimer);
    if (!G || G.done || !PZ.resume) return;
    syncClock();
    storage.set(STORE_SAVE, JSON.stringify({
      v: SAVE_VERSION, src: G.src, diff: G.diff, mode: G.mode, overtime: G.overtime, seed: G.seed, contest: G.contest,
      cols: G.cols, rows: G.rows, tw: G.tw, th: G.th, elapsed: Math.round(G.elapsed), savedAt: Date.now(),
      groups: G.groups.map((g) => [Math.round(g.x * 10) / 10, Math.round(g.y * 10) / 10, g.pieces.map((p) => p.i)]),
    }));
  }

  /* ==== 通关 ==== */
  function finish() {
    if (G.done) return;
    syncClock();
    G.done = true;
    G.running = false;
    stopTimer();
    storage.remove(STORE_SAVE);
    syncTimerText();
    const g = G.groups[0];
    g.x = (G.tw - G.W) / 2;
    g.y = (G.th - G.H) / 2;
    g.el.classList.add("is-gliding");
    placeGroup(g);
    const full = el("img", "pz-full", { src: G.src, alt: "", draggable: false });
    Object.assign(full.style, { width: G.W + "px", height: G.H + "px" });
    g.pc.appendChild(full);
    $("pzTable").classList.add("is-done");
    togglePreview(false);
    setTimeout(() => fitView(true), 80);

    const rec = G.contest
      ? {
        contest: { token: G.contest.token, title: G.contest.title, rev: G.contest.rev }, diff: G.diff, mode: "casual",
        pieces: G.pieces.length, ms: Math.round(G.elapsed), at: nowMs(), eligible: true, submitted: false, code: "",
      }
      : {
        diff: G.diff, mode: G.overtime ? "casual" : G.mode, overtime: G.overtime, pieces: G.pieces.length,
        ms: Math.round(G.elapsed), limitMs: G.limit, at: nowMs(), img: imgNo(G.src),
        eligible: G.mode === "timed" && !G.overtime && CODE_DIFFS.includes(G.diff), code: "",
      };
    storage.set(STORE_LAST, JSON.stringify(rec));
    lastRecord = rec;
    setTimeout(() => showResult(rec), prefersReducedMotion() ? 200 : 1400);
  }

  function showResult(rec) {
    if (!G || $("puzzleOverlay").hidden) return;
    const d = DIFFS[rec.diff];
    if (rec.contest) return showContestResult(rec, d);
    $("pzSubmitBox").hidden = true;
    const rows = [
      ["难度", `${d.name}（${d.level} · ${rec.pieces} 块）`],
      ["模式", rec.overtime ? "限时（超时后完成）" : MODES[rec.mode] + (rec.mode === "timed" ? `（${d.limitMin} 分钟）` : "")],
      ["耗时", fmtClock(rec.ms, true)],
      ...(rec.mode === "timed" ? [["剩余", fmtClock(rec.limitMs - rec.ms, true)]] : []),
      ["通关时间", formatCnSeconds(rec.at)],
    ];
    $("pzResultList").innerHTML = rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join("");
    $("pzCodeBox").hidden = !rec.eligible;
    card("pzResultCard");
    if (rec.eligible) generateCode(rec);
  }

  function showContestResult(rec, d) {
    const rows = [
      ["大赛", rec.contest.title],
      ["难度", `${d.name}（${d.level} · ${rec.pieces} 块）`],
      ["耗时", fmtClock(rec.ms, true)],
      ["通关时间", formatCnSeconds(rec.at)],
    ];
    $("pzResultList").innerHTML = rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join("");
    $("pzSubmitBox").hidden = !!rec.submitted;
    $("pzCodeBox").hidden = !rec.submitted;
    $("pzSubmitBtn").disabled = false;
    setMsg($("pzSubmitMsg"), "");
    $("pzPlayerInput").value = storage.get(STORE_PLAYER) || "";
    card("pzResultCard");
    if (rec.submitted) generateCode(rec);
  }

  function codePlainText(rec) {
    const d = DIFFS[rec.diff];
    if (rec.contest) {
      return [
        "花舞之街拼图大赛·通关",
        `大赛：${rec.contest.title}`,
        `玩家：${rec.player}`,
        `难度：${d.name}（${rec.pieces}块）`,
        `耗时：${fmtClock(rec.ms, true)}`,
        `通关时间：${formatCnSeconds(rec.at)}`,
        `登记号：No.${rec.no}`,
      ].join("\n");
    }
    return [
      "花舞之街拼图·限时通关",
      `难度：${d.name}（${rec.pieces}块）`,
      `耗时：${fmtClock(rec.ms, true)} / 限时 ${d.limitMin} 分钟`,
      `通关时间：${formatCnSeconds(rec.at)}`,
      `相册图：${rec.img}`,
    ].join("\n");
  }

  /* 一代花语加密（站点密钥，由 Worker 完成）；purpose: "puzzle" 让 Worker 固定使用一代 */
  async function sealCode(rec) {
    try {
      await loadLateScript("huayu.js", () => !!window.HJHuayu);
    } catch (e) {
      return { ok: false, msg: CODE_ERRORS.no_js };
    }
    const res = await window.HJHuayu.encrypt(codePlainText(rec), {
      algo: 1,
      post: (payload) => callWorker({ ...payload, purpose: "puzzle" }),
    });
    if (!res.ok || res.algo !== 1) return { ok: false, msg: CODE_ERRORS[res.error] || "通关码生成失败，稍后点「重新生成」" };
    rec.code = res.text.startsWith(CODE_PREFIX) ? res.text.slice(CODE_PREFIX.length) : res.text;
    saveLast(rec);
    return { ok: true, code: rec.code };
  }

  async function generateCode(rec) {
    $("pzCodeTitle").textContent = "通关码生成中…";
    $("pzCodeText").textContent = "";
    $("pzCodeCopyBtn").hidden = $("pzCodeRetryBtn").hidden = true;
    setMsg($("pzCodeMsg"), "");
    const res = rec.code ? { ok: true, code: rec.code } : await sealCode(rec);
    if (lastRecord !== rec) return;
    if (res.ok) {
      $("pzCodeTitle").textContent = rec.contest ? `登记成功！登记号 No.${rec.no} · 通关码` : "恭喜通关！通关码";
      $("pzCodeText").textContent = res.code;
      $("pzCodeCopyBtn").hidden = false;
    } else {
      $("pzCodeTitle").textContent = "通关码";
      setMsg($("pzCodeMsg"), res.msg);
      $("pzCodeRetryBtn").hidden = false;
    }
  }

  /* ==== 打开 / 关闭 ==== */
  function openPuzzle() {
    /* 首次打开先用站点状态里的设置，之后以 Worker 最新返回为准 */
    if (!PZ.loaded) applyState(typeof puzzleSiteState !== "undefined" ? puzzleSiteState : null, false);
    refreshState();
    build();
    $("puzzleOverlay").hidden = false;
    document.documentElement.classList.add("pz-open");
    if (G && !G.done) {
      $("pzHud").hidden = false;
      fitView(false);
      pause();
      return;
    }
    destroyGame();
    showSetup();
  }

  function closePuzzle() {
    if (!built) { $("puzzleOverlay").hidden = true; return; }
    saveNow();
    destroyGame();
    togglePreview(false);
    pointers.clear();
    pan = pinch = null;
    $("puzzleOverlay").hidden = true;
    document.documentElement.classList.remove("pz-open");
  }

  /* 右上角 ×：中断继续关着且正在拼时，点两次才退出 */
  let closeArmedAt = 0;
  function requestClose() {
    const playing = G && !G.done && !PZ.resume && (G.elapsed > 3000 || G.groups.length < G.pieces.length);
    if (playing && Date.now() - closeArmedAt > 3000) {
      closeArmedAt = Date.now();
      showToast("关闭后本局不会保存，再点一次 × 退出");
      return;
    }
    closeArmedAt = 0;
    closePuzzle();
  }

  window.HJPuzzle = { open: openPuzzle, close: closePuzzle, requestClose };
})();
