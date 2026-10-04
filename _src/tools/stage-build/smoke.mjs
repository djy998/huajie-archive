/* 舞台演奏的运行时冒烟测试：用 jsdom 直接跑 _src/bard-stage.js 本体（不是重写一份逻辑），音频时钟由测试手动推进
   覆盖：大厅 → 选曲窗口（搜索 / 分类 / 星级 / 试听）→ 设置窗口（点击范围、画面、判定模式）→ 电脑点气泡演奏（鼠标指着按键、
   中文输入法、漏音不出声、补音、预备拍、声像居中）→ 手机点气泡（旁边一点也算）→ 学习模式停在这一拍 → 暂停 / 继续 → 结算与纪录
   → 示范旋律 → 谱面下载失败 → 音频叫不醒时点一下开始 → 延迟校准 → 返回键 → 判定模式（正常 / 宽松 / 放水）→ 常驻连击与 FULL COMBO
   → 点击范围（正常 / 宽松 / 放水）→ 双放水自动演奏 → 纪录按判定模式与点击范围分开 → 飞花线
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
const SONGS = JSON.parse(readFileSync(path.join(STAGE, "songs.json"), "utf8"));
const chartOf = (id) => JSON.parse(readFileSync(path.join(STAGE, "charts", `${id}.json`), "utf8"));
/* 一路弹到底的场景用最短的一首，省时间 */
const SHORT = SONGS.songs.reduce((a, b) => (b.dur < a.dur ? b : a));

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
function makePage({ coarse = false, width = 1280, height = 800, chartFails = false, running = true, lat = 0, prefs = {} } = {}) {
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
  const P = { mem, toasts: [], midi: [], unlocks: 0, now: 1000, audioT: 5, running, lat, frames: [], fetched: [] };
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
  win.cancelAnimationFrame = () => {};
  win.fetch = async (url) => {
    const u = String(url);
    P.fetched.push(u);
    if (/songs\.json/.test(u)) return { ok: true, json: async () => JSON.parse(JSON.stringify(SONGS)) };
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
  check("每首都有谱面、级别嵌套（轻松 ⊂ 标准 ⊂ 挑战）、音数和索引一致", bad.length === 0, bad.map((s) => s.id).join(","));

  /* 1. 大厅与选曲 */
  {
    const P = makePage();
    await openStage(P);
    check("打开后在大厅", P.st().view === "lobby" && !P.$("#hjStage").hidden);
    check("大厅显示当前曲目", P.$(".hjs-hero-t")?.textContent === firstSong.t);
    check("大厅先把当前曲目的谱面下好", P.fetched.some((u) => u.includes(`charts/${firstSong.id}.json`)));
    check("大厅不再提伴奏音轨", !/伴奏/.test(P.$("#hjsLobby").textContent));
    check("大厅有「离开舞台」按钮", !!P.btn("离开舞台"));
    await sleep(300);
    check("舞台盖满后下面的网站藏起来（hjs-covered）", P.doc.body.classList.contains("hjs-covered"));
    check("背景音乐被暂停", P.win.bgm.playing === false);
    check("开舞台时压入一条历史记录（返回键回上一层）", P.win.history.state && P.win.history.state.hjStage === 1);
    check("默认操作方式是点气泡（电脑也是）", /点气泡/.test(P.$(".hjs-ctrl-tip").textContent));

    P.click(P.btn("换一首"));
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

    check("曲库每首都有三档星级（轻松 1~3、标准 2~4、挑战 3~5，越难不越低）", SONGS.songs.every((s) => Array.isArray(s.diffs) && s.diffs.every((d, k) => d >= k + 1 && d <= k + 3) && s.diffs[0] <= s.diffs[1] && s.diffs[1] <= s.diffs[2]));
    P.click(P.$$(".hjs-chips:not(.is-cat) .hjs-chip")[4]);
    const four = SONGS.songs.filter((s) => s.diffs[1] === 4).length;
    check("四星筛选（按当前难度「标准」）", four > 0 && P.$$(".hjs-song").length === four && /星级按标准/.test(P.$("#hjsCount").textContent), `${P.$$(".hjs-song").length}/${four}`);
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
    P.click(P.btn("就弹这首"));
    check("就弹这首：关窗口、停试听、大厅换成这首", P.st().sheet === "" && P.st().preview === "" && P.$(".hjs-hero-t").textContent === target.t);
    P.key("Escape", "Escape");
    {
      const cur = SONGS.songs.find((x) => x.t === P.$(".hjs-hero-t").textContent);
      const heroStars = () => (P.$(".hjs-hero .hjs-stars").textContent.match(/★/g) || []).length;
      const before = heroStars();
      P.click(P.btn("挑战"));
      check("大厅星级跟着难度变（标准 → 挑战）", before === cur.diffs[1] && heroStars() === cur.diffs[2], `${before}→${heroStars()} ${cur.diffs}`);
      P.click(P.btn("标准"));
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
    check("画面里有飞花线开关，默认关", P.$('[aria-label="飞花线"]') && !P.$('[aria-label="飞花线"]').checked);
    check("设置窗口单独打开", P.st().sheet === "settings" && !!P.$(".hjs-sheet-card.is-settings"));
    check("设置里不再提伴奏", !/伴奏/.test(sheet.textContent));
    P.click(P.btn("关闭", sheet));

    await go(P);
    const st = P.st();
    check("开始演奏：点气泡，没有轨道和键帽", st.view === "play" && st.playing && !P.$(".hjs-lane") && !P.$(".hjs-cap"));
    check("飞花线默认关：不显示", P.$("#hjsFly").hidden && !P.$(".hjs-fly-flower"));
    check("轻松难度：气泡数等于谱面里级别 3 的音", st.notes.length === SHORT.cnt[0], `${st.notes.length}/${SHORT.cnt[0]}`);
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
    P.until(n1.t + 0.57);                         // 轻松难度 0.45 秒判定窗 + 0.1 秒余量之后才算漏
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
    check("再按 Esc 继续", !P.st().paused && P.st().clock.run && P.$("#hjsModal").hidden);
    P.advance(0.05);
    check("继续后从暂停处接着走", Math.abs(P.pos() - tPause - 0.05) < 1e-6, `${(P.pos() - tPause).toFixed(3)}`);

    /* 主线程忙：点按晚 200 ms 才处理，按事件时间补回 50 ms → 判成晚 150 ms，仍在轻松的 PERFECT（0.16 秒）以内 */
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
    check("结算里有手感诊断（平均早晚）", /不早不晚|平均偏/.test(P.$("#hjsModal").textContent));
    check("结算里有设备诊断（输出延迟、点按排队、掉帧）", /输出延迟 \d+ ms · 点按排队 \d+ ms · 掉帧 \d+%/.test(P.$(".hjs-res-diag")?.textContent || ""), P.$(".hjs-res-diag")?.textContent);
    check("帧率稳定时：掉帧 0%、认出 60 Hz", /掉帧 0%（60 Hz，最长一帧 1\d ms）/.test(P.$(".hjs-res-diag")?.textContent || ""), P.$(".hjs-res-diag")?.textContent);
    check("结算计数对得上", fin.counts.perfect === notes.length - 1 && fin.counts.miss === 1, JSON.stringify(fin.counts));
    check("有 MISS 就没有 FULL COMBO（也不多出 null 字样）", !/FULL COMBO|null|undefined/.test(P.$("#hjsModal").textContent));
    check("结算不再提示去校准", !/一直这样/.test(P.$("#hjsModal").textContent));
    const best = JSON.parse(P.mem.get("hj_stage_best2") || "{}");
    check("本机纪录按难度、判定模式、点击范围分开写入", best[`${fin.song}:easy:normal:normal`] && best[`${fin.song}:easy:normal:normal`].score === fin.score && Object.keys(best).length === 1, Object.keys(best).join());
    check("结算分别显示难度、判定模式、点击范围", ["难度轻松", "判定正常", "范围正常"].every((x) => P.$(".hjs-res-tags").textContent.includes(x)), P.$(".hjs-res-tags")?.textContent);
    check("结算里是「结束演奏」，没有「回大厅」", !!P.btn("结束演奏", P.$("#hjsModal")) && !P.btn("回大厅", P.$("#hjsModal")));
    P.click(P.btn("结束演奏", P.$("#hjsModal")));
    check("结束演奏回到大厅", P.st().view === "lobby" && /本机纪录/.test(P.$(".hjs-ctrl").textContent));
  }

  /* 3. 点气泡（手机）：旁边一点也算，远了不算 */
  {
    const P = makePage({ coarse: true, width: 390, height: 844, prefs: { hj_stage_range: "loose" } });   // 宽松点击范围：1.7 / 2.2 个气泡
    await openStage(P);
    check("手机默认点气泡提示", /点气泡/.test(P.$(".hjs-ctrl-tip").textContent));
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
    check("谱面没下载到：回大厅并提示", P.st().view === "lobby" && P.toasts.some((t) => /谱面没加载上/.test(t)));
  }

  /* 7. 音频叫不醒 → 点一下屏幕开始 */
  {
    const P = makePage({ running: false });
    await openStage(P);
    await go(P);
    check("音频没起来时先不开钟", !P.st().playing);
    P.now += 1600;
    await sleep(80);
    check("等不到音频：提示点一下屏幕", /点一下屏幕开始/.test(P.$("#hjsBanner").textContent));
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
    P.click(P.btn("怎么玩"));
    check("玩法说明讲清 MISS 和点空的区别", /MISS 和「点空」不一样/.test(P.$("#hjsSheetCard").textContent));
    P.win.dispatchEvent(new P.win.PopStateEvent("popstate", { state: null }));
    check("返回键先关窗口", P.st().sheet === "" && !P.$("#hjStage").hidden);
    P.win.dispatchEvent(new P.win.PopStateEvent("popstate", { state: null }));
    check("再按返回键离开舞台", P.$("#hjStage").classList.contains("is-leaving"));
  }

  /* 10. 判定模式：正常按难度收紧，宽松三档都按轻松；全弹中出 FULL COMBO，连击一直显示 */
  for (const [judge, want] of [["normal", 1], ["loose", 0]]) {
    const P = makePage({ prefs: { hj_stage_song: SHORT.id, hj_stage_diff: "hard", ...(judge === "normal" ? {} : { hj_stage_judge: judge }) } });
    await openStage(P);
    await go(P);
    const ns = P.st().notes;
    P.until(ns[0].t + 0.15);                    // 晚 150 ms：挑战正常判定 GREAT（0.11 < 0.15 < 0.19），宽松 PERFECT（< 0.18）
    P.pointer(ns[0].x, ns[0].y);
    check(`${judge === "normal" ? "正常判定（默认）" : "宽松判定"}：挑战难度晚 150 ms 判 ${want ? "GREAT" : "PERFECT"}`, P.st().judged[0] === want, `judged=${P.st().judged[0]}`);
    for (let i = 1; i < ns.length; i++) {
      P.until(ns[i].t);
      P.pointer(ns[i].x, ns[i].y);
      if (i === 5) check("连击数一直显示在判定字下方", P.$("#hjsComboN").textContent === "6" && !P.$("#hjsComboBig").classList.contains("is-zero"), P.$("#hjsComboN").textContent);
    }
    P.until(P.st().endT + 2);
    check(`${judge}：全部弹中 → FULL COMBO!`, P.st().finished && /FULL COMBO!/.test(P.$("#hjsModal").textContent) && !/null|undefined/.test(P.$("#hjsModal").textContent));
    if (judge === "loose") check("结算显示：难度挑战、判定宽松", /难度挑战/.test(P.$(".hjs-res-tags").textContent) && /判定宽松/.test(P.$(".hjs-res-tags").textContent));
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
    const rec = JSON.parse(P.mem.get("hj_stage_best2") || "{}");
    check("放水判定：纪录单独记在 :normal:hover:normal 下", !!rec[`${SHORT.id}:normal:hover:normal`] && Object.keys(rec).length === 1, Object.keys(rec).join(","));
  }

  /* 12. 电脑点气泡（非放水）：鼠标指着气泡按任意键也算点 */
  {
    const P = makePage({ prefs: { hj_stage_song: SHORT.id, hj_stage_diff: "normal" } });
    await openStage(P);
    check("电脑点气泡：大厅提示可以按任意键", /按任意键也算/.test(P.$(".hjs-ctrl-tip").textContent));
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
    check("设置里有点击范围（默认正常）", !!P.btn("宽松", P.$("#hjsSheetCard")) && /1\.4 个直径/.test(P.$("#hjsSheetCard").textContent));
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
    check("放水范围：大厅提示点任意位置都算", /放水范围/.test(P.$(".hjs-ctrl-tip").textContent));
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
    check("结算：难度、判定放水、范围放水、模式自动演奏", ["难度挑战", "判定放水", "范围放水", "模式自动演奏"].every((x) => tags.includes(x)), tags);
    check("结算写明不计分、不记纪录，没有评级", /不计分、不记纪录/.test(P.$("#hjsModal").textContent) && !P.$(".hjs-res-rank"));
    check("自动演奏不写本机纪录", !P.mem.get("hj_stage_best2"));
  }

  /* 20. 飞花线：萤火虫大小的花沿曲线匀速掠过每个气泡，在气泡该判定的那一刻正好经过它 */
  {
    const P = makePage({ prefs: { hj_stage_song: SHORT.id, hj_stage_diff: "normal", hj_stage_fly: "1" } });
    await openStage(P);
    P.click(P.btn("设置"));
    check("飞花线开关记得住（打开）", P.$('[aria-label="飞花线"]').checked);
    P.click(P.btn("关闭", P.$("#hjsSheetCard")));
    await go(P);
    check("飞花线：显示一朵花和一池星星（24 颗）", !P.$("#hjsFly").hidden && !!P.$(".hjs-fly-flower") && P.$$(".hjs-fly-star").length === 24);
    const g = P.st().g;
    const fsz = parseFloat(P.$("#hjsFly").style.getPropertyValue("--fly"));
    check("飞花线：花是萤火虫大小（约 1/4 个气泡）", fsz > 0 && fsz < g.size * 0.3, `${fsz} / ${g.size}`);
    const ns = P.st().notes;
    const ap = 0;                                      // 花在气泡该判定的那一刻经过它
    P.until(ns[0].t - ap - 0.3);
    const fp0 = P.st().flyPos;
    check("飞花线：开始时花在第一个气泡的位置", fp0 && Math.hypot(fp0.x - ns[0].x, fp0.y - ns[0].y) < 1, JSON.stringify(fp0));
    const k = ns.findIndex((a, i) => i > 1 && a.t - ns[i - 1].t > 0.4 && Math.hypot(a.x - ns[i - 1].x, a.y - ns[i - 1].y) > g.size);
    if (k > 0) {
      const a = ns[k - 1], b = ns[k];
      const half = (a.t + b.t) / 2 - ap;
      P.until(half);
      const m = P.st().flyPos;
      const dA = Math.hypot(m.x - a.x, m.y - a.y), dB = Math.hypot(m.x - b.x, m.y - b.y), dAB = Math.hypot(a.x - b.x, a.y - b.y);
      check("飞花线：两个气泡之间是在路上（不是跳过去）", dA > dAB * 0.2 && dB > dAB * 0.2, `${dA.toFixed(0)}/${dB.toFixed(0)}/${dAB.toFixed(0)}`);
      P.until(b.t - ap);
      const e = P.st().flyPos;
      check("飞花线：气泡该判定的那一刻正好经过它", Math.hypot(e.x - b.x, e.y - b.y) < g.size * 0.05, `${Math.hypot(e.x - b.x, e.y - b.y).toFixed(2)}`);
      check("飞花线：花在气泡下面一层（不挡音名）", P.$("#hjsFly").compareDocumentPosition(P.$("#hjsNotes")) & P.win.Node.DOCUMENT_POSITION_FOLLOWING);
    }
    const tf = P.$(".hjs-fly-flower").style.transform;
    check("飞花线：花只用 transform 移动", /translate3d/.test(tf), tf);
    const Q = makePage({ prefs: { hj_stage_song: SHORT.id, hj_stage_fly: "1", hj_stage_render: "simple" } });
    await openStage(Q);
    await go(Q);
    check("简单显示时星星池更小", Q.$$(".hjs-fly-star").length === 12);
  }

  /* 21. 得分倍率：判定模式、点击范围各自宽松 −20%、放水 −50%，相加；同样全 PERFECT，分数按倍率缩 */
  {
    const runAll = async (prefs) => {
      const P = makePage({ prefs: { hj_stage_song: SHORT.id, hj_stage_diff: "easy", ...prefs } });
      await openStage(P);
      const tip = P.$(".hjs-tip").textContent;
      await go(P);
      const ns = P.st().notes;
      for (const n of ns) { P.until(n.t); P.pointer(n.x, n.y); }
      P.until(P.st().endT + 2);
      return { score: P.st().score, mult: P.st().mult, tip, res: P.$("#hjsModal").textContent, perfect: P.st().counts.perfect === ns.length };
    };
    const base = await runAll({});
    const ll = await runAll({ hj_stage_judge: "loose", hj_stage_range: "loose" });
    const hl = await runAll({ hj_stage_judge: "hover", hj_stage_range: "loose" });
    check("得分倍率：正常 ×1、宽松+宽松 ×0.6、放水判定+宽松范围 ×0.3", base.mult === 1 && Math.abs(ll.mult - 0.6) < 1e-9 && Math.abs(hl.mult - 0.3) < 1e-9, `${base.mult}/${ll.mult}/${hl.mult}`);
    check("同样全 PERFECT，分数按倍率缩（逐个四舍五入，误差 < 0.5%）", base.perfect && ll.perfect && Math.abs(ll.score / base.score - 0.6) < 0.005, `${base.score} → ${ll.score}`);
    check("大厅和结算写明倍率", /得分 ×0\.6（宽松判定 −20%、宽松范围 −20%）/.test(ll.tip) && /得分 ×0\.6/.test(ll.res) && !/得分 ×/.test(base.res), ll.tip);
  }

  /* 13. 旧纪录（曲目:难度）算作宽松判定的纪录 */
  {
    const old = JSON.stringify({ [`${firstSong.id}:normal`]: { score: 12345, acc: 90, rank: "A", combo: 10 } });
    const A = makePage({ prefs: { hj_stage_best2: old } });
    await openStage(A);
    check("旧纪录不算进正常判定", !/本机纪录/.test(A.$(".hjs-ctrl").textContent));
    const B = makePage({ prefs: { hj_stage_best2: old, hj_stage_judge: "loose", hj_stage_range: "loose" } });
    await openStage(B);
    check("最早的旧纪录（曲目:难度）算宽松判定 + 宽松范围", /本机纪录（标准 · 宽松判定 · 宽松范围）· 12,345 分/.test(B.$(".hjs-ctrl").textContent), B.$(".hjs-best")?.textContent);
    const mid = JSON.stringify({ [`${firstSong.id}:normal:normal`]: { score: 2222, acc: 90, rank: "A", combo: 10 } });
    const C = makePage({ prefs: { hj_stage_best2: mid } });
    await openStage(C);
    check("加点击范围以前的纪录（曲目:难度:判定模式）算正常范围", /本机纪录（标准 · 正常判定 · 正常范围）· 2,222 分/.test(C.$(".hjs-ctrl").textContent), C.$(".hjs-best")?.textContent);
    const D = makePage({ prefs: { hj_stage_best2: mid, hj_stage_range: "loose" } });
    await openStage(D);
    check("换了点击范围就不显示别的范围的纪录", !/本机纪录/.test(D.$(".hjs-ctrl").textContent));
  }

  const failed = results.filter((r) => !r[1]);
  results.forEach(([name, ok, extra]) => console.log(`${ok ? "✓" : "✗"} ${name}${extra ? `  (${extra})` : ""}`));
  console.log(failed.length ? `\n${failed.length} 项没通过 / 共 ${results.length} 项` : `\n全部通过：${results.length}/${results.length}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
