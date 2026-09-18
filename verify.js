/* =============================================================================
   花舞之街 · 薰风花语町 —— 人机验证组件（Cloudflare Turnstile + 三种手动验证）
   -----------------------------------------------------------------------------
   这个文件是新增的独立组件（普通脚本，挂在 window.HJVerify 上），index.html 里只需：
     1) 在页面脚本之前引入：<script src="verify.js?v=1"></script>
     2) 准备一个空的挂载容器，然后创建验证门：
          const gate = HJVerify.createGate(容器元素, {
            post: callWorker,                 // 页面里调用 Worker 的函数（POST JSON）
            turnstileSiteKey: TURNSTILE_SITE_KEY,
            onPass: (proof) => { … },         // 通过后的凭证，交给页面继续
          });
        gate.open();                          // 打开（自动挑一种验证方式）
        gate.refresh();                       // 换一题 / 重开
        gate.useManual("原因文字");            // 强制切到手动验证
        gate.proof();                         // 当前凭证：{token} / {verifyPass} / null

   两大类验证方式（完成任意一种即可通过）：
     · 自动验证（Cloudflare）—— 默认方式；脚本加载失败 / 超时 / 报错时自动转手动验证。
       验证区下方常驻一个「自动验证不成功？点击手动验证」按钮，随时可以自己切过去。
     · 手动验证 —— 下分三种，切到手动验证后用一排小标签互相切换，也可以点「返回自动验证」：
         · 狒科生 —— 看职业图标选职业（三选一），图标来自仓库 jobicon/ 文件夹
         · 文科生 —— 飞花令：给一个常用汉字，写一句含该字的诗词；可点「提示」拿 20 个字来拼
         · 理科生 —— 算术题

   安全设计：
     · 手动验证的题目由 Worker 出题、Worker 判卷，正确答案不会下发到前端；
     · 文科生的诗词判定在服务端：题库（必背 + 高中 / 大学 / 偏门）命中就直接通过，
       题库没有但像一句诗词也会放行，只有「不含令字 / 太短 / 夹字母数字 / 口水话」才打回，
       打回时会带上原因（data.why）；
     · 狒科生的职业图标由 Worker 从站点 jobicon/ 取回、以 data URL 内联进题目，
       地址里不含职业名，看源码也抄不到答案；
     · 答对后拿到一次性通行证 verifyPass（默认 10 分钟内有效、只能用一次），
       提交表单时随请求交给 Worker 消费；服务端未通过就一律按「人机验证未通过」处理。
   ============================================================================= */

(function (global) {
  "use strict";

  /* ===========================================================================
     0. 配置与常量
     =========================================================================== */

  /* 手动验证方式记在本地：记过之后 6 小时内直接用手动验证，不再等 Cloudflare 加载 */
  const MANUAL_KEEP_MS = 6 * 3600 * 1000;
  const K_MANUAL_AT = "hj_captcha_manual_at";   // 最近一次用手动验证的时间
  const K_MANUAL_MODE = "hj_captcha_mode";      // 记住的手动验证方式
  const MANUAL_MODES = ["ff14", "poem", "math"];

  const MODES = [
    { id: "cf", label: "自动验证", title: "自动验证（Cloudflare）" },
    { id: "ff14", label: "狒科生", title: "狒科生：看图标选职业" },
    { id: "poem", label: "文科生", title: "文科生：飞花令" },
    { id: "math", label: "理科生", title: "理科生：算术题" },
  ];

  const DEFAULTS = {
    post: null,                 // (payload) => Promise<object|null>，页面提供的 Worker 调用函数
    turnstileSiteKey: "",
    turnstileWaitMs: 6000,      // 等 Turnstile 脚本的时间，超时就切手动验证
    turnstileSlowMs: 12000,     // 组件出来了但一直不通过时的提示时间
    /* 职业图标地址由 Worker 决定（默认走 Worker 代理，地址里不含职业名，避免看地址作弊） */
    onPass: null,               // (proof) => void
    onModeChange: null,         // (mode) => void
  };

  /* 本地存储：隐私模式下会抛错，统一吞掉 */
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
    set(key, value) { try { localStorage.setItem(key, String(value)); } catch (e) {} },
    remove(key) { try { localStorage.removeItem(key); } catch (e) {} },
  };

  /* 等待 Turnstile 脚本加载完成；超时返回 false */
  function waitForTurnstile(timeoutMs) {
    if (global.turnstile) return Promise.resolve(true);
    return new Promise((resolve) => {
      const start = Date.now();
      const timer = setInterval(() => {
        if (global.turnstile) { clearInterval(timer); resolve(true); }
        else if (Date.now() - start >= timeoutMs) { clearInterval(timer); resolve(false); }
      }, 250);
    });
  }

  const isManualMode = (mode) => MANUAL_MODES.indexOf(mode) >= 0;
  const modeLabel = (mode) => (MODES.find((m) => m.id === mode) || MODES[1]).label;

  /* 记住 / 读取「改用某种手动验证」的偏好 */
  function rememberManual(mode) {
    store.set(K_MANUAL_AT, Date.now());
    if (isManualMode(mode)) store.set(K_MANUAL_MODE, mode);
  }
  function forgetManual() {
    store.remove(K_MANUAL_AT);
    store.remove(K_MANUAL_MODE);
  }
  function prefersManual() {
    if (!(Date.now() - (Number(store.get(K_MANUAL_AT)) || 0) < MANUAL_KEEP_MS)) return false;
    return isManualMode(defaultManualMode());
  }
  function defaultManualMode() {
    const saved = store.get(K_MANUAL_MODE);
    return isManualMode(saved) ? saved : "ff14";   // 「狒科生」是默认的手动验证方式
  }

  /* 错误原因 → 人话。data 为 null 表示请求根本没回来 */
  function errText(data, networkHint) {
    if (!data) return networkHint || "连接失败，检查一下网络后再试";
    switch (data.error) {
      case "rate_limited": return "操作太频繁了，请稍等一会儿再试";
      case "wrong": return "答案不对，再试一次";
      case "expired":
      case "not_found": return "题目已过期，已换一题，请重新作答";
      case "bad_mode": return "验证方式不对，请重新选择";
      case "unknown action": return "后端（Worker）还是旧版本，请联系管理员";
      case "no_db": return "后端没有连上数据库（D1），请联系管理员";
      case "no_icon": return "职业图标暂时取不到，已换一种验证方式";
      default: return "验证服务出错了（" + (data.error || "未知错误") + "），请稍后再试";
    }
  }

  /* ===========================================================================
     1. 验证门：一个容器 = 一套「Cloudflare + 三种手动验证」界面
     =========================================================================== */

  class VerifyGate {
    constructor(host, options) {
      this.host = host;
      this.o = Object.assign({}, DEFAULTS, options || {});
      this.mode = null;
      this.task = null;         // 当前题目（Worker 返回的原始对象）
      this.proof = null;        // 已通过的凭证：{ token } 或 { verifyPass }
      this.note = "";           // 需要一直显示给用户的说明（例如「Cloudflare 加载不出来，已改用狒科生」）
      this.hint = null;         // 文科生的提示：{ chars: [...], len: n }
      this.wrong = 0;           // 当前题目答错次数
      this.busy = false;
      this.session = 0;         // 每次换题 / 换方式 +1，用来丢弃过期的异步回调
      this.widgetId = null;     // Turnstile 组件 id
      this.built = false;
      this.build();
    }

    /* ---------- 1.1 骨架：标签按钮 + 提示行 + 面板 ---------- */

    build() {
      const host = this.host;
      host.innerHTML = "";
      host.classList.add("verify-host");

      /* 手动验证的三种方式（狒科生 / 文科生 / 理科生）并排；只有切到手动验证时才出现 */
      this.tabs = document.createElement("div");
      this.tabs.className = "verify-tabs";
      this.tabs.setAttribute("role", "tablist");
      this.tabs.setAttribute("aria-label", "选择手动验证方式");
      this.tabs.hidden = true;
      this.tabs.innerHTML = '<span class="verify-tabs-label">手动验证</span>'
        + MANUAL_MODES.map((id) => {
            const m = MODES.find((x) => x.id === id);
            return '<button type="button" class="verify-tab" role="tab" data-act="tab" data-mode="' + m.id + '"'
              + ' title="' + m.title + '" aria-selected="false">' + m.label + "</button>";
          }).join("");

      this.tipEl = document.createElement("p");
      this.tipEl.className = "verify-tip";
      this.tipEl.setAttribute("role", "status");
      this.tipEl.setAttribute("aria-live", "polite");
      this.tipEl.hidden = true;

      this.body = document.createElement("div");
      this.body.className = "verify-body";

      /* 底部切换：自动验证下是「自动验证不成功？点击手动验证」，手动验证下是「返回自动验证」 */
      this.switchEl = document.createElement("div");
      this.switchEl.className = "verify-switch";
      this.switchEl.hidden = true;

      host.append(this.tabs, this.tipEl, this.body, this.switchEl);

      host.addEventListener("click", (e) => this.onClick(e));
      host.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        const input = e.target.closest(".verify-input");
        if (input) { e.preventDefault(); this.submitAnswer(input.value); }
      });
      this.built = true;
    }

    onClick(e) {
      const el = e.target.closest("[data-act]");
      if (!el || !this.host.contains(el)) return;
      const act = el.dataset.act;

      if (act === "tab") {
        const mode = el.dataset.mode;
        if (mode === this.mode) return;
        if (mode === "cf") forgetManual();          // 主动切回 Cloudflare：不再默认手动验证
        else rememberManual(mode);
        this.setMode(mode);
        return;
      }
      if (act === "manual") { this.useManual(""); return; }                 // 自动验证不成功 → 手动验证
      if (act === "auto") { forgetManual(); this.setMode("cf"); return; }    // 手动验证 → 返回自动验证
      if (act === "opt") { this.submitAnswer(el.dataset.value); return; }   // 狒科生：点职业名
      if (act === "submit") {
        const input = this.body.querySelector(".verify-input");
        this.submitAnswer(input ? input.value : "");
        return;
      }
      if (act === "refresh") { this.loadTask(); return; }                   // 换一题 / 换一个令字
      if (act === "hint") { this.loadHint(); return; }                      // 文科生：提示
      if (act === "char") {                                                 // 文科生：点提示里的字填进输入框
        const input = this.body.querySelector(".verify-input");
        if (input) { input.value += el.dataset.value; input.focus(); }
        return;
      }
    }

    /* ---------- 1.2 状态：打开 / 关闭 / 换方式 / 换题 ---------- */

    /* 打开验证；不传方式时按偏好自动挑（国内加载不了 Cloudflare 的访客直接进手动验证） */
    open(mode) {
      this.host.hidden = false;
      this.session++;
      this.proof = null;
      this.hint = null;
      this.wrong = 0;
      this.removeWidget();
      this.setMode(mode || (prefersManual() ? defaultManualMode() : "cf"));
    }

    hide() {
      this.session++;
      this.removeWidget();
      this.host.hidden = true;
    }

    /* 切到手动验证：自动验证不可用时组件自己调用，访客点「点击手动验证」时也走这里 */
    useManual(reason) {
      const mode = defaultManualMode();
      rememberManual(mode);
      this.setMode(mode, reason ? reason + "（" + modeLabel(mode) + "）" : "");
    }

    /* 换一题 / 重开当前方式 */
    refresh() {
      this.proof = null;
      this.setMode(this.mode, "");
    }

    /* 服务端说凭证无效时调用：作废当前凭证并让用户重做 */
    clearProof() {
      this.proof = null;
      this.refresh();
    }

    setMode(mode, tip) {
      if (!mode) mode = "cf";
      this.session++;
      this.mode = mode;
      this.task = null;
      this.hint = null;
      this.wrong = 0;
      this.proof = null;
      this.removeWidget();

      /* 方式标签只在手动验证时露出；自动验证时整排收起来 */
      this.tabs.hidden = !isManualMode(mode);
      this.tabs.querySelectorAll(".verify-tab").forEach((btn) => {
        const on = btn.dataset.mode === mode;
        btn.classList.toggle("is-on", on);
        btn.setAttribute("aria-selected", on ? "true" : "false");
      });

      this.note = tip || "";      // 自动降级之类的原因要一直显示，别被「出题中…」顶掉
      this.setTip("");
      this.renderSwitch();
      if (this.o.onModeChange) this.o.onModeChange(mode);

      if (mode === "cf") this.renderTurnstile();
      else this.loadTask();
    }

    /* 底部的切换按钮。自动验证没通过时给一个「点击手动验证」的出口；手动验证时给「返回自动验证」 */
    renderSwitch() {
      const el = this.switchEl;
      if (!el) return;
      if (this.proof) { el.innerHTML = ""; el.hidden = true; return; }
      el.innerHTML = this.mode === "cf"
        ? '<button type="button" class="verify-switch-btn" data-act="manual">自动验证不成功？点击手动验证</button>'
        : '<button type="button" class="verify-mini" data-act="auto">返回自动验证</button>';
      el.hidden = false;
    }

    /* 提示行：临时状态优先，没有临时状态时显示切换方式的说明（note） */
    setTip(text, isError) {
      const show = text || this.note;
      this.tipEl.textContent = show || "";
      this.tipEl.hidden = !show;
      this.tipEl.classList.toggle("is-error", !!isError && !!text);
      this.tipEl.classList.toggle("is-note", !text && !!this.note);
    }

    /* ---------- 1.3 Cloudflare Turnstile ---------- */

    removeWidget() {
      if (global.turnstile && this.widgetId !== null) {
        try { global.turnstile.remove(this.widgetId); } catch (e) {}
      }
      this.widgetId = null;
    }

    async renderTurnstile() {
      const session = this.session;
      this.body.innerHTML = '<div class="verify-cf"></div>';
      const box = this.body.querySelector(".verify-cf");

      if (!global.turnstile) this.setTip("验证组件加载中，请稍候…");
      const ready = await waitForTurnstile(this.o.turnstileWaitMs);
      if (session !== this.session || this.mode !== "cf") return;

      if (!ready) {
        this.useManual("自动验证（Cloudflare）加载不出来，已转到手动验证");
        return;
      }

      this.setTip("");
      let passed = false;
      try {
        this.widgetId = global.turnstile.render(box, {
          sitekey: this.o.turnstileSiteKey,
          callback: (token) => {
            if (session !== this.session) return;
            passed = true;
            this.proof = { token: token };
            this.setTip("验证通过");
            this.renderSwitch();
            if (this.o.onPass) this.o.onPass(this.proof);
          },
          "expired-callback": () => {
            if (session !== this.session) return;
            this.proof = null;
            this.renderSwitch();
          },
          "error-callback": () => {
            if (session === this.session) {
              this.useManual("自动验证（Cloudflare）加载失败，已转到手动验证");
            }
            return true;   // 已自行处理，不让组件反复重试
          },
        });
      } catch (e) {
        this.useManual("自动验证（Cloudflare）初始化失败，已转到手动验证");
        return;
      }

      /* 组件出现了但一直卡着不通过（网络受限时常见）：给一句提示 */
      setTimeout(() => {
        if (!passed && session === this.session && this.mode === "cf" && !this.proof) {
          this.setTip("一直转圈的话，可以点下面的「自动验证不成功？点击手动验证」");
        }
      }, this.o.turnstileSlowMs);
    }

    /* ---------- 1.4 手动验证：出题 ---------- */

    async loadTask() {
      const session = this.session;
      const mode = this.mode;
      this.task = null;
      this.hint = null;
      this.wrong = 0;
      this.proof = null;
      this.body.innerHTML = "";
      this.setTip("出题中…");

      const data = this.o.post ? await this.o.post({ action: "get_verify_task", mode: mode }) : null;
      if (session !== this.session || mode !== this.mode) return;

      if (!data || !data.ok) {
        /* 站点上的 jobicon/ 取不到图时别让访客卡在狒科生：直接换算术题 */
        if (data && data.error === "no_icon" && mode === "ff14") {
          rememberManual("math");
          this.setMode("math", "职业图标暂时取不到，已换成另一种手动验证");
          return;
        }
        this.setTip(errText(data), true);
        this.body.innerHTML = '<div class="verify-actions"><button type="button" class="verify-mini" data-act="refresh">重试</button></div>';
        return;
      }
      this.task = data;
      this.setTip("");
      this.renderTask();
    }

    renderTask() {
      const t = this.task;
      if (this.mode === "ff14") this.body.innerHTML = this.tplFf14(t);
      else if (this.mode === "poem") this.body.innerHTML = this.tplPoem(t);
      else this.body.innerHTML = this.tplMath(t);
      this.focusFirst();
    }

    focusFirst() {
      const input = this.body.querySelector(".verify-input");
      if (input) input.focus({ preventScroll: true });
    }

    /* 狒科生：一张职业图标 + 三个职业名 */
    tplFf14(t) {
      /* 图标由 Worker 以 data URL 下发（地址里不含职业名，看源码也抄不到答案） */
      const icon = t.iconData || t.icon;
      const img = icon
        ? '<img class="verify-job-icon" src="' + icon + '" alt="职业图标" width="72" height="72" loading="eager">'
        : '<span class="verify-job-fallback">图标加载失败，点「换一题」再试</span>';
      const options = (t.options || []).map((name) =>
        '<button type="button" class="verify-opt" data-act="opt" data-value="' + name + '">' + name + "</button>"
      ).join("");
      return ''
        + '<div class="verify-job">' + img + "</div>"
        + '<p class="verify-q">请选出这个图标对应的职业：</p>'
        + '<div class="verify-options">' + options + "</div>"
        + '<div class="verify-actions"><button type="button" class="verify-mini" data-act="refresh">换一题</button></div>';
    }

    /* 文科生：飞花令 */
    tplPoem(t) {
      const chars = (this.hint && this.hint.chars || []).map((c) =>
        '<button type="button" class="verify-char" data-act="char" data-value="' + c + '">' + c + "</button>"
      ).join("");
      const hintBox = this.hint
        ? '<div class="verify-hint-chars">' + chars + "</div>"
        : "";
      const hintNote = this.hint
        ? '<p class="verify-hint-note">从下面这些字里拼出诗词（点字可以填进输入框）'
          + (this.hint.len ? "，答案共 " + this.hint.len + " 个字" : "") + "：</p>"
        : "";
      return ''
        + '<p class="verify-q">飞花令：请写一句含有「<b class="verify-key">' + t.keyword + "</b>」字的诗词"
        +   '<span class="verify-sub">（诗、词、曲都算，写其中一句即可）</span></p>'
        + '<div class="verify-row">'
        +   '<input type="text" class="verify-input" maxlength="40" autocomplete="off" spellcheck="false"'
        +     ' aria-label="含有「' + t.keyword + '」字的诗句" placeholder="例：夜来风雨声，花落知多少">'
        +   '<button type="button" class="verify-ok" data-act="submit">确认</button>'
        + "</div>"
        + '<div class="verify-hint-wrap">'
        +   '<button type="button" class="verify-mini" data-act="hint">提示（20 个字）</button>'
        +   hintNote + hintBox
        + "</div>"
        + '<div class="verify-actions"><button type="button" class="verify-mini" data-act="refresh">换一个令字</button></div>';
    }

    /* 理科生：算术题 */
    tplMath(t) {
      return ''
        + '<p class="verify-q">请计算：<b class="verify-expr">' + t.question + "</b> = ?</p>"
        + '<div class="verify-row">'
        +   '<input type="text" class="verify-input" inputmode="numeric" maxlength="6" autocomplete="off"'
        +     ' aria-label="算术题答案" placeholder="填写答案">'
        +   '<button type="button" class="verify-ok" data-act="submit">确认</button>'
        + "</div>"
        + '<div class="verify-actions"><button type="button" class="verify-mini" data-act="refresh">换一题</button></div>';
    }

    /* 文科生：要提示。提示由 Worker 生成（随机挑一句含令字的答案，取其用到的字再补足到 20 个） */
    async loadHint() {
      if (!this.task) return;
      const session = this.session;
      this.setTip("正在取提示…");
      const data = await this.o.post({ action: "get_verify_hint", id: this.task.id });
      if (session !== this.session) return;
      if (!data || !data.ok) { this.setTip(errText(data), true); return; }
      this.hint = { chars: data.chars || [], len: data.len || 0 };
      this.setTip("");
      const wrap = this.body.querySelector(".verify-hint-wrap");
      if (wrap) {
        const chars = this.hint.chars.map((c) =>
          '<button type="button" class="verify-char" data-act="char" data-value="' + c + '">' + c + "</button>"
        ).join("");
        wrap.innerHTML = '<button type="button" class="verify-mini" data-act="hint">提示（20 个字）</button>'
          + '<p class="verify-hint-note">从下面这些字里拼一句就行（点字可以填进输入框）'
          + (this.hint.len ? "，答案共 " + this.hint.len + " 个字" : "") + "：</p>"
          + '<div class="verify-hint-chars">' + chars + "</div>";
        const input = this.body.querySelector(".verify-input");
        if (input) input.focus({ preventScroll: true });
      } else {
        this.renderTask();
      }
    }

    /* ---------- 1.5 手动验证：交卷 ---------- */

    async submitAnswer(value) {
      if (this.busy || !this.task || this.proof) return;
      const answer = String(value == null ? "" : value).trim();
      if (!answer) { this.setTip(this.mode === "math" ? "请先填写算术题的答案（数字）" : "请先写下你的答案", true); return; }

      this.busy = true;
      const session = this.session;
      this.setTip(this.mode === "ff14" ? "" : "判卷中…");
      const data = await this.o.post({ action: "verify_answer", id: this.task.id, answer: answer });
      this.busy = false;
      if (session !== this.session) return;

      if (!data || !data.ok) {
        if (data && (data.error === "wrong")) {
          this.wrong++;
          /* 服务端会给出具体原因（例如「这句里没有『春』字」），有就直接显示 */
          this.setTip((data.why ? data.why + "。" : "答案不对，再试一次。")
            + "（已答错 " + this.wrong + " 次）"
            + (this.mode === "poem" && !this.hint ? "，卡住了可以点下面的「提示」" : ""), true);
          if (this.mode === "poem" && this.wrong >= 2 && !this.hint) this.loadHint();
          else if (this.wrong >= 5) this.loadTask();
          return;
        }
        if (data && (data.error === "expired" || data.error === "not_found")) {
          this.setTip(errText(data));
          this.loadTask();
          return;
        }
        this.setTip(errText(data), true);
        return;
      }

      this.proof = { verifyPass: data.pass };
      this.setTip("验证通过");
      this.renderSwitch();
      if (this.o.onPass) this.o.onPass(this.proof);
    }

    /* ---------- 1.6 凭证 ---------- */

    /* 当前已通过的凭证（没有就是 null）。注意：字段叫 proof，方法叫 getProof，避免撞名 */
    getProof() { return this.proof; }
  }

  /* ===========================================================================
     2. 对外接口
     =========================================================================== */

  const HJVerify = {
    createGate(host, options) {
      if (!host) throw new Error("HJVerify.createGate: 找不到挂载容器");
      return new VerifyGate(host, options);
    },
    MODES: MODES,
    prefersManual: prefersManual,
    defaultManualMode: defaultManualMode,
    rememberManual: rememberManual,
    forgetManual: forgetManual,
    waitForTurnstile: waitForTurnstile,
    /* 免验证窗口：通过后 5 分钟内不再弹验证（时间戳存本地，刷新仍有效） */
    isFresh(graceMs) { return Date.now() - (Number(store.get("hj_captcha_ok_at")) || 0) < (graceMs || 5 * 60 * 1000); },
    markOk() { store.set("hj_captcha_ok_at", Date.now()); },
  };

  global.HJVerify = HJVerify;
})(window);
