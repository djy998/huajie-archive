/* 花语自测（需要 Node.js 18+）：在 _src 目录运行  node huayu/selftest.mjs
   只测网页这一侧（压缩、一代换字、二代组句、版本识别）；加密用一个「原样返回」的假 Worker 代替。
   全部通过时最后一行打印「全部通过」，有问题时打印出错的样例并以非 0 退出。 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const PARTS = ["util.js", "zi.js", "v1.js", "v2-lexicon.js", "v2-compress.js", "v2-sentence.js", "v2.js"];

async function load() {
  let code = "";
  for (const f of PARTS) code += (await readFile(join(DIR, f), "utf8")) + "\n";
  const data = JSON.stringify(JSON.parse(await readFile(join(DIR, "zi-data.json"), "utf8")));
  code = code.replace("/*@@ZI_DATA@@*/ null", () => data);
  code += await readFile(join(DIR, "..", "huayu.js"), "utf8");
  globalThis.window = globalThis;
  return new Function(`${code}
    return { U: HJHuayuUtil, Zi: HJHuayuZi, V1: HJHuayuV1, LX: HJHuayuV2Lexicon, C: HJHuayuV2Compress,
             S: HJHuayuV2Sentence, V2: HJHuayuV2, H: window.HJHuayu };`)();
}

let failed = 0, checks = 0;
function check(ok, what, detail) {
  checks++;
  if (ok) return;
  failed++;
  console.log("✗", what, detail === undefined ? "" : JSON.stringify(detail).slice(0, 300));
}

let seed = 20260930;
const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
const pick = (s) => { const a = Array.from(s); return a[Math.floor(rnd() * a.length)]; };
const randomBits = (n) => Array.from({ length: n }, () => (rnd() < 0.5 ? 0 : 1));
function randomText(len) {
  let s = "";
  for (let i = 0; i < len; i++) {
    const r = rnd();
    if (r < 0.45) s += String.fromCodePoint(0x4e00 + Math.floor(rnd() * 20992));
    else if (r < 0.7) s += String.fromCodePoint(0x20 + Math.floor(rnd() * 95));
    else if (r < 0.8) s += pick("，。！？、：；“”（）…—～\n\t 　");
    else if (r < 0.88) s += String.fromCodePoint(0x1f300 + Math.floor(rnd() * 700));
    else if (r < 0.95) s += String.fromCodePoint(0x3040 + Math.floor(rnd() * 190));
    else s += String.fromCodePoint(Math.floor(rnd() * 0x10ffff));
  }
  return s;
}

/* 原样返回的假 Worker：头部照 Worker 的规则拼，校验固定，数据不加密 */
const fakePost = async (b) => {
  if (b.action === "huayu_seal") {
    const kind = b.key ? 1 : 0;
    const head = b.v === 1 ? kind : (kind << 3) | (b.method << 1);
    return { ok: true, v: b.v, head, tag: 0xbeef, data: b.data, n: b.n };
  }
  if (b.action === "huayu_open") return b.tag === 0xbeef ? { ok: true, data: b.data, n: b.n, old: false } : { ok: false, error: "bad_key" };
  return null;
};

const M = await load();
const { U, Zi, V1, LX, C, S, V2, H } = M;

/* 1. 字模型压缩 */
const samples = [
  "今晚八点在梦羽宝境花街见！", "Hello, world! 12345", "こんにちは、花街へようこそ。", "😂😂😂 好耶👍🏻",
  "𠀀𪚥 한국어 테스트 \u0000 \ud800", "a", "\n\n\t", "哈".repeat(3000), randomText(500),
];
for (const s of samples) check(Zi.decompress(Zi.compress(s)) === s, "字模型往返", s.slice(0, 30));

/* 2. 一代：固定样例的花字不能变（变了说明一代被改坏了） */
const GOLDEN = [
  ["今晚八点在梦羽宝境花街见！", 0, 12345, "听花语：菊霖禾菏林茹萱昕篦茫昕橘樊葆笏椽杓璨"],
  ["Hello 花街 🌸", 1, 999, "听花语：艾蔬柔楫琪琅秧暄稔柘萁榧茺"],
];
for (const [text, head, tag, want] of GOLDEN) {
  const p = V1.pack(text);
  const got = V1.toText({ head, tag, ...p });
  check(got === want, "一代固定样例", { text, got, want });
}
for (let i = 0; i < 300; i++) {
  const text = randomText(1 + Math.floor(rnd() * 120));
  const p = V1.pack(text);
  const t = V1.toText({ head: i & 1, tag: i * 97 & 0xffff, ...p });
  const q = V1.parse("看看这个 " + t.replace(/(.{6})/gu, "$1，\n") + " 好的");
  check(q.ok && q.head === (i & 1) && q.tag === (i * 97 & 0xffff) && V1.unpack(q) === text, "一代往返", text);
}

/* 3. 二代词库：同类词字数相同、没有重复、没有断句标点；句式之间不会撞车 */
for (const [k, list] of Object.entries(LX.WORDS)) {
  const lens = new Set(list.map((w) => Array.from(w).length));
  check(lens.size === 1, "同类词字数相同", k);
  check(new Set(list).size === list.length, "同类词不重复", k);
  check(!list.some((w) => /[。！？，、；：\s]/.test(w)), "词里没有标点", k);
}
const g = S.grammar();
for (const tp of g.templates) check(/^[^。！？]*[。！？]$/.test(tp.text), "句号只在句尾", tp.text);
{
  const sets = g.templates.map((tp) => {
    const out = [];
    for (const tk of tp.tokens) {
      if (tk.lit) for (const ch of tk.lit) out.push(new Set([ch]));
      else for (let i = 0; i < tk.cat.len; i++) out.push(new Set(tk.cat.list.map((w) => Array.from(w)[i])));
    }
    return out;
  });
  for (let i = 0; i < g.templates.length; i++) for (let j = i + 1; j < g.templates.length; j++) {
    if (g.templates[i].len !== g.templates[j].len) continue;
    const clash = sets[i].every((a, p) => [...a].some((c) => sets[j][p].has(c)));
    check(!clash, "句式可能撞车", [g.templates[i].text, g.templates[j].text]);
  }
}

/* 4. 二代组句：随机比特串 → 散文 → 比特串，一位不差；加空白、换半角标点、前后多话也能读回 */
for (let i = 0; i < 600; i++) {
  const n = i < 20 ? i : Math.floor(rnd() * (i % 50 === 0 ? 20000 : 600));
  const bits = randomBits(n);
  const text = S.encode(bits);
  const back = S.decode(text);
  check(back && back.join("") === bits.join(""), "组句往返", { n });
  if (i % 3 === 0) {
    const messy = "朋友发来：" + text.replace(/，/g, ", ").replace(/。/g, ".\n ") + "\n（转发）";
    const back2 = S.decode(messy);
    check(back2 && back2.join("") === bits.join(""), "组句容错", { n, messy: messy.slice(0, 80) });
  }
}

/* 5. 二代压缩：各种内容都要原样还原 */
const kinds = {
  "空": "", "一个字": "花", "短中文": "今晚八点在梦羽宝境花街见！", "英文": "The quick brown fox jumps over the lazy dog.",
  "数字": "20260930 1234567890 3.1415926", "标点": "，。！？、；：“”‘’（）《》【】…—～·!@#$%^&*()_+-=[]{}|;':\",./<>?",
  "表情": "🌸🌕😂👍🏻👨‍👩‍👧‍👦❤️", "特殊字符": "\u0000\u0001​﻿퟿￿𝄞\u{10ffff}",
  "落单代理项": "a\ud800b\udc00c", "重复字": "哈".repeat(500), "大段重复": "花舞之街·薰风花语町欢迎你！".repeat(400),
  "中等": "花舞之街是《最终幻想14》2021年3月由热心玩家在冒险者住宅区建成的街区。".repeat(3), "随机": randomText(3000),
  "超长": randomText(19000),
};
for (const [name, text] of Object.entries(kinds)) {
  if (!text) {
    let err = "";
    try { await C.pack(text); } catch (e) { err = e.message; }
    check(err === "empty", "空文本应报 empty", err);
    continue;
  }
  const { method, bits } = await C.pack(text);
  check((await C.unpack(method, bits)) === text, "二代压缩往返：" + name, { method });
}

/* 6. 整条路（假 Worker）：一代、二代加密解密，自动识别版本，自定义密钥要填 */
for (const [name, text] of Object.entries(kinds)) {
  if (!text) continue;
  for (const algo of [1, 2]) {
    const enc = await H.encrypt(text, { algo, post: fakePost });
    check(enc.ok, `加密 ${name} V${algo}`, enc);
    if (!enc.ok) continue;
    const det = H.detect(enc.text);
    check(det.ok && det.algo === algo, `识别版本 ${name} V${algo}`, det);
    const dec = await H.decrypt(enc.text, { post: fakePost });
    check(dec.ok && dec.text === text && dec.algo === algo, `解密 ${name} V${algo}`, dec.ok ? dec.algo : dec);
  }
}
for (const algo of [1, 2]) {
  const enc = await H.encrypt("寻宝线索：北口", { algo, post: fakePost, key: "月见草" });
  const need = await H.decrypt(enc.text, { post: fakePost });
  check(need.error === "need_key" && need.kind === 1, `自定义密钥要填 V${algo}`, need);
  const dec = await H.decrypt(enc.text, { post: fakePost, key: "月见草" });
  check(dec.ok && dec.text === "寻宝线索：北口", `自定义密钥解密 V${algo}`, dec);
}
check(H.detect("这不是花语。随便说点什么！").error === "not_huayu", "普通文字不是花语");

console.log(`共检查 ${checks} 处：` + (failed ? `有 ${failed} 处没通过` : "全部通过"));
process.exit(failed ? 1 : 0);
