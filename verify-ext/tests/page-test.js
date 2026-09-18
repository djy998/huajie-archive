/* 页面级端到端自测：本地起「静态站 + 真 worker.js」服务器，用 jsdom 打开真实 index.html，
   模拟「Turnstile 被墙」的国内访客，走完 狒科生验证 → 花街介绍弹窗、以及购票表单提交。
   与线上唯一的区别：D1 是内存版、Turnstile 的 siteverify 由本地服务器假装通过。 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { JSDOM, VirtualConsole, requestInterceptor } = require("jsdom");
const { pathToFileURL } = require("url");

const ROOT = path.resolve(__dirname, "../..");
let pass = 0, fail = 0;
const ok = (cond, label) => { cond ? pass++ : (fail++, console.log("  ✗ " + label)); };
const tick = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- 内存版 D1：只认 worker.js 里出现的那几条 SQL ---------------- */
function makeFakeD1() {
  const t = { rate_limits: [], site_flags: new Map(), likes: [], ticket_orders: [], starlight: new Map(), announcements: [] };
  let nextTicketId = 1;
  const q = (sql) => sql.replace(/\s+/g, " ").trim();
  const flag = (key, value) => t.site_flags.set(key, value);

  const exec = (sql, a) => {
    const s = q(sql);
    /* rate_limits（限流 + 手动验证的一次性记账） */
    if (/^DELETE FROM rate_limits WHERE client_key = \? AND action = \? AND ts < \?$/i.test(s)) {
      t.rate_limits = t.rate_limits.filter((r) => !(r.client_key === a[0] && r.action === a[1] && r.ts < a[2]));
      return { changes: 0 };
    }
    if (/^SELECT COUNT\(\*\) AS n FROM rate_limits WHERE client_key = \? AND action = \? AND ts >= \?$/i.test(s)) {
      return { row: { n: t.rate_limits.filter((r) => r.client_key === a[0] && r.action === a[1] && r.ts >= a[2]).length } };
    }
    if (/^INSERT INTO rate_limits \(client_key, action, ts\) VALUES \(\?, \?, \?\)$/i.test(s)) {
      t.rate_limits.push({ client_key: a[0], action: a[1], ts: a[2] });
      return { changes: 1 };
    }
    if (/^DELETE FROM rate_limits WHERE action = \? AND ts < \?$/i.test(s)) {
      t.rate_limits = t.rate_limits.filter((r) => !(r.action === a[0] && r.ts < a[1]));
      return { changes: 0 };
    }
    if (/^INSERT INTO rate_limits \(client_key, action, ts\) SELECT \?, \?, \? WHERE NOT EXISTS \(SELECT 1 FROM rate_limits WHERE client_key = \? AND action = \?\)$/i.test(s)) {
      if (t.rate_limits.some((r) => r.client_key === a[3] && r.action === a[4])) return { changes: 0 };
      t.rate_limits.push({ client_key: a[0], action: a[1], ts: a[2] });
      return { changes: 1 };
    }
    /* site_flags */
    if (/^SELECT value FROM site_flags WHERE key = 'lockdown'$/i.test(s)) {
      return { row: t.site_flags.has("lockdown") ? { value: t.site_flags.get("lockdown") } : null };
    }
    if (/^SELECT key, value FROM site_flags WHERE key IN \(/i.test(s)) {
      return { rows: [...t.site_flags.entries()].filter(([k]) => a.includes(k)).map(([key, value]) => ({ key, value })) };
    }
    if (/^INSERT INTO site_flags \(key, value\) VALUES \('lockdown', \?\) ON CONFLICT\(key\) DO UPDATE SET value = excluded\.value$/i.test(s)) {
      flag("lockdown", a[0]); return { changes: 1 };
    }
    if (/^INSERT INTO site_flags \(key, value\) VALUES \(\?, \?\) ON CONFLICT\(key\) DO UPDATE SET value = excluded\.value$/i.test(s)) {
      flag(a[0], a[1]); return { changes: 1 };
    }
    /* starlight */
    if (/^SELECT start_ms, end_ms FROM starlight WHERE id = 1$/i.test(s)) {
      return { row: t.starlight.has(1) ? t.starlight.get(1) : null };
    }
    /* likes */
    if (/^SELECT target_key, COUNT\(\*\) AS n FROM likes WHERE target_key IN \(/i.test(s)) {
      const counts = {};
      a.forEach((k) => { counts[k] = t.likes.filter((r) => r.target_key === k).length; });
      return { rows: a.map((k) => ({ target_key: k, n: counts[k] })) };
    }
    if (/^SELECT DISTINCT target_key FROM likes WHERE client_key = \? AND target_key IN \(/i.test(s)) {
      const [clientKey, ...keys] = a;
      return { rows: [...new Set(t.likes.filter((r) => r.client_key === clientKey && keys.includes(r.target_key)).map((r) => r.target_key))].map((target_key) => ({ target_key })) };
    }
    if (/^SELECT COUNT\(\*\) AS n FROM likes WHERE client_key = \? AND day = \?$/i.test(s)) {
      return { row: { n: t.likes.filter((r) => r.client_key === a[0] && r.day === a[1]).length } };
    }
    if (/^INSERT INTO likes \(target_key, client_key, day, created_at\) SELECT \?, \?, \?, \? WHERE \(SELECT COUNT\(\*\) FROM likes WHERE client_key = \? AND day = \?\) < \?$/i.test(s)) {
      const [key, clientKey, day, createdAt, , , limit] = a;
      if (t.likes.filter((r) => r.client_key === clientKey && r.day === day).length >= limit) return { changes: 0 };
      t.likes.push({ target_key: key, client_key: clientKey, day, created_at: createdAt });
      return { changes: 1 };
    }
    /* 购票 */
    if (/^SELECT COALESCE\(SUM\(qty\), 0\) AS n FROM ticket_orders WHERE day = \?$/i.test(s)) {
      return { row: { n: t.ticket_orders.filter((r) => r.day === a[0]).reduce((x, r) => x + r.qty, 0) } };
    }
    if (/^INSERT INTO ticket_orders \(day, seq, contact, qty, holders, message, anonymous, over_limit, created_at, client_key\) SELECT \?, COALESCE\(MAX\(seq\), 0\) \+ 1, \?, \?, \?, \?, \?, CASE WHEN COALESCE\(SUM\(qty\), 0\) \+ \? > \? THEN 1 ELSE 0 END, \?, \? FROM ticket_orders WHERE day = \? RETURNING id, seq, over_limit$/i.test(s)) {
      const [day, contact, qty, holders, message, anonymous, addQty, limit, createdAt, clientKey] = a;
      const seq = t.ticket_orders.filter((r) => r.day === day).reduce((x, r) => Math.max(x, r.seq), 0) + 1;
      const sold = t.ticket_orders.filter((r) => r.day === day).reduce((x, r) => x + r.qty, 0);
      const row = { id: nextTicketId++, day, seq, contact, qty, holders, message, anonymous, over_limit: sold + addQty > limit ? 1 : 0, created_at: createdAt, client_key: clientKey };
      t.ticket_orders.push(row);
      return { row: { id: row.id, seq: row.seq, over_limit: row.over_limit } };
    }
    if (/^SELECT \* FROM ticket_orders WHERE contact = \? ORDER BY created_at ASC LIMIT 50$/i.test(s)) {
      return { rows: t.ticket_orders.filter((r) => r.contact === a[0]) };
    }
    if (/^SELECT \* FROM ticket_orders ORDER BY day ASC, seq ASC$/i.test(s)) return { rows: t.ticket_orders };
    if (/^DELETE FROM ticket_orders$/i.test(s)) { t.ticket_orders = []; return { changes: 0 }; }
    /* 公告 */
    if (/^SELECT id, created_at, body(, show_a, show_b)?, image_url FROM announcements/i.test(s)) {
      return { rows: t.announcements };
    }
    throw new Error("内存 D1 不认识的 SQL：" + s);
  };

  return {
    _tables: t,
    prepare(sql) {
      const s = q(sql);
      return {
        bind: (...a) => ({
          run: async () => ({ success: true, meta: { changes: exec(s, a).changes || 0 } }),
          first: async () => exec(s, a).row || null,
          all: async () => ({ results: exec(s, a).rows || [] }),
        }),
        run: async () => ({ success: true, meta: { changes: exec(s, []).changes || 0 } }),
        first: async () => exec(s, []).row || null,
        all: async () => ({ results: exec(s, []).rows || [] }),
      };
    },
    batch: async (list) => Promise.all(list.map((x) => x.run())),
  };
}

const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };

(async () => {
  /* ---- 载入真 worker.js ---- */
  const tmp = path.join(os.tmpdir(), "hj-page-worker.mjs");
  fs.writeFileSync(tmp, fs.readFileSync(path.join(ROOT, "verify-ext/worker.js")));
  const mod = await import(pathToFileURL(tmp).href);

  const db = makeFakeD1();
  db._tables.site_flags.set("ticket_open", 1);
  db._tables.site_flags.set("ticket_daily_limit", 100);
  const iconRequests = [];
  const env = {
    DB: db,
    PASSWORD_A: "a", PASSWORD_B: "b", PASSWORD_C: "c",
    LOGIN_GUARD_SECRET: "pepper", TURNSTILE_SECRET_KEY: "tssk",
    HJ_SITE_ORIGIN: "http://127.0.0.1:8123",   // 职业图标就从本地静态站取
  };

  /* ---- 静态站 + Worker 入口 ---- */
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const send = (code, body, type) => { res.writeHead(code, { "content-type": type || "application/json; charset=utf-8" }); res.end(body); };

    /* 职业图标：真 Worker 会来取，这里就按仓库里的 jobicon/ 给文件 */
    if (url.pathname.startsWith("/jobicon/")) {
      const job = decodeURIComponent(url.pathname.slice("/jobicon/".length).replace(/\.png$/, ""));
      const file = path.join(ROOT, "jobicon", job + ".png");
      if (!fs.existsSync(file)) return send(404, "no icon", "text/plain");
      iconRequests.push(job);
      return send(200, fs.readFileSync(file), "image/png");
    }

    if (url.pathname === "/api/" && req.method === "POST") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const res2 = await mod.default.fetch(new Request("http://127.0.0.1:8123/api/", {
        method: "POST",
        headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.9" },
        body: raw || "{}",
      }), env);
      return send(res2.status, await res2.text());
    }

    /* 静态文件 */
    const p = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = path.join(ROOT, decodeURIComponent(p));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(404, "not found", "text/plain");
    send(200, fs.readFileSync(file), MIME[path.extname(file)] || "application/octet-stream");
  });

  /* ---- 打开页面（外网一律失败 = 国内访客） ---- */
  const blockExternal = requestInterceptor((request) => {
    if (request.url.startsWith("http://127.0.0.1")) return undefined;
    return new Response("", { status: 404, statusText: "blocked" });
  });

  await new Promise((r) => server.listen(8123, "127.0.0.1", r));
  const errors = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => { if (!/Could not load|not implemented/i.test(String(e.message))) errors.push(String(e.message).split("\n")[0]); });
  vc.on("error", (m) => errors.push(String(m)));

  const dom = await JSDOM.fromURL("http://127.0.0.1:8123/", {
    runScripts: "dangerously",
    resources: "usable",
    requestInterceptor: blockExternal,
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      window.fetch = (u, o) => fetch(u.startsWith("http") ? u : "http://127.0.0.1:8123" + u, o);
      window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
      window.HTMLMediaElement.prototype.play = () => Promise.resolve();
      window.HTMLMediaElement.prototype.pause = () => {};
      window.Element.prototype.animate = () => ({ cancel() {}, finish() {}, addEventListener() {}, onfinish: null });
      window.Element.prototype.scrollIntoView = () => {};
      window.Element.prototype.requestFullscreen = () => Promise.resolve();
      window.AudioContext = class { constructor() { this.destination = {}; this.state = "suspended"; } createGain() { return { connect() {}, gain: { value: 0 } }; } createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: {} }; } resume() { return Promise.resolve(); } close() {} };
      window.speechSynthesis = { speak() {}, cancel() {} };
      window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    },
  });

  const { window } = dom;
  await tick(1500);

  console.log("1. 页面初始化");
  ok(!!window.HJVerify, "verify.js 已加载（window.HJVerify 存在）");
  ok(!!window.document.getElementById("captchaVerify"), "弹窗验证挂载点存在");
  ok(!!window.document.getElementById("ticketVerify"), "购票表单验证挂载点存在");
  const ticketTabs = window.document.querySelectorAll("#ticketVerify .verify-tab");
  ok(ticketTabs.length === 4, "购票表单里四种方式按钮并排（实际 " + ticketTabs.length + "）");
  ok(errors.length === 0, "页面脚本没有报错：" + errors.slice(0, 3).join(" | "));

  console.log("2. 花街介绍：国内访客（Turnstile 加载不了）→ 自动改用手动验证");
  window.document.getElementById("infoTile").click();
  await tick(200);
  ok(window.document.getElementById("captchaOverlay").hidden === false, "验证弹窗打开了");
  ok(window.document.querySelector("#captchaVerify .verify-tab.is-on").textContent === "Cloudflare", "先尝试 Cloudflare");
  await tick(7000);   // 等 6 秒超时自动降级
  const onTab = window.document.querySelector("#captchaVerify .verify-tab.is-on");
  ok(onTab.textContent === "狒科生", "6 秒没加载出来 → 自动切到狒科生，实际：" + onTab.textContent);
  const tip = window.document.querySelector("#captchaVerify .verify-tip");
  ok(!tip.hidden && tip.textContent.includes("加载不出来"), "给了切换原因的提示：" + tip.textContent);

  console.log("3. 狒科生：选对职业 → 凭证交给 Worker → 打开花街介绍");
  const correct = iconRequests[iconRequests.length - 1];   // 真 Worker 取的那张图 = 正确答案
  let optBtn = [...window.document.querySelectorAll("#captchaVerify .verify-opt")].find((b) => b.textContent === correct);
  if (!optBtn) { await tick(600); optBtn = [...window.document.querySelectorAll("#captchaVerify .verify-opt")].find((b) => b.textContent === correct); }
  ok(!!optBtn, "选项里能找到正确职业：" + correct);
  ok(!!window.document.querySelector("#captchaVerify .verify-job-icon"), "图标以内联 data URL 渲染");
  optBtn.click();
  await tick(800);
  ok(window.document.getElementById("captchaOverlay").hidden === true, "验证通过后弹窗自动关闭");
  ok(window.document.getElementById("infoOverlay").hidden === false, "排队中的动作（花街介绍）被执行了");
  ok(window.localStorage.getItem("hj_captcha_ok_at") !== null, "记录了免验证窗口时间戳");
  const usedPasses = db._tables.rate_limits.filter((r) => r.action === "verify_pass_used");
  ok(usedPasses.length === 1, "Worker 把通行证消费掉了（记账 1 条，实际 " + usedPasses.length + "）");

  console.log("4. 购票：手动验证 → 提交成功");
  window.location.hash = window.HJ_CONFIG_TICKET_HASH || "#ticket-mq7Zr2Kx9vLp4sWb8TnY3cHd";
  await tick(800);
  const ticketInput = window.document.getElementById("ticketContact");
  ok(!!ticketInput, "购票表单已渲染");
  ticketInput.value = "123456789";
  window.document.getElementById("ticketHolders").querySelector(".th-name").value = "测试角色";
  const serverSel = window.document.getElementById("ticketHolders").querySelector(".th-server");
  serverSel.value = serverSel.options[1] ? serverSel.options[1].value : "";
  await tick(100);
  const tTab = window.document.querySelector("#ticketVerify .verify-tab.is-on");
  ok(tTab && tTab.textContent === "狒科生", "购票表单里默认用手动验证，实际：" + (tTab && tTab.textContent));
  let tOpts = [...window.document.querySelectorAll("#ticketVerify .verify-opt")];
  if (!tOpts.length) {
    await tick(600);
    tOpts = [...window.document.querySelectorAll("#ticketVerify .verify-opt")];
  }
  ok(tOpts.length === 3, "购票表单里出现三个职业选项（实际 " + tOpts.length + "）");
  const ticketCorrect = iconRequests[iconRequests.length - 1];
  const tBtn = [...tOpts].find((b) => b.textContent === ticketCorrect);
  ok(!!tBtn, "购票表单里的正确职业：" + ticketCorrect);
  tBtn.click();
  await tick(300);
  window.document.getElementById("ticketSubmitBtn").click();
  await tick(800);
  ok(window.document.getElementById("ticketResult").hidden === false, "提交成功，显示了登记成功页");
  ok(window.document.getElementById("ticketResultTitle").textContent.includes("登记成功"), "结果标题正确：" + window.document.getElementById("ticketResultTitle").textContent);
  ok(db._tables.ticket_orders.length === 1, "D1 里落了一条订单");

  console.log("5. 凭证只用一次：同一张通行证不能第二次购票");
  window.document.getElementById("ticketSaveImgBtn").hidden = true;
  const serverValue = serverSel.options[1] ? serverSel.options[1].value : "紫水栈桥";
  const ticketPayload = (pass) => ({
    action: "submit_ticket", verifyPass: pass, contact: "123456789", qty: 1,
    holders: [{ name: "测试角色", server: serverValue }], message: "", anonymous: true,
  });

  const forged = await window.callWorker(ticketPayload("伪造的凭证"));
  ok(!forged.ok && forged.error === "captcha", "伪造凭证被拒：" + JSON.stringify(forged));

  /* 拿一张真凭证：直接向后端要一道算术题并答对 */
  const task = await window.callWorker({ action: "get_verify_task", mode: "math" });
  const m = /^(\d+) ([+\−×]) (\d+)$/.exec(task.question);
  const val = m[2] === "+" ? +m[1] + +m[3] : m[2] === "−" ? +m[1] - +m[3] : +m[1] * +m[3];
  const ans = await window.callWorker({ action: "verify_answer", id: task.id, answer: String(val) });
  ok(ans.ok === true, "答对算术题拿到真凭证");

  const first = await window.callWorker(ticketPayload(ans.pass));
  ok(first.ok === true, "真凭证能正常购票：" + JSON.stringify(first));
  const second = await window.callWorker(ticketPayload(ans.pass));
  ok(second.ok === false && second.error === "captcha", "同一张真凭证第二次被拒：" + JSON.stringify(second));

  console.log("\n页面运行期错误：", errors.length ? errors.slice(0, 5) : "无");
  console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
  server.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
