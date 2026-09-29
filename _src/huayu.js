/* =============================================================================
   花舞之街 · 薰风花语町 —— 花语编码 huayu.js
   -----------------------------------------------------------------------------
   首页「听得花间语」和管理页「花语加密」共用，打开它们时才由 main.js 的 loadHuayuJs() 加载，
   加载完设置 window.HJHuayu。
   一段花语的来历：
     明文 ──压缩（本文件）──▶ 比特 ──加密（Worker，密钥只在后端）──▶ 比特 ──换字（本文件）──▶「听花语：」+ 花字
   1. 压缩：逐字预测 + 算术编码，预测来自三层：
        · 本条消息里「前两个字」之后出现过的字
        · 「前一个字」之后常见的字（静态二元表 BI，约两万对）+ 本条消息里的计数
        · 按字类（汉字 / 假名 / 字母 / 数字 / 空白 / 标点 / 表情 / 其它）的先验频率
      中文平均每字 8 比特上下（UTF-8 要 24 比特），字表之外的任意字符（生僻字、韩文、符号）也能编。
   2. 加密在 Worker：比特串 = 版本 1 位 + 密钥类型 1 位 + 校验 16 位 + 密文，
      本文件只负责打包 / 拆包（Worker 收发的是 base64 字节 + 比特数）。
   3. 换字：比特串前面加一个 1，当成一个大数写成 N 进制，每一位对应一个花字（N = 花字表的字数）。
      花字只用简繁写法相同的草木字，经过繁简转换也能解开；正文之间夹的空格、换行、标点都会被忽略。
   数据（字频、二元表、花字表）在 huayu-data.json，build.mjs 生成发布版时填进下面的 HUAYU_DATA。
   注意：huayu-data.json 和本文件的算法、参数（P、LEN_W、ESC_RANGES…）一起决定了花语的写法，
   改了任何一处，以前写的花语就解不开了。要升级请用新的版本号（头部的版本位），并保留旧版的解法。
   ============================================================================= */
(() => {
  const DATA = /*@@HUAYU_DATA@@*/ null;

  const PREFIX = "听花语：";
  const MAX_CHARS = 20000;   // 编码能力的上限（首页和管理页各自还有更小的输入上限）
  const HEAD_BITS = 2, TAG_BITS = 16;

  /* 模型参数（频率总和都控制在 2^21 以内，算术编码全程是精确整数） */
  const P = {
    hanTotal: 1 << 19, hanBeta: 1 << 11,     // 汉字先验总频率 / 出现过的字每次加多少
    kanaTotal: 1 << 16, kanaBeta: 1 << 10,
    smallTotal: 1 << 12, smallBeta: 1 << 7,  // 字母、数字、标点等小字表
    clsInit: 24, clsInc: 1,                  // 字类转移的先验强度 / 每次加多少
    escNew: 2, escInc: 2,                    // 字表之外的字
    ctx2Max: 1 << 15, ctx1Max: 1 << 9,       // 动态计数超过就减半
    biTotal: 1 << 14, dynW: 1 << 10,         // 一阶：静态表总频率 / 本条消息里的计数权重
  };

  /* ---------------------------------------------------------------------------
     算术编码：32 位整数区间，逐比特输出
     --------------------------------------------------------------------------- */
  const TOP = 4294967296, HALF = 2147483648, Q1 = 1073741824, Q3 = 3221225472;

  class Encoder {
    constructor() { this.lo = 0; this.hi = TOP - 1; this.pending = 0; this.bits = []; this.enc = true; }
    put(cl, ch, total) {
      const r = this.hi - this.lo + 1;
      this.hi = this.lo + Math.floor((r * ch) / total) - 1;
      this.lo = this.lo + Math.floor((r * cl) / total);
      for (;;) {
        if (this.hi < HALF) this.emit(0);
        else if (this.lo >= HALF) { this.emit(1); this.lo -= HALF; this.hi -= HALF; }
        else if (this.lo >= Q1 && this.hi < Q3) { this.pending++; this.lo -= Q1; this.hi -= Q1; }
        else break;
        this.lo *= 2; this.hi = this.hi * 2 + 1;
      }
    }
    emit(b) {
      this.bits.push(b);
      for (; this.pending > 0; this.pending--) this.bits.push(1 - b);
    }
    finish() {
      this.pending++;
      this.emit(this.lo < Q1 ? 0 : 1);
      const bits = this.bits;
      let n = bits.length;
      while (n > 0 && bits[n - 1] === 0) n--;   // 解码时缺的位按 0 补，末尾的 0 不用写
      bits.length = n;
      return bits;
    }
  }

  class Decoder {
    constructor(bits) {
      this.bits = bits; this.pos = 0; this.lo = 0; this.hi = TOP - 1; this.val = 0; this.enc = false;
      for (let i = 0; i < 32; i++) this.val = this.val * 2 + this.next();
    }
    next() {
      const p = this.pos++;
      if (p < this.bits.length) return this.bits[p];
      if (p > this.bits.length + 64) throw new Error("broken");
      return 0;
    }
    get(total) {
      const r = this.hi - this.lo + 1;
      return Math.floor(((this.val - this.lo + 1) * total - 1) / r);
    }
    put(cl, ch, total) {
      const r = this.hi - this.lo + 1;
      this.hi = this.lo + Math.floor((r * ch) / total) - 1;
      this.lo = this.lo + Math.floor((r * cl) / total);
      for (;;) {
        if (this.hi < HALF) { /* 高位是 0，什么都不用减 */ }
        else if (this.lo >= HALF) { this.lo -= HALF; this.hi -= HALF; this.val -= HALF; }
        else if (this.lo >= Q1 && this.hi < Q3) { this.lo -= Q1; this.hi -= Q1; this.val -= Q1; }
        else break;
        this.lo *= 2; this.hi = this.hi * 2 + 1; this.val = this.val * 2 + this.next();
      }
    }
  }

  /* 按频率数组编 / 解一个下标（编码时传 idx；解码时忽略 idx，返回解出的下标） */
  function codeIndex(c, fs, idx) {
    let total = 0;
    for (let i = 0; i < fs.length; i++) total += fs[i];
    if (c.enc) {
      let lo = 0;
      for (let i = 0; i < idx; i++) lo += fs[i];
      c.put(lo, lo + fs[idx], total);
      return idx;
    }
    const t = c.get(total);
    let lo = 0, i = 0;
    while (lo + fs[i] <= t) { lo += fs[i]; i++; }
    c.put(lo, lo + fs[i], total);
    return i;
  }

  function codeUniform(c, n, v) {
    if (n <= 1) return 0;
    if (!c.enc) v = c.get(n);
    c.put(v, v + 1, n);
    return v;
  }

  /* ---------------------------------------------------------------------------
     大字表（汉字、假名）：树状数组存累计频率
     --------------------------------------------------------------------------- */
  class Fenwick {
    constructor(freqs) {
      const n = freqs.length;
      this.n = n;
      this.t = new Float64Array(n + 1);
      for (let i = 0; i < n; i++) this.t[i + 1] = freqs[i];
      for (let i = 1; i <= n; i++) {
        const j = i + (i & -i);
        if (j <= n) this.t[j] += this.t[i];
      }
      this.top = 1;
      while (this.top * 2 <= n) this.top *= 2;
    }
    add(i, d) { for (i++; i <= this.n; i += i & -i) this.t[i] += d; }
    prefix(i) { let s = 0; for (; i > 0; i -= i & -i) s += this.t[i]; return s; }
  }

  /* 一类字：静态先验频率 + 本条消息里出现过的字加权（加权总和超过先验总和时减半） */
  class SymClass {
    constructor(def, beta) {
      this.cps = def.cps;
      this.f = Float64Array.from(def.freqs);
      this.fw = new Fenwick(def.freqs);
      this.total = def.total;
      this.beta = beta;
      this.boost = new Map();
      this.boostSum = 0;
    }
    bump(i) {
      this.f[i] += this.beta; this.fw.add(i, this.beta); this.total += this.beta;
      this.boost.set(i, (this.boost.get(i) || 0) + this.beta);
      this.boostSum += this.beta;
      if (this.boostSum <= this.total - this.boostSum) return;
      this.boostSum = 0;
      for (const [j, b] of this.boost) {
        const nb = Math.floor(b / 2), d = nb - b;
        this.f[j] += d; this.fw.add(j, d); this.total += d;
        if (nb) { this.boost.set(j, nb); this.boostSum += nb; } else this.boost.delete(j);
      }
    }
    /* 编 / 解一个下标；ex = 要排除的下标（互不重复），只在累计值里扣掉，不动树 */
    code(c, idx, ex) {
      const f = this.f;
      let exTot = 0;
      for (let k = 0; k < ex.length; k++) exTot += f[ex[k]];
      const total = this.total - exTot;
      if (c.enc) {
        let lo = this.fw.prefix(idx);
        for (let k = 0; k < ex.length; k++) if (ex[k] < idx) lo -= f[ex[k]];
        c.put(lo, lo + f[idx], total);
        return idx;
      }
      const t = c.get(total);
      const sorted = ex.length > 1 ? Array.from(ex).sort((a, b) => a - b) : ex;
      const cum = new Float64Array(sorted.length + 1);
      for (let k = 0; k < sorted.length; k++) cum[k + 1] = cum[k] + f[sorted[k]];
      const below = (pos) => {   // 下标 < pos 的排除字的频率和
        let lo = 0, hi = sorted.length;
        while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < pos) lo = m + 1; else hi = m; }
        return cum[lo];
      };
      const tree = this.fw.t, n = this.fw.n;
      let pos = 0, acc = 0;
      for (let step = this.fw.top; step > 0; step >>= 1) {
        const nx = pos + step;
        if (nx <= n && acc + tree[nx] - below(nx) <= t) { pos = nx; acc += tree[nx]; }
      }
      const lo = acc - below(pos);
      c.put(lo, lo + f[pos], total);
      return pos;
    }
  }

  /* ---------------------------------------------------------------------------
     字表：第一次用到时建好，之后一直复用
     --------------------------------------------------------------------------- */
  const HAN = 0, KANA = 1, LOW = 2, UP = 3, DIG = 4, SPC = 5, PUN = 6, EMO = 7, ESC = 8, NCLS = 9, START = 9;
  const BI_START = 2;   // 静态二元表里代表「消息开头」的上下文

  const cpsOf = (s) => Array.from(s, (ch) => ch.codePointAt(0));

  /* 频段表 → 频率：bk = [起始档, 各档字数…]，第 b 档的概率 ∝ 2^(-b/8) */
  function bucketFreqs(n, bk, total) {
    const p = [];
    let b = bk[0];
    for (let k = 1; k < bk.length; k++, b++) for (let j = 0; j < bk[k]; j++) p.push(Math.pow(2, -b / 8));
    while (p.length < n) p.push(p[p.length - 1]);
    const sum = p.reduce((a, x) => a + x, 0);
    return p.slice(0, n).map((x) => Math.max(1, Math.round((x / sum) * total)));
  }
  function weightFreqs(ws, total) {
    const sum = ws.reduce((a, x) => a + x, 0);
    return ws.map((x) => Math.max(1, Math.round((x / sum) * total)));
  }

  let TABLES = null;
  function tables() {
    if (TABLES) return TABLES;
    const defs = [];
    const han = cpsOf(DATA.han), kana = cpsOf(DATA.kana);
    defs[HAN] = { cps: han, freqs: bucketFreqs(han.length, DATA.hanB, P.hanTotal), beta: P.hanBeta };
    defs[KANA] = { cps: kana, freqs: bucketFreqs(kana.length, DATA.kanaB, P.kanaTotal), beta: P.kanaBeta };
    for (const [cls, key] of [[LOW, "low"], [UP, "up"], [DIG, "dig"], [SPC, "spc"], [PUN, "pun"], [EMO, "emo"]]) {
      const [chars, ws] = DATA[key];
      defs[cls] = { cps: cpsOf(chars), freqs: weightFreqs(ws, P.smallTotal), beta: P.smallBeta };
    }
    for (const d of defs) d.total = d.freqs.reduce((a, x) => a + x, 0);
    /* 字 → [类, 类内下标] */
    const where = new Map();
    defs.forEach((d, cls) => d.cps.forEach((cp, i) => { if (!where.has(cp)) where.set(cp, [cls, i]); }));

    /* 静态二元表：每段 = 前一个字 + 逃逸档位 + 若干组（档位标记 U+E000+档，后继字…），段之间用 U+E100 分隔 */
    const bi = new Map();
    const res = DATA.biRes;
    for (const block of DATA.bi.split("")) {
      const it = cpsOf(block);
      const escP = Math.pow(2, -(it[1] - 0xe000) / res);
      const cps = [], ps = [];
      let p = 0, sum = 0;
      for (let i = 2; i < it.length; i++) {
        const v = it[i];
        if (v >= 0xe000 && v <= 0xe0ff) { p = Math.pow(2, -(v - 0xe000) / res); continue; }
        cps.push(v); ps.push(p); sum += p;
      }
      const n = cps.length, k = (1 - escP) / sum;
      const f = new Float64Array(n), cum = new Float64Array(n + 1);
      const idx = new Map();
      const byCls = new Array(NCLS).fill(null);
      for (let i = 0; i < n; i++) {
        f[i] = Math.max(1, Math.round(ps[i] * k * P.biTotal));
        cum[i + 1] = cum[i] + f[i];
        idx.set(cps[i], i);
        const w = where.get(cps[i]);
        if (w) (byCls[w[0]] || (byCls[w[0]] = [])).push(w[1]);
      }
      const esc = Math.max(1, Math.round(escP * P.biTotal));
      bi.set(it[0], { cps, f, cum, idx, byCls, esc, total: cum[n] + esc });
    }
    const alpha = Array.from(DATA.alpha);
    TABLES = { defs, where, bi, alpha, alphaIdx: new Map(alpha.map((ch, i) => [ch, i])) };
    return TABLES;
  }

  /* 字表之外的字：先选区段，再编段内偏移 */
  const ESC_RANGES = [
    [0x4e00, 0x9fff], [0x3400, 0x4dbf], [0x1f000, 0x1faff], [0xac00, 0xd7a3],
    [0x20000, 0x3ffff], [0x0000, 0xffff], [0x0000, 0x10ffff],
  ];
  const ESC_RANGE_W = [8, 3, 6, 3, 2, 4, 1];

  /* ---------------------------------------------------------------------------
     模型：编码和解码走同一套代码（编码器 c.enc = true 时传入字，解码时传 0、返回解出的字）
     --------------------------------------------------------------------------- */
  class Model {
    constructor() {
      const T = tables();
      this.where = T.where;
      this.bi = T.bi;
      this.cls = T.defs.map((d) => new SymClass(d, d.beta));
      this.trans = DATA.trans.map((row) => weightFreqs(row, P.clsInit * NCLS));
      this.escList = []; this.escCnt = [];
      this.escRangeCnt = ESC_RANGE_W.slice();
      this.ctx1 = new Map();
      this.ctx2 = new Map();
      this.h1 = -1; this.h2 = -1;
      this.prevCls = START;
      /* 排除集：高阶上下文里已经确定「不是它」的字，低阶不再给它们留概率。
         exSt = 整张静态后继表都排除（不必逐字放进集合） */
      this.exSet = new Set();
      this.exSt = null;
      this.tmpS = []; this.tmpF = []; this.tmpI = [];
    }

    classOf(cp) { return this.where.get(cp) || [ESC, -1]; }
    isEx(cp) { return this.exSet.has(cp) || (this.exSt !== null && this.exSt.idx.has(cp)); }

    /* 二阶（纯动态）；逃逸返回 -1 */
    codeCtx2(c, ctx, cp) {
      if (!ctx) return -1;
      const syms = this.tmpS, fs = this.tmpF;
      syms.length = 0; fs.length = 0;
      for (let i = 0; i < ctx.cps.length; i++) { syms.push(ctx.cps[i]); fs.push(2 * ctx.cnt[i] - 1); }
      fs.push(syms.length);
      let idx = syms.length;
      if (c.enc) { const j = syms.indexOf(cp); if (j >= 0) idx = j; }
      idx = codeIndex(c, fs, idx);
      if (idx < syms.length) return syms[idx];
      for (const s of syms) this.exSet.add(s);
      return -1;
    }

    /* 一阶：静态二元表 + 本条消息里的计数 */
    codeCtx1(c, cp) {
      const st = this.bi.get(this.h1 < 0 ? BI_START : this.h1) || null;
      const dy = this.h1 >= 0 ? this.ctx1.get(this.h1) || null : null;
      if (!st && !dy) return -1;
      const ex = this.exSet;
      let touched = false;
      if (st && ex.size) for (const e of ex) if (st.idx.has(e)) { touched = true; break; }

      /* 最常见的情形：只有静态表、没有排除 —— 直接用预先算好的累计频率 */
      if (st && !dy && !touched) {
        const n = st.cps.length, total = st.total;
        if (c.enc) {
          const i = st.idx.get(cp);
          if (i !== undefined) { c.put(st.cum[i], st.cum[i + 1], total); return cp; }
          c.put(st.cum[n], total, total);
        } else {
          const t = c.get(total);
          if (t < st.cum[n]) {
            let lo = 0, hi = n - 1;
            while (lo < hi) { const m = (lo + hi + 1) >> 1; if (st.cum[m] <= t) lo = m; else hi = m - 1; }
            c.put(st.cum[lo], st.cum[lo + 1], total);
            return st.cps[lo];
          }
          c.put(st.cum[n], total, total);
        }
        this.exSt = st;
        return -1;
      }

      const syms = this.tmpS, fs = this.tmpF;
      syms.length = 0; fs.length = 0;
      let esc = 0;
      if (st) {
        esc += st.esc;
        for (let i = 0; i < st.cps.length; i++) {
          const x = st.cps[i];
          if (touched && ex.has(x)) continue;
          syms.push(x); fs.push(st.f[i]);
        }
      }
      const nStatic = syms.length;
      if (dy) {
        let k = 0;
        for (let i = 0; i < dy.cps.length; i++) {
          const x = dy.cps[i];
          if (ex.has(x)) continue;
          k++;
          const w = P.dynW * (2 * dy.cnt[i] - 1);
          const j = st && st.idx.has(x) ? syms.indexOf(x) : -1;
          if (j >= 0 && j < nStatic) fs[j] += w; else { syms.push(x); fs.push(w); }
        }
        esc += P.dynW * k;
      }
      if (!syms.length) return -1;
      fs.push(Math.max(1, esc));
      let idx = syms.length;
      if (c.enc) { const j = syms.indexOf(cp); if (j >= 0) idx = j; }
      idx = codeIndex(c, fs, idx);
      if (idx < syms.length) return syms[idx];
      if (st) this.exSt = st;
      for (let i = nStatic; i < syms.length; i++) ex.add(syms[i]);
      return -1;
    }

    /* 零阶：先编字类，再在类里编字（排除高阶已经排除的字） */
    codeBase(c, cp) {
      let cls = -1, idx = -1;
      if (c.enc) [cls, idx] = this.classOf(cp);
      cls = codeIndex(c, this.trans[this.prevCls], cls);
      if (cls === ESC) return this.codeEsc(c, cp);
      const sc = this.cls[cls];
      const exIdx = this.tmpI;
      exIdx.length = 0;
      const st = this.exSt;
      if (st && st.byCls[cls]) for (const j of st.byCls[cls]) exIdx.push(j);
      for (const s of this.exSet) {
        if (st && st.idx.has(s)) continue;
        const w = this.where.get(s);
        if (w && w[0] === cls) exIdx.push(w[1]);
      }
      idx = sc.code(c, idx, exIdx);
      return sc.cps[idx];
    }

    /* 字表之外的字：本条消息里出现过的直接选，新的编区段 + 偏移 */
    codeEsc(c, cp) {
      const fs = [P.escNew], list = [];
      for (let i = 0; i < this.escList.length; i++) {
        if (this.isEx(this.escList[i])) continue;
        list.push(this.escList[i]); fs.push(this.escCnt[i]);
      }
      let idx = 0;
      if (c.enc) idx = list.indexOf(cp) + 1;
      idx = codeIndex(c, fs, idx);
      if (idx > 0) return list[idx - 1];
      let r = 0;
      if (c.enc) while (!(cp >= ESC_RANGES[r][0] && cp <= ESC_RANGES[r][1])) r++;
      r = codeIndex(c, this.escRangeCnt, r);
      this.escRangeCnt[r] += 2;
      const [a, b] = ESC_RANGES[r];
      const size = b - a + 1;
      let off = c.enc ? cp - a : 0;
      if (size > 1024) {
        const hi = codeUniform(c, Math.ceil(size / 1024), Math.floor(off / 1024));
        const lo = codeUniform(c, Math.min(1024, size - hi * 1024), off % 1024);
        off = hi * 1024 + lo;
      } else off = codeUniform(c, size, off);
      return a + off;
    }

    code(c, cp) {
      this.exSet.clear();
      this.exSt = null;
      const m2 = this.h2 >= 0 ? this.ctx2.get(this.h2) : undefined;
      let s = m2 ? this.codeCtx2(c, m2.get(this.h1), cp) : -1;
      if (s < 0) s = this.codeCtx1(c, cp);
      if (s < 0) s = this.codeBase(c, cp);
      this.update(s);
      return s;
    }

    update(s) {
      if (this.h2 >= 0) {
        let m2 = this.ctx2.get(this.h2);
        if (!m2) { m2 = new Map(); this.ctx2.set(this.h2, m2); }
        this.bumpCtx(m2, this.h1, s, P.ctx2Max);
      }
      if (this.h1 >= 0) this.bumpCtx(this.ctx1, this.h1, s, P.ctx1Max);
      const [cls, idx] = this.classOf(s);
      if (cls === ESC) {
        const i = this.escList.indexOf(s);
        if (i < 0) { this.escList.push(s); this.escCnt.push(P.escInc); } else this.escCnt[i] += P.escInc;
      } else this.cls[cls].bump(idx);
      this.trans[this.prevCls][cls] += P.clsInc;
      this.prevCls = cls;
      this.h2 = this.h1; this.h1 = s;
    }

    bumpCtx(map, key, s, max) {
      let ctx = map.get(key);
      if (!ctx) { ctx = { cps: [], cnt: [], n: 0 }; map.set(key, ctx); }
      const i = ctx.cps.indexOf(s);
      if (i < 0) { ctx.cps.push(s); ctx.cnt.push(1); } else ctx.cnt[i]++;
      if (++ctx.n > max) {
        ctx.n = 0;
        for (let j = 0; j < ctx.cnt.length; j++) { ctx.cnt[j] = Math.ceil(ctx.cnt[j] / 2); ctx.n += ctx.cnt[j]; }
      }
    }
  }

  /* 字数：先编二进制位数（常见长度给得多），再编其余位 */
  const LEN_W = [1, 3, 5, 8, 12, 14, 14, 12, 9, 6, 4, 2, 1, 1, 1, 1, 1];
  function codeLength(c, n) {
    let k = c.enc ? (n ? 32 - Math.clz32(n) : 0) : 0;
    k = codeIndex(c, LEN_W, k);
    if (k <= 1) return k;
    const base = 1 << (k - 1);
    return base + codeUniform(c, base, c.enc ? n - base : 0);
  }

  /* ---------------------------------------------------------------------------
     比特 ⇄ 字节（base64，和 Worker 之间传这个）
     --------------------------------------------------------------------------- */
  function bitsToB64(bits, from = 0) {
    const n = bits.length - from;
    const bytes = new Uint8Array(Math.ceil(n / 8));
    for (let i = 0; i < n; i++) if (bits[from + i]) bytes[i >> 3] |= 128 >> (i & 7);
    let s = "";
    for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(s);
  }
  function b64ToBits(b64, n) {
    const s = atob(b64);
    if (s.length !== Math.ceil(n / 8)) throw new Error("broken");
    const bits = new Array(n);
    for (let i = 0; i < n; i++) bits[i] = (s.charCodeAt(i >> 3) >> (7 - (i & 7))) & 1;
    return bits;
  }
  const readBits = (bits, from, n) => { let v = 0; for (let i = 0; i < n; i++) v = v * 2 + bits[from + i]; return v; };
  const pushBits = (bits, v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >> i) & 1); };

  /* ---------------------------------------------------------------------------
     比特 ⇄ 花字：前面加一个 1 当哨兵（保住开头的 0），整串当成大数写成 N 进制，每次除 N^5
     --------------------------------------------------------------------------- */
  function bitsToFlowers(bits) {
    const { alpha } = tables();
    const N = alpha.length, CH = BigInt(N) ** 5n;
    let s = "1" + bits.join("");
    s = "0".repeat((4 - (s.length % 4)) % 4) + s;
    let hex = "";
    for (let i = 0; i < s.length; i += 4) hex += parseInt(s.substr(i, 4), 2).toString(16);
    let v = BigInt("0x" + hex);
    const ds = [];
    while (v > 0n) {
      let r = Number(v % CH);
      v /= CH;
      for (let j = 0; j < 5; j++) { ds.push(r % N); r = Math.floor(r / N); }
    }
    while (ds.length && ds[ds.length - 1] === 0) ds.pop();
    let out = "";
    for (let i = ds.length - 1; i >= 0; i--) out += alpha[ds[i]];
    return out;
  }

  function flowersToBits(body) {
    const { alpha, alphaIdx } = tables();
    const N = alpha.length, CH = BigInt(N) ** 5n;
    const ds = Array.from(body, (ch) => alphaIdx.get(ch));
    let i = 0, r = 0;
    for (; i < ds.length % 5; i++) r = r * N + ds[i];
    let v = BigInt(r);
    for (; i < ds.length; i += 5) {
      r = 0;
      for (let j = 0; j < 5; j++) r = r * N + ds[i + j];
      v = v * CH + BigInt(r);
    }
    const b = v.toString(2);
    if (b[0] !== "1") return null;
    const bits = new Array(b.length - 1);
    for (let k = 1; k < b.length; k++) bits[k - 1] = b.charCodeAt(k) - 48;
    return bits;
  }

  /* 从一段文字里找出花语正文：有「听花语」就从它后面开始；
     花字之间的空白、标点、换行、表情一律跳过，遇到别的文字（字母、数字、非花字的汉字）就停 */
  function extractBody(input) {
    const { alphaIdx } = tables();
    let s = String(input || "");
    const at = s.lastIndexOf("听花语");
    if (at >= 0) s = s.slice(at + 2);
    let body = "";
    for (const ch of s) {
      if (alphaIdx.has(ch)) { body += ch; continue; }
      if (body && /[\p{L}\p{N}]/u.test(ch)) break;
    }
    return body;
  }

  /* ---------------------------------------------------------------------------
     对外接口
     --------------------------------------------------------------------------- */
  const countChars = (text) => cpsOf(String(text || "")).length;

  /* 明文 → { data, n }（压缩后的比特，交给 Worker 加密） */
  function compress(text) {
    const cps = cpsOf(String(text || ""));
    if (!cps.length) throw new Error("empty");
    if (cps.length > MAX_CHARS) throw new Error("too_long");
    const c = new Encoder();
    codeLength(c, cps.length);
    const m = new Model();
    for (const cp of cps) m.code(c, cp);
    const bits = c.finish();
    return { data: bitsToB64(bits), n: bits.length };
  }

  /* { data, n }（Worker 解密后的比特）→ 明文 */
  function decompress({ data, n }) {
    const c = new Decoder(b64ToBits(data, n));
    const len = codeLength(c, 0);
    if (!len || len > MAX_CHARS) throw new Error("broken");
    const m = new Model();
    const out = new Array(len);
    for (let i = 0; i < len; i++) out[i] = m.code(c, 0);
    let s = "";
    for (let i = 0; i < len; i += 4096) s += String.fromCodePoint(...out.slice(i, i + 4096));
    return s;
  }

  /* Worker 加密的结果 { head, tag, data, n } → 「听花语：」+ 花字 */
  function toFlowers({ head, tag, data, n }) {
    const bits = [];
    pushBits(bits, head, HEAD_BITS);
    pushBits(bits, tag, TAG_BITS);
    for (const b of b64ToBits(data, n)) bits.push(b);
    return PREFIX + bitsToFlowers(bits);
  }

  /* 花语 → { ok, head, tag, data, n, kind }，交给 Worker 解密；
     不是花语 / 残缺 / 以后的新版本分别返回 error: not_huayu / broken / version */
  function fromFlowers(input) {
    const body = extractBody(input);
    if (!body) return { ok: false, error: "not_huayu" };
    const bits = flowersToBits(body);
    if (!bits || bits.length <= HEAD_BITS + TAG_BITS) return { ok: false, error: "broken" };
    const head = readBits(bits, 0, HEAD_BITS);
    if (head >> 1) return { ok: false, error: "version" };
    const from = HEAD_BITS + TAG_BITS;
    return {
      ok: true, head, kind: head & 1,
      tag: readBits(bits, HEAD_BITS, TAG_BITS),
      data: bitsToB64(bits, from), n: bits.length - from,
    };
  }

  /* 看起来像不像花语（输入框自动判断加密还是解密用） */
  function looksLike(input) {
    const s = String(input || "");
    if (s.includes("听花语")) return true;
    const body = extractBody(s);
    const letters = (s.match(/[\p{L}\p{N}]/gu) || []).length;
    return body.length >= 4 && body.length >= letters * 0.9;
  }

  window.HJHuayu = { PREFIX, MAX_CHARS, countChars, compress, decompress, toFlowers, fromFlowers, looksLike, extractBody };
})();
