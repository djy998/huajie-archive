/* 花舞之街 · 吟游诗人模拟器。从「更多」打开时按需加载，依赖 main.js 的工具（$、storage、showToast、siteVolume、bgm、makeWidgetDraggable…）
   - 玩法参考 blossom（github.com/alexbainter/blossom，MIT）：点击处的高度决定音高，左右决定声像；
     每个音隔 7~12 秒回响一次并逐渐变弱，最多同时循环最近的 15 个音，随手点几下就成了一段循环的旋律
   - 音阶为五声音阶（宫商角徵羽），怎么点都不会刺耳；钢琴、竖琴用 blossom 那样的宽音域（C2–C7 五个八度），
     鲁特琴四个八度，其余乐器三个八度、音域参考游戏内乐器演奏
   - 钢琴用 blossom 同款的真实采样（VSCO 2 社区版，CC0，assets/bard/，选到钢琴才下载，没下载好时用合成音顶上）；
     其余音色由 Web Audio 合成：拨弦（竖琴、鲁特琴、拨弦提琴）用 Karplus-Strong，
     拉弦与管乐用周期波形 + 滤波 + 包络 + 颤音；共用一个混响
   - 回响中的音保留自己的音色，演奏中换音色可以叠出合奏
   - 开始演奏后由全屏透明层接管点击（不会点到页面上的东西），再点按钮或按 Esc 结束；演奏时背景音乐暂停 */
(() => {
  const STORE_INST = "hj_bard_inst";
  const STORE_XY = "hj_bard_xy";
  const BADGE_SRC = "jobicon/%E5%90%9F%E6%B8%B8%E8%AF%97%E4%BA%BA.png";

  const SCALE = [0, 2, 4, 7, 9];                         // 大调五声音阶
  const LOOP_MAX = 15;                                   // 同时循环的音数、每个音的回响次数
  const LOOP_DELAY_MS = [7000, 12000];                   // 回响间隔，每次开始演奏时随机取
  const LOOP_FUDGE_MS = 250;                             // 每次回响额外的随机延迟（逐次累加，旋律慢慢错开）
  const COLOR_IDLE_MS = 3000;                            // 停手这么久后换一种颜色
  const RENDER_SR = 32000;                               // 拨弦、钢琴预渲染的采样率
  const CACHE_MAX = 96;
  const MAX_VOICES = 40;
  const FADE_OUT_S = 0.9;

  /* 乐器：low 为最低音的 MIDI 编号（C1 = 24，C4 = 60），oct 为八度数（默认 3）；gain 已按实测响度校准。
     sustain 类：harm 为谐波振幅；cut 为低通截止（基频倍数，floor / ceil 为上下限 Hz，上限默认 8k），bright 为起音时的倍数；
     a / hold / rel 为起音、按住、释放（秒）；vib 为 [速率 Hz, 深度 音分, 延迟 秒]；
     noise 为气声 [音量, 中心频率（基频倍数）, Q, 起音时的额外气声]；scoop 为起音时从低多少音分滑上来；
     pluck 类：pos 为拨弦位置，bright 为起音亮度（基频倍数），stretch 为环路低通，t60 等为余音长短；
     body 为共鸣滤波 [类型, 频率, 增益 dB, Q]；verb 为送进混响的比例（默认 1）；
     samples 为采样文件（前缀 + MIDI 编号 + .mp3），播放时取最近的采样变调；采样自带混响与各音区的自然响度，
     所以钢琴照 blossom 的做法：不再送混响、不做音区响度补偿，只过 2.5k 低通 */
  const saw = (n, k = 1) => Array.from({ length: n }, (_, i) => 1 / Math.pow(i + 1, k));
  const INSTRUMENTS = [
    { id: "harp", name: "竖琴", group: "弦乐", low: 36, oct: 5, kind: "pluck", gain: 0.62,
      pluck: { pos: 0.38, bright: 9, noise: 0.12, stretch: 0.5, t60: 5.6, t60Exp: 0.55, t60Min: 1.4, t60Max: 6.5, maxLen: 4 },
      body: [["highpass", 55], ["peaking", 230, 2.5, 0.9], ["highshelf", 3600, -5]] },
    { id: "piano", name: "钢琴", group: "弦乐", low: 36, oct: 5, kind: "piano", gain: 0.8, sampleGain: 1.3, verb: 0,
      samples: { prefix: "assets/bard/piano-", notes: [37, 41, 45, 49, 53, 57, 61, 65, 69, 73, 77, 81, 85, 89, 93, 97] },
      body: [["highpass", 40], ["lowpass", 2500]] },
    { id: "lute", name: "鲁特琴", group: "弦乐", low: 36, oct: 4, kind: "pluck", gain: 0.6,
      pluck: { pos: 0.17, bright: 18, noise: 0.3, stretch: 0.42, t60: 3.4, t60Exp: 0.5, t60Min: 0.9, t60Max: 4, maxLen: 3 },
      body: [["highpass", 70], ["peaking", 190, 3.5, 1.2], ["peaking", 1700, 2, 1.4], ["highshelf", 5200, -6]] },
    { id: "fiddle", name: "拨弦提琴", group: "弦乐", low: 36, kind: "pluck", gain: 0.78,
      pluck: { pos: 0.27, bright: 13, noise: 0.22, stretch: 0.5, t60: 1.5, t60Exp: 0.4, t60Min: 0.45, t60Max: 1.7, maxLen: 1.6 },
      body: [["highpass", 90], ["peaking", 280, 4.5, 1.5], ["peaking", 2700, 3, 1.3], ["highshelf", 6000, -6]] },
    { id: "violin", name: "小提琴", group: "弦乐", low: 48, kind: "sustain", gain: 0.34,
      harm: saw(36), cut: 7, floor: 900, bright: 9, q: 0.6, a: 0.11, hold: 0.7, rel: 0.55, sus: 0.82,
      vib: [5.8, 15, 0.16], noise: [0.012, 14, 0.7, 0.02], detune: 5,
      body: [["highpass", 170], ["peaking", 290, 4, 1.5], ["peaking", 2600, 5, 1.2], ["highshelf", 6000, -9]] },
    { id: "viola", name: "中提琴", group: "弦乐", low: 48, kind: "sustain", gain: 0.32,
      harm: saw(36), cut: 5.5, floor: 800, bright: 7, q: 0.6, a: 0.13, hold: 0.75, rel: 0.6, sus: 0.82,
      vib: [5.4, 13, 0.18], noise: [0.01, 12, 0.7, 0.015], detune: 5,
      body: [["highpass", 120], ["peaking", 240, 4, 1.4], ["peaking", 1900, 3.5, 1.2], ["highshelf", 4800, -9]] },
    { id: "cello", name: "大提琴", group: "弦乐", low: 36, kind: "sustain", gain: 0.36,
      harm: saw(36), cut: 6, floor: 700, bright: 8, q: 0.6, a: 0.15, hold: 0.8, rel: 0.65, sus: 0.82,
      vib: [5.2, 14, 0.18], noise: [0.008, 18, 0.7, 0.012], detune: 4,
      body: [["highpass", 60], ["peaking", 190, 4, 1.2], ["peaking", 1500, 2, 1.2], ["highshelf", 3800, -8]] },
    { id: "bass", name: "低音提琴", group: "弦乐", low: 24, kind: "sustain", gain: 0.44,
      harm: saw(30), cut: 7, floor: 520, bright: 9, q: 0.7, a: 0.14, hold: 0.8, rel: 0.6, sus: 0.85,
      vib: [5, 10, 0.2], noise: [0.006, 24, 0.7, 0.01], detune: 3,
      body: [["highpass", 30], ["peaking", 130, 3, 1.1], ["peaking", 700, 2.5, 1.2], ["highshelf", 2600, -8]] },

    { id: "flute", name: "长笛", group: "管乐", low: 72, kind: "sustain", gain: 0.32,
      harm: [1, 0.3, 0.11, 0.05, 0.025, 0.012], cut: 8, floor: 2400, q: 0.4, a: 0.07, hold: 0.55, rel: 0.45, sus: 0.85,
      vib: [5, 11, 0.18], noise: [0.05, 2, 1.1, 0.16],
      body: [["highpass", 220], ["highshelf", 5500, -6]] },
    { id: "oboe", name: "双簧管", group: "管乐", low: 60, kind: "sustain", gain: 0.3,
      harm: [0.55, 1, 0.9, 0.72, 0.46, 0.34, 0.24, 0.17, 0.12, 0.08, 0.055, 0.035, 0.02], cut: 9, floor: 3000, ceil: 5500, q: 0.5,
      a: 0.05, hold: 0.5, rel: 0.3, sus: 0.85, vib: [5.2, 9, 0.24], noise: [0.012, 3, 1, 0.03],
      body: [["highpass", 240], ["peaking", 1150, 6, 1.5], ["peaking", 2900, 4, 2], ["highshelf", 5000, -6]] },
    { id: "clarinet", name: "单簧管", group: "管乐", low: 48, kind: "sustain", gain: 0.3,
      harm: [1, 0.04, 0.75, 0.04, 0.5, 0.03, 0.32, 0.02, 0.2, 0.02, 0.12, 0.01, 0.07], cut: 7, floor: 1800, q: 0.7,
      a: 0.06, hold: 0.55, rel: 0.35, sus: 0.88, vib: [4.8, 3, 0.3], noise: [0.012, 4, 1, 0.025],
      body: [["highpass", 110], ["peaking", 1500, 2, 1.2], ["highshelf", 4500, -6]] },
    { id: "fife", name: "横笛", group: "管乐", low: 72, kind: "sustain", gain: 0.36,
      harm: [1, 0.42, 0.22, 0.1, 0.05], cut: 7, floor: 3000, q: 0.4, a: 0.04, hold: 0.4, rel: 0.3, sus: 0.85,
      vib: [5.6, 8, 0.15], noise: [0.06, 1.5, 1.2, 0.22],
      body: [["highpass", 400], ["highshelf", 6500, -8]] },
    { id: "panpipes", name: "排箫", group: "管乐", low: 60, kind: "sustain", gain: 0.28,
      harm: [1, 0.06, 0.2, 0.03, 0.07, 0.01, 0.025], cut: 6, floor: 2000, q: 0.4, a: 0.05, hold: 0.45, rel: 0.6, sus: 0.8,
      vib: [4.5, 6, 0.25], noise: [0.09, 1, 2.5, 0.42], scoop: 30,
      body: [["highpass", 180], ["highshelf", 5000, -6]] },
    { id: "trumpet", name: "小号", group: "管乐", low: 48, kind: "sustain", gain: 0.4,
      harm: saw(30, 0.75), cut: 6, floor: 900, bright: 10, q: 1.4, a: 0.035, hold: 0.5, rel: 0.25, sus: 0.85,
      vib: [5.5, 8, 0.3], scoop: 25,
      body: [["highpass", 140], ["peaking", 1300, 4, 1], ["highshelf", 5000, -5]] },
    { id: "trombone", name: "长号", group: "管乐", low: 36, kind: "sustain", gain: 0.4,
      harm: saw(30, 0.8), cut: 4.2, floor: 600, bright: 7, q: 1.2, a: 0.06, hold: 0.55, rel: 0.3, sus: 0.85,
      vib: [5, 5, 0.35], scoop: 20,
      body: [["highpass", 60], ["peaking", 520, 3, 1], ["highshelf", 3500, -6]] },
    { id: "tuba", name: "大号", group: "管乐", low: 24, kind: "sustain", gain: 0.42,
      harm: saw(24, 0.95), cut: 4, floor: 380, bright: 6, q: 0.8, a: 0.07, hold: 0.55, rel: 0.35, sus: 0.88,
      vib: [4.6, 4, 0.4], scoop: 15,
      body: [["highpass", 28], ["peaking", 240, 3, 1], ["highshelf", 2000, -8]] },
    { id: "horn", name: "圆号", group: "管乐", low: 36, kind: "sustain", gain: 0.32,
      harm: saw(24, 1.1), cut: 3.2, floor: 420, bright: 4.6, q: 0.7, a: 0.09, hold: 0.6, rel: 0.45, sus: 0.88,
      vib: [4.8, 4, 0.4], scoop: 12,
      body: [["highpass", 55], ["peaking", 420, 2, 1], ["highshelf", 2400, -7]] },
    { id: "sax", name: "萨克斯", group: "管乐", low: 48, kind: "sustain", gain: 0.3,
      harm: saw(30, 0.85), cut: 6, floor: 1200, bright: 9, q: 1.1, a: 0.05, hold: 0.55, rel: 0.3, sus: 0.85,
      vib: [5.4, 14, 0.2], noise: [0.016, 5, 0.8, 0.03], scoop: 20,
      body: [["highpass", 100], ["peaking", 620, 4, 1.2], ["peaking", 1800, 5, 1.4], ["highshelf", 4200, -6]] },
  ];
  const INST = Object.fromEntries(INSTRUMENTS.map((it) => [it.id, it]));
  const DEFAULT_INST = "piano";

  /* 波纹颜色：白天深一些，夜里浅一些 */
  const PALETTE = {
    day: ["192 79 122", "205 118 34", "52 145 124", "70 116 200", "135 88 196", "200 88 58", "96 140 40"],
    night: ["201 179 245", "255 201 138", "247 168 196", "143 224 207", "156 200 255", "255 181 158", "238 222 140"],
  };

  const NOTE_SVG = [
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 17.5V5l9-2v12"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="15.5" cy="15" r="2.5"/></svg>',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 17V4c2.2 1.6 5 2.4 5 6"/><circle cx="9.5" cy="17" r="2.6"/></svg>',
  ];
  const ICON = {
    close: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    play: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
    stop: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1.5"/></svg>',
  };

  const touchFirst = () => matchMedia("(pointer: coarse)").matches;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const stepsOf = (inst) => SCALE.length * (inst.oct || 3) + 1;   // 含最高的 C
  const stepMidi = (inst, step) => inst.low + Math.floor(step / SCALE.length) * 12 + SCALE[step % SCALE.length];
  /* 高音略收、低音略补，各音区听起来差不多响；2kHz 上下耳朵最敏感，再多收一些 */
  const loudness = (f) => clamp(Math.pow(262 / f, 0.2), 0.5, 1.6) * (f > 1500 ? Math.pow(1500 / f, 0.35) : 1);

  const B = {
    built: false,
    playing: false,
    inst: DEFAULT_INST,
    loopDelay: 9000,
    count: 0,            // 本次演奏的点击数（回响衰减用）
    timers: new Set(),
    color: 0,
    lastTap: 0,
    bgmWasOn: false,
    stopTimer: 0,
  };

  /* ==== 音频 ==== */
  const A = { ctx: null, master: null, dry: null, send: null, bodies: {}, waves: {}, cache: new Map(), samples: {}, voices: new Set(), noise: null, queue: [], idle: 0 };

  function ensureAudio() {
    if (A.ctx) return A.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    let ctx;
    /* 手机上缓冲区放大一些，CPU 忙时不至于断音爆音 */
    const latencyHint = touchFirst() ? "balanced" : "interactive";
    try { ctx = new AC({ latencyHint }); } catch (e) { try { ctx = new AC(); } catch (err) { return null; } }
    const master = ctx.createGain();
    master.gain.value = 0;
    /* 末级限幅：音叠得再多也不冲过 0 dBFS（削波就是「滋滋」声） */
    const bus = ctx.createGain();
    bus.gain.value = 0.7;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -9;
    limiter.knee.value = 6;
    limiter.ratio.value = 16;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.2;
    const dry = ctx.createGain();
    dry.gain.value = 0.85;
    const send = ctx.createBiquadFilter();
    send.type = "highpass";
    send.frequency.value = 200;
    const sendLp = ctx.createBiquadFilter();
    sendLp.type = "lowpass";
    sendLp.frequency.value = 5000;
    const verb = ctx.createConvolver();
    verb.buffer = makeImpulse(ctx, 2.8);
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    dry.connect(bus);
    send.connect(sendLp).connect(verb).connect(wet).connect(bus);
    bus.connect(limiter).connect(master).connect(ctx.destination);

    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    Object.assign(A, { ctx, master, dry, send, noise });
    return ctx;
  }

  /* 混响：越往后越暗的衰减噪声；起头就先压掉高频，免得有嘶嘶声 */
  function makeImpulse(ctx, seconds) {
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * seconds);
    const pre = Math.floor(sr * 0.018);
    const buf = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let lp = 0;
      for (let i = pre; i < len; i++) {
        const t = (i - pre) / sr;
        const k = 0.5 + 0.45 * (i / len);
        lp += (1 - k) * (Math.random() * 2 - 1 - lp);
        const fadeIn = Math.min(1, t / 0.008);
        d[i] = lp * Math.exp((-6.9 * t) / (seconds * 0.82)) * fadeIn;
      }
    }
    return buf;
  }

  function instBody(inst) {
    if (A.bodies[inst.id]) return A.bodies[inst.id];
    const input = A.ctx.createGain();
    let node = input;
    (inst.body || []).forEach(([type, freq, gain = 0, q]) => {
      const f = A.ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      if (type === "peaking" || type.endsWith("shelf")) f.gain.value = gain;
      f.Q.value = q ?? (type === "peaking" ? 1 : 0.707);
      node.connect(f);
      node = f;
    });
    node.connect(A.dry);
    const verb = inst.verb ?? 1;
    if (verb > 0) {
      const g = A.ctx.createGain();
      g.gain.value = verb;
      node.connect(g).connect(A.send);
    }
    A.bodies[inst.id] = input;
    return input;
  }

  function instWave(inst) {
    if (A.waves[inst.id]) return A.waves[inst.id];
    const real = new Float32Array(inst.harm.length + 1);
    const imag = new Float32Array(inst.harm.length + 1);
    inst.harm.forEach((v, i) => { imag[i + 1] = v; });
    A.waves[inst.id] = A.ctx.createPeriodicWave(real, imag);
    return A.waves[inst.id];
  }

  /* Karplus-Strong：延迟线长取整数，用播放速率补回准确的音高 */
  function renderPluck(p, f) {
    const sr = RENDER_SR;
    const S = p.stretch * clamp(Math.pow(196 / f, 1.3), 0.06, 1);  // 高音的环路低通放轻，泛音不至于一出声就没了
    const soft = Math.exp((-2 * Math.PI * Math.min(9000, f * p.bright)) / sr);
    const N = Math.max(2, Math.floor(sr / f - S));
    const f0 = sr / (N + S);
    const t60 = clamp(p.t60 * Math.pow(130 / f, p.t60Exp), p.t60Min, p.t60Max);
    const rho = Math.pow(0.001, 1 / (t60 * f0));
    const len = Math.ceil(Math.min(t60, p.maxLen) * sr);
    const y = new Float32Array(len);
    let lp = 0;
    let mean = 0;
    for (let i = 0; i < N; i++) {
      const u = i / N;
      const tri = u < p.pos ? u / p.pos : (1 - u) / (1 - p.pos);
      const x = (1 - p.noise) * (tri * 2 - 1) + p.noise * (Math.random() * 2 - 1);
      lp += (1 - soft) * (x - lp);
      y[i] = lp;
      mean += lp;
    }
    mean /= N;
    let peak = 1e-6;
    for (let i = 0; i < N; i++) {
      y[i] -= mean;
      peak = Math.max(peak, Math.abs(y[i]));
    }
    for (let n = N; n < len; n++) y[n] = rho * ((1 - S) * y[n - N] + S * (n > N ? y[n - N - 1] : 0));
    finishBuffer(y, sr, peak, 0.0015, 0.25);
    return { data: y, rate: f / f0 };
  }

  /* 钢琴：带非谐性的分音，两根弦略微失谐，高次分音衰减更快，再加一点击弦噪声 */
  function renderPiano(f, midi) {
    const sr = RENDER_SR;
    const len = Math.ceil(clamp(4.6 * Math.pow(262 / f, 0.5), 1.6, 5) * sr);
    const y = new Float32Array(len);
    const inharm = 0.00038 * Math.pow(2, ((midi - 60) / 12) * 0.9);
    const t60Base = clamp(9 * Math.pow(262 / f, 0.65), 1.4, 14);
    const maxF = Math.min(sr * 0.45, 9000);
    for (let n = 1; n <= 32; n++) {
      const fn = n * f * Math.sqrt(1 + inharm * n * n);
      if (fn > maxF) break;
      const amp = (Math.abs(Math.sin((Math.PI * n) / 7.3)) + 0.08) / Math.pow(n, 0.95) * Math.exp(-fn / 3800);
      const t60 = t60Base / (1 + 0.35 * (n - 1) + fn / 2600);
      const slow = Math.exp(-6.9 / (t60 * sr));
      const fast = Math.exp(-6.9 / (t60 * 0.22 * sr));
      for (const det of [0.99955, 1.00045]) {
        const w = (2 * Math.PI * fn * det) / sr;
        const c = Math.cos(w);
        const s = Math.sin(w);
        const ph = Math.random() * Math.PI * 2;
        let re = Math.cos(ph);
        let im = Math.sin(ph);
        let eSlow = amp * 0.42;
        let eFast = amp * 0.58;
        for (let i = 0; i < len; i++) {
          y[i] += im * (eSlow + eFast);
          const r2 = re * c - im * s;
          im = re * s + im * c;
          re = r2;
          eSlow *= slow;
          eFast *= fast;
          if (eSlow < 3e-5 * amp) break;
        }
      }
    }
    let lp = 0;
    const hammer = Math.floor(sr * 0.03);
    const thump = 0.06 * clamp(262 / f, 0.5, 2);
    for (let i = 0; i < hammer; i++) {
      lp += 0.35 * (Math.random() * 2 - 1 - lp);
      y[i] += lp * thump * Math.exp(-i / (sr * 0.006));
    }
    let peak = 1e-6;
    for (let i = 0; i < Math.min(len, sr * 0.12); i++) peak = Math.max(peak, Math.abs(y[i]));
    finishBuffer(y, sr, peak, 0.002, 0.3);
    return { data: y, rate: 1 };
  }

  function finishBuffer(y, sr, peak, fadeIn, fadeOutPart) {
    const len = y.length;
    const g = 0.9 / peak;
    const inN = Math.max(1, Math.floor(sr * fadeIn));
    const outStart = Math.floor(len * (1 - fadeOutPart));
    for (let i = 0; i < len; i++) {
      let k = g;
      if (i < inN) k *= i / inN;
      if (i > outStart) k *= 0.5 + 0.5 * Math.cos((Math.PI * (i - outStart)) / (len - outStart));
      y[i] *= k;
    }
  }

  function noteBuffer(inst, midi) {
    const key = inst.id + ":" + midi;
    const hit = A.cache.get(key);
    if (hit) {
      A.cache.delete(key);
      A.cache.set(key, hit);
      return hit;
    }
    const f = mtof(midi);
    const r = inst.kind === "piano" ? renderPiano(f, midi) : renderPluck(inst.pluck, f);
    const buffer = A.ctx.createBuffer(1, r.data.length, RENDER_SR);
    buffer.getChannelData(0).set(r.data);
    const entry = { buffer, rate: r.rate };
    A.cache.set(key, entry);
    if (A.cache.size > CACHE_MAX) A.cache.delete(A.cache.keys().next().value);
    return entry;
  }

  /* 采样：打开小组件时先下载，开始演奏（有了 AudioContext）后再解码；失败时清掉记录，下次再试，期间用合成音 */
  const rawSamples = {};
  const sampleUrls = (inst) => inst.samples.notes.map((m) => [m, `${inst.samples.prefix}${m}.mp3?v=${HJ.version}`]);

  function fetchSample(url) {
    rawSamples[url] ??= fetch(url)
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .catch((e) => { delete rawSamples[url]; throw e; });
    return rawSamples[url];
  }

  function prefetchSamples(inst) {
    if (!inst.samples || A.samples[inst.id]) return;
    sampleUrls(inst).forEach(([, url]) => fetchSample(url).catch(() => {}));
  }

  function loadSamples(inst) {
    if (!A.ctx || !inst.samples || A.samples[inst.id]) return;
    const ctx = A.ctx;
    const entry = { ready: false, buffers: new Map() };
    A.samples[inst.id] = entry;
    Promise.all(sampleUrls(inst).map(([m, url]) => fetchSample(url)
      .then((data) => { delete rawSamples[url]; return new Promise((resolve, reject) => ctx.decodeAudioData(data, resolve, reject)); })
      .then((buf) => entry.buffers.set(m, buf))))
      .then(() => { entry.ready = true; })
      .catch(() => { if (A.samples[inst.id] === entry) delete A.samples[inst.id]; });
  }

  /* 选中乐器后趁空闲把各音先算好，点击时不卡；有采样的乐器改为下载采样 */
  function prerender(inst) {
    if (!A.ctx || inst.kind === "sustain") return;
    if (inst.samples) {
      loadSamples(inst);
      return;
    }
    A.queue = Array.from({ length: stepsOf(inst) }, (_, i) => [inst, stepMidi(inst, i)]);
    if (A.idle) return;
    const idle = window.requestIdleCallback || ((fn) => setTimeout(() => {
      const t0 = performance.now();
      fn({ timeRemaining: () => Math.max(0, 12 - (performance.now() - t0)) });
    }, 40));
    const work = (deadline) => {
      A.idle = 0;
      do {
        const job = A.queue.shift();
        if (!job) return;
        noteBuffer(...job);
      } while (deadline.timeRemaining() > 6);
      A.idle = idle(work);
    };
    A.idle = idle(work);
  }

  function voiceOut(inst, pan, gain, t) {
    const g = A.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    let head = g;
    if (A.ctx.createStereoPanner) {
      const p = A.ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      head = p;
    }
    head.connect(instBody(inst));
    return g;
  }

  function trackVoice(src, nodes, stop) {
    const v = { stop };
    A.voices.add(v);
    src.onended = () => {
      A.voices.delete(v);
      nodes.forEach((n) => { try { n.disconnect(); } catch (e) {} });
    };
    /* 同时发声太多时，最早的那个先淡出 */
    if (A.voices.size > MAX_VOICES) {
      const oldest = A.voices.values().next().value;
      A.voices.delete(oldest);
      oldest.stop(A.ctx.currentTime);
    }
  }

  function sampleFor(inst, midi) {
    const entry = A.samples[inst.id];
    if (!entry || !entry.ready) return null;
    const near = inst.samples.notes.reduce((a, b) => (Math.abs(b - midi) < Math.abs(a - midi) ? b : a));
    return { buffer: entry.buffers.get(near), rate: Math.pow(2, (midi - near) / 12), gain: inst.sampleGain, flat: true };
  }

  function playSample(inst, midi, t, vel, pan) {
    const { buffer, rate, gain = inst.gain, flat } = sampleFor(inst, midi) || noteBuffer(inst, midi);
    const src = A.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const out = voiceOut(inst, pan, gain * vel * (flat ? 1 : loudness(mtof(midi))), t);
    src.connect(out);
    src.start(t);
    trackVoice(src, [src, out], (now) => {
      out.gain.cancelScheduledValues(now);
      out.gain.setTargetAtTime(0, now, 0.03);
      try { src.stop(now + 0.2); } catch (e) {}
    });
  }

  function playSustain(inst, midi, t, vel, pan) {
    const ctx = A.ctx;
    const f = mtof(midi);
    const nodes = [];
    const add = (n) => { nodes.push(n); return n; };
    const out = add(voiceOut(inst, pan, inst.gain * vel * loudness(f), t));
    const amp = add(ctx.createGain());
    const filt = add(ctx.createBiquadFilter());
    filt.type = "lowpass";
    filt.Q.value = inst.q;
    const nyq = ctx.sampleRate * 0.45;
    const top = Math.min(nyq, inst.ceil || 8000);
    const cutS = Math.min(top, Math.max(inst.floor, f * inst.cut));
    const cutA = Math.min(top, Math.max(inst.floor, f * (inst.bright || inst.cut)));
    const tRel = t + inst.hold;
    const tEnd = tRel + inst.rel * 1.8;
    filt.frequency.setValueAtTime(cutA * 0.35 + cutS * 0.1, t);
    filt.frequency.linearRampToValueAtTime(cutA, t + inst.a);
    filt.frequency.setTargetAtTime(cutS, t + inst.a, 0.12);
    filt.frequency.setTargetAtTime(cutS * 0.6, tRel, inst.rel / 3);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(1, t + inst.a);
    amp.gain.setTargetAtTime(inst.sus, t + inst.a, 0.15);
    amp.gain.setTargetAtTime(0, tRel, inst.rel / 4);
    filt.connect(amp).connect(out);

    const sources = [];
    const oscs = [];
    const detunes = inst.detune ? [-inst.detune, inst.detune] : [0];
    detunes.forEach((d) => {
      const o = add(ctx.createOscillator());
      o.setPeriodicWave(instWave(inst));
      o.frequency.value = f;
      o.detune.value = d;
      if (inst.scoop) {
        o.detune.setValueAtTime(d - inst.scoop, t);
        o.detune.setTargetAtTime(d, t, 0.025);
      }
      const g = add(ctx.createGain());
      g.gain.value = 1 / detunes.length;
      o.connect(g).connect(filt);
      o.start(t);
      oscs.push(o);
      sources.push(o);
    });

    if (inst.vib) {
      const [rate, depth, delay] = inst.vib;
      const lfo = add(ctx.createOscillator());
      lfo.frequency.value = rate * (0.94 + Math.random() * 0.12);
      const lg = add(ctx.createGain());
      lg.gain.setValueAtTime(0, t);
      lg.gain.setValueAtTime(0, t + delay);
      lg.gain.linearRampToValueAtTime(depth, t + delay + 0.3);
      lfo.connect(lg);
      oscs.forEach((o) => lg.connect(o.detune));
      lfo.start(t);
      sources.push(lfo);
    }

    if (inst.noise) {
      const [level, band, q, chiff] = inst.noise;
      const n = add(ctx.createBufferSource());
      n.buffer = A.noise;
      n.loop = true;
      const bp = add(ctx.createBiquadFilter());
      bp.type = "bandpass";
      bp.frequency.value = Math.min(nyq, f * band);
      bp.Q.value = q;
      const ng = add(ctx.createGain());
      ng.gain.setValueAtTime(0, t);
      ng.gain.linearRampToValueAtTime(level + chiff, t + Math.min(0.02, inst.a));
      ng.gain.setTargetAtTime(level, t + 0.02, 0.05);
      ng.gain.setTargetAtTime(0, tRel, inst.rel / 4);
      n.connect(bp).connect(ng).connect(out);
      n.start(t, Math.random() * 1.5);
      sources.push(n);
    }

    sources.forEach((src) => src.stop(tEnd));
    trackVoice(sources[0], nodes, (now) => {
      out.gain.cancelScheduledValues(now);
      out.gain.setTargetAtTime(0, now, 0.03);
      sources.forEach((src) => { try { src.stop(now + 0.2); } catch (e) {} });
    });
  }

  function playNote(note, vel) {
    if (!A.ctx || vel <= 0) return;
    const inst = INST[note.inst];
    const midi = stepMidi(inst, note.step);
    const t = A.ctx.currentTime + 0.01;
    A.master.gain.setTargetAtTime(siteVolume.level, A.ctx.currentTime, 0.05);
    try {
      if (inst.kind === "sustain") playSustain(inst, midi, t, vel, note.pan);
      else playSample(inst, midi, t, vel, note.pan);
    } catch (e) {
      console.error(e);
    }
  }

  /* ==== 演奏：点击与回响 ==== */
  function tapNote(x, y) {
    const { vw, vh } = viewportSize();
    const now = Date.now();
    if (now - B.lastTap > COLOR_IDLE_MS) B.color += 1 + Math.floor(Math.random() * 3);
    B.lastTap = now;
    B.count += 1;
    const palette = PALETTE[isDayMode() ? "day" : "night"];
    const steps = stepsOf(INST[B.inst]);
    const note = {
      inst: B.inst,
      step: clamp(Math.floor((1 - y / vh) * steps), 0, steps - 1),
      pan: clamp((x / vw) * 2 - 1, -1, 1) * 0.6,
      x: x / vw,
      y: y / vh,
      rgb: palette[B.color % palette.length],
      count: B.count,
      plays: 1,
    };
    playNote(note, 1);
    showRipple(note, 1, true);
    scheduleEcho(note);
  }

  /* blossom 的回响：较新的音、回响次数少的音更响；超出最近 15 个音的不再回响 */
  function scheduleEcho(note) {
    if (B.count > LOOP_MAX && note.count <= B.count - LOOP_MAX) return;
    const wait = B.loopDelay + (note.plays - 1) * Math.random() * LOOP_FUDGE_MS;
    const id = setTimeout(() => {
      B.timers.delete(id);
      if (!B.playing) return;
      const byCount = (LOOP_MAX - (B.count - note.count)) / LOOP_MAX;
      const byPlays = (LOOP_MAX - note.plays + 1) / LOOP_MAX;
      const vel = (byCount + byPlays) / 2;
      note.plays += 1;
      if (vel <= 0) return;
      playNote(note, vel);
      if (!document.hidden) showRipple(note, vel, false);
      scheduleEcho(note);
    }, wait);
    B.timers.add(id);
  }

  function showRipple(note, vel, fresh) {
    const stage = $("bardStage");
    if (!stage) return;
    const { vw, vh } = viewportSize();
    const x = note.x * vw;
    const y = note.y * vh;
    const calm = prefersReducedMotion();
    if (stage.childElementCount > 60) stage.querySelector(".bard-ripple")?.remove();
    const r = document.createElement("span");
    r.className = "bard-ripple" + (calm ? " is-calm" : "");
    const d = Math.round(clamp(Math.min(vw, vh) * 0.8, 240, 560));
    r.style.cssText = `left:${x}px;top:${y}px;--d:${d}px;--c:${note.rgb};--o:${(0.25 + 0.75 * vel).toFixed(3)}`;
    stage.appendChild(r);
    setTimeout(() => r.remove(), 5200);
    if (!fresh || calm) return;
    const pop = document.createElement("span");
    pop.className = "bard-pop";
    pop.style.cssText = `left:${x}px;top:${y}px;--c:${note.rgb}`;
    stage.appendChild(pop);
    setTimeout(() => pop.remove(), 800);
    if (!fxEnabled) return;
    const n = document.createElement("span");
    n.className = "bard-note";
    n.innerHTML = NOTE_SVG[note.count % NOTE_SVG.length];
    n.style.cssText = `left:${x}px;top:${y}px;--c:${note.rgb};--dx:${Math.round(Math.random() * 36 - 18)}px;--rot:${Math.round(Math.random() * 30 - 15)}deg`;
    stage.appendChild(n);
    setTimeout(() => n.remove(), 1700);
  }

  function onStagePointer(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    if (A.ctx && A.ctx.state !== "running") A.ctx.resume().catch(() => {});
    tapNote(e.clientX, e.clientY);
  }

  function start() {
    if (B.playing) return;
    if (siteVolume.muted) {
      showToast("现在是静音，先把音量调大再演奏吧");
      openVolPanel(true);
      return;
    }
    if (!ensureAudio()) {
      showToast("这个浏览器放不出网页音频，换一个试试");
      return;
    }
    try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) {}
    A.ctx.resume().catch(() => {});
    clearTimeout(B.stopTimer);
    A.voices.forEach((v) => v.stop(A.ctx.currentTime));
    A.voices.clear();
    A.master.gain.cancelScheduledValues(A.ctx.currentTime);
    A.master.gain.setTargetAtTime(siteVolume.level, A.ctx.currentTime, 0.02);

    Object.assign(B, {
      playing: true,
      count: 0,
      lastTap: 0,
      loopDelay: LOOP_DELAY_MS[0] + Math.random() * (LOOP_DELAY_MS[1] - LOOP_DELAY_MS[0]),
      bgmWasOn: bgm.playing,
    });
    if (B.bgmWasOn) bgm.pause();
    prerender(INST[B.inst]);

    const stage = document.createElement("div");
    stage.className = "bard-stage";
    stage.id = "bardStage";
    stage.setAttribute("aria-hidden", "true");
    const tip = document.createElement("span");
    tip.className = "bard-tip";
    tip.textContent = touchFirst() ? "点任意位置演奏 · 越往上音越高" : "点击任意位置演奏 · 越往上音越高 · Esc 结束";
    stage.appendChild(tip);
    stage.addEventListener("pointerdown", onStagePointer);
    stage.addEventListener("contextmenu", (e) => e.preventDefault());
    document.body.appendChild(stage);
    document.documentElement.classList.add("bard-on");
    openMorePanel(false);
    openVolPanel(false);
    syncButton();
  }

  function stop() {
    if (!B.playing) return;
    B.playing = false;
    B.timers.forEach((id) => clearTimeout(id));
    B.timers.clear();
    if (A.ctx) {
      const now = A.ctx.currentTime;
      A.master.gain.cancelScheduledValues(now);
      A.master.gain.setTargetAtTime(0, now, FADE_OUT_S / 4);
      clearTimeout(B.stopTimer);
      B.stopTimer = setTimeout(() => {
        A.voices.forEach((v) => v.stop(A.ctx.currentTime));
        A.voices.clear();
        A.ctx.suspend().catch(() => {});
      }, FADE_OUT_S * 1000 + 200);
    }
    const stage = $("bardStage");
    if (stage) {
      stage.id = "";
      stage.classList.add("is-leaving");
      setTimeout(() => stage.remove(), 400);
    }
    document.documentElement.classList.remove("bard-on");
    try { if (navigator.audioSession) navigator.audioSession.type = "auto"; } catch (e) {}
    if (B.bgmWasOn && !siteVolume.muted) bgm.play();
    B.bgmWasOn = false;
    syncButton();
  }

  /* ==== 小组件 ==== */
  function syncButton() {
    const btn = $("bardPlay");
    if (!btn) return;
    btn.classList.toggle("is-on", B.playing);
    btn.setAttribute("aria-pressed", String(B.playing));
    btn.innerHTML = (B.playing ? ICON.stop : ICON.play) + `<span>${B.playing ? "结束演奏" : "开始演奏"}</span>`;
    $("bardWidget").classList.toggle("is-playing", B.playing);
    $("bardHint").textContent = !B.playing ? "开始后点页面任意位置，越往上音越高"
      : touchFirst() ? "再点一下按钮结束" : "再点一下按钮或按 Esc 结束";
  }

  function setPos(right, top) {
    placeWidget($("bardWidget"), right, top);
    storage.set(STORE_XY, `${right},${top}`);
  }

  function build() {
    if (B.built) return;
    B.built = true;
    const groups = [...new Set(INSTRUMENTS.map((it) => it.group))];
    const options = groups.map((g) => `<optgroup label="${g}">`
      + INSTRUMENTS.filter((it) => it.group === g).map((it) => `<option value="${it.id}">${it.name}</option>`).join("")
      + "</optgroup>").join("");
    const w = document.createElement("div");
    w.className = "bard-widget";
    w.id = "bardWidget";
    w.hidden = true;
    w.setAttribute("role", "group");
    w.setAttribute("aria-label", "吟游诗人模拟器");
    w.innerHTML = `
      <div class="bard-head" title="拖动移动，双击复位">
        <span class="bard-title"><img class="bard-badge" src="${BADGE_SRC}" alt="" width="24" height="24" decoding="async" draggable="false">吟游诗人模拟器</span>
        <button class="bard-tool" id="bardClose" type="button" aria-label="关闭吟游诗人模拟器" title="关闭">${ICON.close}</button>
      </div>
      <label class="visually-hidden" for="bardInst">音色</label>
      <select class="bard-select" id="bardInst">${options}</select>
      <button class="bard-play" id="bardPlay" type="button" aria-pressed="false"></button>
      <p class="bard-hint" id="bardHint"></p>`;
    document.body.appendChild(w);

    const saved = storage.get(STORE_INST);
    B.inst = INST[saved] ? saved : DEFAULT_INST;
    $("bardInst").value = B.inst;
    $("bardInst").addEventListener("change", (e) => {
      B.inst = INST[e.target.value] ? e.target.value : DEFAULT_INST;
      storage.set(STORE_INST, B.inst);
      prefetchSamples(INST[B.inst]);
      if (A.ctx) prerender(INST[B.inst]);
    });
    $("bardPlay").addEventListener("click", () => (B.playing ? stop() : start()));
    $("bardClose").addEventListener("click", close);
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || !B.playing) return;
      e.preventDefault();
      stop();
    });
    window.addEventListener("pagehide", stop);

    const xy = (storage.get(STORE_XY) || "").split(",").map(Number);
    if (xy.length === 2 && xy.every(Number.isFinite)) setPos(...clampWidgetPos(xy[0], xy[1]));
    makeWidgetDraggable(w, w.querySelector(".bard-head"), {
      move: setPos,
      reset: () => {
        w.style.right = w.style.top = "";
        storage.remove(STORE_XY);
      },
    });
    syncButton();
  }

  function open() {
    build();
    const w = $("bardWidget");
    if (!w.hidden) {
      w.classList.remove("is-nudge");
      void w.offsetWidth;
      w.classList.add("is-nudge");
      return;
    }
    w.hidden = false;
    prefetchSamples(INST[B.inst]);
    $("bardPlay").focus({ preventScroll: true });
  }

  function close() {
    stop();
    const w = $("bardWidget");
    if (w) w.hidden = true;
  }

  window.HJBard = { open, close, stop };
})();
