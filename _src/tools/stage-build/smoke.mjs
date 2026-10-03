/* 舞台演奏的运行时冒烟测试：用 jsdom 直接跑 _src/bard-stage.js 本体（不是重写一份逻辑），时间轴由测试手动推进
   覆盖：大厅 → 选曲窗口（搜索 / 星级 / 试听）→ 设置窗口（操作方式、改键对调）→ 键盘轨道演奏（中文输入法下的按键、
   漏音不出声、补音、预备拍、声像居中）→ 点气泡演奏（旁边一点也算）→ 学习模式停在这一拍 → 暂停 / 继续 → 结算与纪录
   → 示范轨失败退回轻音 → 延迟校准 → 返回键
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
const SONGS = JSON.parse(readFileSync(path.join(REPO, "assets", "bard", "stage", "songs.json"), "utf8"));

const results = [];
const check = (name, cond, extra = "") => results.push([name, !!cond, extra]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 每个场景一个干净的页面 */
function makePage({ coarse = false, width = 1280, height = 800, perfFails = false, prefs = {} } = {}) {
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
  const P = { mem, toasts: [], midi: [], audios: [], now: 1000, frames: [] };
  win.showToast = (m) => P.toasts.push(m);
  win.bgm = { playing: true, pause() { this.playing = false; }, play() { this.playing = true; } };
  win.siteVolume = { level: 0.6, get muted() { return this.level <= 0; }, set(v) { this.level = v; }, attach(el) { el.volume = this.level; } };
  win.HJBard = {
    unlock: () => true, prepare: () => {}, instName: () => "piano",
    instruments: [{ id: "piano", name: "钢琴", group: "弦乐" }, { id: "harp", name: "竖琴", group: "弦乐" }],
    playMidi: (midi, vel, inst, pan, delay) => { P.midi.push({ midi, vel, inst, pan, delay, at: P.t() }); return true; },
  };
  win.matchMedia = (q) => ({ matches: q.includes("coarse") ? coarse : false, addEventListener() {}, removeEventListener() {} });
  Object.defineProperty(win, "innerWidth", { value: width, configurable: true });
  Object.defineProperty(win, "innerHeight", { value: height, configurable: true });
  win.performance.now = () => P.now;
  win.requestAnimationFrame = (fn) => { P.frames.push(fn); return P.frames.length; };
  win.cancelAnimationFrame = () => {};
  win.fetch = async () => ({ ok: true, json: async () => JSON.parse(JSON.stringify(SONGS)) });

  /* 假 <audio>：真 DOM 元素 + 可写时间轴 */
  win.Audio = function Audio() {
    const el = doc.createElement("audio");
    const st = { currentTime: 0, paused: true, src: "" };
    Object.defineProperty(el, "currentTime", { get: () => st.currentTime, set: (v) => { st.currentTime = v; }, configurable: true });
    Object.defineProperty(el, "paused", { get: () => st.paused, configurable: true });
    Object.defineProperty(el, "src", { get: () => st.src, set: (v) => { st.src = v; st.currentTime = 0; }, configurable: true });
    el.play = () => {
      if (perfFails && /perf/.test(st.src)) return Promise.reject(Object.assign(new Error("404"), { name: "NotSupportedError" }));
      st.paused = false;
      el.dispatchEvent(new win.Event("play"));
      return Promise.resolve();
    };
    el.pause = () => { if (!st.paused) { st.paused = true; el.dispatchEvent(new win.Event("pause")); } };
    el._st = st;
    P.audios.push(el);
    return el;
  };
  win.eval(SRC);

  P.win = win;
  P.doc = doc;
  P.$ = (sel) => doc.querySelector(sel);
  P.$$ = (sel) => Array.from(doc.querySelectorAll(sel));
  P.HJ = win.HJStage;
  P.acc = () => P.audios[0];
  P.perf = () => P.audios[1];
  P.cal = () => P.audios[2];
  P.t = () => (P.acc() ? P.acc().currentTime : 0);
  /* 推进 sec 秒：伴奏没暂停就跟着走，每 1/60 秒跑一帧 */
  P.advance = (sec, el) => {
    const steps = Math.max(1, Math.round(sec * 60));
    const dt = sec / steps;
    for (let i = 0; i < steps; i++) {
      P.now += 1000 * dt;
      for (const a of el ? [el] : P.audios) if (!a.paused) a.currentTime += dt;
      const fs = P.frames;
      P.frames = [];
      fs.forEach((f) => f(P.now));
    }
  };
  /* 推进到伴奏时间 t（秒） */
  P.until = (t) => {
    for (let guard = 0; P.acc().currentTime < t - 1e-6 && guard < 60 * 600; guard++) {
      P.advance(Math.min(1 / 60, t - P.acc().currentTime));
      if (P.acc().paused) { P.advance(0.1); break; }   // 学习模式停住、暂停：时间不再走
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

async function main() {
  const firstSong = SONGS.songs[0];

  /* 1. 大厅 */
  {
    const P = makePage();
    await openStage(P);
    const st = P.HJ.state;
    check("打开后在大厅", st.view === "lobby" && !P.$("#hjStage").hidden);
    check("大厅显示当前曲目", P.$(".hjs-hero-t")?.textContent === firstSong.t);
    check("大厅有「离开舞台」按钮", !!P.btn("离开舞台"));
    check("大厅有开始按钮且可点", P.$("#hjsGo") && !P.$("#hjsGo").disabled);
    check("背景音乐被暂停", P.win.bgm.playing === false);
    check("开舞台时压入一条历史记录（返回键回上一层）", P.win.history.state && P.win.history.state.hjStage === 1);
    check("电脑默认键盘提示", /键盘/.test(P.$(".hjs-ctrl-tip").textContent));

    /* 选曲窗口 */
    P.click(P.btn("换一首"));
    check("选曲窗口单独打开", P.HJ.state.sheet === "picker" && !P.$("#hjsSheet").hidden && !!P.$(".hjs-sheet-card.is-picker"));
    check("选曲窗口列出全部曲目", P.$$(".hjs-song").length === SONGS.songs.length, `${P.$$(".hjs-song").length}`);
    const input = P.$(".hjs-search-in");
    input.value = "月光";
    input.dispatchEvent(new P.win.Event("input", { bubbles: true }));
    const hits = P.$$(".hjs-song");
    check("搜索「月光」能筛出来", hits.length >= 1 && hits.every((r) => /月光/.test(r.textContent)), `${hits.length}`);
    input.value = "";
    input.dispatchEvent(new P.win.Event("input", { bubbles: true }));
    P.click(P.$$(".hjs-chip")[5]);
    const five = SONGS.songs.filter((s) => s.diff === 5).length;
    check("五星筛选", P.$$(".hjs-song").length === five, `${P.$$(".hjs-song").length}/${five}`);
    const row = P.$$(".hjs-song")[0];
    P.click(row);
    await sleep(2);
    const target = SONGS.songs.find((s) => s.id === row.dataset.id);
    check("点曲目＝选中", P.HJ.state.song === target.id);
    check("点曲目开始试听（从第一个音附近开始）", !P.acc().paused && /acc\.mp3$/.test(P.acc().src) && Math.abs(P.acc().currentTime - Math.max(0, target.lead - 0.15)) < 0.01);
    P.click(P.btn("就弹这首"));
    check("就弹这首：关窗口、停试听、大厅换成这首", P.HJ.state.sheet === "" && P.acc().paused && P.$(".hjs-hero-t").textContent === target.t);
    P.key("Escape", "Escape");
    check("大厅里 Esc 关掉舞台", P.$("#hjStage").classList.contains("is-leaving"));
  }

  /* 2. 键盘轨道：输入法、漏音、补音、预备拍、声像 */
  {
    const P = makePage({ width: 1280, prefs: { hj_stage_diff: "easy" } });
    await openStage(P);
    P.click(P.btn("设置"));
    check("设置窗口单独打开", P.HJ.state.sheet === "settings" && !!P.$(".hjs-sheet-card.is-settings"));
    const lanes = 4;   // 1280 宽 → 自动 4 条
    const keyBtns = P.$$(".hjs-keybtn");
    check("自动轨道数按宽度（1280 → 4 条）", keyBtns.length === lanes, `${keyBtns.length}`);
    P.click(keyBtns[0]);
    P.key("KeyF", "f");
    check("改键撞车时两条轨道对调", P.HJ.state.codes[4][0] === "KeyF" && P.HJ.state.codes[4][1] === "KeyD", JSON.stringify(P.HJ.state.codes[4]));
    P.click(P.$$(".hjs-keybtn")[0]);
    P.key("KeyD", "d");
    check("再改回 D F J K", P.HJ.state.codes[4].join() === "KeyD,KeyF,KeyJ,KeyK");
    P.click(P.btn("关闭", P.$("#hjsSheetCard")));

    P.click(P.$("#hjsGo"));
    await sleep(2);
    P.advance(0.02);
    const st = P.HJ.state;
    check("开始演奏：键盘模式、4 条轨道", st.view === "play" && st.mode === "keys" && st.lanes === 4 && st.playing);
    check("轻松难度有补音（谱面省掉的旋律音）", st.bg.length > 0, `${st.bg.length}`);
    const notes = st.notes;
    const n0 = notes[0];
    P.until(n0.t - 0.4);
    const ticks = P.midi.filter((m) => m.vel === 0.32);
    check("第一个音前有预备拍", ticks.length >= 2, `${ticks.length}`);
    P.until(n0.t);
    const code = st.codes[4][n0.lane];
    P.key(code, "Process", { keyCode: 229 });     // 中文输入法开着时 key 是 Process
    const after = P.HJ.state;
    check("中文输入法下按键照样判定（按 e.code）", after.judged[0] === 0, `judged=${after.judged[0]}`);
    const hitSound = P.midi.find((m) => m.vel === 1);
    check("弹中发出这个音，声像居中", hitSound && hitSound.midi === n0.m && hitSound.pan === 0);
    check("判定字显示在屏幕中间那层", /PERFECT/.test(P.$("#hjsJudge").textContent));

    const before = P.midi.length;
    const n1 = notes[1];
    P.until(n1.t + 0.6);
    const hitsAfter = P.midi.slice(before).filter((m) => m.vel >= 0.8);
    check("漏掉的音不出声", P.HJ.state.judged[1] === 3 && hitsAfter.length === 0, `judged=${P.HJ.state.judged[1]} sounds=${hitsAfter.length}`);
    const bgPlayed = P.midi.filter((m) => m.vel === 0.4);
    check("补音按时排进去（轻音）", bgPlayed.length > 0 && bgPlayed.every((m) => m.pan === 0 && m.delay >= 0 && m.delay <= 0.06), `${bgPlayed.length}`);

    P.key("Escape", "Escape");
    check("Esc 暂停：伴奏停、出暂停卡", P.HJ.state.paused && P.acc().paused && !P.$("#hjsModal").hidden);
    const tPause = P.acc().currentTime;
    P.advance(1);
    check("暂停时时间不走", P.acc().currentTime === tPause);
    P.key("Escape", "Escape");
    check("再按 Esc 继续", !P.HJ.state.paused && !P.acc().paused && P.$("#hjsModal").hidden);

    /* 一路弹到底 */
    for (let i = 2; i < notes.length; i++) {
      P.until(notes[i].t);
      P.key(P.HJ.state.codes[4][notes[i].lane], "x");
    }
    P.until(notes[notes.length - 1].t + 2);
    const fin = P.HJ.state;
    check("弹完出结算", fin.finished && /演出结束/.test(P.$("#hjsModal").textContent));
    check("结算计数对得上", fin.counts.perfect === notes.length - 1 && fin.counts.miss === 1, JSON.stringify(fin.counts));
    const best = JSON.parse(P.mem.get("hj_stage_best") || "{}");
    check("本机纪录写入", best[`${fin.song}:easy`] && best[`${fin.song}:easy`].score === fin.score);
    P.click(P.btn("回大厅"));
    check("回大厅", P.HJ.state.view === "lobby" && /本机纪录/.test(P.$(".hjs-ctrl").textContent));
  }

  /* 3. 点气泡（手机）：旁边一点也算，远了不算 */
  {
    const P = makePage({ coarse: true, width: 390, height: 844 });
    await openStage(P);
    check("手机默认点气泡提示", /点气泡/.test(P.$(".hjs-ctrl-tip").textContent));
    P.click(P.$("#hjsGo"));
    await sleep(2);
    P.advance(0.02);
    const st = P.HJ.state;
    check("手机进入点气泡模式、没有轨道键帽", st.mode === "tap" && P.$$(".hjs-cap").length === 0);
    const xs = st.notes.slice(0, 12).map((n) => Math.round(n.x));
    check("气泡沿旋律左右铺开（前 12 个不全在一列）", new Set(xs).size >= 3, xs.join(","));
    const sameSpot = st.notes.slice(1, 30).filter((n, i) => Math.hypot(n.x - st.notes[i].x, n.y - st.notes[i].y) < st.g.size * 0.9).length;
    check("相邻两个气泡不叠在一起", sameSpot === 0, `${sameSpot}`);
    const n0 = st.notes[0];
    P.until(n0.t - 0.02);
    P.pointer(n0.x + st.g.size * 0.8, n0.y);        // 点在气泡旁边
    check("点在气泡旁边也算弹中", P.HJ.state.judged[0] >= 0 && P.HJ.state.judged[0] < 3, `judged=${P.HJ.state.judged[0]}`);
    const n1 = st.notes[1];
    P.until(n1.t);
    P.pointer(n1.x + st.g.size * 3, Math.max(0, n1.y - st.g.size * 3));
    check("点得太远不算", P.HJ.state.judged[1] === -1);
    P.click(P.btn("回到大厅"));
    check("演奏中 ✕ 回大厅", P.HJ.state.view === "lobby" && P.acc().paused);
  }

  /* 4. 学习模式：停在这一拍 */
  {
    const P = makePage({ prefs: { hj_stage_learn: "1" } });
    await openStage(P);
    P.click(P.$("#hjsGo"));
    await sleep(2);
    P.advance(0.02);
    const st = P.HJ.state;
    const n0 = st.notes[0];
    P.until(n0.t + 0.5);
    const s1 = P.HJ.state;
    check("学习模式：到点停住", s1.frozen && P.acc().paused);
    check("停在这一拍上（不再多走 0.3 秒）", P.acc().currentTime - n0.t < 0.05, `${Math.round((P.acc().currentTime - n0.t) * 1000)} ms`);
    const wrong = (n0.lane + 1) % s1.lanes;
    P.key(s1.codes[s1.lanes][wrong], "x");
    check("按错轨道不放行", P.HJ.state.frozen);
    P.key("Escape", "Escape");
    P.key("Escape", "Escape");
    check("停住时暂停再继续，还是停住（不闪一下）", P.HJ.state.frozen && P.acc().paused && !P.HJ.state.paused);
    P.key(s1.codes[s1.lanes][n0.lane], "x");
    check("按对了继续走", !P.HJ.state.frozen && !P.acc().paused && P.HJ.state.judged[0] === 0);
    check("学习模式 HUD 显示已弹对", /1\//.test(P.$("#hjsScore").textContent));
  }

  /* 5. 示范轨加载失败 → 整条旋律轻音代替 */
  {
    const P = makePage({ perfFails: true, prefs: { hj_stage_demo: "1" } });
    await openStage(P);
    P.click(P.$("#hjsGo"));
    await sleep(5);
    P.advance(0.02);
    const st = P.HJ.state;
    check("示范轨失败：提示并改用轻音", P.toasts.some((t) => /示范旋律没加载上/.test(t)) && st.bg.length === SONGS.songs[0].mel.length, `${st.bg.length}`);
  }

  /* 6. 延迟校准：每下都晚 40 ms → +40 */
  {
    const P = makePage();
    await openStage(P);
    P.click(P.btn("设置"));
    P.click(P.btn("校准"));
    const cal = P.cal();
    check("校准放节拍音", !cal.paused && /metronome\.mp3/.test(cal.src));
    for (let k = 0; k < 10; k++) {
      for (let g = 0; cal.currentTime < 1.2 + 0.6 * k + 0.04 - 1e-6 && g < 2000; g++) P.advance(Math.min(1 / 60, 1.2 + 0.6 * k + 0.04 - cal.currentTime), cal);
      P.key("Space", " ");
    }
    cal.dispatchEvent(new P.win.Event("ended"));
    check("校准结果写进判定延迟", P.HJ.state.delayMs === 40, `${P.HJ.state.delayMs}`);
  }

  /* 7. 返回键 */
  {
    const P = makePage();
    await openStage(P);
    P.click(P.btn("设置"));
    P.win.dispatchEvent(new P.win.PopStateEvent("popstate", { state: null }));
    check("返回键先关窗口", P.HJ.state.sheet === "" && !P.$("#hjStage").hidden);
    P.win.dispatchEvent(new P.win.PopStateEvent("popstate", { state: null }));
    check("再按返回键离开舞台", P.$("#hjStage").classList.contains("is-leaving"));
  }

  const failed = results.filter((r) => !r[1]);
  results.forEach(([name, ok, extra]) => console.log(`${ok ? "✓" : "✗"} ${name}${extra ? `  (${extra})` : ""}`));
  console.log(failed.length ? `\n${failed.length} 项没通过 / 共 ${results.length} 项` : `\n全部通过：${results.length}/${results.length}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
