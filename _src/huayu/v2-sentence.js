/* =============================================================================
   花语 · 二代（V2）组句：比特串 ⇄ 一句句花的散文
   -----------------------------------------------------------------------------
   比特串前面加一个 1 当成一个大数 v，按「混合进制」一位一位取出来：
     先取句式编号（除以句式总数），再按句式里空位的顺序取每个空位的词号（除以该类词的个数），
     一句写完 v 还没取完就接着写下一句，v 取到 0 为止。读回时按相反顺序乘回去，得到原来的 v。
   · 每句的句式号、词号都按句子序号 / 空位序号转一个固定的偏移，免得收尾那几句总是同样的开头词；
   · 同一类别的词字数相同，句式里空位的位置是固定的，所以按句号、问号、叹号断句后，
     每句话只能对上唯一一个句式、唯一一组词（lex-check 已验证句式之间不会撞车）；
   · 读回前先把空白去掉、半角标点换成全角、繁体字换回简体（只换词库里用到的字），
     第一句前面多出来的话（例如「朋友发来：」）和最后一句后面多出来的话都会被忽略。
   ============================================================================= */
const HJHuayuV2Sentence = (() => {
  const U = HJHuayuUtil;
  const LX = HJHuayuV2Lexicon;
  const PER_PARAGRAPH = 4;   // 每 4 句换一行
  const ROT_S = 131, ROT_J = 37;

  let G = null;
  function grammar() {
    if (G) return G;
    const cats = {};
    for (const [name, list] of Object.entries(LX.WORDS)) {
      cats[name] = { name, list, radix: list.length, big: BigInt(list.length), len: Array.from(list[0]).length,
        index: new Map(list.map((w, i) => [w, i])) };
    }
    /* {F} 依次展开成 {F2}、{F3}（顺序固定，句式编号就是展开后的下标） */
    const expanded = [];
    for (const t of LX.TEMPLATES) {
      let variants = [t];
      while (variants.some((v) => v.includes("{F}"))) {
        variants = variants.flatMap((v) => (v.includes("{F}") ? [v.replace("{F}", "{F2}"), v.replace("{F}", "{F3}")] : [v]));
      }
      expanded.push(...variants);
    }
    const templates = expanded.map((t) => {
      const tokens = t.split(/(\{[A-Z0-9]+\})/).filter(Boolean)
        .map((p) => (p[0] === "{" ? { cat: cats[p.slice(1, -1)] } : { lit: p, len: Array.from(p).length }));
      let len = 0, prod = 1n;
      for (const tk of tokens) {
        if (tk.cat) { len += tk.cat.len; prod *= tk.cat.big; } else len += tk.len;
      }
      return { text: t, tokens, len, prod, slots: tokens.filter((tk) => tk.cat).map((tk) => tk.cat) };
    });
    const byLen = new Map();
    templates.forEach((tp, i) => {
      if (!byLen.has(tp.len)) byLen.set(tp.len, []);
      byLen.get(tp.len).push(i);
    });
    const t2s = new Map();
    const pairs = Array.from(LX.T2S);
    for (let i = 0; i + 1 < pairs.length; i += 2) t2s.set(pairs[i], pairs[i + 1]);
    G = { cats, templates, count: templates.length, countBig: BigInt(templates.length), byLen,
      lens: [...byLen.keys()].sort((a, b) => b - a), t2s };
    return G;
  }

  /* 比特串 → 散文 */
  function encode(bits) {
    const g = grammar();
    let v = U.bitsToBig(bits);
    const sentences = [];
    for (let s = 0; v > 0n; s++) {
      const t0 = Number(v % g.countBig);
      v /= g.countBig;
      const tp = g.templates[(t0 + s * ROT_S) % g.count];
      let rem = v % tp.prod;
      v /= tp.prod;
      let out = "", j = 0;
      for (const tk of tp.tokens) {
        if (tk.lit) { out += tk.lit; continue; }
        const d = Number(rem % tk.cat.big);
        rem /= tk.cat.big;
        out += tk.cat.list[(d + s * ROT_S + j * ROT_J) % tk.cat.radix];
        j++;
      }
      sentences.push(out);
    }
    let text = "";
    sentences.forEach((x, i) => { text += (i && i % PER_PARAGRAPH === 0 ? "\n" : "") + x; });
    return text;
  }

  /* 读回前的整理：去空白、半角标点换全角、繁体换简体 */
  const HALF = { ",": "，", ";": "；", ":": "：", "!": "！", "?": "？", ".": "。" };
  function normalize(input) {
    const g = grammar();
    let s = "";
    for (const ch of String(input || "").replace(/[\s​-‍⁠﻿]/g, "")) {
      s += HALF[ch] || g.t2s.get(ch) || ch;
    }
    return s;
  }

  /* 一句话 → { t, digits }；对不上返回 null */
  function matchAt(str, t) {
    const g = grammar();
    const tp = g.templates[t];
    const chars = Array.from(str);
    let pos = 0;
    const idx = [];
    for (const tk of tp.tokens) {
      if (tk.lit) {
        if (chars.slice(pos, pos + tk.len).join("") !== tk.lit) return null;
        pos += tk.len;
      } else {
        const i = tk.cat.index.get(chars.slice(pos, pos + tk.cat.len).join(""));
        if (i === undefined) return null;
        idx.push(i);
        pos += tk.cat.len;
      }
    }
    return idx;
  }

  function matchSentence(str) {
    const g = grammar();
    const cands = g.byLen.get(Array.from(str).length);
    if (!cands) return null;
    for (const t of cands) {
      const idx = matchAt(str, t);
      if (idx) return { t, idx };
    }
    return null;
  }

  /* 第一句前面可能多出几个字：从长到短试句尾 */
  function matchTail(str) {
    const g = grammar();
    const chars = Array.from(str);
    for (const len of g.lens) {
      if (len >= chars.length) continue;
      const m = matchSentence(chars.slice(chars.length - len).join(""));
      if (m) return m;
    }
    return null;
  }

  /* 散文 → 比特串；不是二代花语返回 null */
  function decode(input) {
    const g = grammar();
    const parts = normalize(input).match(/[^。！？]*[。！？]/g) || [];
    const found = [];
    for (let i = 0; i < parts.length; i++) {
      let m = matchSentence(parts[i]);
      if (!m && i === 0) m = matchTail(parts[i]);
      if (!m) {
        if (found.length) break;   // 后面多出来的话不管
        return null;
      }
      found.push(m);
    }
    if (!found.length) return null;
    let v = 0n;
    for (let s = found.length - 1; s >= 0; s--) {
      const { t, idx } = found[s];
      const tp = g.templates[t];
      let rem = 0n;
      for (let j = tp.slots.length - 1; j >= 0; j--) {
        const cat = tp.slots[j];
        const d = (((idx[j] - s * ROT_S - j * ROT_J) % cat.radix) + cat.radix) % cat.radix;
        rem = rem * cat.big + BigInt(d);
      }
      const t0 = (((t - s * ROT_S) % g.count) + g.count) % g.count;
      v = (v * tp.prod + rem) * g.countBig + BigInt(t0);
    }
    return U.bigToBits(v);
  }

  return { encode, decode, normalize, grammar };
})();
