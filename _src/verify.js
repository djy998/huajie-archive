/* 人机验证：HJVerify.createGate(容器, { post, turnstileSiteKey, onPass })。
   Turnstile 不可用时改为手动验证，由 Worker 出题判卷，通过后得到一次性凭证 */

(function (global) {
  "use strict";

  /* ==== 配置 ==== */

  /* 用过手动验证后 6 小时内直接使用手动验证 */
  const MANUAL_KEEP_MS = 6 * 3600 * 1000;
  const K_MANUAL_AT = "hj_captcha_manual_at";
  const K_MANUAL_MODE = "hj_captcha_mode";
  const MANUAL_MODES = ["ff14", "poem", "math"];

  const MODES = [
    { id: "cf", label: "自动验证", title: "自动验证" },
    { id: "ff14", label: "狒科生", title: "狒科生：看图标选职业" },
    { id: "poem", label: "文科生", title: "文科生：飞花令" },
    { id: "math", label: "理科生", title: "理科生：算术题" },
  ];

  const DEFAULTS = {
    post: null,                 // (payload) => Promise<object|null>
    turnstileSiteKey: "",
    turnstileWaitMs: 6000,      // 超时转为手动验证
    turnstileSlowMs: 12000,
    onPass: null,               // (proof) => void
  };

  const store = {
    get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
    set(key, value) { try { localStorage.setItem(key, String(value)); } catch (e) {} },
    remove(key) { try { localStorage.removeItem(key); } catch (e) {} },
  };

  /* Turnstile 脚本按需加载 */
  const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";
  function loadTurnstileScript() {
    if (global.turnstile || document.querySelector("script[data-turnstile]")) return;
    const s = document.createElement("script");
    s.src = TURNSTILE_SRC;
    s.async = true;
    s.dataset.turnstile = "1";
    document.head.appendChild(s);
  }

  function waitForTurnstile(timeoutMs) {
    if (global.turnstile) return Promise.resolve(true);
    loadTurnstileScript();
    return new Promise((resolve) => {
      const start = Date.now();
      const timer = setInterval(() => {
        if (global.turnstile) { clearInterval(timer); resolve(true); }
        else if (Date.now() - start >= timeoutMs) { clearInterval(timer); resolve(false); }
      }, 250);
    });
  }

  /* 题面画在 canvas 上并加干扰，页面文本中不出现题目 */
  const FONT_STACK = '"Noto Serif SC","Songti SC",serif';

  function paintChallenge(canvas, text, opts) {
    if (!canvas || !text) return;
    const ctx = canvas.getContext && canvas.getContext("2d");
    if (!ctx) return;
    const o = Object.assign({ size: 30, pad: 10, hFactor: 1.5 }, opts || {});
    const ink = (getComputedStyle(canvas).getPropertyValue("--verify-ink") || "#ffd699").trim() || "#ffd699";
    const chars = Array.from(String(text));
    const dpr = Math.min(global.devicePixelRatio || 1, 3);
    const font = o.size + "px " + FONT_STACK;

    ctx.font = font;
    const widths = chars.map((c) => ctx.measureText(c).width + o.size * 0.07);
    const w = Math.ceil(widths.reduce((a, b) => a + b, 0) + o.pad * 2);
    const h = Math.ceil(o.size * o.hFactor);
    const jitter = Math.max(0, h - o.size) * 0.4;

    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    ctx.font = font;
    ctx.textBaseline = "middle";
    ctx.fillStyle = ink;
    let x = o.pad;
    chars.forEach((c, i) => {
      const cw = widths[i];
      ctx.save();
      ctx.translate(x + cw / 2, h / 2 + (Math.random() - 0.5) * jitter);
      ctx.rotate((Math.random() - 0.5) * 0.16);
      ctx.fillText(c, -cw / 2, 0);
      ctx.restore();
      x += cw;
    });

    ctx.strokeStyle = ink;
    ctx.globalAlpha = 0.26;
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(Math.random() * w, Math.random() * h);
      ctx.bezierCurveTo(Math.random() * w, Math.random() * h, Math.random() * w, Math.random() * h,
                        Math.random() * w, Math.random() * h);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  const isManualMode = (mode) => MANUAL_MODES.indexOf(mode) >= 0;
  const hintNoteHtml = (hint) => '<p class="verify-hint-note">点击文字填入' + (hint.len ? "，答案共 " + hint.len + " 字" : "") + "</p>";

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
    return isManualMode(saved) ? saved : "ff14";
  }

  function errText(data) {
    if (!data) return "网络连接失败";
    switch (data.error) {
      case "rate_limited": return "操作过于频繁，请稍后再试";
      case "wrong": return "请重新作答";
      case "expired":
      case "not_found": return "题目已过期，请重新作答";
      case "bad_mode": return "验证方式无效";
      case "no_icon": return "图标加载失败";
      default: return "验证服务出错，请稍后再试";
    }
  }

  /* ==== 组件 ==== */

  class VerifyGate {
    constructor(host, options) {
      this.host = host;
      this.o = Object.assign({}, DEFAULTS, options || {});
      this.mode = null;
      this.task = null;
      this.proof = null;        // { token } 或 { verifyPass }
      this.note = "";           // 常驻说明，如切换验证方式的原因
      this.hint = null;         // 文科生提示：{ chars, len }
      this.busy = false;
      this.session = 0;         // 丢弃过期的异步回调
      this.widgetId = null;
      this.built = false;
      this.build();
    }

    build() {
      const host = this.host;
      host.innerHTML = "";
      host.classList.add("verify-host");

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
        if (mode === "cf") forgetManual();
        else rememberManual(mode);
        this.setMode(mode);
        return;
      }
      if (act === "manual") { this.useManual(""); return; }
      if (act === "auto") { forgetManual(); this.setMode("cf"); return; }
      if (act === "opt") { this.submitAnswer(el.dataset.value); return; }
      if (act === "submit") {
        const input = this.body.querySelector(".verify-input");
        this.submitAnswer(input ? input.value : "");
        return;
      }
      if (act === "refresh") { this.loadTask(); return; }
      if (act === "hint") { this.loadHint(); return; }
      if (act === "char") {
        const input = this.body.querySelector(".verify-input");
        if (input) { input.value += el.dataset.value; input.focus(); }
        return;
      }
    }

    /* 未指定方式时按偏好选择 */
    open(mode) {
      this.host.hidden = false;
      this.session++;
      this.proof = null;
      this.hint = null;
      this.removeWidget();
      this.setMode(mode || (prefersManual() ? defaultManualMode() : "cf"));
    }

    hide() {
      this.session++;
      this.removeWidget();
      this.host.hidden = true;
    }

    useManual(reason) {
      const mode = defaultManualMode();
      rememberManual(mode);
      this.setMode(mode, reason);
    }

    refresh() {
      this.proof = null;
      this.setMode(this.mode, "");
    }

    setMode(mode, tip) {
      if (!mode) mode = "cf";
      this.session++;
      this.mode = mode;
      this.task = null;
      this.hint = null;
      this.proof = null;
      this.removeWidget();

      this.tabs.hidden = !isManualMode(mode);
      this.tabs.querySelectorAll(".verify-tab").forEach((btn) => {
        const on = btn.dataset.mode === mode;
        btn.classList.toggle("is-on", on);
        btn.setAttribute("aria-selected", on ? "true" : "false");
      });

      this.note = tip || "";
      this.setTip("");
      this.renderSwitch();

      if (mode === "cf") this.renderTurnstile();
      else this.loadTask();
    }

    /* 通过后撤下题目（「换一题」会清掉刚拿到的凭证） */
    renderPassed() {
      this.task = null;
      this.hint = null;
      this.tabs.hidden = true;
      this.note = "";
      this.setTip("");
      this.body.innerHTML = '<p class="verify-done"><span class="verify-done-mark" aria-hidden="true">✓</span>验证通过</p>';
      this.renderSwitch();
    }

    renderSwitch() {
      const el = this.switchEl;
      if (!el) return;
      if (this.proof) { el.innerHTML = ""; el.hidden = true; return; }
      el.innerHTML = this.mode === "cf"
        ? '<button type="button" class="verify-switch-btn" data-act="manual">改用手动验证</button>'
        : '<button type="button" class="verify-mini" data-act="auto">返回自动验证</button>';
      el.hidden = false;
    }

    /* 临时提示优先，否则显示 note */
    setTip(text, isError) {
      const show = text || this.note;
      this.tipEl.textContent = show || "";
      this.tipEl.hidden = !show;
      this.tipEl.classList.toggle("is-error", !!isError && !!text);
      this.tipEl.classList.toggle("is-note", !text && !!this.note);
    }

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

      if (!global.turnstile) this.setTip("加载中…");
      const ready = await waitForTurnstile(this.o.turnstileWaitMs);
      if (session !== this.session || this.mode !== "cf") return;

      if (!ready) {
        this.useManual("自动验证不可用，已切换为手动验证");
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
              this.useManual("自动验证不可用，已切换为手动验证");
            }
            return true;
          },
        });
      } catch (e) {
        this.useManual("自动验证不可用，已切换为手动验证");
        return;
      }

      setTimeout(() => {
        if (!passed && session === this.session && this.mode === "cf" && !this.proof) {
          this.setTip("加载缓慢可改用手动验证");
        }
      }, this.o.turnstileSlowMs);
    }

    /* afterTip：出题后保留的错误提示 */
    async loadTask(afterTip) {
      const session = this.session;
      const mode = this.mode;
      this.task = null;
      this.hint = null;
      this.proof = null;
      this.body.innerHTML = "";
      this.setTip(afterTip || "出题中…", !!afterTip);

      const data = this.o.post ? await this.o.post({ action: "get_verify_task", mode: mode }) : null;
      if (session !== this.session || mode !== this.mode) return;

      if (!data || !data.ok) {
        if (data && data.error === "no_icon" && mode === "ff14") {
          rememberManual("math");
          this.setMode("math", "图标加载失败，已切换验证方式");
          return;
        }
        this.setTip(errText(data), true);
        this.body.innerHTML = '<div class="verify-actions"><button type="button" class="verify-mini" data-act="refresh">重试</button></div>';
        return;
      }
      this.task = data;
      this.setTip(afterTip || "", !!afterTip);
      this.renderTask();
    }

    renderTask() {
      const t = this.task;
      if (this.mode === "ff14") this.body.innerHTML = this.tplFf14(t);
      else if (this.mode === "poem") this.body.innerHTML = this.tplPoem(t);
      else this.body.innerHTML = this.tplMath(t);
      this.paintTask();
      this.watchTheme();
      this.focusFirst();
    }

    paintTask() {
      const t = this.task;
      if (!t) return;
      const cv = this.body.querySelector(".verify-canvas");
      if (!cv) return;
      if (this.mode === "poem") paintChallenge(cv, t.keyword, { size: 26, pad: 3, hFactor: 1.2 });
      else if (this.mode === "math") paintChallenge(cv, t.question + " = ?", { size: 32, pad: 12 });
    }

    /* 昼夜切换时重画题面 */
    watchTheme() {
      if (this.themeWatch || typeof MutationObserver !== "function") return;
      this.themeWatch = new MutationObserver(() => {
        const day = document.body.classList.contains("day-mode");
        if (day === this.themeDay) return;
        this.themeDay = day;
        this.paintTask();
      });
      this.themeDay = document.body.classList.contains("day-mode");
      this.themeWatch.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    }

    focusFirst() {
      const input = this.body.querySelector(".verify-input");
      if (input) input.focus({ preventScroll: true });
    }

    /* 狒科生：图标由 Worker 以 data URL 下发，不暴露职业名 */
    tplFf14(t) {
      const icon = t.iconData;
      const img = icon
        ? '<img class="verify-job-icon" src="' + icon + '" alt="职业图标" width="72" height="72" loading="eager">'
        : '<span class="verify-job-fallback">图标加载失败</span>';
      const options = (t.options || []).map((name) =>
        '<button type="button" class="verify-opt" data-act="opt" data-value="' + name + '">' + name + "</button>"
      ).join("");
      return ''
        + '<div class="verify-job">' + img + "</div>"
        + '<p class="verify-q">选择图标对应的职业</p>'
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
      const hintNote = this.hint ? hintNoteHtml(this.hint) : "";
      return ''
        + '<p class="verify-q">飞花令：写一句含「'
        +   '<canvas class="verify-canvas verify-key-canvas" role="img" aria-label="令字"></canvas>'
        +   '」字的诗词</p>'
        + '<div class="verify-row">'
        +   '<input type="text" class="verify-input" maxlength="40" autocomplete="off" spellcheck="false"'
        +     ' aria-label="含有指定字的诗句">'
        +   '<button type="button" class="verify-ok" data-act="submit">确认</button>'
        + "</div>"
        + '<div class="verify-hint-wrap">'
        +   '<button type="button" class="verify-mini" data-act="hint">提示</button>'
        +   hintNote + hintBox
        + "</div>"
        + '<div class="verify-actions"><button type="button" class="verify-mini" data-act="refresh">换一题</button></div>';
    }

    /* 理科生：算术题 */
    tplMath(t) {
      return ''
        + '<p class="verify-q">计算</p>'
        + '<div class="verify-expr-wrap">'
        +   '<canvas class="verify-canvas verify-expr-canvas" role="img" aria-label="算术题"></canvas>'
        + "</div>"
        + '<div class="verify-row">'
        +   '<input type="text" class="verify-input" inputmode="numeric" maxlength="6" autocomplete="off"'
        +     ' aria-label="答案" placeholder="答案">'
        +   '<button type="button" class="verify-ok" data-act="submit">确认</button>'
        + "</div>"
        + '<div class="verify-actions"><button type="button" class="verify-mini" data-act="refresh">换一题</button></div>';
    }

    /* 文科生提示：Worker 从一句答案中取字并补足 10 个 */
    async loadHint() {
      if (!this.task) return;
      const session = this.session;
      this.setTip("加载中…");
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
        wrap.innerHTML = '<button type="button" class="verify-mini" data-act="hint">提示</button>'
          + hintNoteHtml(this.hint) + '<div class="verify-hint-chars">' + chars + "</div>";
        const input = this.body.querySelector(".verify-input");
        if (input) input.focus({ preventScroll: true });
      } else {
        this.renderTask();
      }
    }

    async submitAnswer(value) {
      if (this.busy || !this.task || this.proof) return;
      const answer = String(value == null ? "" : value).trim();
      if (!answer) { this.setTip("请输入答案", true); return; }

      this.busy = true;
      const session = this.session;
      this.setTip(this.mode === "ff14" ? "" : "验证中…");
      const data = await this.o.post({ action: "verify_answer", id: this.task.id, answer: answer });
      this.busy = false;
      if (session !== this.session) return;

      if (!data || !data.ok) {
        /* 答错即换题（Worker 已作废该题） */
        if (data && data.error === "wrong") {
          this.loadTask((this.mode === "poem" && data.why ? data.why + "，" : "") + "请重新作答");
          return;
        }
        if (data && (data.error === "expired" || data.error === "not_found")) {
          this.loadTask(errText(data));
          return;
        }
        this.setTip(errText(data), true);
        return;
      }

      this.proof = { verifyPass: data.pass };
      this.renderPassed();
      if (this.o.onPass) this.o.onPass(this.proof);
    }

    getProof() { return this.proof; }
  }

  global.HJVerify = {
    createGate: (host, options) => new VerifyGate(host, options),
  };
})(window);
