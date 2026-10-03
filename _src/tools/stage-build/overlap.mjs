/* 气泡重叠统计（开发用）：对每首每档、键盘 4/3/2 轨与手机点气泡，跑 bard-stage.js 的布局，数同时在场的气泡里
   中心距离 < 1 个气泡（重叠）的对数、以及挨得近（< 1.8 个气泡）却同色的对数。用法：node tools/stage-build/overlap.mjs */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..");
const require = createRequire(path.join(REPO, "_src", "package.json"));
const { JSDOM } = require("jsdom");
const SRC = readFileSync(path.join(REPO, "_src", "bard-stage.js"), "utf8");
const STAGE = path.join(REPO, "assets", "bard", "stage");
const SONGS = JSON.parse(readFileSync(path.join(STAGE, "songs.json"), "utf8"));
const only = process.argv[2];
const DIFF = { easy: 1.8, normal: 1.35, hard: 1.05 };

async function run(song, diff, mode) {
  const dom = new JSDOM("<!doctype html><body></body>", { pretendToBeVisual: true, runScripts: "dangerously", url: "https://x.test/" });
  const win = dom.window;
  const mem = new Map([["hj_stage_song", song.id], ["hj_stage_diff", diff], ["hj_stage_input", mode.input], ["hj_stage_lanes", mode.lanes]]);
  win.storage = { get: (k) => (mem.has(k) ? mem.get(k) : null), set: (k, v) => mem.set(k, String(v)), remove: (k) => mem.delete(k), json: () => null };
  win.showToast = () => {};
  win.HJBard = { unlock() {}, prepare() {}, instName: () => "piano", instruments: [], clock: () => ({ t: 1, lat: 0, running: false }), playMidi() {} };
  win.matchMedia = () => ({ matches: false });
  Object.defineProperty(win, "innerWidth", { value: mode.w, configurable: true });
  Object.defineProperty(win, "innerHeight", { value: mode.h, configurable: true });
  win.requestAnimationFrame = () => 0;
  win.fetch = async (u) => ({ ok: true, json: async () => (/songs\.json/.test(u) ? SONGS : JSON.parse(readFileSync(path.join(STAGE, "charts", `${song.id}.json`), "utf8"))) });
  win.eval(SRC);
  win.HJStage.open();
  await new Promise((r) => setTimeout(r, 1));
  win.document.getElementById("hjsGo").click();
  await new Promise((r) => setTimeout(r, 1));
  const st = win.HJStage.state;
  const ns = st.notes, size = st.g.size, W = DIFF[diff] + 0.35;
  let over = 0, close = 0, same = 0, worst = 9;
  for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length && ns[j].t - ns[i].t < W; j++) {
    const d = Math.hypot(ns[i].x - ns[j].x, ns[i].y - ns[j].y) / size;
    worst = Math.min(worst, d);
    if (d < 1) over++;
    if (d < 1.8) { close++; if (ns[i].c === ns[j].c) same++; }
  }
  let jack = 0, sameHand = 0, fast = 0;
  const lanesUsed = [0, 0, 0, 0];
  const L = st.lanes;
  const hand = (l) => (L === 3 ? (l === 1 ? -1 : l > 1 ? 1 : 0) : l < L / 2 ? 0 : 1);
  ns.forEach((n, i) => {
    if (L) lanesUsed[n.lane] += 1;
    const p = ns[i - 1];
    if (!L || !p || n.t - p.t >= 0.2) return;
    fast++;
    if (n.lane === p.lane) jack++;
    else if (hand(n.lane) >= 0 && hand(n.lane) === hand(p.lane)) sameHand++;
  });
  win.close();
  return { n: ns.length, over, close, same, worst, jack, sameHand, fast, lanesUsed };
}
const MODES = [
  { name: "键盘4", input: "keys", lanes: "4", w: 1280, h: 800 },
  { name: "键盘3", input: "keys", lanes: "3", w: 1000, h: 720 },
  { name: "键盘2", input: "keys", lanes: "2", w: 700, h: 700 },
  { name: "手机", input: "tap", lanes: "auto", w: 390, h: 844 },
];
const tot = {};
for (const s of SONGS.songs.filter((s) => !only || s.id === only)) {
  for (const diff of ["easy", "normal", "hard"]) for (const m of MODES) {
    const r = await run(s, diff, m);
    const k = `${m.name}/${diff}`;
    tot[k] ??= { notes: 0, over: 0, same: 0, worst: 9, worstSong: "", jack: 0, sameHand: 0, fast: 0, lanes: [0, 0, 0, 0] };
    tot[k].jack += r.jack; tot[k].sameHand += r.sameHand; tot[k].fast += r.fast; r.lanesUsed.forEach((c, i) => { tot[k].lanes[i] += c; });
    tot[k].notes += r.n; tot[k].over += r.over; tot[k].same += r.same;
    if (r.worst < tot[k].worst) { tot[k].worst = r.worst; tot[k].worstSong = s.id; }
  }
}
for (const [k, v] of Object.entries(tot)) console.log(`${k.padEnd(12)} 音 ${String(v.notes).padStart(6)}  重叠对 ${String(v.over).padStart(5)}  近而同色 ${v.same}  最近 ${v.worst.toFixed(2)} 个气泡（${v.worstSong}）${v.fast ? `  快速连打 ${v.fast}：同键 ${v.jack} 同手 ${v.sameHand}  各轨 ${v.lanes.join("/")}` : ""}`);
