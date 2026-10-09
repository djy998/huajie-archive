/* 舞台演奏的运行时冒烟测试：用 jsdom 直接跑 _src/bard-stage.js 本体（不是重写一份逻辑），音频时钟由测试手动推进
   覆盖：大厅 → 选曲窗口（搜索 / 分类 / 星级 / 试听）→ 设置窗口（点击范围、画面、判定模式）→ 电脑点气泡演奏（鼠标指着按键、
   中文输入法、漏音不出声、补音、预备拍、声像居中）→ 手机点气泡（旁边一点也算）→ 学习模式停在这一拍 → 暂停 / 继续 → 结算与纪录
   → 示范旋律 → 谱面下载失败 → 音频叫不醒时点一下开始 → 延迟校准 → 返回键 → 判定模式（正常 / 宽松 / 放水）→ 常驻连击与 FULL COMBO
   → 点击范围（正常 / 宽松 / 放水）→ 双放水自动演奏 → 纪录按判定模式与点击范围分开 → 飞花线
   → 百万分制（判定分折扣、连击分分档、宽松 / 放水的得分上限、评级、旧纪录换算）→ 隐藏曲目与曲库密码
   用法：cd _src && npm i --no-save jsdom && node tools/stage-build/smoke.mjs   （期望最后一行：全部通过） */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = process.env.HJ_REPO || path.resolve(HERE, "..", "..", "..");
const require = createRequire(path.join(REPO, "_src", "package.json"));
const { JSDOM } = require("jsdom");

const SRC = readFileSync(path.join(REPO, "_src", "bard-stage.js"), "utf8");
const STAGE = path.join(REPO, "assets", "bard", "stage");
/* 大部分场景用全部曲目（等于输过曲库密码）；songs.json 只有公开曲目，在「隐藏曲目」场景里单独测 */
const SONGS = JSON.parse(readFileSync(path.join(STAGE, "songs-all.json"), "utf8"));
const PUBLIC = JSON.parse(readFileSync(path.join(STAGE, "songs.json"), "utf8"));
const chartOf = (id) => JSON.parse(readFileSync(path.join(STAGE, "charts", `${id}.json`), "utf8"));
/* 一路弹到底的场景用最短的一首，省时间 */
const SHORT = SONGS.songs.reduce((a, b) => (b.dur < a.dur ? b : a));

/* 百万分制，按玩法说明另写一遍（不照搬 bard-stage.js），两边对得上才算对 */
function expectScore({ sumW, n, maxCombo, cap = 1000000 }) {
  const raw = (500000 * sumW) / n;
  const j = Math.round(raw <= 500000 ? 0.7 * raw : raw <= 1000000 ? 350000 + 0.42 * (raw - 500000) : 560000 + 0.28 * (raw - 1000000));
  const r = maxCombo / n;
  /* 连击分每 5% 一档（下标 k = 超过 k×5%）；30/40/50/60/70/80/85/90/95% 是原有的点，其余按它们插值补齐 */
  const COMBO5 = [0, 31000, 60000, 86000, 110000, 131000, 150000, 166000, 180000, 197000, 210000,
    216000, 220000, 225000, 230000, 234000, 240000, 255000, 270000, 285000];
  const k = Math.min(19, Math.ceil(r * 20 - 1e-9) - 1);   // r 刚好落在档位上时不算「超过」
  const c = maxCombo >= n ? 300000 : k >= 1 ? COMBO5[k] : 0;
  const t = j + c;
  const knee = cap * 0.9;
  return Math.round(cap >= 1000000 || t <= knee ? t : knee + ((t - knee) * (cap - knee)) / (1000000 - knee));
}

const results = [];
const check = (name, cond, extra = "") => results.push([name, !!cond, extra]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/* 同时在场（时间差 < 出现提前量 + 0.35 秒）的气泡：重叠的对数、挨得近却同色的对数 */
function crowd(st, approach) {
  let over = 0, same = 0;
  const ns = st.notes;
  for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length && ns[j].t - ns[i].t < approach + 0.35; j++) {
    const d = Math.hypot(ns[i].x - ns[j].x, ns[i].y - ns[j].y) / st.g.size;
    if (d < 1) over++;
    if (d < 1.8 && ns[i].c === ns[j].c) same++;
  }
  return { over, same };
}

/* 每个场景一个干净的页面 */
function makePage({ coarse = false, width = 1280, height = 800, chartFails = false, running = true, lat = 0, prefs = {}, publicOnly = false, worker = null } = {}) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, runScripts: "dangerously", url: "https://example.test/" });
  const win = dom.window;
  const doc = win.document;
  const mem = new Map(Object.entries(prefs));
  win.storage = {
    get: (k) => (mem.has(k) ? mem.get(k) : null),
    set: (k, v) => mem.set(k, String(v)),
    remove: (k) => mem.delete(k),
    json: (k) => { try { return JSON.parse(mem.get(k) || "null"); } catch (e) { return null; } },
  };
  const P = { mem, toasts: [], midi: [], unlocks: 0, now: 1000, audioT: 5, running, lat, frames: [], fetched: [], calls: [] };
  /* main.js 的 callWorker：只在「隐藏曲目」场景里接 stage_unlock */
  win.callWorker = async (payload) => { P.calls.push(payload); return worker ? worker(payload) : null; };
  win.showToast = (m) => P.toasts.push(m);
  win.bgm = { playing: true, pause() { this.playing = false; }, play() { this.playing = true; } };
  win.siteVolume = { level: 0.6, get muted() { return this.level <= 0; }, set(v) { this.level = v; } };
  /* 假的模拟器音源：clock 就是测试手里的音频时间 */
  win.HJBard = {
    unlock: () => { P.unlocks += 1; return true; }, prepare: () => {}, instName: () => "piano",
    instruments: [{ id: "piano", name: "钢琴", group: "弦乐" }, { id: "harp", name: "竖琴", group: "弦乐" }, { id: "lute", name: "鲁特琴", group: "弦乐" }],
    clock: () => ({ t: P.audioT, lat: P.lat, running: P.running }),
    playMidi: (midi, vel, inst, pan, delay) => { P.midi.push({ midi, vel, inst, pan, delay, at: P.pos() }); return true; },
  };
  win.matchMedia = (q) => ({ matches: q.includes("coarse") ? coarse : false, addEventListener() {}, removeEventListener() {} });
  Object.defineProperty(win, "innerWidth", { value: width, configurable: true });
  Object.defineProperty(win, "innerHeight", { value: height, configurable: true });
  win.performance.now = () => P.now;
  win.requestAnimationFrame = (fn) => { P.frames.push(fn); return P.frames.length; };
  win.HTMLCanvasElement.prototype.getContext = () => null;   // jsdom 没有 canvas：飞花线只算位置、不画
  win.cancelAnimationFrame = () => {};
  win.fetch = async (url) => {
    const u = String(url);
    P.fetched.push(u);
    if (/songs-all\.json/.test(u)) return { ok: false, status: 404, json: async () => ({}) };   // 网页不该直接读全部曲目
    if (/songs\.json/.test(u)) return { ok: true, json: async () => JSON.parse(JSON.stringify(publicOnly ? PUBLIC : SONGS)) };
    const m = u.match(/charts\/([^/?]+)\.json/);
    if (m && !chartFails) return { ok: true, json: async () => chartOf(decodeURIComponent(m[1])) };
    return { ok: false, status: 404, json: async () => ({}) };
  };
  win.eval(SRC);

  P.win = win;
  P.doc = doc;
  P.$ = (sel) => doc.querySelector(sel);
  P.$$ = (sel) => Array.from(doc.querySelectorAll(sel));
  P.HJ = win.HJStage;
  P.st = () => P.HJ.state;
  P.pos = () => (P.HJ ? P.HJ.state.pos : 0);
  /* 推进 sec 秒：音频时钟一直在走（AudioContext 不会因为游戏暂停而停），每 1/60 秒跑一帧 */
  P.advance = (sec) => {
    const steps = Math.max(1, Math.round(sec * 60));
    const dt = sec / steps;
    for (let i = 0; i < steps; i++) {
      P.now += 1000 * dt;
      if (P.running) P.audioT += dt;
      const fs = P.frames;
      P.frames = [];
      fs.forEach((f) => f(P.now));
    }
  };
  /* 推进到歌曲时间 t（秒）；钟停了（学习模式停住、暂停）就不再等 */
  P.until = (t) => {
    for (let guard = 0; P.pos() < t - 1e-6 && guard < 60 * 900; guard++) {
      P.advance(Math.min(1 / 60, t - P.pos()));
      if (!P.st().clock.run) { P.advance(0.1); break; }
    }
  };
  P.click = (el) => el.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  /* ago：事件其实发生在多少毫秒之前（模拟手机主线程忙、点按排队晚到） */
  P.key = (code, key = "x", extra = {}, ago = 0) => {
    const ev = new win.KeyboardEvent("keydown", { code, key, bubbles: true, cancelable: true, ...extra });
    Object.defineProperty(ev, "timeStamp", { value: ago === "epoch" ? Date.now() : P.now - ago });   // 和 performance.now 同一时基
    doc.dispatchEvent(ev);
  };
  P.pointer = (x, y, ago = 0) => {
    const ev = new win.MouseEvent("pointerdown", { clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0 });
    Object.defineProperty(ev, "timeStamp", { value: ago === "epoch" ? Date.now() : P.now - ago });
    P.$("#hjsPlay").dispatchEvent(ev);
  };
  P.move = (x, y) => {
    const ev = new win.MouseEvent("pointermove", { clientX: x, clientY: y, bubbles: true, cancelable: true });
    Object.defineProperty(ev, "pointerType", { value: "mouse" });
    P.$("#hjsPlay").dispatchEvent(ev);
  };
  P.btn = (text, root = doc) => Array.from(root.querySelectorAll("button")).find((b) => b.textContent.trim() === text || b.getAttribute("aria-label") === text);
  return P;
}

async function openStage(P) {
  P.HJ.open();
  await sleep(5);
  P.advance(0.02);
}
async function go(P) {
  P.click(P.$("#hjsGo"));
  await sleep(5);
  P.advance(0.02);
}

async function main() {
  const firstSong = SONGS.songs.find((s) => s.id === SONGS.first) || SONGS.songs[0];
  check("曲库是 v2（MIDI 版）且有分类", SONGS.v === 2 && Array.isArray(SONGS.tags) && SONGS.tags.length > 1);
  const bad = SONGS.songs.filter((s) => {
    const n = chartOf(s.id).n;
    const c = [3, 2, 1].map((L) => n.filter((r) => r[2] >= L).length);
    return !(n.length > 0 && c[0] > 0 && c[0] <= c[1] && c[1] <= c[2] && c.join() === s.cnt.join());
  });
  check("每首都有谱面、级别嵌套（仙人刺 ⊂ 魔界花 ⊂ 泰坦）、音数和索引一致", bad.length === 0, bad.map((s) => s.id).join(","));

  /* 1. 大厅与选曲 */
  {
    const P = makePage();
    await openStage(P);
    check("打开后在大厅", P.st().view === "lobby" && !P.$("#hjStage").hidden);
    check("大厅显示当前曲目", P.$(".hjs-hero-t")?.textContent === firstSong.t);
    check("大厅曲目上方写「今晚演奏」", P.$(".hjs-eyebrow")?.textContent === "今晚演奏", P.$(".hjs-eyebrow")?.textContent);
    check("难度三档叫仙人刺 / 魔界花 / 泰坦", ["仙人刺", "魔界花", "泰坦"].every((t) => P.btn(t)));
    check("大厅先把当前曲目的谱面下好", P.fetched.some((u) => u.includes(`charts/${firstSong.id}.json`)));
    check("大厅不再提伴奏音轨", !/伴奏/.test(P.$("#hjsLobby").textContent));
    check("大厅有「离开舞台」按钮", !!P.btn("离开舞台"));
    await sleep(300);
    check("舞台盖满后下面的网站藏起来（hjs-covered）", P.doc.body.classList.contains("hjs-covered"));
    check("背景音乐被暂停", P.win.bgm.playing === false);
    check("开舞台时压入一条历史记录（返回键回上一层）", P.win.history.state && P.win.history.state.hjStage === 1);
    check("开始按钮下方不再有操作提示", !P.$(".hjs-ctrl-tip"));
    check("演出模式提示简化为「按节拍演奏，本难度 N 个音」", /^按节拍演奏，本难度 \d+ 个音$/.test(P.$(".hjs-tip").textContent), P.$(".hjs-tip").textContent);

    P.click(P.btn("更换曲目"));
    check("选曲窗口单独打开", P.st().sheet === "picker" && !P.$("#hjsSheet").hidden && !!P.$(".hjs-sheet-card.is-picker"));
    check("选曲窗口列出全部曲目", P.$$(".hjs-song").length === SONGS.songs.length, `${P.$$(".hjs-song").length}`);
    const input = P.$(".hjs-search-in");
    input.value = "月光";
    input.dispatchEvent(new P.win.Event("input", { bubbles: true }));
    const hits = P.$$(".hjs-song");
    check("搜索「月光」能筛出来", hits.length >= 1 && hits.every((r) => /月光/.test(r.textContent)), `${hits.length}`);
    input.value = "";
    input.dispatchEvent(new P.win.Event("input", { bubbles: true }));

    P.click(P.$$(".hjs-chips.is-cat .hjs-chip").find((b) => b.textContent === "古典"));
    const classical = SONGS.songs.filter((s) => s.tag === "古典").length;
    check("分类筛选（古典），记在本机", P.$$(".hjs-song").length === classical && P.mem.get("hj_stage_cat") === "古典", `${P.$$(".hjs-song").length}/${classical}`);
    P.click(P.$$(".hjs-chips.is-cat .hjs-chip")[0]);
    check("分类回到全部", P.$$(".hjs-song").length === SONGS.songs.length);

    check("曲库每首都有三档星级（仙人刺 1~3、魔界花 2~4、泰坦 3~5，越难不越低）", SONGS.songs.every((s) => Array.isArray(s.diffs) && s.diffs.every((d, k) => d >= k + 1 && d <= k + 3) && s.diffs[0] <= s.diffs[1] && s.diffs[1] <= s.diffs[2]));
    P.click(P.$$(".hjs-chips:not(.is-cat) .hjs-chip")[4]);
    const four = SONGS.songs.filter((s) => s.diffs[1] === 4).length;
    check("四星筛选（按当前难度「魔界花」）", four > 0 && P.$$(".hjs-song").length === four && !/星级按/.test(P.$("#hjsCount").textContent), `${P.$$(".hjs-song").length}/${four}`);
    const row = P.$$(".hjs-song")[0];
    P.click(row);
    await sleep(5);
    const target = SONGS.songs.find((s) => s.id === row.dataset.id);
    check("点曲目＝选中", P.st().song === target.id);
    check("点曲目开始试听", P.st().preview === target.id && P.$(`.hjs-song[data-id="${target.id}"]`).classList.contains("is-preview"));
    P.advance(1.5);
    await sleep(120);
    const pv = P.midi.filter((m) => m.vel === 0.6 || Math.abs(m.vel - 0.42) < 1e-9);
    check("试听用 MIDI 出声（要弹的音稍响）", pv.length > 0 && pv.some((m) => m.vel === 0.6), `${pv.length}`);
    P.click(P.btn("确定"));
    check("确定：关窗口、停试听、大厅换成这首", P.st().sheet === "" && P.st().preview === "" && P.$(".hjs-hero-t").textContent === target.t);
    P.key("Escape", "Escape");
    {
      const cur = SONGS.songs.find((x) => x.t === P.$(".hjs-hero-t").textContent);
      const heroStars = () => (P.$(".hjs-hero .hjs-stars").textContent.match(/★/g) || []).length;
      const before = heroStars();
      P.click(P.btn("泰坦"));
      check("大厅星级跟着难度变（魔界花 → 泰坦）", before === cur.diffs[1] && heroStars() === cur.diffs[2], `${before}→${heroStars()} ${cur.diffs}`);
      P.click(P.btn("魔界花"));
    }
    check("大厅里 Esc 关掉舞台", P.$("#hjStage").classList.contains("is-leaving"));
    check("关舞台时马上露出下面的网站", !P.doc.body.classList.contains("hjs-covered"));
  }

  /* 2. 电脑点气泡：鼠标指着按键、输入法、漏音、补音、预备拍、声像、暂停、结算 */
  {
    const P = makePage({ width: 1280, prefs: { hj_stage_diff: "easy", hj_stage_song: SHORT.id, hj_stage_input: "keys", hj_stage_codes: "{}" } });
    await openStage(P);
    check("键盘轨道模式去掉了：旧的操作方式、键位设置清掉", !P.mem.has("hj_stage_input") && !P.mem.has("hj_stage_codes"));
    P.click(P.btn("设置"));
    const sheet = P.$("#hjsSheetCard");
    check("设置里有判定模式（正常 / 宽松 / 放水）", P.$$('[aria-label="判定模式"] button').map((b) => b.textContent).join() === "正常,宽松,放水");
    check("设置里有点击范围（正常 / 宽松 / 放水）", P.$$('[aria-label="点击范围"] button').map((b) => b.textContent).join() === "正常,宽松,放水");
    check("设置里没有操作方式、轨道、键位", !/操作方式|轨道|键位/.test(sheet.textContent));
    check("画面里有飞花线开关，默认开", P.$('[aria-label="飞花线"]') && P.$('[aria-label="飞花线"]').checked);
    check("设置窗口单独打开", P.st().sheet === "settings" && !!P.$(".hjs-sheet-card.is-settings"));
    check("设置里不再提伴奏", !/伴奏/.test(sheet.textContent));
    P.click(P.btn("关闭", sheet));

    await go(P);
    const st = P.st();
    check("开始演奏：点气泡，没有轨道和键帽", st.view === "play" && st.playing && !P.$(".hjs-lane") && !P.$(".hjs-cap"));
    check("飞花线默认开：显示", !P.$("#hjsFly").hidden && !!P.$(".hjs-fly-flower"));
    check("仙人刺难度：气泡数等于谱面里级别 3 的音", st.notes.length === SHORT.cnt[0], `${st.notes.length}/${SHORT.cnt[0]}`);
    check("其余的音都是补音", st.bg.length === chartOf(SHORT.id).n.length - SHORT.cnt[0], `${st.bg.length}`);
    check("钟从负数开始（预备拍在第一个音之前）", st.startT < 0 && st.clock.run);
    const ck = crowd(st, 1.8);
    check("电脑：同时在场的气泡不重叠、挨得近的不同色", ck.over === 0 && ck.same === 0, JSON.stringify(ck));
    const notes = st.notes;
    const n0 = notes[0];
    P.until(Math.min(0, n0.t) - 0.05);
    const ticks = P.midi.filter((m) => m.vel === 0.32);
    check("第一个音前有四下预备拍", ticks.length === 4, `${ticks.length}`);
    P.until(n0.t);
    P.move(n0.x, n0.y);
    P.key("KeyA", "Process", { keyCode: 229 });       // 中文输入法开着时 key 是 Process
    check("鼠标指着气泡按键（中文输入法下也行）", P.st().judged[0] === 0, `judged=${P.st().judged[0]}`);
    const hitSound = P.midi.find((m) => m.vel === 1);
    check("弹中发出这个音，声像居中", hitSound && hitSound.midi === n0.m && hitSound.pan === 0);
    check("弹中的音用曲目原本的乐器（默认跟随曲目）", hitSound && hitSound.inst === (["piano", "harp", "lute"].includes(SHORT.inst) ? SHORT.inst : "piano"), `${hitSound && hitSound.inst} / ${SHORT.inst}`);
    check("判定字显示在屏幕中间那层", /PERFECT/.test(P.$("#hjsJudge").textContent));

    const before = P.midi.length;
    const n1 = notes[1];
    P.until(n1.t + 0.4);
    check("判定窗过了还多等一下（排队中的点按还算数）", P.st().judged[1] === -1);
    P.until(n1.t + 0.62);                         // 仙人刺难度 0.45 秒判定窗 + 0.15 秒（JUST 的那段）之后才算漏
    const hitsAfter = P.midi.slice(before).filter((m) => m.vel >= 0.8);
    check("漏掉的音不出声", P.st().judged[1] === 3 && hitsAfter.length === 0, `judged=${P.st().judged[1]} sounds=${hitsAfter.length}`);
    const bgPlayed = P.midi.filter((m) => m.vel === 0.4);
    check("补音按音频钟提前排进去（轻音、居中）", bgPlayed.length > 0 && bgPlayed.every((m) => m.pan === 0 && m.delay >= 0 && m.delay <= 0.121), `${bgPlayed.length}`);

    check("漏音后连击归零、常驻连击变暗", P.$("#hjsComboN").textContent === "0" && P.$("#hjsComboBig").classList.contains("is-zero"));
    P.key("Escape", "Escape");
    check("Esc 暂停：钟停、出暂停卡", P.st().paused && !P.st().clock.run && !P.$("#hjsModal").hidden);
    check("暂停卡：继续 / 重来 / 停止演奏", !!P.btn("停止演奏", P.$("#hjsModal")) && !P.btn("回大厅", P.$("#hjsModal")));
    const tPause = P.pos();
    const nPause = P.midi.length;
    P.advance(1);
    check("暂停时歌曲时间不走、也不再排音", P.pos() === tPause && P.midi.length === nPause);
    P.key("Escape", "Escape");
    check("再按 Esc 继续：先倒数", !P.st().paused && P.st().resuming && !P.st().clock.run && P.$("#hjsModal").hidden);
    await sleep(P.st().spb * 4000 + 300);              // 和开头一样：四下预备拍，再过一拍接着走
    check("倒数完接着走", !P.st().resuming && P.st().clock.run);
    P.advance(0.05);
    check("继续后从暂停处接着走", Math.abs(P.pos() - tPause - 0.05) < 1e-6, `${(P.pos() - tPause).toFixed(3)}`);

    /* 主线程忙：点按晚 200 ms 才处理，按事件时间补回 50 ms → 判成晚 150 ms，仍在仙人刺的 PERFECT（0.16 秒）以内 */
    P.until(notes[2].t + 0.2);
    P.move(notes[2].x, notes[2].y);
    P.key("KeyX", "x", {}, 200);
    check("点按排队的时间按事件时间戳补回一点（最多 50 ms）", P.st().judged[2] === 0, `judged=${P.st().judged[2]}`);
    /* 一路弹到底 */
    for (let i = 3; i < notes.length; i++) {
      P.until(notes[i].t);
      P.pointer(notes[i].x, notes[i].y);
    }
    P.until(P.st().endT + 2);
    const fin = P.st();
    check("弹完出结算", fin.finished && /演出结束/.test(P.$("#hjsModal").textContent));
    check("结算里有手感诊断（平均早晚）", /时机准确|平均偏/.test(P.$("#hjsModal").textContent));
    check("结算里有设备诊断（输出延迟、点按排队、掉帧）", /输出延迟 \d+ ms · 点按排队 \d+ ms · 掉帧 \d+%/.test(P.$(".hjs-res-diag")?.textContent || ""), P.$(".hjs-res-diag")?.textContent);
    check("帧率稳定时：掉帧 0%、认出 60 Hz", /掉帧 0%（60 Hz，最长一帧 1\d ms）/.test(P.$(".hjs-res-diag")?.textContent || ""), P.$(".hjs-res-diag")?.textContent);
    check("结算计数对得上", fin.counts.perfect === notes.length - 1 && fin.counts.miss === 1, JSON.stringify(fin.counts));
    check("有 MISS 就没有 FULL COMBO（也不多出 null 字样）", !/FULL COMBO|null|undefined/.test(P.$("#hjsModal").textContent));
    check("结算不再提示去校准", !/一直这样/.test(P.$("#hjsModal").textContent));
    const want = expectScore({ sumW: 3 * (notes.length - 1), n: notes.length, maxCombo: fin.maxCombo });
    check("百万分制：一个 MISS，分数 = 判定分折扣 + 连击分分档", fin.score === want, `${fin.score} / ${want}（最大连击 ${fin.maxCombo}/${notes.length}）`);
    const rankWant = want >= 990000 ? "SSS" : want >= 980000 ? "SS" : want >= 950000 ? "S" : "A+";
    check("评级按得分", P.$(".hjs-res-rank span").textContent === rankWant, `${P.$(".hjs-res-rank span").textContent}/${rankWant}`);
    check("结算写明判定分与连击分", /判定分 [\d,]+ \+ 连击分 [\d,]+/.test(P.$("#hjsModal").textContent));
    const best = JSON.parse(P.mem.get("hj_stage_best3") || "{}");
    const rec = best[`${fin.song}:easy:normal:normal`];
    check("本机纪录按难度、判定模式、点击范围分开写入（最高分 + 评级）", rec && rec.score === fin.score && rec.rank === rankWant && Object.keys(best).length === 1, Object.keys(best).join());
    check("不再写旧纪录 hj_stage_best2", !P.mem.get("hj_stage_best2"));
    check("结算分别显示难度、判定模式、点击范围", ["难度仙人刺", "判定正常", "范围正常"].every((x) => P.$(".hjs-res-tags").textContent.includes(x)), P.$(".hjs-res-tags")?.textContent);
    check("结算里是「结束演奏」，没有「回大厅」", !!P.btn("结束演奏", P.$("#hjsModal")) && !P.btn("回大厅", P.$("#hjsModal")));
    P.click(P.btn("结束演奏", P.$("#hjsModal")));
    check("结束演奏回到大厅", P.st().view === "lobby" && /本机纪录/.test(P.$(".hjs-ctrl").textContent));
  }

  /* 3. 点气泡（手机）：旁边一点也算，远了不算 */
  {
    const P = makePage({ coarse: true, width: 390, height: 844, prefs: { hj_stage_range: "loose" } });   // 宽松点击范围：1.7 / 2.2 个气泡
    await openStage(P);
    check("手机上开始按钮下方也没有操作提示", !P.$(".hjs-ctrl-tip"));
    await go(P);
    const st = P.st();
    check("手机点气泡、没有轨道键帽", st.playing && P.$$(".hjs-cap").length === 0);
    const xs = st.notes.slice(0, 12).map((n) => Math.round(n.x));
    check("气泡沿旋律左右铺开（前 12 个不全在一列）", new Set(xs).size >= 3, xs.join(","));
    const sameSpot = st.notes.slice(1, 30).filter((n, i) => Math.hypot(n.x - st.notes[i].x, n.y - st.notes[i].y) < st.g.size * 0.9).length;
    check("相邻两个气泡不叠在一起", sameSpot === 0, `${sameSpot}`);
    const ck = crowd(st, 1.35);
    check("点气泡：同时在场的气泡不重叠、挨得近的不同色", ck.over === 0 && ck.same === 0, JSON.stringify(ck));
    const n0 = st.notes[0];
    P.until(n0.t - 0.02);
    P.pointer(n0.x + st.g.size * 1.5, n0.y);        // 点在气泡旁边（判定圈 1.6 个气泡）
    check("点在气泡旁边也算弹中", P.st().judged[0] >= 0 && P.st().judged[0] < 3, `judged=${P.st().judged[0]}`);
    const n1 = st.notes[1];
    P.until(n1.t);
    P.pointer(n1.x + st.g.size * 3, Math.max(0, n1.y - st.g.size * 3));
    check("点得太远不算", P.st().judged[1] === -1);
    const n2 = st.notes[2];
    P.until(n2.t);
    P.pointer(n2.x + st.g.size * 2, n2.y);
    check("下一个该弹的气泡：偏 2 个气泡也算", P.st().judged[2] >= 0 && P.st().judged[2] < 3, `judged=${P.st().judged[2]}`);
    /* 外圈加粗：找一个和前一个隔得开的音，离判定点还远时不加粗、0.3 秒内才加粗 */
    {
      const ns0 = P.st().notes;
      const m = ns0.find((a, i) => i > 2 && a.t - ns0[i - 1].t > 0.9 && a.t > P.pos() + 1);
      if (m) {
        ns0.filter((a) => a.t < m.t && a.t > P.pos() + 0.05).forEach((a) => { P.until(a.t); P.pointer(a.x, a.y); });   // 前面的都弹掉
        P.until(m.t - 0.6);
        const far = P.$$(".hjs-note.is-next").length;
        P.until(m.t - 0.2);
        check("下一个该弹的气泡快到点（0.3 秒内）才加粗外圈", far === 0 && P.$$(".hjs-note.is-next").length === 1, `${far}/${P.$$(".hjs-note.is-next").length}`);
      }
    }
    /* 先到先得：挨得近的两个音，稍晚一点点在两个中间偏后的位置，算给前一个，不往后错位 */
    const ns = P.st().notes;
    const k = ns.findIndex((a, i) => i > 3 && ns[i + 1] && ns[i + 1].t - a.t < 0.4 && Math.hypot(ns[i + 1].x - a.x, ns[i + 1].y - a.y) < st.g.size * 1.6);
    if (k > 0) {
      const a = ns[k], b = ns[k + 1];
      P.until(a.t + 0.08);
      P.pointer(a.x + (b.x - a.x) * 0.55, a.y + (b.y - a.y) * 0.55);
      check("挨得近的两个音：稍晚点在中间，算给前一个（不错位）", P.st().judged[a.idx] >= 0 && P.st().judged[b.idx] === -1, `${P.st().judged[a.idx]}/${P.st().judged[b.idx]}`);
    }
    P.click(P.btn("结束演奏"));
    check("演奏中 ✕（结束演奏）回大厅", P.st().view === "lobby" && !P.st().clock.run);
  }

  /* 4. 学习模式：停在这一拍；输出延迟也算进去 */
  {
    const P = makePage({ prefs: { hj_stage_learn: "1" }, lat: 0.08 });
    await openStage(P);
    await go(P);
    const n0 = P.st().notes[0];
    for (let g = 0; !P.st().frozen && g < 60 * 60; g++) P.advance(1 / 60);
    const s1 = P.st();
    check("学习模式：到点停住、钟停", s1.frozen && !s1.clock.run);
    check("钟退回这一拍（之后的补音和你弹的这一下对齐）", Math.abs(P.pos() - n0.t) < 1e-9, `${Math.round((P.pos() - n0.t) * 1000)} ms`);
    const late = P.midi.filter((m) => m.vel === 0.4 && m.at + m.delay >= n0.t + 1e-6).length;
    check("停住前没排这一拍之后的补音", late === 0, `${late}`);
    P.pointer(n0.x + s1.g.size * 4, Math.max(0, n0.y - s1.g.size * 4));
    check("点错地方不放行", P.st().frozen);
    P.key("Escape", "Escape");
    P.key("Escape", "Escape");
    check("停住时暂停再继续，还是停住（不闪一下）", P.st().frozen && !P.st().clock.run && !P.st().paused);
    await sleep(P.st().spb * 4000 + 300);              // 继续前的预备拍
    check("倒数完还是停在这一拍等你", P.st().frozen && !P.st().clock.run && !P.st().resuming);
    const unlocks = P.unlocks;
    P.pointer(n0.x, n0.y);
    check("点对了继续走", !P.st().frozen && P.st().clock.run && P.st().judged[0] === 0);
    check("学习模式弹中提示 WELL", /WELL/.test(P.$("#hjsJudge").textContent));
    check("继续时不会掐掉刚弹的音（不调用 unlock）", P.unlocks === unlocks);
    check("学习模式 HUD 显示已弹对", /1\//.test(P.$("#hjsScore").textContent));
  }

  /* 5. 示范旋律：要弹的音也先轻轻放一遍 */
  {
    const P = makePage({ prefs: { hj_stage_demo: "1", hj_stage_song: SHORT.id, hj_stage_diff: "normal" } });
    await openStage(P);
    await go(P);
    const st = P.st();
    const total = chartOf(SHORT.id).n.length;
    check("示范旋律：补音列表是整首 MIDI", st.bg.length === total, `${st.bg.length}/${total}`);
    check("要弹的音用示范力度", st.bg.filter((n) => n.v === 0.5).length === SHORT.cnt[1]);
    /* 有的浏览器 timeStamp 是 1970 年起的毫秒（或别的时基）：认出来就不用，按处理时刻判定，不会整局判早 */
    const n0 = st.notes[0];
    P.until(n0.t);
    P.pointer(n0.x, n0.y, "epoch");
    check("时间戳时基不对时不拿来用（照样 PERFECT）", P.st().judged[0] === 0, `judged=${P.st().judged[0]}`);
  }

  /* 6. 谱面下载失败 → 回大厅并提示 */
  {
    const P = makePage({ chartFails: true });
    await openStage(P);
    await go(P);
    check("谱面没下载到：回大厅并提示", P.st().view === "lobby" && P.toasts.some((t) => /谱面加载失败/.test(t)));
  }

  /* 7. 音频叫不醒 → 点击屏幕开始 */
  {
    const P = makePage({ running: false });
    await openStage(P);
    await go(P);
    check("音频没起来时先不开钟", !P.st().playing);
    P.now += 1600;
    await sleep(80);
    check("等不到音频：提示点击屏幕", /点击屏幕开始/.test(P.$("#hjsBanner").textContent));
    P.running = true;
    P.pointer(200, 300);
    await sleep(5);
    P.advance(0.05);
    check("点了以后开始演奏", P.st().playing && P.st().clock.run);
  }

  /* 8. 延迟校准：每下都晚 40 ms → +40（「嗒」排在同一个音频钟上，输出延迟另算） */
  {
    const P = makePage({ lat: 0.05 });
    await openStage(P);
    P.click(P.btn("设置"));
    const t0 = P.audioT;
    P.click(P.btn("校准"));
    check("校准开始", P.st().cal);
    for (let k = 0; k < 10; k++) {
      const target = 1.2 + 0.6 * k + 0.05 + 0.04;   // 第 k 下排在 1.2 + 0.6k，听到还要晚 50 ms 输出延迟，玩家再晚 40 ms
      const pos = () => P.audioT - t0;
      while (pos() < target - 1e-6) P.advance(Math.min(1 / 60, target - pos()));
      await sleep(60);
      P.key("Space", " ");
    }
    P.advance(1.2);
    await sleep(150);
    const taps = P.midi.filter((m) => m.vel === 0.7).length;
    check("校准放了 10 下「嗒」", taps === 10, `${taps}`);
    check("校准结果写进判定延迟", P.st().delayMs === 40 && !P.st().cal, `${P.st().delayMs}`);
  }

  /* 9. 返回键 */
  {
    const P = makePage();
    await openStage(P);
    P.click(P.btn("设置"));
    P.click(P.btn("关闭", P.$("#hjsSheetCard")));
    P.click(P.btn("玩法说明"));
    check("玩法说明讲清 MISS 和点空的区别", /MISS 与点空含义不同/.test(P.$("#hjsSheetCard").textContent));
    {
      const items = P.$$("#hjsSheetCard li").map((li) => li.textContent);
      const merged = items.filter((t) => /判定模式/.test(t) && /点击范围/.test(t) && /得分设有上限/.test(t));
      check("玩法说明：共 7 条，判定模式与得分上限一条、得分组成一条，不带括号说明", items.length === 7 && merged.length === 1
        && items.filter((t) => /^得分由判定分（70%）和连击分（30%）两部分组成/.test(t)).length === 1
        && !items.some((t) => /星级|飞花线|预备拍|JUST/.test(t)), `${items.length} 条`);
    }
    P.win.dispatchEvent(new P.win.PopStateEvent("popstate", { state: null }));
    check("返回键先关窗口", P.st().sheet === "" && !P.$("#hjStage").hidden);
    P.win.dispatchEvent(new P.win.PopStateEvent("popstate", { state: null }));
    check("再按返回键离开舞台", P.$("#hjStage").classList.contains("is-leaving"));
  }

  /* 10. 判定模式：正常按难度收紧，宽松三档都按仙人刺；全弹中出 FULL COMBO，连击一直显示 */
  for (const [judge, want] of [["normal", 1], ["loose", 0]]) {
    const P = makePage({ prefs: { hj_stage_song: SHORT.id, hj_stage_diff: "hard", ...(judge === "normal" ? {} : { hj_stage_judge: judge }) } });
    await openStage(P);
    await go(P);
    const ns = P.st().notes;
    P.until(ns[0].t + 0.15);                    // 晚 150 ms：泰坦正常判定 GREAT（0.11 < 0.15 < 0.19），宽松 PERFECT（< 0.18）
    P.pointer(ns[0].x, ns[0].y);
    check(`${judge === "normal" ? "正常判定（默认）" : "宽松判定"}：泰坦难度晚 150 ms 判 ${want ? "GREAT" : "PERFECT"}`, P.st().judged[0] === want, `judged=${P.st().judged[0]}`);
    for (let i = 1; i < ns.length; i++) {
      P.until(ns[i].t);
      P.pointer(ns[i].x, ns[i].y);
      if (i === 5) check("连击数一直显示在判定字下方", P.$("#hjsComboN").textContent === "6" && !P.$("#hjsComboBig").classList.contains("is-zero"), P.$("#hjsComboN").textContent);
    }
    P.until(P.st().endT + 2);
    check(`${judge}：全部弹中 → FULL COMBO!`, P.st().finished && /FULL COMBO!/.test(P.$("#hjsModal").textContent) && !/null|undefined/.test(P.$("#hjsModal").textContent));
    if (judge === "loose") check("结算显示：难度泰坦、判定宽松", /难度泰坦/.test(P.$(".hjs-res-tags").textContent) && /判定宽松/.test(P.$(".hjs-res-tags").textContent));
  }
  /* 11. 放水模式：不用点，鼠标停在气泡上，到点自动算弹中；不记最高分 */
  {
    const P = makePage({ prefs: { hj_stage_song: SHORT.id, hj_stage_diff: "normal", hj_stage_judge: "hover" } });
    await openStage(P);
    await go(P);
    const st = P.st();
    const move = (x, y) => {
      const ev = new P.win.MouseEvent("pointermove", { clientX: x, clientY: y, bubbles: true, cancelable: true });
      Object.defineProperty(ev, "pointerType", { value: "mouse" });
      P.$("#hjsPlay").dispatchEvent(ev);
    };
    const n0 = st.notes[0];
    move(n0.x, n0.y);
    P.until(n0.t - 0.05);
    check("放水：鼠标停在气泡上，没到点不算", P.st().judged[0] === -1);
    P.advance(0.1);
    check("放水：到点自动算弹中（PERFECT）", P.st().judged[0] === 0, `judged=${P.st().judged[0]}`);
    const n1 = st.notes[1];
    move(n1.x + st.g.size * 3, n1.y + st.g.size * 3);
    P.until(n1.t + 0.1);
    check("放水：鼠标不在气泡上不算", P.st().judged[1] === -1);
    move(n1.x, n1.y);
    P.advance(1 / 60);
    check("放水：晚了 0.1 秒移上去，按晚了多少算", P.st().judged[1] >= 0 && P.st().judged[1] < 3, `judged=${P.st().judged[1]}`);
    for (let i = 2; i < st.notes.length; i++) { move(st.notes[i].x, st.notes[i].y); P.until(st.notes[i].t + 0.02); }
    P.until(P.st().endT + 2);
    check("放水：弹完出结算、判定写放水", P.st().finished && /判定放水/.test(P.$(".hjs-res-tags").textContent));
    const rec = JSON.parse(P.mem.get("hj_stage_best3") || "{}");
    check("放水判定：纪录单独记在 :normal:hover:normal 下", !!rec[`${SHORT.id}:normal:hover:normal`] && Object.keys(rec).length === 1, Object.keys(rec).join(","));
  }

  /* 12. 电脑点气泡（非放水）：鼠标指着气泡按任意键也算点 */
  {
    const P = makePage({ prefs: { hj_stage_song: SHORT.id, hj_stage_diff: "normal" } });
    await openStage(P);
    check("电脑上开始按钮下方没有操作提示", !P.$(".hjs-ctrl-tip"));
    await go(P);
    const st = P.st();
    const move = (x, y) => {
      const ev = new P.win.MouseEvent("pointermove", { clientX: x, clientY: y, bubbles: true, cancelable: true });
      Object.defineProperty(ev, "pointerType", { value: "mouse" });
      P.$("#hjsPlay").dispatchEvent(ev);
    };
    const n0 = st.notes[0];
    move(n0.x, n0.y);
    P.until(n0.t);
    check("只把鼠标停在气泡上不算（不是放水模式）", P.st().judged[0] === -1);
    P.key("KeyZ", "z");
    check("鼠标指着气泡按任意键＝点了它", P.st().judged[0] === 0, `judged=${P.st().judged[0]}`);
    const n1 = st.notes[1];
    move(n1.x + st.g.size * 4, Math.max(0, n1.y - st.g.size * 4));
    P.until(n1.t);
    P.key("Space", " ");
    check("鼠标离气泡远时按键不算", P.st().judged[1] === -1);
  }

  /* 14. 掉帧诊断：单独掉一帧（60 Hz 下 33 ms）也要算，并指出最卡的那几秒 */
  {
    const P = makePage({ prefs: { hj_stage_song: SHORT.id, hj_stage_diff: "easy" } });
    await openStage(P);
    await go(P);
    const ns = P.st().notes;
    P.until(ns[0].t);
    const k0 = Math.floor(P.pos() / 4) + 3;          // 往后第 3 个 4 秒段里，连着 20 次各掉一帧
    P.until(k0 * 4 + 0.5);
    const longFrame = () => {                         // 一帧 33 ms（60 Hz 下掉一帧）：旧算法要 34 ms 以上才算，算不到
      P.now += 33;
      P.audioT += 0.033;
      const fs = P.frames;
      P.frames = [];
      fs.forEach((f) => f(P.now));
    };
    for (let i = 0; i < 20; i++) { longFrame(); P.advance(2 / 60); }
    P.until(P.st().endT + 2);
    const diag = P.$(".hjs-res-diag")?.textContent || "";
    const span = `${Math.floor((k0 * 4) / 60)}:${String((k0 * 4) % 60).padStart(2, "0")}`;
    check("单独掉一帧也计入、指出最卡的 4 秒", /掉帧 (<1|[1-9]\d*)%/.test(diag) && diag.includes(`最多在 ${span}`) && /最长一帧 3\d ms/.test(diag), diag);
  }

  /* 15. 画面：正常显示（默认）/ 简单显示 */
  {
    const P = makePage();
    await openStage(P);
    check("默认正常显示", !P.$("#hjStage").classList.contains("is-simple"));
    P.click(P.btn("设置"));
    check("音色默认「跟随曲目」", P.$(".hjs-select")?.value === "song", P.$(".hjs-select")?.value);
    P.click(P.btn("简单显示", P.$("#hjsSheetCard")));
    check("切到简单显示：舞台加 is-simple、记在本机", P.$("#hjStage").classList.contains("is-simple") && P.mem.get("hj_stage_render") === "simple");
    P.click(P.btn("恢复默认设置", P.$("#hjsSheetCard")));
    check("恢复默认设置：回到正常显示", !P.$("#hjStage").classList.contains("is-simple") && !P.mem.has("hj_stage_render"));
    const Q = makePage({ prefs: { hj_stage_render: "simple" } });
    await openStage(Q);
    check("下次打开仍是简单显示", Q.$("#hjStage").classList.contains("is-simple"));
  }

  /* 16. 点击范围：正常（默认）1.4 / 1.7 个气泡，宽松 1.7 / 2.2 */
  {
    const P = makePage({ coarse: true, width: 390, height: 844, prefs: { hj_stage_song: SHORT.id } });
    await openStage(P);
    P.click(P.btn("设置"));
    check("设置里有点击范围（默认正常）", !!P.btn("宽松", P.$("#hjsSheetCard")) && /1\.4 倍直径/.test(P.$("#hjsSheetCard").textContent));
    P.click(P.btn("关闭", P.$("#hjsSheetCard")));
    await go(P);
    const st = P.st();
    const ns = st.notes;
    /* 找一个前后都隔得开的音，免得算到别的气泡上 */
    const lone = (from) => ns.findIndex((a, i) => i >= from && i > 0 && ns[i + 1] && a.t - ns[i - 1].t > 0.6 && ns[i + 1].t - a.t > 0.6);
    const i1 = lone(1);
    ns.slice(0, i1).forEach((a) => { P.until(a.t); P.pointer(a.x, a.y); });
    P.until(ns[i1].t);
    const off = (n, d) => (n.x + st.g.size * d < P.win.innerWidth ? [n.x + st.g.size * d, n.y] : [n.x - st.g.size * d, n.y]);
    P.pointer(...off(ns[i1], 1.55));
    check("正常范围：偏 1.55 个气泡（下一个该点的）也算", P.st().judged[ns[i1].idx] >= 0 && P.st().judged[ns[i1].idx] < 3, `judged=${P.st().judged[ns[i1].idx]}`);
    const i2 = lone(i1 + 1);
    ns.slice(i1 + 1, i2).forEach((a) => { P.until(a.t); P.pointer(a.x, a.y); });
    P.until(ns[i2].t);
    P.pointer(...off(ns[i2], 1.9));
    check("正常范围：偏 1.9 个气泡不算", P.st().judged[ns[i2].idx] === -1, `judged=${P.st().judged[ns[i2].idx]}`);
  }

  /* 17. 开演前先备好音色：warm 没好之前不开钟，好了才开演；要的音高包括谱面全部音和预备拍 */
  {
    const P = makePage({ prefs: { hj_stage_song: SHORT.id } });
    let release;
    const asked = [];
    P.win.HJBard.warm = (inst, midis) => { asked.push([inst, midis.length]); return new Promise((r) => { release = release || r; if (inst === "harp" && midis.length === 1) r(); }); };
    await openStage(P);
    await go(P);
    await sleep(20);
    P.advance(0.5);
    check("音色没备好时不开演、提示准备音色", !P.st().playing && /准备音色/.test(P.$("#hjsBanner").textContent), P.$("#hjsBanner").textContent);
    const total = chartOf(SHORT.id).n.length;
    check("备的是整首的音（要弹的 + 补音）和预备拍", asked.some(([, n]) => n === total) && asked.some(([i, n]) => i === "harp" && n === 1), JSON.stringify(asked));
    release();
    await sleep(20);
    P.advance(0.05);
    check("备好后开演", P.st().playing && P.st().clock.run);
  }

  /* 18. 放水点击范围：不看位置，点哪儿、按什么键都算判定窗里最早那个 */
  {
    const P = makePage({ prefs: { hj_stage_song: SHORT.id, hj_stage_diff: "normal", hj_stage_range: "free" } });
    await openStage(P);
    check("放水范围：开始按钮下方没有操作提示", !P.$(".hjs-ctrl-tip"));
    await go(P);
    const ns = P.st().notes;
    const g = P.st().g;
    P.until(ns[0].t);
    P.pointer(g.w - 5, g.h - 5);                       // 点在屏幕角落
    check("放水范围：点屏幕角落也算", P.st().judged[0] === 0, `judged=${P.st().judged[0]}`);
    P.until(ns[1].t);
    P.key("Space", " ");                               // 没动过鼠标，直接按键
    check("放水范围：没动鼠标、直接按键也算", P.st().judged[1] === 0, `judged=${P.st().judged[1]}`);
    const k = ns.findIndex((a, i) => i > 2 && a.t - ns[i - 1].t > 0.9);
    if (k > 0) {
      ns.slice(2, k).forEach((a) => { P.until(a.t); P.pointer(5, 5); });
      P.until(ns[k].t - 0.6);
      const ghosts = P.st().judged.filter((j) => j >= 0).length;
      P.pointer(5, 5);
      check("放水范围：判定窗里没有该弹的，点了算点空", P.st().judged.filter((j) => j >= 0).length === ghosts);
    }
  }

  /* 19. 双放水（点击范围、判定模式都是放水）：自动演奏，不计分、不记纪录 */
  {
    const P = makePage({ prefs: { hj_stage_song: SHORT.id, hj_stage_diff: "hard", hj_stage_range: "free", hj_stage_judge: "hover" } });
    await openStage(P);
    check("双放水：大厅按钮写「自动演奏」", P.$("#hjsGo").textContent.includes("自动演奏") && /自动演奏/.test(P.$(".hjs-tip").textContent));
    P.click(P.btn("设置"));
    check("双放水：设置里写明是自动演奏", /自动演奏/.test(P.$("#hjsSheetCard").textContent));
    P.click(P.btn("关闭", P.$("#hjsSheetCard")));
    await go(P);
    check("双放水：标题下写自动演奏、分数栏写自动演奏", /自动演奏/.test(P.$("#hjsNowS").textContent) && P.$("#hjsScoreL").textContent === "自动演奏" && P.st().auto);
    const ns = P.st().notes;
    P.until(ns[0].t - 0.1);
    P.pointer(5, 5);
    check("自动演奏：点了不算（也不记点空）", P.st().judged[0] === -1);
    P.until(P.st().endT + 2);
    const st = P.st();
    check("自动演奏：每个音都到点自动弹中（全 PERFECT）", st.judged.length === ns.length && st.judged.every((j) => j === 0), JSON.stringify(st.counts));
    const hits = P.midi.filter((m) => m.vel === 1).length;
    check("自动演奏：每个音都发声", hits === ns.length, `${hits}/${ns.length}`);
    check("自动演奏：不计分", st.score === 0 && /0 分|自动演奏/.test(P.$("#hjsModal").textContent));
    const tags = P.$(".hjs-res-tags").textContent;
    check("结算：难度、判定放水、范围放水、模式自动演奏", ["难度泰坦", "判定放水", "范围放水", "模式自动演奏"].every((x) => tags.includes(x)), tags);
    check("结算写明不计分、不记纪录，评级为「完成」", /不计分、不记录/.test(P.$("#hjsModal").textContent) && P.$(".hjs-res-rank")?.textContent === "完成");
    check("自动演奏不写本机纪录", !P.mem.get("hj_stage_best3") && !P.mem.get("hj_stage_best2"));
  }

  /* 20. 飞花线：萤火虫大小的花沿曲线匀速掠过每个气泡，在气泡该判定的那一刻正好经过它；全部画在一张 canvas 上 */
  {
    const P = makePage({ prefs: { hj_stage_song: SHORT.id, hj_stage_diff: "normal", hj_stage_fly: "1" } });
    await openStage(P);
    P.click(P.btn("设置"));
    check("飞花线开关记得住（打开）", P.$('[aria-label="飞花线"]').checked);
    P.click(P.btn("关闭", P.$("#hjsSheetCard")));
    await go(P);
    const box = P.$("#hjsFly");
    check("飞花线（正常显示）：一朵花和 16 颗星星元素，没有整屏 canvas", !box.hidden && !!P.$(".hjs-fly-flower") && P.$$(".hjs-fly-star").length === 16 && !P.$("#hjsFly canvas") && !P.$(".hjs-fly-svg"));
    const g = P.st().g;
    const ns = P.st().notes;
    P.until(ns[0].t - 0.3);
    const fp0 = P.st().flyPos;
    check("飞花线：开始时花在第一个气泡的位置", fp0 && Math.hypot(fp0.x - ns[0].x, fp0.y - ns[0].y) < 1, JSON.stringify(fp0));
    const k = ns.findIndex((a, i) => i > 1 && a.t - ns[i - 1].t > 0.4 && Math.hypot(a.x - ns[i - 1].x, a.y - ns[i - 1].y) > g.size);
    if (k > 0) {
      const a = ns[k - 1], b = ns[k];
      P.until((a.t + b.t) / 2);
      const m = P.st().flyPos;
      const dA = Math.hypot(m.x - a.x, m.y - a.y), dB = Math.hypot(m.x - b.x, m.y - b.y), dAB = Math.hypot(a.x - b.x, a.y - b.y);
      check("飞花线：两个气泡之间是在路上（不是跳过去）", dA > dAB * 0.2 && dB > dAB * 0.2, `${dA.toFixed(0)}/${dB.toFixed(0)}/${dAB.toFixed(0)}`);
      check("飞花线（正常显示）：飞的时候身后撒星星（最多 16 颗）", !m.line && m.stars > 0 && m.stars <= 16, `stars=${m.stars}`);
      const lit = P.$$(".hjs-fly-star").filter((e) => +e.style.opacity > 0);
      check("星星只用 transform / opacity", lit.length > 0 && lit.every((e) => /translate3d\(.*rotate\(.*scale\(/.test(e.style.transform)), lit[0]?.style.transform);
      check("花的位置和转角写在同一个 transform 里（不跑 CSS 动画）", /translate3d\(.*rotate\(/.test(P.$(".hjs-fly-flower").style.transform), P.$(".hjs-fly-flower").style.transform);
      P.until(b.t);
      const e = P.st().flyPos;
      check("飞花线：气泡该判定的那一刻正好经过它", Math.hypot(e.x - b.x, e.y - b.y) < g.size * 0.05, `${Math.hypot(e.x - b.x, e.y - b.y).toFixed(2)}`);
    }
    check("飞花线：在气泡下面一层（不挡音名）", box.compareDocumentPosition(P.$("#hjsNotes")) & P.win.Node.DOCUMENT_POSITION_FOLLOWING);
    P.until(P.st().endT + 2.5);
    const d1 = P.st().flyPos.draws;
    P.advance(0.3);
    check("飞花线：曲子放完、星星散完后不再改任何东西", P.st().flyPos.draws === d1 && P.st().flyPos.stars === 0 && P.$$(".hjs-fly-star").every((e) => !+e.style.opacity), `${d1}→${P.st().flyPos.draws}`);
    const Q = makePage({ prefs: { hj_stage_song: SHORT.id, hj_stage_fly: "1", hj_stage_render: "simple" } });
    await openStage(Q);
    await go(Q);
    const qs = Q.st().notes;
    const qk = qs.findIndex((a, i) => i > 1 && a.t - qs[i - 1].t > 0.4 && Math.hypot(a.x - qs[i - 1].x, a.y - qs[i - 1].y) > Q.st().g.size);
    Q.until((qs[qk - 1].t + qs[qk].t) / 2);
    const dpath = Q.$(".hjs-fly-svg path").getAttribute("d") || "";
    check("飞花线（简单显示）：一条平滑的细线（SVG 路径，二次曲线连接），没有星星", Q.st().flyPos.line && !Q.$(".hjs-fly-star") && /^M[\d.\- ]+Q/.test(dpath) && (dpath.match(/Q/g) || []).length >= 10, dpath.slice(0, 60));
    Q.until(Q.st().endT + 1);
    check("花停下后线清空", (Q.$(".hjs-fly-svg path").getAttribute("d") || "") === "");
  }

  /* 21. 百万分制与得分上限：全 PERFECT 正好 100 万（完美）；宽松 / 放水按组合有上限，打满正好等于上限 */
  {
    const runAll = async (prefs) => {
      const P = makePage({ prefs: { hj_stage_song: SHORT.id, hj_stage_diff: "easy", ...prefs } });
      await openStage(P);
      const tip = P.$(".hjs-tip").textContent;
      await go(P);
      const ns = P.st().notes;
      const live = [];
      for (const n of ns) { P.until(n.t); P.pointer(n.x, n.y); live.push(P.st().score); }
      P.until(P.st().endT + 2);
      return { score: P.st().score, cap: P.st().cap, tip, live, rank: P.$(".hjs-res-rank span")?.textContent,
        res: P.$("#hjsModal").textContent, perfect: P.st().counts.perfect === ns.length };
    };
    const base = await runAll({});
    check("全 PERFECT 全连：正好 1,000,000 分、评级「完美」", base.perfect && base.score === 1000000 && base.rank === "完美", `${base.score} ${base.rank}`);
    check("演奏中分数只涨不跌，最后一个音打完正好满分", base.live.every((v, i) => i === 0 || v >= base.live[i - 1]) && base.live[base.live.length - 1] === 1000000);
    check("没有上限时不写上限", !/得分上限/.test(base.res) && !/得分上限/.test(base.tip));
    const cases = [
      [{ hj_stage_judge: "loose" }, 800000, "宽松判定"],
      [{ hj_stage_range: "loose" }, 800000, "宽松范围"],
      [{ hj_stage_judge: "loose", hj_stage_range: "loose" }, 700000, "宽松判定、宽松范围"],
      [{ hj_stage_judge: "hover" }, 650000, "放水判定"],
      [{ hj_stage_range: "free" }, 650000, "放水范围"],
      [{ hj_stage_judge: "hover", hj_stage_range: "loose" }, 600000, "放水判定、宽松范围"],
      [{ hj_stage_judge: "loose", hj_stage_range: "free" }, 600000, "宽松判定、放水范围"],
    ];
    for (const [prefs, cap, why] of cases) {
      const r = await runAll(prefs);
      check(`得分上限 ${cap / 10000} 万（${why}）：打满正好等于上限`, r.cap === cap && r.perfect && r.score === cap, `${r.cap} ${r.score}`);
      check(`结算写明「得分上限 ${cap / 10000} 万」，大厅提示保持简短`, !r.tip.includes("得分上限") && r.res.includes(`得分上限 ${cap / 10000} 万`), r.tip);
    }
    /* 上限的九成以内照算，往上压进最后一成；每多一分原始分都还有分 */
    const P = makePage({ prefs: { hj_stage_song: SHORT.id } });
    await openStage(P);
    check("软上限：九成以内不变、往上压缩、到 100 万正好是上限", expectScore({ sumW: 3 * 100 * 0.6, n: 100, maxCombo: 0, cap: 800000 }) === expectScore({ sumW: 3 * 100 * 0.6, n: 100, maxCombo: 0 })
      && expectScore({ sumW: 300, n: 100, maxCombo: 100, cap: 800000 }) === 800000
      && expectScore({ sumW: 299, n: 100, maxCombo: 100, cap: 800000 }) < 800000
      && expectScore({ sumW: 299, n: 100, maxCombo: 100, cap: 800000 }) > expectScore({ sumW: 298, n: 100, maxCombo: 100, cap: 800000 }));
  }

  /* 22. 简单显示不限帧：120 Hz 下每帧都更新；气泡只改外圈、核心的 transform，音名一次性淡入 */
  {
    const P = makePage({ prefs: { hj_stage_song: SHORT.id, hj_stage_render: "simple" } });
    await openStage(P);
    await go(P);
    P.until(P.st().notes[0].t - 0.5);
    const ring = () => P.$(".hjs-note .hjs-ring").style.transform;
    const ks = [];
    for (let i = 0; i < 8; i++) { P.advance(1 / 120); ks.push(ring()); }
    check("简单显示：不限帧，120 Hz 下每帧都更新", ks.filter((k, i) => i && k !== ks[i - 1]).length === 7, ks.join(","));
    check("气泡不再每帧改 CSS 变量", !P.$(".hjs-note").style.getPropertyValue("--k"));
    check("音名只改透明度（常驻一层），过半后渐亮", +P.$(".hjs-note .hjs-name").style.opacity > 0);
  }

  /* 23. 暂停后继续：和开头一样的预备拍（四下嗒、后三下 3·2·1），倒数时钟不走、点了不算，数完接着走 */
  {
    const P = makePage({ prefs: { hj_stage_song: SHORT.id } });
    await openStage(P);
    await go(P);
    const ns = P.st().notes;
    P.until(ns[2].t - 0.6);
    P.key("Escape", "Escape");
    const t0 = P.pos();
    const ticks0 = P.midi.filter((m) => m.vel === 0.32).length;
    P.click(P.btn("继续", P.$("#hjsModal")));
    check("继续：第一下嗒先不出数字、钟还没走", P.st().resuming && P.$("#hjsBanner").textContent === "" && !P.st().clock.run && P.$("#hjsModal").hidden);
    await sleep(P.st().spb * 1000 + 60);
    check("第二下出 3", /3/.test(P.$("#hjsBanner").textContent), P.$("#hjsBanner").textContent);
    P.pointer(ns[2].x, ns[2].y);
    check("倒数时点了不算", P.st().judged[2] === -1);
    await sleep(P.st().spb * 3000 + 300);
    P.advance(0.02);
    const ticks1 = P.midi.filter((m) => m.vel === 0.32).length;
    check("四下嗒之后再过一拍接着走，从暂停处开始", !P.st().resuming && P.st().clock.run && ticks1 - ticks0 === 4 && Math.abs(P.pos() - t0 - 0.02) < 0.01, `ticks=${ticks1 - ticks0} dt=${(P.pos() - t0).toFixed(3)}`);
    P.key("Escape", "Escape");
    P.click(P.btn("继续", P.$("#hjsModal")));
    P.key("Escape", "Escape");
    check("倒数时再按暂停：回到暂停", P.st().paused && !P.st().resuming && !P.$("#hjsModal").hidden);
  }

  /* 24. 飞花线的图片一直解码不完（比如页面在后台）：最多等 2.5 秒就开演，不会卡在准备音色 */
  {
    const P = makePage({ prefs: { hj_stage_song: SHORT.id, hj_stage_fly: "1" } });
    P.win.HTMLImageElement.prototype.decode = () => new Promise(() => {});
    await openStage(P);
    await go(P);
    await sleep(2700);
    P.advance(0.05);
    check("图片解码卡住也最多等 2.5 秒就开演", P.st().playing && P.st().clock.run);
  }

  /* 25. 点空的原因：偏早 / 点偏 */
  {
    const P = makePage({ prefs: { hj_stage_song: SHORT.id, hj_stage_diff: "hard" } });
    await openStage(P);
    await go(P);
    const ns = P.st().notes, g = P.st().g;
    const k = ns.findIndex((a, i) => i > 1 && a.t - ns[i - 1].t > 0.45);
    ns.slice(0, k).forEach((a) => { P.until(a.t); P.pointer(a.x, a.y); });
    P.until(ns[k].t - 0.4);                            // 泰坦正常判定 GOOD 只到 0.29 秒：早 0.4 秒点在气泡上
    P.pointer(ns[k].x, ns[k].y);
    check("点空原因：偏早", P.st().ghostWhy.early === 1 && P.st().judged[ns[k].idx] === -1, JSON.stringify(P.st().ghostWhy));
    P.until(ns[k].t);
    P.pointer(ns[k].x > g.w / 2 ? 10 : g.w - 10, ns[k].y > g.h / 2 ? g.top : g.bottom);
    check("点空原因：时间对但点偏了", P.st().ghostWhy.off === 1, JSON.stringify(P.st().ghostWhy));
    P.until(P.st().endT + 2);
    check("结算写明点空原因", /点空 \d+ 次（偏早 1 · 点偏 1/.test(P.$("#hjsModal").textContent), (P.$("#hjsModal").textContent.match(/点空[^）]*）/) || [""])[0]);
  }

  /* 26. JUST：比 GOOD 早 / 晚出去不到 0.1 秒算 JUST —— 给一点分、出声、断连击；再远就是点空 */
  {
    /* 挑一首泰坦难度里有几个前后都空出 0.8 秒的音的曲子（短的优先） */
    const hardTimes = (id) => { let ms = 0; return chartOf(id).n.map((r) => { ms += r[0]; return [ms / 1000, r[2]]; }).filter((x) => x[1] >= 1).map((x) => x[0]); };
    const lone = (ts) => ts.map((_, i) => i).filter((i) => i > 0 && i + 1 < ts.length && ts[i] - ts[i - 1] > 0.8 && ts[i + 1] - ts[i] > 0.8);
    const song = SONGS.songs.slice().sort((x, y) => x.dur - y.dur).find((x) => lone(hardTimes(x.id)).length >= 3);
    const P = makePage({ prefs: { hj_stage_song: song.id, hj_stage_diff: "hard" } });   // 泰坦正常判定：GOOD 到 0.29 秒
    await openStage(P);
    await go(P);
    const ns = P.st().notes;
    const gaps = (i) => i > 0 && ns[i + 1] && ns[i].t - ns[i - 1].t > 0.8 && ns[i + 1].t - ns[i].t > 0.8;
    const ks = ns.map((_, i) => i).filter(gaps).slice(0, 3);
    check("JUST 测试找得到合适的曲子", ks.length === 3, song && song.id);
    if (ks.length === 3) {
      let i0 = 0;
      const playTo = (k) => { ns.slice(i0, k).forEach((a) => { P.until(a.t); P.pointer(a.x, a.y); }); i0 = k + 1; };
      playTo(ks[0]);
      const a = ns[ks[0]];
      const combo0 = P.st().combo, score0 = P.st().score, sounds0 = P.midi.filter((m) => m.vel === 0.65).length;
      P.until(a.t + 0.34);                              // 晚 0.34 秒：过了 GOOD（0.29），还在 JUST 里（0.29 × 4/3 ≈ 0.39），还没判 MISS
      P.pointer(a.x, a.y);
      check("晚出 GOOD 不到 0.1 秒：JUST", P.st().judged[a.idx] === 4 && /JUST/.test(P.$("#hjsJudge").textContent), `judged=${P.st().judged[a.idx]}`);
      check("JUST 断连击、给一点分、出声", combo0 > 0 && P.st().combo === 0 && P.st().score > score0 && P.midi.filter((m) => m.vel === 0.65).length === sounds0 + 1, `combo ${combo0}→${P.st().combo} +${P.st().score - score0}`);
      playTo(ks[1]);
      const b = ns[ks[1]];
      P.until(b.t - 0.35);                              // 早 0.35 秒
      P.pointer(b.x, b.y);
      check("早出 GOOD 不到 0.1 秒：JUST", P.st().judged[b.idx] === 4, `judged=${P.st().judged[b.idx]}`);
      playTo(ks[2]);
      const c = ns[ks[2]];
      const g0 = P.st().ghostWhy.early;
      P.until(c.t - 0.45);                              // 早 0.45 秒：超出 JUST
      P.pointer(c.x, c.y);
      check("再早就是点空", P.st().judged[c.idx] === -1 && P.st().ghostWhy.early === g0 + 1);
      P.until(P.st().endT + 2);
      check("结算有 JUST 一格（PERFECT / GREAT / GOOD / JUST / MISS）", P.$$(".hjs-res-grid .hjs-cell small").map((e) => e.textContent).join() === "PERFECT,GREAT,GOOD,JUST,MISS" && P.st().counts.just === 2);
      check("有 JUST 就没有 FULL COMBO", !/FULL COMBO/.test(P.$("#hjsModal").textContent));
    }
  }

  /* 27. 暂停时显示到目前为止的成绩 */
  {
    const P = makePage({ prefs: { hj_stage_song: SHORT.id } });
    await openStage(P);
    await go(P);
    const ns = P.st().notes;
    ns.slice(0, 5).forEach((a) => { P.until(a.t); P.pointer(a.x, a.y); });
    P.key("Escape", "Escape");
    const card = P.$("#hjsModal").textContent;
    check("暂停卡：进度、分数、准确率、连击、各档计数", /进度 \d+:\d\d \/ \d+:\d\d/.test(card) && card.includes(P.$("#hjsScore").textContent) && /准确率 100\.0% · 连击 5 · 最大连击 5/.test(card) && P.$$("#hjsModal .hjs-cell").length === 5 && P.$("#hjsModal .hjs-cell.is-perfect b").textContent === "5", card.slice(0, 80));
    P.click(P.btn("停止演奏", P.$("#hjsModal")));
    const Q = makePage({ prefs: { hj_stage_song: SHORT.id } });
    await openStage(Q);
    await go(Q);
    Q.until(Q.st().notes[0].t - 0.5);
    Q.key("Escape", "Escape");
    check("还没弹时暂停：准确率显示 —", /准确率 — · 连击 0/.test(Q.$("#hjsModal").textContent));
  }

  /* 28. JUST 的宽度按 GOOD 的三分之一：仙人刺（GOOD 0.45）晚 0.58 秒还是 JUST，泰坦（0.29）晚 0.4 秒就判 MISS */
  {
    const easyTimes = (id) => { let ms = 0; return chartOf(id).n.map((r) => { ms += r[0]; return [ms / 1000, r[2]]; }).filter((x) => x[1] >= 3).map((x) => x[0]); };
    const ok = (ts) => ts.some((t, i) => i > 0 && i + 1 < ts.length && t - ts[i - 1] > 1 && ts[i + 1] - t > 1);
    const song = SONGS.songs.slice().sort((x, y) => x.dur - y.dur).find((x) => ok(easyTimes(x.id)));
    const P = makePage({ prefs: { hj_stage_song: song.id, hj_stage_diff: "easy" } });
    await openStage(P);
    await go(P);
    const ns = P.st().notes;
    const k = ns.findIndex((a, i) => i > 0 && ns[i + 1] && a.t - ns[i - 1].t > 1 && ns[i + 1].t - a.t > 1);
    check("仙人刺 JUST 测试找得到合适的曲子", k > 0, song && song.id);
    if (k > 0) {
      ns.slice(0, k).forEach((a) => { P.until(a.t); P.pointer(a.x, a.y); });
      P.until(ns[k].t + 0.58);
      check("仙人刺：晚 0.58 秒（GOOD 0.45 + 0.15 以内）还算 JUST", P.st().judged[ns[k].idx] === -1 && (P.pointer(ns[k].x, ns[k].y), P.st().judged[ns[k].idx] === 4), `judged=${P.st().judged[ns[k].idx]}`);
    }
  }

  /* 13. 百万分制以前的纪录（hj_stage_best2：曲目:难度[:判定模式[:点击范围]]）按准确率与最大连击换算 */
  {
    const n = firstSong.cnt[1];
    const conv = (acc, combo, cap) => expectScore({ sumW: (acc / 100) * 3 * n, n, maxCombo: combo, cap });
    const fmt = (v) => v.toLocaleString("en-US");
    const old = JSON.stringify({ [`${firstSong.id}:normal`]: { score: 12345, acc: 90, rank: "A", combo: 10 } });
    const A = makePage({ prefs: { hj_stage_best2: old } });
    await openStage(A);
    check("旧纪录不算进正常判定", !/本机纪录/.test(A.$(".hjs-ctrl").textContent));
    const B = makePage({ prefs: { hj_stage_best2: old, hj_stage_judge: "loose", hj_stage_range: "loose" } });
    await openStage(B);
    const wb = conv(90, 10, 700000);
    check("最早的旧纪录（曲目:难度）算宽松判定 + 宽松范围，按准确率换算成百万分制", B.$(".hjs-best")?.textContent.includes(`本机纪录（魔界花 · 宽松判定 · 宽松范围）· ${fmt(wb)} 分 · `), `${B.$(".hjs-best")?.textContent} / ${wb}`);
    const mid = JSON.stringify({ [`${firstSong.id}:normal:normal`]: { score: 2222, acc: 99.5, rank: "SS", combo: n } });
    const C = makePage({ prefs: { hj_stage_best2: mid } });
    await openStage(C);
    const wc = conv(99.5, n, 1000000);
    check("加点击范围以前的纪录（曲目:难度:判定模式）算正常范围，全连按 30 万连击分", C.$(".hjs-best")?.textContent.includes(`· ${fmt(wc)} 分 · SSS`), `${C.$(".hjs-best")?.textContent} / ${wc}`);
    const D = makePage({ prefs: { hj_stage_best2: mid, hj_stage_range: "loose" } });
    await openStage(D);
    check("换了点击范围就不显示别的范围的纪录", !/本机纪录/.test(D.$(".hjs-ctrl").textContent));
    const both = { hj_stage_best2: mid, hj_stage_best3: JSON.stringify({ [`${firstSong.id}:normal:normal:normal`]: { score: 500000, rank: "C" } }) };
    const E = makePage({ prefs: both });
    await openStage(E);
    check("新旧纪录都有时显示分高的", E.$(".hjs-best")?.textContent.includes(`${fmt(wc)} 分`), E.$(".hjs-best")?.textContent);
  }

  /* 25. 隐藏曲目：songs.json 只有公开曲目；搜索框输入曲库密码按回车换成全部曲目，凭证记在本机，下次打开自动换 */
  {
    const ALL = JSON.parse(JSON.stringify(SONGS));
    const worker = (p) => {
      if (p.action !== "stage_unlock") return { ok: false, error: "unknown_action" };
      if (p.password === "月见草" || p.token === "tk1") return { ok: true, token: "tk2", ...ALL };
      return { ok: false, error: "auth" };
    };
    const hidden = SONGS.songs.find((s) => !PUBLIC.songs.some((x) => x.id === s.id));
    check("公开曲库只有 show=True 的曲子，first 也是公开的", PUBLIC.songs.length > 0 && PUBLIC.songs.length < SONGS.songs.length && PUBLIC.songs.some((s) => s.id === PUBLIC.first), `${PUBLIC.songs.length}/${SONGS.songs.length}`);
    const P = makePage({ publicOnly: true, worker, prefs: { hj_stage_song: hidden.id } });
    await openStage(P);
    check("没输密码：存着的隐藏曲目不选，改选公开的", P.st().song === PUBLIC.first, P.st().song);
    check("网页不直接读 songs-all.json", !P.fetched.some((u) => /songs-all/.test(u)));
    P.click(P.btn("更换曲目"));
    check("选曲窗口只有公开曲目", P.$$(".hjs-song").length === PUBLIC.songs.length && /\d+ \/ \d+ 首/.test(P.$("#hjsCount").textContent), P.$("#hjsCount").textContent);
    check("公开曲目只有一个分类：不显示分类筛选，也不多出 null 字样", !P.$(".hjs-chips.is-cat") && !/null|undefined/.test(P.$("#hjsSheetCard").textContent));
    const input = P.$(".hjs-search-in");
    const enter = (text) => {
      input.value = text;
      input.dispatchEvent(new P.win.Event("input", { bubbles: true }));
      input.dispatchEvent(new P.win.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    };
    enter("不对的密码");
    await sleep(5);
    check("密码不对：什么也不说，还是公开曲目", P.$$(".hjs-song").length <= PUBLIC.songs.length && !P.toasts.length && !P.mem.get("hj_stage_unlock"), P.toasts.join());
    check("回车时把搜索框里的字发给 Worker 核对", P.calls.some((c) => c.action === "stage_unlock" && c.password === "不对的密码"));
    enter("月见草");
    await sleep(5);
    check("密码对了：显示全部曲目、清空搜索、提示一下", P.$$(".hjs-song").length === SONGS.songs.length && P.$(".hjs-search-in").value === "" && /已显示全部曲目/.test(P.toasts.join()), `${P.$$(".hjs-song").length} ${P.toasts.join()}`);
    check("凭证记在本机", P.mem.get("hj_stage_unlock") === "tk2");
    const n0 = P.calls.length;
    enter("别的字");
    await sleep(5);
    check("已经显示全部曲目后，回车不再发给 Worker", P.calls.length === n0);
    const Q = makePage({ publicOnly: true, worker, prefs: { hj_stage_song: hidden.id, hj_stage_unlock: "tk1" } });
    await openStage(Q);
    await sleep(5);
    Q.advance(0.02);
    check("有凭证：打开舞台就是全部曲目，选回存着的隐藏曲目", Q.st().song === hidden.id && Q.calls.some((c) => c.token === "tk1") && Q.mem.get("hj_stage_unlock") === "tk2", Q.st().song);
    const R = makePage({ publicOnly: true, worker, prefs: { hj_stage_unlock: "old" } });
    await openStage(R);
    await sleep(5);
    check("凭证失效（换了密码、过期）：删掉凭证，用公开曲目", !R.mem.get("hj_stage_unlock") && R.st().song === PUBLIC.first);
  }

  const failed = results.filter((r) => !r[1]);
  results.forEach(([name, ok, extra]) => console.log(`${ok ? "✓" : "✗"} ${name}${extra ? `  (${extra})` : ""}`));
  console.log(failed.length ? `\n${failed.length} 项没通过 / 共 ${results.length} 项` : `\n全部通过：${results.length}/${results.length}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
