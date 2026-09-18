/* =============================================================================
   完整 worker.js 的本地自测（Node 18+，不连云、不连真 D1）
   用法：node verify-ext/selftest.js
   -----------------------------------------------------------------------------
   两部分：
     1) 纯函数单测（把 worker.js 放进 vm 里跑）：诗词判卷、提示、暗号加解密
     2) 端到端：用内存版 D1 + 假的 fetch 驱动 worker.fetch()，跑
        Cloudflare / 狒科生 / 文科生 / 理科生 四条通过路径 + 购票 + 限流 + 兼容旧接口
   ============================================================================= */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const os = require("os");
const { pathToFileURL } = require("url");

const DIR = __dirname;
const SRC = fs.readFileSync(path.join(DIR, "worker.js"), "utf8");
const BANK = JSON.parse(fs.readFileSync(path.join(DIR, "poem-bank.json"), "utf8"));

let pass = 0;
let fail = 0;
function ok(cond, label) {
  if (cond) pass++;
  else { fail++; console.log("  ✗ " + label); }
}

/* ------------------------------------------------------------------ 1. vm 单测 */
const sandbox = {
  crypto, URL, console, setTimeout, Buffer,
  btoa: (s) => Buffer.from(s, "binary").toString("base64"),
  atob: (s) => Buffer.from(s, "base64").toString("binary"),
  TextEncoder, TextDecoder,
  Response: class Response { constructor(body, init) { this.body = body; Object.assign(this, init || {}); } },
  fetch: async () => ({ ok: false, status: 404 }),
};
sandbox.globalThis = sandbox;
const EXPORTS = "({ HJV_POEM_COMMON, HJV_POEM_EXTRA, HJV_POEM_JUDGE, HJV_KEYWORDS, HJV_JOBS, HJV_TRAD, "
  + "hjPoemNorm, hjPoemVerdict, hjPoemWhy, hjBuildHint, hjSeal, hjOpen, hjMathTask, "
  + "hjCreateTask, hjTaskHint, hjCheckAnswer, hjConsumePass, verifyHuman, handlers })";
const api = vm.runInNewContext(
  SRC.replace("export default {", "const __worker = {") + "\n;" + EXPORTS + ";",
  sandbox,
  { filename: "worker.js" }
);

console.log("一、纯函数");
ok(api.HJV_KEYWORDS.length === 20, "令字 20 个（实际 " + api.HJV_KEYWORDS.length + "）");
ok(api.HJV_JOBS.length === 23, "职业 23 个（实际 " + api.HJV_JOBS.length + "）");
ok(api.HJV_POEM_JUDGE.length >= 600, "判定库 ≥ 600 句（实际 " + api.HJV_POEM_JUDGE.length + "）");
console.log("     令字 " + api.HJV_KEYWORDS.length + " 个 / 职业 " + api.HJV_JOBS.length
  + " 个 / 判定库 " + api.HJV_POEM_JUDGE.length + " 句");

/* 归一化 / 繁体 */
ok(api.hjPoemNorm("夜来风雨声，花落知多少。") === "夜来风雨声花落知多少", "归一化：去标点");
ok(api.hjPoemNorm("夜來風雨聲") === "夜来风雨声", "归一化：繁体转简体");
ok(api.hjPoemNorm("abc-春 123") === "春", "归一化：只留汉字");

/* 判卷：库内 / 宽松 / 各种不通过 */
ok(api.hjPoemVerdict("夜来风雨声", "风").ok, "库内句子通过");
ok(api.hjPoemVerdict("夜来风雨声，花落知多少", "花").ok, "写上下两句也通过");
ok(api.hjPoemVerdict("夜來風雨聲", "风").ok, "繁体输入通过");
ok(api.hjPoemVerdict("春风又绿江南岸", "月").error === undefined, "……（含令字的句子）");
{
  const v = api.hjPoemVerdict("海上生明月", "花");
  ok(!v.ok && v.reason === "no_keyword", "不含令字 → no_keyword");
  ok(api.hjPoemWhy("no_keyword", "花").indexOf("花") >= 0, "提示语里带上令字");
}
ok(!api.hjPoemVerdict("春", "春").ok, "太短 → 不通过");
ok(api.hjPoemVerdict("秋风萧瑟", "秋").ok, "四字名句（在题库里）也算过");
ok(api.hjPoemVerdict("秋风萧瑟，洪波涌起", "秋").ok, "四字句带上下句也算过");
ok(!api.hjPoemVerdict("秋天真美", "秋").ok, "库外的四字口水话仍然不通过");
ok(api.hjPoemVerdict("春花春雪春雨春山春水", "春").ok, "宽松判定：库外但像诗词 → 通过");
ok(!api.hjPoemVerdict("天上的花儿开了", "花").ok, "口水话 → 不通过");
ok(!api.hjPoemVerdict("春天123", "春").ok, "夹数字 → 不通过");
ok(!api.hjPoemVerdict("春春春春春春", "春").ok, "只重复一个字 → 不通过");

/* 每个令字：库里够多、提示能拼出至少一句、提示恒为 20 个字 */
api.HJV_KEYWORDS.forEach((kw) => {
  const common = api.HJV_POEM_COMMON[kw] || [];
  ok(common.length >= 8, "「" + kw + "」提示库 ≥ 8 句（实际 " + common.length + "）");
  const hit = api.HJV_POEM_JUDGE.filter((l) => l.indexOf(kw) >= 0).length;
  ok(hit >= 20, "「" + kw + "」判定库 ≥ 20 句（实际 " + hit + "）");
  common.forEach((line) => ok(api.hjPoemNorm(line).indexOf(kw) >= 0, "提示句必须含令字：" + line));

  let assembled = 0;
  common.forEach((line) => {
    const hint = api.hjBuildHint(api.hjPoemNorm(line), kw);
    ok(hint.length === 20, "「" + kw + "」提示 20 个字（实际 " + hint.length + "）");
    const pool = hint.slice();
    let enough = true;
    for (const ch of api.hjPoemNorm(line)) {
      const i = pool.indexOf(ch);
      if (i < 0) { enough = false; break; }
      pool.splice(i, 1);
    }
    if (enough && api.hjPoemVerdict(hint.slice(0, 20).join(""), kw).ok !== undefined) assembled++;
    ok(enough, "提示能拼出这句：" + line);
  });
  ok(assembled > 0, "「" + kw + "」提示可拼装");
});

/* 暗号：加密 / 篡改 / 换密钥 */
(async () => {
  const envA = { LOGIN_GUARD_SECRET: "pepper-1", PASSWORD_C: "pw" };
  const sealed = await api.hjSeal(envA, { t: "task", m: "poem", a: "春", l: "春眠不觉晓", n: "abcd1234efgh5678", exp: Date.now() + 1000 });
  ok(!sealed.includes("春") && !/(task|poem)/.test(sealed), "暗号里看不出答案（base64url）");
  const opened = await api.hjOpen(envA, sealed);
  ok(opened && opened.a === "春" && opened.l === "春眠不觉晓", "暗号能解回原样");
  const tampered = sealed.slice(0, -2) + (sealed.slice(-2) === "AA" ? "BB" : "AA");
  ok((await api.hjOpen(envA, tampered)) === null, "改过的暗号解不开");
  ok((await api.hjOpen({ LOGIN_GUARD_SECRET: "pepper-2" }, sealed)) === null, "换密钥后旧暗号失效");
  const fake = await api.hjOpen(envA, "not-a-real-token");
  ok(fake === null, "瞎编的暗号解不开");

  /* ------------------------------------------------------- 2. 端到端 */
  console.log("二、端到端（worker.fetch + 内存 D1）");
  const mod = await import(pathToFileURL(await copyToMjs()).href);

  const state = { calls: [], icons: [], siteverifyOk: true, iconFail: false };
  const d1 = makeD1();
  globalThis.fetch = makeFetch(state);
  const env = {
    DB: d1,
    PASSWORD_A: "aaa", PASSWORD_B: "bbb", PASSWORD_C: "ccc",
    LOGIN_GUARD_SECRET: "pepper", TURNSTILE_SECRET_KEY: "tssk",
    HJ_SITE_ORIGIN: "https://site.test",
  };

  const post = (payload) => call(mod, env, "https://worker.test/api/", payload);
  const get = (url) => mod.default.fetch(new Request(url), env);

  /* ---- GET /ping ---- */
  {
    const res = await get("https://worker.test/ping");
    const data = await res.json();
    ok(data.ok && data.version === "2026-09-18d", "GET /ping 版本号已更新");
    ok(data.features.includes("manual-verify"), "features 里有 manual-verify");
    ok(data.manual_verify.poems >= 600, "ping 里带上题库规模");
    ok(data.manual_verify.modes.join(",") === "ff14,poem,math", "ping 里带上三种模式");
  }

  /* ---- verify_ping ---- */
  {
    const data = await post({ action: "verify_ping" });
    ok(data.ok && data.modes.join(",") === "ff14,poem,math", "verify_ping 返回模式");
    ok(data.jobs === 23 && data.poems >= 600 && data.hint_chars === 20, "verify_ping 返回规模");
    ok(data.strict === false && data.site_origin === "https://site.test", "verify_ping 返回站点来源");
  }

  /* ---- 文科生：出题 → 判卷 → 通行证 → 消费 ---- */
  {
    let seenKeywords = new Set();
    for (let i = 0; i < 30; i++) {
      const task = await post({ action: "get_verify_task", mode: "poem" });
      ok(task.ok && task.mode === "poem", "poem 出题 ok");
      ok(api.HJV_KEYWORDS.includes(task.keyword), "令字来自常用 20 字：" + task.keyword);
      ok(typeof task.id === "string" && task.id.length > 40, "题目 id 是一段暗号");
      ok(task.id.indexOf(task.keyword) < 0, "id 里不含令字");
      seenKeywords.add(task.keyword);
    }
    ok(seenKeywords.size >= 10, "30 次出题覆盖 ≥ 10 个令字（实际 " + seenKeywords.size + "）");

    const task = await post({ action: "get_verify_task", mode: "poem" });
    const kw = task.keyword;

    const bad = await post({ action: "verify_answer", id: task.id, answer: "两个黄鹂鸣翠柳" });   // 不含任何令字
    ok(bad.ok === false, "答非所问 → 不通过");
    const badReason = bad.why || "";
    ok(badReason.length > 0, "不通过时给出原因：" + badReason);

    // 提示：20 个字，能拼出提示句
    const hint = await post({ action: "get_verify_hint", id: task.id });
    ok(hint.ok && hint.chars.length === 20, "提示 20 个字");
    ok(hint.len >= 4 && hint.len <= 16, "提示里带上答案字数：" + hint.len);
    const pool = hint.chars.slice();
    let need = 0;
    for (const line of api.HJV_POEM_COMMON[kw]) {
      if (api.hjPoemNorm(line).length !== hint.len) continue;
      const copy = pool.slice();
      let ok2 = true;
      for (const ch of api.hjPoemNorm(line)) {
        const idx = copy.indexOf(ch);
        if (idx < 0) { ok2 = false; break; }
        copy.splice(idx, 1);
      }
      if (ok2) { need++; }
    }
    ok(need > 0, "提示的字能拼出「" + kw + "」的一句（命中 " + need + " 句）");

    // 用提示拼一句交卷（挑一句长度一致的）
    const target = api.HJV_POEM_COMMON[kw].filter((l) => api.hjPoemNorm(l).length === hint.len)[0]
      || api.HJV_POEM_COMMON[kw][0];
    const good = await post({ action: "verify_answer", id: task.id, answer: target });
    ok(good.ok && typeof good.pass === "string", "答对 → 发通行证");
    ok(good.pass.indexOf(kw) < 0 && good.pass.indexOf(target) < 0, "通行证里看不出答案");

    const again = await post({ action: "verify_answer", id: task.id, answer: target });
    ok(again.ok === false, "同一道题只发一张通行证");
    ok(again.error === "expired", "重复交卷提示 expired（实际 " + again.error + "）");

    const use1 = await post({ action: "verify_turnstile", verifyPass: good.pass });
    ok(use1.ok === true, "通行证在 verify_turnstile 上消费成功");
    const use2 = await post({ action: "verify_turnstile", verifyPass: good.pass });
    ok(use2.ok === false, "同一张通行证不能用第二次");
    const use3 = await post({ action: "verify_turnstile", verifyPass: "v1.fake.fake" });
    ok(use3.ok === false, "伪造的通行证不通过");

    // 宽松判定：库外但像诗词
    const loose = await post({ action: "get_verify_task", mode: "poem" });
    const looseLine = loose.keyword + "山流水送君行";
    const looseRes = await post({ action: "verify_answer", id: loose.id, answer: looseLine });
    ok(looseRes.ok === true, "库外的诗句走宽松判定放行：" + looseLine);

    // 繁体输入：找一句含常用字的诗，把字换成繁体再交上去
    const SIMP2TRAD = { "风": "風", "云": "雲", "红": "紅", "来": "來", "声": "聲", "时": "時", "见": "見",
      "归": "歸", "万": "萬", "无": "無", "边": "邊", "处": "處", "过": "過", "还": "還", "头": "頭",
      "楼": "樓", "叶": "葉", "树": "樹", "独": "獨", "飞": "飛", "鸟": "鳥", "马": "馬", "语": "語",
      "诗": "詩", "灯": "燈", "门": "門", "关": "關", "国": "國", "尽": "盡", "与": "與", "为": "為",
      "开": "開", "满": "滿", "问": "問", "谁": "誰", "黄": "黃", "绿": "綠", "蓝": "藍", "长": "長" };
    const tradTask = await post({ action: "get_verify_task", mode: "poem" });
    const tradPick = api.HJV_POEM_COMMON[tradTask.keyword].find((l) => [...l].some((ch) => SIMP2TRAD[ch]));
    const tradLine = [...tradPick].map((ch) => SIMP2TRAD[ch] || ch).join("");
    ok(tradLine !== tradPick, "繁体样例确实转成了繁体：" + tradLine);
    const tradRes = await post({ action: "verify_answer", id: tradTask.id, answer: tradLine });
    ok(tradRes.ok === true, "繁体输入也判得过：" + tradLine);

    const notFound = await post({ action: "verify_answer", id: "whatever", answer: "春眠不觉晓" });
    ok(notFound.ok === false && notFound.error === "not_found", "乱填 id → not_found");
  }

  /* ---- 狒科生 ---- */
  {
    /* 先测「图标取不到」：这时候图标缓存还是空的，4 次重试必定全部 404 */
    state.iconFail = true;
    const broken = await post({ action: "get_verify_task", mode: "ff14" });
    ok(broken.ok === false && broken.error === "no_icon", "图标取不到 → no_icon / 实际：" + JSON.stringify(broken));
    state.iconFail = false;

    state.icons.length = 0;
    state.calls.length = 0;
    const task = await post({ action: "get_verify_task", mode: "ff14" });
    ok(task.ok && task.mode === "ff14", "ff14 出题 ok");
    ok(Array.isArray(task.options) && task.options.length === 3, "三个职业选项");
    ok(task.options.every((n) => api.HJV_JOBS.includes(n)), "选项都是仓库里的职业");
    ok(new Set(task.options).size === 3, "三个选项不重复");
    ok(String(task.iconData).startsWith("data:image/png;base64,"), "图标以 data URL 内联");
    ok(task.id.indexOf("jobicon") < 0, "id 里不含图标地址");
    task.options.forEach((n) => ok(task.id.indexOf(n) < 0, "id 里不含职业名：" + n));
    ok(state.icons.length === 1, "只取了 1 张图标");
    ok(task.options.includes(state.icons[0]), "取的那张图就是正确答案的图标：" + state.icons[0]);
    ok(state.calls.some((u) => u === "https://site.test/jobicon/" + encodeURIComponent(state.icons[0]) + ".png"),
      "图标是从站点 jobicon/ 取的");

    const wrong = await post({ action: "verify_answer", id: task.id, answer: task.options.find((n) => n !== state.icons[0]) });
    ok(wrong.ok === false && wrong.error === "wrong", "选错职业 → wrong");
    ok(typeof wrong.why === "string" && wrong.why.length > 0, "选错时给出提示语");

    const right = await post({ action: "verify_answer", id: task.id, answer: state.icons[0] });
    ok(right.ok === true && typeof right.pass === "string", "选对职业 → 发通行证");

  }

  /* ---- 理科生 ---- */
  {
    const task = await post({ action: "get_verify_task", mode: "math" });
    ok(task.ok && task.mode === "math" && /^\d+ [+\−×] \d+$/.test(task.question), "算术题格式：" + task.question);
    const bad = await post({ action: "verify_answer", id: task.id, answer: "999999" });
    ok(bad.ok === false && bad.error === "wrong", "算错 → wrong");
    const m = /^(\d+) [+\−×] (\d+)$/.exec(task.question);
    const val = task.question.includes("+") ? +m[1] + +m[2]
      : task.question.includes("−") ? +m[1] - +m[2] : +m[1] * +m[2];
    const good = await post({ action: "verify_answer", id: task.id, answer: String(val) });
    ok(good.ok === true && typeof good.pass === "string", "算对 → 发通行证");

    const badMode = await post({ action: "get_verify_task", mode: "nope" });
    ok(badMode.error === "bad_mode", "乱传 mode → bad_mode");
  }

  /* ---- 旧接口仍然可用（老页面缓存） ---- */
  {
    const math = await post({ action: "get_math_challenge" });
    ok(math.ok && typeof math.challenge === "string", "旧算术题接口仍在");
    const m = /^(\d+) ([+\−×]) (\d+)$/.exec(math.question);
    const val = m[2] === "+" ? +m[1] + +m[3] : m[2] === "−" ? +m[1] - +m[3] : +m[1] * +m[3];
    const first = await post({ action: "verify_turnstile", math: { challenge: math.challenge, answer: val } });
    ok(first.ok === true, "旧算术题作答通过");
    const reuse = await post({ action: "verify_turnstile", math: { challenge: math.challenge, answer: val } });
    ok(reuse.ok === false, "旧算术题一道只能用一次");

    state.siteverifyOk = true;
    const ts = await post({ action: "verify_turnstile", token: "dummy-token" });
    ok(ts.ok === true, "Turnstile token 走 siteverify 通过");
    state.siteverifyOk = false;
    const tsBad = await post({ action: "verify_turnstile", token: "dummy-token" });
    ok(tsBad.ok === false, "siteverify 失败 → 不通过");
    state.siteverifyOk = true;
  }

  /* ---- 购票：手动验证通行证换票 ---- */
  {
    d1.setFlags({ ticket_open: 1, ticket_daily_limit: 100, ticket_allow_pending: 0 });
    const task = await post({ action: "get_verify_task", mode: "math" });
    const m = /^(\d+) ([+\−×]) (\d+)$/.exec(task.question);
    const val = m[2] === "+" ? +m[1] + +m[3] : m[2] === "−" ? +m[1] - +m[3] : +m[1] * +m[3];
    const ans = await post({ action: "verify_answer", id: task.id, answer: String(val) });

    const ticket = { contact: "tester@example.com", qty: 1, holders: [{ name: "测试猫猫", server: "紫水栈桥" }], message: "", anonymous: true };
    const noPass = await post(Object.assign({ action: "submit_ticket" }, ticket));
    ok(noPass.ok === false && noPass.error === "captcha", "不带凭证买票 → captcha");

    const withPass = await post(Object.assign({ action: "submit_ticket", verifyPass: ans.pass }, ticket));
    ok(withPass.ok === true && withPass.seq === 1, "带手动验证通行证买票成功（序 " + withPass.seq + "）");
    ok(withPass.remaining === 99, "余票正确（" + withPass.remaining + "）");

    const reuse = await post(Object.assign({ action: "submit_ticket", verifyPass: ans.pass }, ticket));
    ok(reuse.ok === false && reuse.error === "captcha", "同一张通行证不能买第二张票");
  }

  /* ---- 限流 ---- */
  {
    let limited = 0;
    for (let i = 0; i < 70; i++) {
      const data = await post({ action: "get_verify_task", mode: "math" });
      if (data.error === "rate_limited") limited++;
    }
    ok(limited > 0, "超量出题会被限流（" + limited + " 次被拦）");
  }

  console.log("\n" + (fail === 0 ? "全部通过" : "有失败项") + "：通过 " + pass + " / 失败 " + fail);
  process.exitCode = fail === 0 ? 0 : 1;
})();

/* ---------------------------------------------------------------- 工具 */
async function copyToMjs() {
  const tmp = path.join(os.tmpdir(), "hj-worker-selftest.mjs");
  fs.writeFileSync(tmp, SRC);
  return tmp;
}

async function call(mod, env, url, payload) {
  const res = await mod.default.fetch(
    new Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
    env
  );
  return res.json();
}

function makeFetch(state) {
  return async (input) => {
    const url = String(input);
    state.calls.push(url);
    if (url.includes("/jobicon/")) {
      const name = decodeURIComponent(url.split("/jobicon/")[1].replace(/\.png.*$/, ""));
      if (state.iconFail) return new Response("nope", { status: 404 });
      state.icons.push(name);
      const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
      return new Response(png, { status: 200, headers: { "Content-Type": "image/png" } });
    }
    if (url.includes("siteverify")) {
      return new Response(JSON.stringify({ success: state.siteverifyOk !== false }), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  };
}

/* 内存版 D1：只认 worker.js 里出现的那几条 SQL，够跑通验证与购票 */
function makeD1() {
  const t = { rate_limits: [], site_flags: [], ticket_orders: [] };
  let nextId = 1;

  const insertFlag = (key, value) => {
    const row = t.site_flags.find((r) => r.key === key);
    if (row) row.value = value;
    else t.site_flags.push({ key, value });
  };

  function exec(s, args) {
    if (/^DELETE FROM rate_limits WHERE client_key = \? AND action = \? AND ts < \?$/i.test(s)) {
      t.rate_limits = t.rate_limits.filter((r) => !(r.client_key === args[0] && r.action === args[1] && r.ts < args[2]));
      return { changes: 0 };
    }
    if (/^SELECT COUNT\(\*\) AS n FROM rate_limits WHERE client_key = \? AND action = \? AND ts >= \?$/i.test(s)) {
      return { row: { n: t.rate_limits.filter((r) => r.client_key === args[0] && r.action === args[1] && r.ts >= args[2]).length } };
    }
    if (/^INSERT INTO rate_limits \(client_key, action, ts\) VALUES \(\?, \?, \?\)$/i.test(s)) {
      t.rate_limits.push({ client_key: args[0], action: args[1], ts: args[2] });
      return { changes: 1 };
    }
    if (/^DELETE FROM rate_limits WHERE action = \? AND ts < \?$/i.test(s)) {
      t.rate_limits = t.rate_limits.filter((r) => !(r.action === args[0] && r.ts < args[1]));
      return { changes: 0 };
    }
    if (/^INSERT INTO rate_limits \(client_key, action, ts\) SELECT \?, \?, \? WHERE NOT EXISTS \(SELECT 1 FROM rate_limits WHERE client_key = \? AND action = \?\)$/i.test(s)) {
      if (t.rate_limits.some((r) => r.client_key === args[3] && r.action === args[4])) return { changes: 0 };
      t.rate_limits.push({ client_key: args[0], action: args[1], ts: args[2] });
      return { changes: 1 };
    }
    if (/^SELECT key, value FROM site_flags WHERE key IN \(\?, \?, \?\)$/i.test(s)) {
      return { rows: t.site_flags.filter((r) => args.includes(r.key)).map((r) => ({ key: r.key, value: r.value })) };
    }
    if (/^INSERT INTO site_flags \(key, value\) VALUES \(\?, \?\) ON CONFLICT\(key\) DO UPDATE SET value = excluded\.value$/i.test(s)) {
      insertFlag(args[0], args[1]);
      return { changes: 1 };
    }
    if (/^SELECT COALESCE\(SUM\(qty\), 0\) AS n FROM ticket_orders WHERE day = \?$/i.test(s)) {
      return { row: { n: t.ticket_orders.filter((r) => r.day === args[0]).reduce((a, r) => a + r.qty, 0) } };
    }
    if (/^INSERT INTO ticket_orders \(day, seq, contact, qty, holders, message, anonymous, over_limit, created_at, client_key\) SELECT \?, COALESCE\(MAX\(seq\), 0\) \+ 1, \?, \?, \?, \?, \?, CASE WHEN COALESCE\(SUM\(qty\), 0\) \+ \? > \? THEN 1 ELSE 0 END, \?, \? FROM ticket_orders WHERE day = \? RETURNING id, seq, over_limit$/i.test(s)) {
      const [day, contact, qty, holders, message, anonymous, addQty, limit, createdAt, clientKey] = args;
      const seq = t.ticket_orders.filter((r) => r.day === day).reduce((a, r) => Math.max(a, r.seq), 0) + 1;
      const sold = t.ticket_orders.filter((r) => r.day === day).reduce((a, r) => a + r.qty, 0);
      const over = sold + addQty > limit ? 1 : 0;
      const row = { id: nextId++, day, seq, contact, qty, holders, message, anonymous, over_limit: over, created_at: createdAt, client_key: clientKey };
      t.ticket_orders.push(row);
      return { row: { id: row.id, seq: row.seq, over_limit: row.over_limit } };
    }
    if (/^SELECT \* FROM ticket_orders WHERE contact = \? ORDER BY created_at ASC LIMIT 50$/i.test(s)) {
      return { rows: t.ticket_orders.filter((r) => r.contact === args[0]) };
    }
    throw new Error("内存 D1 不认识的 SQL: " + s);
  }

  return {
    setFlags(obj) { Object.keys(obj).forEach((k) => insertFlag(k, obj[k])); },
    prepare(sql) {
      return {
        bind(...args) {
          return {
            run: async () => ({ success: true, meta: { changes: exec(sql.replace(/\s+/g, " ").trim(), args).changes || 0 } }),
            first: async () => exec(sql.replace(/\s+/g, " ").trim(), args).row || null,
            all: async () => ({ results: exec(sql.replace(/\s+/g, " ").trim(), args).rows || [] }),
          };
        },
      };
    },
  };
}
