/* 舞台演奏的运行时冒烟测试：用 jsdom 直接跑 _src/bard-stage.js 本体（不是重写一份逻辑），音频时钟由测试手动推进
   覆盖：大厅 → 选曲窗口（搜索 / 分类 / 星级 / 试听）→ 设置窗口（操作方式、改键对调）→ 键盘轨道演奏（中文输入法下的按键、
   漏音不出声、补音、预备拍、声像居中）→ 点气泡演奏（旁边一点也算）→ 学习模式停在这一拍 → 暂停 / 继续 → 结算与纪录
   → 示范旋律 → 谱面下载失败 → 音频叫不醒时点一下开始 → 延迟校准 → 返回键
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
  P.key = (code, key = "x", extra = {}) => doc.dispatchEvent(new win.KeyboardEvent("keydown", { code, key, bubbles: true, cancelable: true, ...extra }));
  P.pointer = (x, y) => P.$("#hjsPlay").dispatchEvent(new win.MouseEvent("pointerdown", { clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0 }));
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
    check("背景音乐被暂停", P.win.bgm.playing === false);
    check("开舞台时压入一条历史记录（返回键回上一层）", P.win.history.state && P.win.history.state.hjStage === 1);
    check("电脑默认键盘提示", /键盘/.test(P.$(".hjs-ctrl-tip").textContent));

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

    P.click(P.$$(".hjs-chips:not(.is-cat) .hjs-chip")[5]);
    const five = SONGS.songs.filter((s) => s.diff === 5).length;
    check("五星筛选", P.$$(".hjs-song").length === five, `${P.$$(".hjs-song").length}/${five}`);
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
    check("大厅里 Esc 关掉舞台", P.$("#hjStage").classList.contains("is-leaving"));
  }

  /* 2. 键盘轨道：输入法、漏音、补音、预备拍、声像、暂停、结算 */
  {
    const P = makePage({ width: 1280, prefs: { hj_stage_diff: "easy", hj_stage_song: SHORT.id } });
    await openStage(P);
    P.click(P.btn("设置"));
    check("设置窗口单独打开", P.st().sheet === "settings" && !!P.$(".hjs-sheet-card.is-settings"));
    check("设置里不再提伴奏", !/伴奏/.test(P.$("#hjsSheetCard").textContent));
    const keyBtns = P.$$(".hjs-keybtn");
    check("自动轨道数按宽度（1280 → 4 条）", keyBtns.length === 4, `${keyBtns.length}`);
    P.click(keyBtns[0]);
    P.key("KeyF", "f");
    check("改键撞车时两条轨道对调", P.st().codes[4][0] === "KeyF" && P.st().codes[4][1] === "KeyD", JSON.stringify(P.st().codes[4]));
    P.click(P.$$(".hjs-keybtn")[0]);
    P.key("KeyD", "d");
    check("再改回 D F J K", P.st().codes[4].join() === "KeyD,KeyF,KeyJ,KeyK");
    P.click(P.btn("关闭", P.$("#hjsSheetCard")));

    await go(P);
    const st = P.st();
    check("开始演奏：键盘模式、4 条轨道", st.view === "play" && st.mode === "keys" && st.lanes === 4 && st.playing);
    check("轻松难度：气泡数等于谱面里级别 3 的音", st.notes.length === SHORT.cnt[0], `${st.notes.length}/${SHORT.cnt[0]}`);
    check("其余的音都是补音", st.bg.length === chartOf(SHORT.id).n.length - SHORT.cnt[0], `${st.bg.length}`);
    check("钟从负数开始（预备拍在第一个音之前）", st.startT < 0 && st.clock.run);
    const notes = st.notes;
    const n0 = notes[0];
    P.until(Math.min(0, n0.t) - 0.05);
    const ticks = P.midi.filter((m) => m.vel === 0.32);
    check("第一个音前有四下预备拍", ticks.length === 4, `${ticks.length}`);
    P.until(n0.t);
    P.key(st.codes[4][n0.lane], "Process", { keyCode: 229 });     // 中文输入法开着时 key 是 Process
    check("中文输入法下按键照样判定（按 e.code）", P.st().judged[0] === 0, `judged=${P.st().judged[0]}`);
    const hitSound = P.midi.find((m) => m.vel === 1);
    check("弹中发出这个音，声像居中", hitSound && hitSound.midi === n0.m && hitSound.pan === 0);
    check("判定字显示在屏幕中间那层", /PERFECT/.test(P.$("#hjsJudge").textContent));

    const before = P.midi.length;
    const n1 = notes[1];
    P.until(n1.t + 0.4);                          // 轻松难度过了 0.36 秒算漏，下一个音至少隔 0.5 秒
    const hitsAfter = P.midi.slice(before).filter((m) => m.vel >= 0.8);
    check("漏掉的音不出声", P.st().judged[1] === 3 && hitsAfter.length === 0, `judged=${P.st().judged[1]} sounds=${hitsAfter.length}`);
    const bgPlayed = P.midi.filter((m) => m.vel === 0.4);
    check("补音按音频钟提前排进去（轻音、居中）", bgPlayed.length > 0 && bgPlayed.every((m) => m.pan === 0 && m.delay >= 0 && m.delay <= 0.121), `${bgPlayed.length}`);

    P.key("Escape", "Escape");
    check("Esc 暂停：钟停、出暂停卡", P.st().paused && !P.st().clock.run && !P.$("#hjsModal").hidden);
    const tPause = P.pos();
    const nPause = P.midi.length;
    P.advance(1);
    check("暂停时歌曲时间不走、也不再排音", P.pos() === tPause && P.midi.length === nPause);
    P.key("Escape", "Escape");
    check("再按 Esc 继续", !P.st().paused && P.st().clock.run && P.$("#hjsModal").hidden);
    P.advance(0.05);
    check("继续后从暂停处接着走", Math.abs(P.pos() - tPause - 0.05) < 1e-6, `${(P.pos() - tPause).toFixed(3)}`);

    /* 一路弹到底 */
    for (let i = 2; i < notes.length; i++) {
      P.until(notes[i].t);
      P.key(P.st().codes[4][notes[i].lane], "x");
    }
    P.until(P.st().endT + 2);
    const fin = P.st();
    check("弹完出结算", fin.finished && /演出结束/.test(P.$("#hjsModal").textContent));
    check("结算计数对得上", fin.counts.perfect === notes.length - 1 && fin.counts.miss === 1, JSON.stringify(fin.counts));
    const best = JSON.parse(P.mem.get("hj_stage_best2") || "{}");
    check("本机纪录写入（新的 best2）", best[`${fin.song}:easy`] && best[`${fin.song}:easy`].score === fin.score);
    P.click(P.btn("回大厅"));
    check("回大厅", P.st().view === "lobby" && /本机纪录/.test(P.$(".hjs-ctrl").textContent));
  }

  /* 3. 点气泡（手机）：旁边一点也算，远了不算 */
  {
    const P = makePage({ coarse: true, width: 390, height: 844 });
    await openStage(P);
    check("手机默认点气泡提示", /点气泡/.test(P.$(".hjs-ctrl-tip").textContent));
    await go(P);
    const st = P.st();
    check("手机进入点气泡模式、没有轨道键帽", st.mode === "tap" && P.$$(".hjs-cap").length === 0);
    const xs = st.notes.slice(0, 12).map((n) => Math.round(n.x));
    check("气泡沿旋律左右铺开（前 12 个不全在一列）", new Set(xs).size >= 3, xs.join(","));
    const sameSpot = st.notes.slice(1, 30).filter((n, i) => Math.hypot(n.x - st.notes[i].x, n.y - st.notes[i].y) < st.g.size * 0.9).length;
    check("相邻两个气泡不叠在一起", sameSpot === 0, `${sameSpot}`);
    const n0 = st.notes[0];
    P.until(n0.t - 0.02);
    P.pointer(n0.x + st.g.size * 0.8, n0.y);        // 点在气泡旁边
    check("点在气泡旁边也算弹中", P.st().judged[0] >= 0 && P.st().judged[0] < 3, `judged=${P.st().judged[0]}`);
    const n1 = st.notes[1];
    P.until(n1.t);
    P.pointer(n1.x + st.g.size * 3, Math.max(0, n1.y - st.g.size * 3));
    check("点得太远不算", P.st().judged[1] === -1);
    P.click(P.btn("回到大厅"));
    check("演奏中 ✕ 回大厅", P.st().view === "lobby" && !P.st().clock.run);
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
    const wrong = (n0.lane + 1) % s1.lanes;
    P.key(s1.codes[s1.lanes][wrong], "x");
    check("按错轨道不放行", P.st().frozen);
    P.key("Escape", "Escape");
    P.key("Escape", "Escape");
    check("停住时暂停再继续，还是停住（不闪一下）", P.st().frozen && !P.st().clock.run && !P.st().paused);
    const unlocks = P.unlocks;
    P.key(s1.codes[s1.lanes][n0.lane], "x");
    check("按对了继续走", !P.st().frozen && P.st().clock.run && P.st().judged[0] === 0);
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
    P.win.dispatchEvent(new P.win.PopStateEvent("popstate", { state: null }));
    check("返回键先关窗口", P.st().sheet === "" && !P.$("#hjStage").hidden);
    P.win.dispatchEvent(new P.win.PopStateEvent("popstate", { state: null }));
    check("再按返回键离开舞台", P.$("#hjStage").classList.contains("is-leaving"));
  }

  const failed = results.filter((r) => !r[1]);
  results.forEach(([name, ok, extra]) => console.log(`${ok ? "✓" : "✗"} ${name}${extra ? `  (${extra})` : ""}`));
  console.log(failed.length ? `\n${failed.length} 项没通过 / 共 ${results.length} 项` : `\n全部通过：${results.length}/${results.length}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
