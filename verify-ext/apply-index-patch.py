#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 index.html 里的人机验证改成「Cloudflare + 狒科生 / 文科生 / 理科生」。
   脚本是幂等的（跑第二遍会说「已经是新版」），改完会做一致性检查。"""
import io, re, sys

P = "index.html"
s = io.open(P, encoding="utf-8").read()
orig = s
changed = []

def sub(old, new, label, count=1):
    global s
    if old not in s:
        raise SystemExit("找不到片段（%s）：\n%s" % (label, old[:200]))
    s = s.replace(old, new, count)
    changed.append(label)

# ---------------------------------------------------------------- 1. 版本号 +1
sub("      var CSS_VERSION = 43;", "      var CSS_VERSION = 44;", "style.css 版本号 43 → 44")

# ---------------------------------------------------------------- 2. 目录注释
sub("     3. 视图切换与路由            9. 人机验证（Turnstile / 算术题）",
    "     3. 视图切换与路由            9. 人机验证（Cloudflare/狒科生/文科生/理科生）",
    "目录注释")
sub("   后端：Cloudflare Worker（WORKER_URL），密码与公告均在 Worker + D1，页面中不含密码。",
    "   后端：Cloudflare Worker（WORKER_URL），密码与公告均在 Worker + D1，页面中不含密码。\n"
    "   验证：界面在 verify.js（HJVerify，新增文件），题目与判卷在 Worker（见 verify-ext/）。",
    "脚本头说明")

# ---------------------------------------------------------------- 3. 引入 verify.js
sub("""<script>
/* =============================================================================
   花舞之街 · 薰风花语町 —— 页面脚本""",
    """<!-- 人机验证组件（Cloudflare Turnstile + 狒科生 / 文科生 / 理科生），必须放在页面脚本之前 -->
<script src="verify.js?v=1"></script>

<script>
/* =============================================================================
   花舞之街 · 薰风花语町 —— 页面脚本""",
    "引入 verify.js")

# ---------------------------------------------------------------- 4. 弹窗验证的 DOM
sub("""    <div id="turnstileWidget"></div>
    <div class="math-captcha" id="captchaMath" hidden></div>
    <button type="button" class="captcha-switch" id="captchaSwitch">验证加载不出来？改用算术题</button>
    <button type="button" class="captcha-switch" id="captchaSwitchBack" hidden>切回 Cloudflare 验证</button>
    <p class="form-msg" id="captchaMsg" hidden></p>""",
    """    <!-- 验证组件挂载点：Cloudflare / 狒科生 / 文科生 / 理科生 四种方式由 verify.js 渲染 -->
    <div class="verify-host" id="captchaVerify"></div>
    <p class="form-msg" id="captchaMsg" hidden></p>""",
    "弹窗验证 DOM")

# ---------------------------------------------------------------- 5. 购票表单的 DOM
sub("""        <div class="ticket-captcha" id="ticketTurnstile"></div>
        <div class="math-captcha" id="ticketMath" hidden></div>
        <div class="captcha-switch-row">
          <button type="button" class="captcha-switch" id="ticketCaptchaSwitch">验证加载不出来？改用算术题</button>
          <button type="button" class="captcha-switch" id="ticketCaptchaSwitchBack" hidden>切回 Cloudflare 验证</button>
        </div>""",
    """        <div class="verify-host ticket-verify" id="ticketVerify"></div>""",
    "购票表单验证 DOM")

# ---------------------------------------------------------------- 6. STORE 里去掉不再使用的键
sub("""  captchaOkAt: "hj_captcha_ok_at",
  captchaMathAt: "hj_captcha_math_at",   // 最近一次改用算术题的时间""",
    """  captchaOkAt: "hj_captcha_ok_at",
  // 手动验证偏好（方式 / 时间）由 verify.js 自己用 hj_captcha_mode、hj_captcha_manual_at 记录""",
    "localStorage 键名注释")

# ---------------------------------------------------------------- 7. ticketState
sub("""const ticketState = {
  qty: 1,
  allowPending: false,
  remaining: null,
  widgetId: null,
  token: null,
  submitting: false,
};""",
    """const ticketState = {
  qty: 1,
  allowPending: false,
  remaining: null,
  proof: null,        // 人机验证凭证：{ token }（Cloudflare）或 { verifyPass }（手动验证）
  submitting: false,
};""",
    "ticketState")

# ---------------------------------------------------------------- 8. 购票页表单内验证
old_ticket_captcha = s[s.index("  renderTicketCaptcha();\n}"):s.index("function collectTicketForm()")]
new_ticket_captcha = """  ticketGate.open();
}

/* 表单内的人机验证：和弹窗共用 verify.js 的同一套组件
   （Cloudflare / 狒科生 / 文科生 / 理科生，完成任意一种即可）。
   通过后凭证挂在 ticketState.proof 上，随表单一起交给 Worker 校验并消费。 */
let ticketGate = null;

function initTicketCaptcha() {
  ticketGate = HJVerify.createGate($("ticketVerify"), {
    post: callWorker,
    turnstileSiteKey: TURNSTILE_SITE_KEY,
    onPass: (proof) => {
      ticketState.proof = proof;
      setMsg($("ticketMsg"), "");
    },
  });
}

/* 提交后重新出题（凭证是一次性的，用过就得重新验证） */
function resetTicketCaptcha() {
  ticketState.proof = null;
  if (ticketGate) ticketGate.refresh();
}

"""
s = s.replace(old_ticket_captcha, new_ticket_captcha, 1)
changed.append("购票表单验证逻辑")

# ---------------------------------------------------------------- 9. submitTicket
sub("""  let proof;
  if (ticketMath.active) {
    const math = ticketMath.value();
    if (!math) {
      setMsg(msg, "请先填写下方算术题的答案（数字）");
      ticketMath.focus();
      return;
    }
    proof = { math };
  } else if (ticketState.token) {
    proof = { token: ticketState.token };
  } else {
    setMsg(msg, "请先完成下方的人机验证（加载不出来可以点「改用算术题」）");
    return;
  }
""",
    """  const proof = ticketState.proof;
  if (!proof) {
    setMsg(msg, "请先完成下方的人机验证（Cloudflare / 狒科生 / 文科生 / 理科生 任选一种）");
    return;
  }
""",
    "submitTicket 取凭证")

sub("""  btn.textContent = "提交中…";
  const usedMath = !!proof.math;
  const data = await callWorker({ action: "submit_ticket", ...form.payload, ...proof });""",
    """  btn.textContent = "提交中…";
  const data = await callWorker({ action: "submit_ticket", ...form.payload, ...proof });""",
    "submitTicket 去掉 usedMath")

sub("""    if (data.error === "captcha" && usedMath) {
      setMsg(msg, "算术题答案不对，已换一道题，请重新计算后提交");
      ticketMath.focus();
      return;
    }""",
    """    if (data.error === "captcha") {
      setMsg(msg, proof.verifyPass
        ? "人机验证凭证已过期或用过，已换一题，请重新验证后提交"
        : "人机验证未通过，已换一题，请重新验证后提交");
      return;
    }""",
    "submitTicket 的 captcha 报错提示")

# ---------------------------------------------------------------- 10. initTicket
sub("""  ticketMath = new MathCaptcha($("ticketMath"));
  $("ticketCaptchaSwitch").addEventListener("click", () => useTicketMath());
  $("ticketCaptchaSwitchBack").addEventListener("click", () => {
    forgetMathCaptcha();
    ticketMath.hide();
    $("ticketCaptchaSwitch").hidden = false;
    $("ticketCaptchaSwitchBack").hidden = true;
    $("ticketTurnstile").hidden = false;
    setMsg($("ticketMsg"), "");
    renderTicketCaptcha();
  });
""", """  initTicketCaptcha();
""", "initTicket")

# ---------------------------------------------------------------- 11. 重写第 9 节
start = s.index("""/* =============================================================================
   9. 人机验证（Turnstile，备用：算术题）""")
end = s.index("""/* =============================================================================
   10. 视觉特效：昼夜切换、飘落花叶 / 星星、点击爆花""")
new_section9 = """/* =============================================================================
   9. 人机验证（Cloudflare Turnstile + 三种手动验证：狒科生 / 文科生 / 理科生）
   -----------------------------------------------------------------------------
   界面与流程都在 verify.js（HJVerify）里，这里只负责和页面衔接：
   - 弹出验证：通过后把凭证交给 Worker 二次确认（verify_turnstile），再执行排队中的动作
     （打开活动群 / 花街介绍、复制附联系方式、密码连错后的再验证）
   - 通过后 5 分钟内免验证（时间戳存本地，刷新仍有效），
     「活动群」「花街介绍」「复制附联系方式」共用此窗口；密码连错触发的验证不享受该窗口
   - 手动验证的题目由 Worker 出题判卷，答案不下发到前端；答对后拿到一次性通行证 verifyPass，
     弹窗里再交给 verify_turnstile 确认一次；购票表单则随 submit_ticket 一起交给 Worker 消费
   - Turnstile 在国内经常加载失败：脚本出错或 6 秒内没加载出来会自动切到手动验证
     （默认「狒科生」），用户也可以直接点上面的按钮换方式；换过之后 6 小时内默认走手动验证
   ============================================================================= */

const CAPTCHA_GRACE_MS = 5 * 60 * 1000;

const isCaptchaFresh = () => Date.now() - (Number(storage.get(STORE.captchaOkAt)) || 0) < CAPTCHA_GRACE_MS;
const markCaptchaOk = () => storage.set(STORE.captchaOkAt, Date.now());

let captchaGate = null;         // 弹窗里的验证组件（verify.js）
let turnstilePending = null;    // 验证通过后要执行的动作
let turnstileFailStreak = 0;    // Turnstile 交给 Worker 校验时连续失败的次数
let captchaSession = 0;         // 每次打开 / 关闭弹窗 +1，用来丢弃过期的异步回调

/* 免验证窗口内直接执行，否则弹出验证 */
function requestCaptcha(pending) {
  if (isCaptchaFresh()) runCaptchaPending(pending);
  else openCaptcha(pending);
}

function openCaptcha(pending) {
  turnstilePending = pending;
  turnstileFailStreak = 0;
  captchaSession++;
  setMsg($("captchaMsg"), "");
  $("captchaOverlay").hidden = false;
  playEnterAnim(document.querySelector("#captchaOverlay .gate-card"));
  captchaGate.open();
}

function closeCaptcha() {
  $("captchaOverlay").hidden = true;
  captchaSession++;
  captchaGate.hide();
  turnstilePending = null;
}

/* 把凭证交给 Worker 确认：Turnstile 走 siteverify，手动验证走一次性通行证 */
async function finishCaptcha(proof) {
  const pending = turnstilePending;
  const msg = $("captchaMsg");
  const session = captchaSession;

  setMsg(msg, "验证中…");
  const verify = await callWorker({ action: "verify_turnstile", ...proof });
  if (session !== captchaSession) return;

  if (!verify || !verify.ok) {
    /* Turnstile 组件常会自动通过；失败后无条件重建会陷入「通过→失败→重建」的循环并耗尽限流额度，
       所以连续失败 2 次就直接改用手动验证 */
    if (proof.token) {
      turnstileFailStreak++;
      if (turnstileFailStreak >= 2) {
        captchaGate.useManual("验证服务暂时不可用，已改用「狒科生」，看图标选职业就行");
        return;
      }
      setMsg(msg, "验证未通过，请重新完成一次");
      captchaGate.refresh();
      return;
    }
    setMsg(msg, !verify ? "连接失败，检查一下网络后再试"
      : verify.error === "rate_limited" ? "尝试太频繁了，请稍等一会儿再试"
      : "验证已过期，请重新完成一次");
    captchaGate.clearProof();
    return;
  }

  closeCaptcha();
  markCaptchaOk();
  runCaptchaPending(pending);
}

function runCaptchaPending(pending) {
  switch (pending) {
    case "group":
      openGroupModal();
      break;
    case "info":
      openInfoModal();
      break;
    case "copy_verify":
      showToast("验证通过，5 分钟内复制会附上联系方式");
      break;
    case "internal":
      showToast("验证通过，可以继续输入密码");
      $("internalPassword").focus();
      break;
  }
}

function initCaptcha() {
  captchaGate = HJVerify.createGate($("captchaVerify"), {
    post: callWorker,
    turnstileSiteKey: TURNSTILE_SITE_KEY,
    onPass: finishCaptcha,
  });
  $("captchaClose").addEventListener("click", closeCaptcha);
  closeOnBackdrop($("captchaOverlay"), closeCaptcha);
}


"""
s = s[:start] + new_section9 + s[end:]
changed.append("第 9 节整体重写")

# ---------------------------------------------------------------- 12. 兜底：verify.js 没加载成功时不要拖垮整页
sub("""function requestCaptcha(pending) {
  if (isCaptchaFresh()) runCaptchaPending(pending);
  else openCaptcha(pending);
}""",
"""function requestCaptcha(pending) {
  if (isCaptchaFresh()) { runCaptchaPending(pending); return; }
  /* verify.js 没加载成功（没上传 / 被缓存挡住）时给出明确提示，而不是静默失败 */
  if (!captchaGate) { showToast("人机验证组件没加载出来，刷新页面再试一次"); return; }
  openCaptcha(pending);
}""", "requestCaptcha 兜底")

sub("""function closeCaptcha() {
  $("captchaOverlay").hidden = true;
  captchaSession++;
  captchaGate.hide();
  turnstilePending = null;
}""",
"""function closeCaptcha() {
  $("captchaOverlay").hidden = true;
  captchaSession++;
  if (captchaGate) captchaGate.hide();
  turnstilePending = null;
}""", "closeCaptcha 兜底")

sub("""function initCaptcha() {
  captchaGate = HJVerify.createGate($("captchaVerify"), {""",
"""function initCaptcha() {
  if (!window.HJVerify) { console.error("[验证] verify.js 没有加载成功，人机验证不可用"); return; }
  captchaGate = HJVerify.createGate($("captchaVerify"), {""", "initCaptcha 兜底")

sub("""function initTicketCaptcha() {
  ticketGate = HJVerify.createGate($("ticketVerify"), {""",
"""function initTicketCaptcha() {
  if (!window.HJVerify) { console.error("[验证] verify.js 没有加载成功，购票表单的人机验证不可用"); return; }
  ticketGate = HJVerify.createGate($("ticketVerify"), {""", "initTicketCaptcha 兜底")

sub("""  const proof = ticketState.proof;
  if (!proof) {
    setMsg(msg, "请先完成下方的人机验证（Cloudflare / 狒科生 / 文科生 / 理科生 任选一种）");
    return;
  }""",
"""  const proof = ticketState.proof;
  if (!proof) {
    setMsg(msg, ticketGate
      ? "请先完成下方的人机验证（Cloudflare / 狒科生 / 文科生 / 理科生 任选一种）"
      : "人机验证组件没加载出来，刷新页面再试一次（或联系管理员检查 verify.js）");
    return;
  }""", "购票提交兜底")

sub("""  ticketGate.open();
}""", """  if (ticketGate) ticketGate.open();
}""", "购票页打开验证兜底")

io.open(P, "w", encoding="utf-8").write(s)

# ---------------------------------------------------------------- 一致性检查
problems = []
for gone in ['id="turnstileWidget"', 'id="captchaMath"', 'id="captchaSwitch"', 'id="captchaSwitchBack"',
             'id="ticketMath"', 'id="ticketTurnstile"', 'id="ticketCaptchaSwitch"',
             'ticketMath', 'MathCaptcha', 'renderTicketCaptcha', 'useTicketMath', 'useMathInOverlay',
             'renderTurnstile', 'prefersMathCaptcha', 'rememberMathCaptcha', 'forgetMathCaptcha',
             'TURNSTILE_WAIT_MS', 'MATH_MODE_KEEP_MS', 'captchaMathAt', 'submitCaptchaMath',
             'turnstileWidgetId', 'removeTurnstileWidget', 'turnstileRetryTimer']:
    if gone in s:
        problems.append("仍残留：" + gone)
for need in ['id="captchaVerify"', 'id="ticketVerify"', 'HJVerify.createGate', 'captchaGate.open()',
             'ticketGate.open()', 'verify.js?v=1', 'function initTicketCaptcha',
             'if (!window.HJVerify)', 'if (captchaGate) captchaGate.hide()']:
    if need not in s:
        problems.append("缺少：" + need)

print("已修改：" + "、".join(changed))
print("字节数：%d → %d" % (len(orig), len(s)))
print("检查：", "全部通过" if not problems else "\n  ".join(problems))
sys.exit(1 if problems else 0)
