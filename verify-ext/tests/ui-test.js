/* verify.js 的界面自测（jsdom）：标签切换、四种方式、自动降级、凭证产出 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const SRC = fs.readFileSync(path.resolve(__dirname, "../../verify.js"), "utf8");

let pass = 0, fail = 0;
const ok = (cond, label) => { cond ? pass++ : (fail++, console.log("  ✗ " + label)); };
const tick = (ms) => new Promise((r) => setTimeout(r, ms));

function boot() {
  const dom = new JSDOM('<!doctype html><html><body><div class="gate-card"><div id="host"></div></div></body></html>', {
    runScripts: "dangerously",
    url: "https://example.test/",
    pretendToBeVisual: true,
  });
  dom.window.eval(SRC);
  return dom;
}

/* 假的 Worker：按 action 返回预设结果 */
function fakePost(log, opts) {
  const o = Object.assign({ mode: "ff14" }, opts || {});
  let calls = 0;
  return async (payload) => {
    log.push(payload);
    if (payload.action === "get_verify_task") {
      calls++;
      if (payload.mode === "ff14") {
        return { ok: true, id: "v" + calls, mode: "ff14", options: ["绘灵法师", "龙骑士", "骑士"], icon: "/api?jobicon=v" + calls };
      }
      if (payload.mode === "poem") return { ok: true, id: "v" + calls, mode: "poem", keyword: "花" };
      return { ok: true, id: "v" + calls, mode: "math", question: "37 + 46" };
    }
    if (payload.action === "get_verify_hint") {
      return { ok: true, chars: "夜来风雨声花落知多少春眠不觉晓处处闻啼鸟举头望明月".split("").slice(0, 20), len: 10 };
    }
    if (payload.action === "verify_answer") {
      if (o.rejectAll) return { ok: false, error: "wrong" };
      return { ok: true, pass: "p" + calls };
    }
    return { ok: false, error: "unknown action" };
  };
}

(async () => {
  /* ---------- 1. 没有 Cloudflare 时自动降级到「狒科生」 ---------- */
  console.log("1. Turnstile 加载不出来 → 自动切「狒科生」");
  {
    const dom = boot();
    const log = [];
    const passes = [];
    const gate = dom.window.HJVerify.createGate(dom.window.document.getElementById("host"), {
      post: fakePost(log), turnstileSiteKey: "dummy", turnstileWaitMs: 30, onPass: (p) => passes.push(p),
    });
    gate.open();
    ok(gate.mode === "cf", "先按 Cloudflare 打开");
    await tick(400);   // waitForTurnstile 每 250ms 检查一次超时
    ok(gate.mode === "ff14", "超时后自动切到狒科生，实际：" + gate.mode);
    const tabs = dom.window.document.querySelectorAll(".verify-tab");
    ok(tabs.length === 4, "四种方式各有一个按钮（4 个），实际：" + tabs.length);
    ok([...tabs].map((t) => t.textContent).join("/") === "Cloudflare/狒科生/文科生/理科生", "按钮文案与顺序");
    ok(dom.window.document.querySelector(".verify-tab.is-on").textContent === "狒科生", "狒科生是默认高亮的那个");
    ok(log.some((p) => p.action === "get_verify_task" && p.mode === "ff14"), "向 Worker 要了 ff14 题目");
    const opts = dom.window.document.querySelectorAll(".verify-opt");
    ok(opts.length === 3, "三个职业名并排，实际：" + opts.length);
    ok(!!dom.window.document.querySelector(".verify-job-icon"), "显示了职业图标");
    /* 选正确答案 */
    [...opts].find((b) => b.textContent === "龙骑士").click();
    await tick(30);
    ok(passes.length === 1 && passes[0].verifyPass === "p1", "答对后给出 verifyPass 凭证：" + JSON.stringify(passes[0]));
    ok(dom.window.document.querySelector(".verify-tip").textContent.includes("验证通过"), "界面提示验证通过");
    /* 记忆偏好：再开一次应直接进手动验证 */
    ok(dom.window.HJVerify.prefersManual(), "记住了「以后直接用手动验证」");
    ok(dom.window.localStorage.getItem("hj_captcha_mode") === "ff14", "记住的方式是 ff14");
    dom.window.close();
  }

  /* ---------- 2. Cloudflare 可用时用 Cloudflare ---------- */
  console.log("2. Cloudflare 正常 → 直接用 Cloudflare");
  {
    const dom = boot();
    const passes = [];
    dom.window.turnstile = {
      render(el, opts) { el.innerHTML = "<i>widget</i>"; setTimeout(() => opts.callback("TOKEN123"), 10); return 7; },
      remove() {}, reset() {},
    };
    const gate = dom.window.HJVerify.createGate(dom.window.document.getElementById("host"), {
      post: fakePost([]), turnstileSiteKey: "dummy", turnstileWaitMs: 50, onPass: (p) => passes.push(p),
    });
    gate.open();
    ok(gate.mode === "cf", "默认是 Cloudflare");
    await tick(60);
    ok(passes.length === 1 && passes[0].token === "TOKEN123", "拿到 Turnstile token：" + JSON.stringify(passes[0]));
    dom.window.close();
  }

  /* ---------- 3. 文科生：飞花令 + 提示拼字 ---------- */
  console.log("3. 文科生：飞花令 + 提示");
  {
    const dom = boot();
    dom.window.localStorage.setItem("hj_captcha_manual_at", String(Date.now()));
    dom.window.localStorage.setItem("hj_captcha_mode", "poem");
    const log = [];
    const passes = [];
    const gate = dom.window.HJVerify.createGate(dom.window.document.getElementById("host"), {
      post: fakePost(log), turnstileSiteKey: "dummy", turnstileWaitMs: 30, onPass: (p) => passes.push(p),
    });
    gate.open();
    await tick(20);
    ok(gate.mode === "poem", "记住文科生后直接进飞花令，实际：" + gate.mode);
    ok(dom.window.document.querySelector(".verify-q").textContent.includes("花"), "题目里带令字");
    /* 点提示 */
    dom.window.document.querySelector('[data-act="hint"]').click();
    await tick(30);
    const chars = dom.window.document.querySelectorAll(".verify-char");
    ok(chars.length === 20, "提示给 20 个字，实际：" + chars.length);
    ok(log.some((p) => p.action === "get_verify_hint"), "提示是向 Worker 要的");
    /* 点两个字应该填进输入框 */
    chars[0].click(); chars[1].click();
    const input = dom.window.document.querySelector(".verify-input");
    ok(input.value.length === 2, "点提示里的字会填进输入框");
    input.value = "夜来风雨声，花落知多少";
    dom.window.document.querySelector('[data-act="submit"]').click();
    await tick(30);
    ok(passes.length === 1 && passes[0].verifyPass, "答对后给出凭证");
    ok(log.find((p) => p.action === "verify_answer").answer === "夜来风雨声，花落知多少", "答案原样交给 Worker");
    dom.window.close();
  }

  /* ---------- 4. 理科生：算术题答错后再答对 ---------- */
  console.log("4. 理科生：算术题");
  {
    const dom = boot();
    dom.window.localStorage.setItem("hj_captcha_manual_at", String(Date.now()));
    dom.window.localStorage.setItem("hj_captcha_mode", "math");
    const log = [];
    const passes = [];
    let reject = true;
    const post = async (payload) => {
      log.push(payload);
      if (payload.action === "get_verify_task") return { ok: true, id: "v1", mode: "math", question: "12 + 7" };
      if (payload.action === "verify_answer") {
        if (reject) { reject = false; return { ok: false, error: "wrong" }; }
        return { ok: true, pass: "p9" };
      }
      return { ok: false };
    };
    const gate = dom.window.HJVerify.createGate(dom.window.document.getElementById("host"), {
      post, turnstileSiteKey: "dummy", turnstileWaitMs: 30, onPass: (p) => passes.push(p),
    });
    gate.open();
    await tick(20);
    ok(gate.mode === "math", "记住理科生后直接进算术题，实际：" + gate.mode);
    ok(dom.window.document.querySelector(".verify-expr").textContent === "12 + 7", "算式渲染出来");
    const input = dom.window.document.querySelector(".verify-input");
    input.value = "19";
    dom.window.document.querySelector('[data-act="submit"]').click();
    await tick(20);
    ok(passes.length === 0, "答错时不给凭证");
    ok(dom.window.document.querySelector(".verify-tip").textContent.includes("答案不对"), "提示答案不对");
    dom.window.document.querySelector('[data-act="submit"]').click();
    await tick(20);
    ok(passes.length === 1 && passes[0].verifyPass === "p9", "第二次答对拿到凭证");
    dom.window.close();
  }

  /* ---------- 5. 主动切回 Cloudflare 会忘掉手动偏好 ---------- */
  console.log("5. 切回 Cloudflare");
  {
    const dom = boot();
    dom.window.turnstile = { render: () => 1, remove() {}, reset() {} };
    dom.window.localStorage.setItem("hj_captcha_manual_at", String(Date.now()));
    dom.window.localStorage.setItem("hj_captcha_mode", "poem");
    const gate = dom.window.HJVerify.createGate(dom.window.document.getElementById("host"), {
      post: fakePost([]), turnstileSiteKey: "dummy", turnstileWaitMs: 30,
    });
    gate.open();
    await tick(20);
    ok(gate.mode === "poem", "先按记住的方式打开");
    dom.window.document.querySelector('[data-mode="cf"]').click();
    await tick(20);
    ok(gate.mode === "cf", "点 Cloudflare 后切回去");
    ok(!dom.window.HJVerify.prefersManual(), "忘掉了手动验证偏好");
    dom.window.close();
  }


  /* ---------- 6. 狒科生：图标 data URL / 没有图标时兜底 ---------- */
  console.log("6. 狒科生图标");
  {
    const dom = boot();
    dom.window.localStorage.setItem("hj_captcha_manual_at", String(Date.now()));
    dom.window.localStorage.setItem("hj_captcha_mode", "ff14");
    const post = async (payload) => {
      if (payload.action === "get_verify_task") {
        return { ok: true, id: "v1", mode: "ff14", options: ["绘灵法师", "龙骑士", "骑士"],
                 iconData: "data:image/png;base64,AAAA" };
      }
      return { ok: false };
    };
    const gate = dom.window.HJVerify.createGate(dom.window.document.getElementById("host"), {
      post, turnstileSiteKey: "dummy", turnstileWaitMs: 30,
    });
    gate.open();
    await tick(20);
    const img = dom.window.document.querySelector(".verify-job-icon");
    ok(!!img && img.getAttribute("src").startsWith("data:image/png;base64,"), "data URL 图标直接渲染");
    ok(!/jobicon/.test(dom.window.document.getElementById("host").innerHTML), "源码里不出现 jobicon 路径");

    /* 没有图标时给兜底文案，而不是空白 */
    const post2 = async () => ({ ok: true, id: "v2", mode: "ff14", options: ["龙骑士", "骑士", "武僧"] });
    const host2 = dom.window.document.createElement("div");
    dom.window.document.body.appendChild(host2);
    const gate2 = dom.window.HJVerify.createGate(host2, {
      post: post2, turnstileSiteKey: "dummy", turnstileWaitMs: 30,
    });
    gate2.open();
    await tick(20);
    ok(!!dom.window.document.querySelector(".verify-job-fallback"), "没有图标时显示兜底文案");
    dom.window.close();
  }

  /* ---------- 7. 图标取不到（no_icon）→ 自动改用理科生 ---------- */
  console.log("7. no_icon 自动换方式");
  {
    const dom = boot();
    dom.window.localStorage.setItem("hj_captcha_manual_at", String(Date.now()));
    dom.window.localStorage.setItem("hj_captcha_mode", "ff14");
    const log = [];
    const post = async (payload) => {
      log.push(payload);
      if (payload.action === "get_verify_task") {
        if (payload.mode === "ff14") return { ok: false, error: "no_icon" };
        return { ok: true, id: "v2", mode: "math", question: "3 × 4" };
      }
      return { ok: false };
    };
    const gate = dom.window.HJVerify.createGate(dom.window.document.getElementById("host"), {
      post, turnstileSiteKey: "dummy", turnstileWaitMs: 30,
    });
    gate.open();
    await tick(30);
    ok(gate.mode === "math", "自动切到理科生，实际：" + gate.mode);
    ok(dom.window.document.querySelector(".verify-tip").textContent.includes("图标"), "提示里说明原因");
    ok(dom.window.localStorage.getItem("hj_captcha_mode") === "math", "记住了改用理科生");
    dom.window.close();
  }

  /* ---------- 8. 判卷失败时显示 Worker 给的原因 ---------- */
  console.log("8. 判卷失败原因");
  {
    const dom = boot();
    dom.window.localStorage.setItem("hj_captcha_manual_at", String(Date.now()));
    dom.window.localStorage.setItem("hj_captcha_mode", "poem");
    const post = async (payload) => {
      if (payload.action === "get_verify_task") return { ok: true, id: "v1", mode: "poem", keyword: "花" };
      if (payload.action === "verify_answer") return { ok: false, error: "wrong", why: "这句里没有「花」字，换一句试试" };
      return { ok: false };
    };
    const gate = dom.window.HJVerify.createGate(dom.window.document.getElementById("host"), {
      post, turnstileSiteKey: "dummy", turnstileWaitMs: 30,
    });
    gate.open();
    await tick(20);
    const input = dom.window.document.querySelector(".verify-input");
    input.value = "床前明月光";
    dom.window.document.querySelector('[data-act="submit"]').click();
    await tick(20);
    const tip = dom.window.document.querySelector(".verify-tip").textContent;
    ok(tip.includes("换一句试试"), "显示服务端给的原因：" + tip);
    dom.window.close();
  }

  console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
