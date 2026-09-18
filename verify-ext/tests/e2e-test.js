/* 真·端到端：真实 verify.js（jsdom）+ 真实 verify-ext/worker.js（内存 D1）
   验证前端与后端说的是同一套协议：出题 → 判卷 → 通行证 → 消费。 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const { JSDOM } = require("jsdom");
const { pathToFileURL } = require("url");

const REPO = path.resolve(__dirname, "../..");
const VERIFY_JS = fs.readFileSync(path.join(REPO, "verify.js"), "utf8");
const WORKER_JS = fs.readFileSync(path.join(REPO, "verify-ext/worker.js"), "utf8");
const BANK = JSON.parse(fs.readFileSync(path.join(REPO, "verify-ext/poem-bank.json"), "utf8"));

let pass = 0, fail = 0;
const ok = (cond, label) => { cond ? pass++ : (fail++, console.log("  ✗ " + label)); };
const tick = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- 内存 D1（够验证用） ---------------- */
function makeD1() {
  const rows = [];
  function exec(s, args) {
    if (/^DELETE FROM rate_limits WHERE client_key = \? AND action = \? AND ts < \?$/i.test(s)) {
      for (let i = rows.length - 1; i >= 0; i--) {
        const r = rows[i];
        if (r.client_key === args[0] && r.action === args[1] && r.ts < args[2]) rows.splice(i, 1);
      }
      return { changes: 0 };
    }
    if (/^SELECT COUNT\(\*\) AS n FROM rate_limits WHERE client_key = \? AND action = \? AND ts >= \?$/i.test(s)) {
      return { row: { n: rows.filter((r) => r.client_key === args[0] && r.action === args[1] && r.ts >= args[2]).length } };
    }
    if (/^INSERT INTO rate_limits \(client_key, action, ts\) VALUES \(\?, \?, \?\)$/i.test(s)) {
      rows.push({ client_key: args[0], action: args[1], ts: args[2] });
      return { changes: 1 };
    }
    if (/^DELETE FROM rate_limits WHERE action = \? AND ts < \?$/i.test(s)) {
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i].action === args[0] && rows[i].ts < args[1]) rows.splice(i, 1);
      return { changes: 0 };
    }
    if (/^INSERT INTO rate_limits \(client_key, action, ts\) SELECT \?, \?, \? WHERE NOT EXISTS \(SELECT 1 FROM rate_limits WHERE client_key = \? AND action = \?\)$/i.test(s)) {
      if (rows.some((r) => r.client_key === args[3] && r.action === args[4])) return { changes: 0 };
      rows.push({ client_key: args[0], action: args[1], ts: args[2] });
      return { changes: 1 };
    }
    throw new Error("内存 D1 不认识的 SQL: " + s);
  }
  return {
    prepare(sql) {
      return {
        bind(...args) {
          const s = sql.replace(/\s+/g, " ").trim();
          return {
            run: async () => ({ success: true, meta: { changes: exec(s, args).changes || 0 } }),
            first: async () => exec(s, args).row || null,
            all: async () => ({ results: exec(s, args).rows || [] }),
          };
        },
      };
    },
  };
}

(async () => {
  const mod = await import(pathToFileURL(path.join(os.tmpdir(), "hj-e2e-worker.mjs")).href || "");
  const fetchedIcons = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/jobicon/")) {
      fetchedIcons.push(decodeURIComponent(url.split("/jobicon/")[1].replace(/\.png.*$/, "")));
      const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
      return new Response(png, { status: 200, headers: { "Content-Type": "image/png" } });
    }
    if (url.includes("siteverify")) return new Response(JSON.stringify({ success: false }), { status: 200 });
    return new Response("not found", { status: 404 });
  };

  const env = {
    DB: makeD1(),
    PASSWORD_A: "a", PASSWORD_B: "b", PASSWORD_C: "c",
    LOGIN_GUARD_SECRET: "pepper", TURNSTILE_SECRET_KEY: "tssk",
    HJ_SITE_ORIGIN: "https://site.test",
  };
  const workerPost = async (payload) => {
    const res = await mod.default.fetch(new Request("https://worker.test/api/", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    }), env);
    return res.json();
  };

  const dom = new JSDOM('<!doctype html><html><body><div class="gate-card"><div id="host"></div></div></body></html>', {
    runScripts: "dangerously", url: "https://example.test/", pretendToBeVisual: true,
  });
  dom.window.eval(VERIFY_JS);

  const passes = [];
  const gate = dom.window.HJVerify.createGate(dom.window.document.getElementById("host"), {
    post: workerPost, turnstileSiteKey: "dummy", turnstileWaitMs: 30, onPass: (p) => passes.push(p),
  });

  /* ---- 1. 无 Cloudflare → 自动进狒科生 → 用真后端出题、判卷 ---- */
  console.log("1. 页面 ⇄ 真 Worker：狒科生");
  gate.open();
  await tick(400);
  ok(gate.mode === "ff14", "自动切到狒科生，实际：" + gate.mode);
  const opts = [...dom.window.document.querySelectorAll(".verify-opt")];
  ok(opts.length === 3, "拿到三个职业选项");
  const img = dom.window.document.querySelector(".verify-job-icon");
  ok(!!img && img.getAttribute("src").startsWith("data:image/png;base64,"), "图标是后端内联的 data URL");
  ok(fetchedIcons.length === 1, "后端只从站点取了 1 张图");
  ok(opts.some((b) => b.textContent === fetchedIcons[0]), "正确答案就在选项里");
  opts.find((b) => b.textContent === fetchedIcons[0]).click();
  await tick(50);
  ok(passes.length === 1 && passes[0].verifyPass, "前端拿到 verifyPass：" + JSON.stringify(passes[0]));
  ok(dom.window.document.querySelector(".verify-tip").textContent.includes("验证通过"), "界面提示通过");

  /* ---- 2. 通行证回后端确认（页面 finishCaptcha 干的事） ---- */
  const confirm = await workerPost(Object.assign({ action: "verify_turnstile" }, passes[0]));
  ok(confirm.ok === true, "通行证在 verify_turnstile 上被接受");
  const again = await workerPost(Object.assign({ action: "verify_turnstile" }, passes[0]));
  ok(again.ok === false, "同一张通行证不能复用");

  /* ---- 3. 文科生：故意先答错（看原因），再用题库句子答对 ---- */
  console.log("2. 页面 ⇄ 真 Worker：文科生");
  gate.setMode("poem");
  await tick(60);
  ok(gate.mode === "poem", "切到飞花令");
  const keyword = /「(.+?)」/.exec(dom.window.document.querySelector(".verify-q").textContent)[1];
  ok(BANK.common[keyword] && BANK.common[keyword].length >= 8, "令字「" + keyword + "」在常用库里");
  const input = dom.window.document.querySelector(".verify-input");
  input.value = "两个黄鹂鸣翠柳";   // 不含任何一个令字，必定判错
  dom.window.document.querySelector('[data-act="submit"]').click();
  await tick(40);
  const tip = dom.window.document.querySelector(".verify-tip").textContent;
  ok(tip.includes("没有") || tip.includes("不对"), "答错时给出服务端原因：" + tip);

  const line = BANK.common[keyword][0];
  input.value = line;
  dom.window.document.querySelector('[data-act="submit"]').click();
  await tick(40);
  ok(passes.length === 2 && passes[1].verifyPass, "用题库句子答对，拿到第二张通行证");

  /* ---- 4. 提示：20 个字，拼出来也能过 ---- */
  console.log("3. 页面 ⇄ 真 Worker：提示拼字");
  gate.setMode("poem");
  await tick(60);
  dom.window.document.querySelector('[data-act="hint"]').click();
  await tick(60);
  const chars = [...dom.window.document.querySelectorAll(".verify-char")];
  ok(chars.length === 20, "提示给 20 个字");
  const kw2 = /「(.+?)」/.exec(dom.window.document.querySelector(".verify-q").textContent)[1];
  const hintPool = chars.map((b) => b.textContent);
  /* 提示一定包含「后端出的那句话」的全部字，反推出是哪一句再点 */
  const want = BANK.common[kw2].find((l) => {
    const pool = hintPool.slice();
    for (const ch of l) {
      const i = pool.indexOf(ch);
      if (i < 0) return false;
      pool.splice(i, 1);
    }
    return true;
  });
  ok(!!want, "20 个字里能拼出题库里的一句：" + want);
  const usedBtns = [];
  for (const ch of want) {
    const btn = chars.find((b) => b.textContent === ch && usedBtns.indexOf(b) < 0);
    if (btn) { usedBtns.push(btn); btn.click(); }
  }
  const filled = dom.window.document.querySelector(".verify-input").value;
  ok(filled.replace(/[^\u4e00-\u9fff]/g, "") === want, "照着提示拼出了：" + filled);
  dom.window.document.querySelector('[data-act="submit"]').click();
  await tick(40);
  ok(passes.length === 3 && passes[2].verifyPass, "拼出来的句子被判过");

  /* ---- 5. 理科生：真后端出题、真判卷 ---- */
  console.log("4. 页面 ⇄ 真 Worker：理科生");
  gate.setMode("math");
  await tick(60);
  const expr = dom.window.document.querySelector(".verify-expr").textContent;
  const m = /^(\d+) ([+\−×]) (\d+)$/.exec(expr);
  const val = m[2] === "+" ? +m[1] + +m[3] : m[2] === "−" ? +m[1] - +m[3] : +m[1] * +m[3];
  dom.window.document.querySelector(".verify-input").value = String(val);
  dom.window.document.querySelector('[data-act="submit"]').click();
  await tick(40);
  ok(passes.length === 4 && passes[3].verifyPass, "算术题答对：" + expr + " = " + val);

  dom.window.close();
  console.log("\n通过 " + pass + " 项，失败 " + fail + " 项");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
