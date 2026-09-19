/* =============================================================================
   花舞之街 · 薰风花语町 —— 活动购票（访客端）ticket.js
   -----------------------------------------------------------------------------
   从 index.html 拆出来的独立脚本，页面里紧跟在主脚本后面加载：
       <script src="ticket.js?v=1"></script>
       <script>initApp();</script>
   依赖主脚本里的全局函数 / 常量：$、callWorker、setMsg、showToast、escapeHtml、showView、setRoute、
   playEnterAnim、closeOnBackdrop、copyText、captchaOn、TICKET_HASH、TICKET_TITLE、GROUP_QQ、TURNSTILE_SITE_KEY。
   购票管理（管理员面板、Excel 导出）在 admin.js，也会用到这里的 formatHolder / minutesToHHMM 等工具函数。
   改了本文件之后把 index.html 里 ticket.js?v= 的数字 +1。
   ============================================================================= */

/* =============================================================================
   6b. 活动购票（访客表单 / 查询 / 管理员面板 / Excel 导出）
   - 首页入口在「购票已开放 + 未勾（测试）」时出现，点击先看购票须知；也可直接访问 TICKET_HASH（#ti）
   - 「日」按国服时间的「每日票额刷新时间」切换（默认 0:00，管理页可改），由 Worker 统一计算
   - 标题、「（测试）」后缀、再次购票的间隔（冷却）也都在管理页设置
   - 进入页面时已售罄或未开放 → 弹窗提示并隐藏表单；
     填表过程中额度被买满 → 仍可提交，Worker 将整单标记为超额（导出标红）
   ============================================================================= */

/* 单人限购由后台配置（Worker 的 ticket_per_person），这里只是读不到状态时的兜底值。
   Worker 侧还有一道硬上限（TICKET_PER_PERSON_MAX = 20），前端被改也越不过去。 */
const TICKET_PER_PERSON_FALLBACK = 5;
/* 区服按大区分组：下拉里用分组标题显示【大区】，存进表格的仍是服务器名（与往年表格一致） */
const TICKET_SERVER_GROUPS = [
  { dc: "陆行鸟", servers: ["拉诺西亚", "幻影群岛", "神意之地", "萌芽池", "红玉海", "宇宙和音", "沃仙曦染", "晨曦王座"] },
  { dc: "莫古力", servers: ["潮风亭", "神拳痕", "白银乡", "白金幻象", "旅人栈桥", "拂晓之间", "龙巢神殿", "梦羽宝境"] },
  { dc: "猫小胖", servers: ["紫水栈桥", "延夏", "静语庄园", "摩杜纳", "海猫茶屋", "柔风海湾", "琥珀原"] },
  { dc: "豆豆柴", servers: ["水晶塔", "银泪湖", "太阳海岸", "伊修加德", "红茶川"] },
];
const TICKET_SERVERS = TICKET_SERVER_GROUPS.flatMap((g) => g.servers);
const TICKET_MSG_SOLD_OUT = "今日活动票已售罄，可留意后续放票！";
const TICKET_MSG_CLOSED = "购票暂未开放，请留意活动群通知";
const TICKET_ERRORS = {
  closed: TICKET_MSG_CLOSED,
  bad_contact: "请填写联系方式",
  bad_qty: "购票数量超出单人限额，请减少后再试",
  bad_holders: "持票人信息不完整，请检查",
  bad_holder_name: "请填写每位持票人的 id",
  bad_holder_server: "请为每位持票人选择区服",
  bad_holder_name_format: "持票人 id 不符合要求：不能有数字，最多 6 个字，只能用汉字、英文字母和「·」",
  pending_not_allowed: "当前不支持 id 待定，请填写完整的持票人信息",
  first_holder_required: "第一位持票玩家的 id 和区服必须填写，不能待定",
  captcha: "人机验证未通过，请重新验证后再提交",
  rate_limited: "提交太频繁了，请稍后再试",
  cooldown: "刚刚已经成功登记过了，请稍后再提交",
  server_error: "服务器出错了。请先用下方「查询我的登记」确认是否已登记成功，查不到再重新提交",
};

const ticketState = {
  qty: 1,
  perPerson: TICKET_PER_PERSON_FALLBACK,   // 由 get_ticket_status 下发
  allowPending: false,
  remaining: null,
  proof: null,        // 人机验证凭证：{ token }（Cloudflare）或 { verifyPass }（手动验证）
  submitting: false,
  /* 以下由 get_ticket_status 下发（管理页可改），这里是兜底值 */
  title: TICKET_TITLE,
  testMode: true,
  cooldownMin: 30,     // 成功提交后至少隔多少分钟才能再提交（0 = 不限制）
  cooldownUntil: 0,    // 本机估算的冷却结束时间（epoch 毫秒），真正的判断在 Worker
  resetMin: 0,         // 每日票额刷新时间：国服 0 点之后的分钟数
};

/* 页面上显示的完整标题：后台标题 + 可选的「（测试）」 */
const ticketFullTitle = () => (ticketState.title || TICKET_TITLE) + (ticketState.testMode ? "（测试）" : "");
/* 分钟数 ↔ "HH:MM" */
const minutesToHHMM = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const hhmmToMinutes = (v) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(v || ""));
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  return h < 24 && mi < 60 ? h * 60 + mi : null;
};
/* 剩余秒数 → 「约 N 分钟」/「N 秒」 */
const formatWait = (sec) => (sec >= 60 ? `约 ${Math.ceil(sec / 60)} 分钟` : `${Math.max(1, Math.ceil(sec))} 秒`);
function ticketCooldownText(sec) {
  const gap = ticketState.cooldownMin ? `每次成功登记后需间隔 ${ticketState.cooldownMin} 分钟才能再次提交，` : "";
  return `${gap}请${formatWait(sec)}后再试`;
}

/* 把状态里的标题 / 冷却 / 刷新时间同步到页面 */
function applyTicketMeta(st) {
  if (typeof st.title === "string" && st.title) ticketState.title = st.title;
  if (typeof st.testMode === "boolean") ticketState.testMode = st.testMode;
  if (Number.isInteger(st.cooldownMin)) ticketState.cooldownMin = st.cooldownMin;
  if (Number.isInteger(st.resetMin)) ticketState.resetMin = st.resetMin;
  if (Number.isFinite(st.cooldownLeftSec)) {
    ticketState.cooldownUntil = st.cooldownLeftSec > 0 ? Date.now() + st.cooldownLeftSec * 1000 : 0;
  }
  if (!$("view-ticket").hidden) {
    $("ticketTitle").textContent = ticketFullTitle();
    document.title = `${ticketFullTitle()} · 花舞之街`;
  }
  const hint = $("ticketResetHint");
  if (hint) {
    hint.hidden = !ticketState.resetMin;
    hint.textContent = ticketState.resetMin ? `每日 ${minutesToHHMM(ticketState.resetMin)} 刷新（国服时间）` : "";
  }
}

const TICKET_CN_NUM = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
const ticketHolderLabel = (i) =>
  i === 0 ? "持票玩家 id 和服务器" : `第${TICKET_CN_NUM[i] || i + 1}位持票玩家 id 和服务器`;
const formatHolder = (h) => (!h || h.pending) ? "待定" : `${h.name}@${h.server}`;

/* 国服时间换算 ------------------------------------------------------------------
   定时开关的时间一律按国服时间（UTC+8）理解，和站长本人所在时区无关。
   datetime-local 控件给出的是「浏览器本地时区」的字面时间，人在日本（UTC+9）时
   直接 new Date(value) 会整整差一小时，所以必须显式按 +08:00 解析、按 +8 小时格式化。 */
const cnLocalToEpoch = (v) => {
  if (!v) return 0;
  const t = Date.parse(`${String(v).slice(0, 16)}:00+08:00`);
  return Number.isFinite(t) ? t : 0;
};
const epochToCnLocal = (ms) => (ms ? new Date(ms + 8 * 3600 * 1000).toISOString().slice(0, 16) : "");
const formatCnTime = (ms) => {
  if (!ms) return "";
  const iso = new Date(ms + 8 * 3600 * 1000).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
};

/* 弹窗 ------------------------------------------------------------------------ */
function openTicketNotice(text) {
  $("ticketNoticeText").textContent = text;
  $("ticketNoticeOverlay").hidden = false;
}
function closeTicketNotice() {
  $("ticketNoticeOverlay").hidden = true;
}

/* 持票人 id 规则 ------------------------------------------------------------------
   - 只能用汉字、英文字母和「·」，不能有数字
   - 合计不超过 6 个字（汉字、字母、「·」都算 1 个字）
   - 英文字母：id 开头的字母大写，其余字母一律小写（填写时自动改）
   - 自动改的还有：全角字母 → 半角、各种中间点（・ • ‧ 等）→「·」、去掉空格
   Worker 端（readTicketInput）用同一套规则再校验一次，前端被绕过也写不进库。 */
const TICKET_NAME_MAX_CHARS = 6;
const TICKET_NAME_DOTS = /[\u30FB\uFF65\u2022\u2027\u2219\u22C5\u00B7\u0387\u16EB\u2E31]/g;   // 各种中间点 → ·

const isHanCodePoint = (cp) =>
  (cp >= 0x3400 && cp <= 0x4DBF) || (cp >= 0x4E00 && cp <= 0x9FFF) ||
  (cp >= 0xF900 && cp <= 0xFAFF) || (cp >= 0x20000 && cp <= 0x3FFFF);

/* 自动修正（不删数字、不删非法字符，留给校验去提示） */
function normalizeTicketName(raw) {
  let s = String(raw == null ? "" : raw);
  if (s.normalize) s = s.normalize("NFKC");                 // 全角字母 / 数字 → 半角
  s = s.replace(/[\s\u3000]+/g, "").replace(TICKET_NAME_DOTS, "·");
  let first = true;
  return Array.from(s).map((ch) => {
    const isLetter = /[A-Za-z]/.test(ch);
    const out = isLetter ? (first ? ch.toUpperCase() : ch.toLowerCase()) : ch;
    first = false;
    return out;
  }).join("");
}

/* 返回错误文案；合规返回 "" */
function ticketNameError(name) {
  const chars = Array.from(name);
  if (!chars.length) return "请填写持票人 id";
  if (/[@＠]/.test(name)) return "id 里不用写 @ 和服务器，服务器在右边选择";
  if (/[0-9]/.test(name)) return "id 不能包含数字";
  if (chars.some((ch) => ch !== "·" && !/[A-Za-z]/.test(ch) && !isHanCodePoint(ch.codePointAt(0)))) {
    return "id 只能用汉字、英文字母和「·」";
  }
  if (chars.every((ch) => ch === "·")) return "id 不能只有「·」";
  if (chars.length > TICKET_NAME_MAX_CHARS) {
    return `id 最多 ${TICKET_NAME_MAX_CHARS} 个字（汉字、字母、「·」都算 1 个字），现在是 ${chars.length} 个`;
  }
  return "";
}

/* 输入框实时修正 + 提示。中文输入法拼字（composition）期间不能改值，否则会把拼音打断 */
function bindTicketNameInput(input, warn) {
  let composing = false;
  const fix = () => {
    const before = input.value;
    const after = normalizeTicketName(before);
    if (after !== before) {
      /* 光标位置：按光标前那一段修正后的长度重新定位 */
      const caret = input.selectionStart ?? before.length;
      const pos = normalizeTicketName(before.slice(0, caret)).length;
      input.value = after;
      try { input.setSelectionRange(pos, pos); } catch (e) { /* 部分输入框类型不支持 */ }
    }
    const err = input.value ? ticketNameError(input.value) : "";
    warn.textContent = err;
    warn.hidden = !err;
    input.classList.toggle("is-invalid", !!err);
  };
  input.addEventListener("compositionstart", () => { composing = true; });
  input.addEventListener("compositionend", () => { composing = false; fix(); });
  input.addEventListener("input", (e) => { if (!composing && !e.isComposing) fix(); });
  input.addEventListener("blur", fix);
  if (input.value) fix();
}

/* 持票人输入行 ------------------------------------------------------------------ */
function renderTicketHolders() {
  const wrap = $("ticketHolders");
  // 保留已填内容，数量变化时不丢
  const prev = Array.from(wrap.querySelectorAll(".ticket-holder")).map((row) => ({
    name: row.querySelector(".th-name").value,
    server: row.querySelector(".th-server").value,
    pending: !!row.querySelector(".th-pending")?.checked,
  }));
  const options = `<option value="">选择区服</option>` + TICKET_SERVER_GROUPS.map((g) =>
    `<optgroup label="【${g.dc}】">${g.servers.map((s) => `<option value="${s}">${s}</option>`).join("")}</optgroup>`
  ).join("");

  wrap.innerHTML = Array.from({ length: ticketState.qty }, (_, i) => `
    <div class="ticket-field ticket-holder" data-index="${i}">
      <span class="ticket-label is-required">${ticketHolderLabel(i)}</span>
      ${i === 0 ? "" : `<p class="ticket-sub">购买 ${i + 1} 张票时填写</p>`}
      <div class="ticket-holder-row">
        <input type="text" class="th-name" maxlength="12" placeholder="角色名" autocomplete="off" spellcheck="false"
               autocapitalize="off" aria-label="${ticketHolderLabel(i)}：角色名">
        <select class="th-server" aria-label="${ticketHolderLabel(i)}：服务器">${options}</select>
        ${(ticketState.allowPending && i > 0) ? `
        <label class="audience-opt th-pending-opt">
          <input type="checkbox" class="th-pending"><span>id 待定</span>
        </label>` : ""}
      </div>
      <p class="ticket-warn th-warn" role="alert" hidden></p>
    </div>`).join("");

  wrap.querySelectorAll(".ticket-holder").forEach((row, i) => {
    const name = row.querySelector(".th-name");
    const server = row.querySelector(".th-server");
    const pending = row.querySelector(".th-pending");
    if (prev[i]) {
      name.value = prev[i].name;
      server.value = prev[i].server;
      if (pending) pending.checked = prev[i].pending;
    }
    const warn = row.querySelector(".th-warn");
    bindTicketNameInput(name, warn);
    const sync = () => {
      const on = !!pending?.checked;
      name.disabled = on;
      server.disabled = on;
      row.classList.toggle("is-pending", on);
      if (on) { warn.hidden = true; name.classList.remove("is-invalid"); }
    };
    pending?.addEventListener("change", sync);
    sync();
  });
}

function setTicketQty(n) {
  ticketState.qty = Math.min(ticketState.perPerson, Math.max(1, n));
  $("ticketQty").textContent = String(ticketState.qty);
  $("ticketQtyMinus").disabled = ticketState.qty <= 1;
  $("ticketQtyPlus").disabled = ticketState.qty >= ticketState.perPerson;
  updateTicketQtyWarn();
  renderTicketHolders();
}

function updateTicketQtyWarn() {
  const r = ticketState.remaining;
  const over = r !== null && r > 0 && ticketState.qty > r;
  $("ticketQtyWarn").hidden = !over;
  if (over) $("ticketQtyWarn").textContent = `今日仅剩 ${r} 张，超出部分需等待工作人员确认`;
}

/* 单人限额变了：更新提示文案、夹住当前数量、重画持票人行 */
function applyTicketPerPerson(perPerson) {
  const n = Number(perPerson);
  const next = Number.isInteger(n) && n >= 1 ? n : TICKET_PER_PERSON_FALLBACK;
  if (next === ticketState.perPerson && $("ticketHolders").children.length) return;
  ticketState.perPerson = next;
  const hint = $("ticketLimitHint");
  if (hint) hint.textContent = `每名游客限购 ${next} 张，需要批量购票的游客请联系活动群群主。`;
  setTicketQty(Math.min(ticketState.qty, next));
}

function renderTicketStock(remaining) {
  ticketState.remaining = remaining;
  $("ticketRemaining").textContent = remaining === null ? "--" : String(remaining);
  $("ticketStock").classList.toggle("is-empty", remaining === 0);
  updateTicketQtyWarn();
}

/* 页面状态：form（可填写）/ blocked（未开放或售罄）/ result（提交成功） */
function setTicketMode(mode, blockedText = "") {
  $("ticketForm").hidden = mode !== "form";
  $("ticketResult").hidden = mode !== "result";
  let blocked = $("ticketBlocked");
  if (!blocked) {
    blocked = document.createElement("p");
    blocked.id = "ticketBlocked";
    blocked.className = "ticket-blocked";
    $("ticketForm").before(blocked);
  }
  blocked.hidden = mode !== "blocked";
  blocked.textContent = blockedText;
}

/* 进入购票页 --------------------------------------------------------------------- */
async function openTicketView() {
  showView("view-ticket");
  $("ticketTitle").textContent = ticketFullTitle();
  document.title = `${ticketFullTitle()} · 花舞之街`;
  if (!$("ticketResult").hidden) clearTicketForm();   // 再次进入购票页 → 回到空白表单

  setTicketMode("blocked", "正在读取购票状态…");
  const st = await callWorker({ action: "get_ticket_status" });
  if (!st || !st.ok) {
    renderTicketStock(null);
    setTicketMode("blocked", "购票状态读取失败，检查一下网络后刷新页面再试");
    return;
  }
  applyTicketMeta(st);
  applyTicketPerPerson(st.perPerson);
  renderTicketStock(st.remaining);
  if (!st.open) {
    /* 已经排好开启时间的话，告诉访客几点开，比一句「未开放」有用得多 */
    const text = st.openAt ? `${TICKET_MSG_CLOSED}（预计 ${formatCnTime(st.openAt)} 国服时间开启）` : TICKET_MSG_CLOSED;
    setTicketMode("blocked", text);
    openTicketNotice(text);
    return;
  }
  if (st.remaining <= 0) {
    setTicketMode("blocked", TICKET_MSG_SOLD_OUT);
    openTicketNotice(TICKET_MSG_SOLD_OUT);
    return;
  }
  if (ticketState.allowPending !== !!st.allowPending || !$("ticketHolders").children.length) {
    ticketState.allowPending = !!st.allowPending;
    renderTicketHolders();
  }
  setTicketMode("form");
  if (captchaOn && ticketGate) ticketGate.open();
  /* 拿着链接直接进来、还没看过须知的：先弹一次（从首页入口进来的已经确认过了） */
  if (!ticketGuideAcked && $("ticketGuideOverlay").hidden) openTicketGuide("ack");
  const left = (ticketState.cooldownUntil - Date.now()) / 1000;
  if (left > 0) setMsg($("ticketMsg"), ticketCooldownText(left));
}

/* 表单内的人机验证：和弹窗共用 verify.js 的同一套组件
   （自动验证 Cloudflare，或手动验证的狒科生 / 文科生 / 理科生，完成任意一种即可）。
   通过后凭证挂在 ticketState.proof 上，随表单一起交给 Worker 校验并消费。 */
let ticketGate = null;

function initTicketCaptcha() {
  if (!captchaOn) { $("ticketVerify").hidden = true; return; }   // 总开关关掉：不出题
  if (!window.HJVerify) { console.error("[验证] verify.js 没有加载成功，购票表单的人机验证不可用"); return; }
  ticketGate = HJVerify.createGate($("ticketVerify"), {
    post: callWorker,
    turnstileSiteKey: TURNSTILE_SITE_KEY,
    onPass: (proof) => {
      ticketState.proof = proof;
      setMsg($("ticketMsg"), "");
    },
  });
}

/* 机器人验证总开关变化时由主脚本的 applyCaptchaEnabled 调用。
   changed = false（只是读回来确认一下还是开着）时只同步显隐，不动已经出好的题：
   以前这里会在「表单没被隐藏」时直接 open()，而购票页不可见时表单也是没隐藏的，
   结果每个打开首页的访客都在后台多做了一次验证（加载 Turnstile / 找 Worker 出题）。 */
function syncTicketCaptcha(changed) {
  const host = $("ticketVerify");
  if (host) host.hidden = !captchaOn;
  if (!changed) return;
  if (captchaOn) {
    // 重新打开时把购票表单里的验证组件补上（管理员切换后不必刷新页面）
    if (!ticketGate) initTicketCaptcha();
    if (ticketGate && !$("view-ticket").hidden && !$("ticketForm").hidden) ticketGate.open();
  } else {
    ticketState.proof = null;
    if (ticketGate) ticketGate.hide();
  }
}

/* 提交后重新出题（凭证是一次性的，用过就得重新验证） */
function resetTicketCaptcha() {
  ticketState.proof = null;
  if (captchaOn && ticketGate) ticketGate.refresh();
}

function collectTicketForm() {
  const contact = $("ticketContact").value.trim();
  if (!contact) return { error: "请填写联系方式", focus: $("ticketContact") };

  const holders = [];
  for (const row of $("ticketHolders").querySelectorAll(".ticket-holder")) {
    const i = Number(row.dataset.index);
    if (row.querySelector(".th-pending")?.checked) {
      holders.push({ pending: true });
      continue;
    }
    const name = row.querySelector(".th-name");
    const server = row.querySelector(".th-server");
    const who = i === 0 ? "持票玩家" : `第${TICKET_CN_NUM[i] || i + 1}位持票玩家`;
    name.value = normalizeTicketName(name.value);
    if (!name.value) return { error: `请填写${ticketHolderLabel(i).replace(" 和服务器", "")}`, focus: name };
    const nameErr = ticketNameError(name.value);
    if (nameErr) return { error: `${who}：${nameErr}`, focus: name };
    if (!server.value) return { error: `请为${who}选择服务器`, focus: server };
    holders.push({ name: name.value, server: server.value });
  }
  return {
    payload: {
      contact,
      qty: ticketState.qty,
      holders,
      message: $("ticketMessage").value.trim(),
      anonymous: $("ticketAnonymous").checked,
    },
  };
}

async function submitTicket(e) {
  e.preventDefault();
  if (ticketState.submitting) return;
  const msg = $("ticketMsg");
  const form = collectTicketForm();
  if (form.error) {
    setMsg(msg, form.error);
    form.focus?.focus();
    return;
  }
  /* 冷却中就别让访客白做一遍人机验证（真正的判断在 Worker，这里只是提前提示） */
  const cdLeft = (ticketState.cooldownUntil - Date.now()) / 1000;
  if (cdLeft > 0) {
    setMsg(msg, ticketCooldownText(cdLeft));
    return;
  }
  const proof = ticketState.proof;
  if (captchaOn && !proof) {
    setMsg(msg, ticketGate
      ? "请先完成下方的人机验证（自动验证，或点「自动验证不成功？点击手动验证」换手动验证）"
      : "人机验证组件没加载出来，刷新页面再试一次（或联系管理员检查 verify.js）");
    return;
  }

  setMsg(msg, "");
  ticketState.submitting = true;
  const btn = $("ticketSubmitBtn");
  btn.disabled = true;
  btn.textContent = "提交中…";
  const data = await callWorker({ action: "submit_ticket", ...form.payload, ...(proof || {}) });
  ticketState.submitting = false;
  btn.disabled = false;
  btn.textContent = "提交";
  /* 验证凭证是一次性的，但 Worker 在「未开放 / 表单不对 / 冷却中 / 限流」时根本没走到验证那步，
     凭证还没被用掉——这些情况就别让访客重做一遍验证。其余情况（成功、验证失败、
     服务器出错、网络断了不知道走到哪一步）一律作废重来 */
  const PRE_VERIFY_ERRORS = ["closed", "cooldown", "rate_limited", "bad_contact", "bad_qty", "bad_holders",
    "bad_holder_name", "bad_holder_server", "bad_holder_name_format", "pending_not_allowed", "first_holder_required"];
  if (!(data && !data.ok && PRE_VERIFY_ERRORS.includes(data.error))) resetTicketCaptcha();

  if (!data) {
    /* 请求可能已经到了服务器、只是回应丢了：不能断言「没登记成功」，让访客先查一下，免得重复下单 */
    setMsg(msg, "连接中断，无法确认是否登记成功。请先用下方「查询我的登记」查一下，查不到再重新提交");
    return;
  }
  if (!data.ok) {
    if (data.error === "closed") {
      setTicketMode("blocked", TICKET_MSG_CLOSED);
      openTicketNotice(TICKET_MSG_CLOSED);
      return;
    }
    if (data.error === "cooldown") {
      if (Number.isInteger(data.cooldownMin)) ticketState.cooldownMin = data.cooldownMin;
      const wait = Number(data.waitSec) || 60;
      ticketState.cooldownUntil = Date.now() + wait * 1000;
      setMsg(msg, ticketCooldownText(wait));
      return;
    }
    if (data.error === "captcha") {
      setMsg(msg, proof && proof.verifyPass
        ? "人机验证凭证已过期或用过，已换一题，请重新验证后提交"
        : "人机验证未通过，已换一题，请重新验证后提交");
      return;
    }
    setMsg(msg, TICKET_ERRORS[data.error] || "提交失败，请稍后再试");
    return;
  }

  if (Number.isInteger(data.cooldownMin)) ticketState.cooldownMin = data.cooldownMin;
  ticketState.cooldownUntil = ticketState.cooldownMin ? Date.now() + ticketState.cooldownMin * 60 * 1000 : 0;
  renderTicketStock(data.remaining);
  showTicketResult(form.payload, data);
}

function showTicketResult(p, data) {
  const dayLabel = `${Number(data.day.slice(5, 7))}月${Number(data.day.slice(8, 10))}日`;
  $("ticketResultTitle").textContent = `登记成功 · ${dayLabel}`;
  $("ticketResultNote").textContent = data.overLimit
    ? `提交时今日票额已满，本单为超额登记，需等待工作人员确认。请截图保存本页，并留意活动群${GROUP_QQ}。`
    : `请截图保存本页，付款与取票请留意活动群${GROUP_QQ}。`;
  $("ticketResultNote").classList.toggle("is-warn", !!data.overLimit);
  const rows = [
    ["联系方式", p.contact],
    ["购票数量", `${p.qty} 张`],
    ...p.holders.map((h, i) => [`持票人 ${i + 1}`, formatHolder(h)]),
  ];
  if (p.message) rows.push(["留言", `${p.message}（${p.anonymous ? "匿名" : "实名"}）`]);
  ticketResultSnapshot = { rows, dayLabel, note: $("ticketResultNote").textContent };
  $("ticketResultList").innerHTML = rows
    .map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join("");
  setTicketMode("result");
  $("ticketResult").scrollIntoView({ behavior: "smooth", block: "center" });
}

function clearTicketForm() {
  $("ticketForm").reset();
  $("ticketAnonymous").checked = true;
  $("ticketHolders").innerHTML = "";
  setMsg($("ticketMsg"), "");
  setTicketQty(1);
  $("ticketResult").hidden = true;
}

function resetTicketForm() {
  clearTicketForm();
  openTicketView();
}

/* 截图保存 ----------------------------------------------------------------------
   用 canvas 自己画一张登记凭证图（不依赖外部库，国内也能用），右下角带水印 */
let ticketResultSnapshot = null;

const TICKET_IMG = {
  width: 760,
  pad: 44,
  bg: "#241d3c",
  card: "#2a2344",
  line: "rgba(233,224,255,.16)",
  cream: "#f7f0e2",
  gold: "#ffd699",
  soft: "#c9bfe0",
  mute: "#948aad",
  serif: '"Noto Serif SC", "Songti SC", "Source Han Serif SC", serif',
};

/* 按最大宽度折行，返回行数组 */
function wrapCanvasText(ctx, text, maxWidth) {
  const lines = [];
  for (const paragraph of String(text).split("\n")) {
    let line = "";
    for (const ch of paragraph) {
      if (ctx.measureText(line + ch).width > maxWidth && line) {
        lines.push(line);
        line = ch;
      } else {
        line += ch;
      }
    }
    lines.push(line);
  }
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawTicketImage(snap) {
  const S = TICKET_IMG;
  const scale = Math.min(3, Math.max(2, window.devicePixelRatio || 1));
  const labelW = 110;
  const valueW = S.width - S.pad * 2 - labelW - 16;
  const measure = document.createElement("canvas").getContext("2d");

  // 先量高度：标题 + 副标题 + 说明（可能折行） + 每行信息 + 水印
  measure.font = `16px ${S.serif}`;
  const noteLines = wrapCanvasText(measure, snap.note, S.width - S.pad * 2);
  const rowLines = snap.rows.map(([k, v]) => ({ k, lines: wrapCanvasText(measure, v, valueW) }));
  const rowsHeight = rowLines.reduce((n, r) => n + Math.max(1, r.lines.length) * 28 + 10, 0);
  const height = Math.round(S.pad + 46 + 40 + noteLines.length * 26 + 22 + rowsHeight + 18 + 22 + S.pad);

  const canvas = document.createElement("canvas");
  canvas.width = S.width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.textBaseline = "top";

  ctx.fillStyle = S.bg;
  ctx.fillRect(0, 0, S.width, height);
  roundRect(ctx, 14, 14, S.width - 28, height - 28, 22);
  ctx.fillStyle = S.card;
  ctx.fill();
  ctx.strokeStyle = S.line;
  ctx.lineWidth = 1;
  ctx.stroke();

  let y = S.pad;
  ctx.textAlign = "center";
  ctx.fillStyle = S.gold;
  ctx.font = `bold 30px ${S.serif}`;
  ctx.fillText(ticketFullTitle(), S.width / 2, y);
  y += 46;
  ctx.fillStyle = S.cream;
  ctx.font = `bold 22px ${S.serif}`;
  ctx.fillText(`登记成功 · ${snap.dayLabel}`, S.width / 2, y);
  y += 40;
  ctx.fillStyle = S.soft;
  ctx.font = `15px ${S.serif}`;
  noteLines.forEach((line) => {
    ctx.fillText(line, S.width / 2, y);
    y += 26;
  });
  y += 22;

  ctx.textAlign = "left";
  rowLines.forEach(({ k, lines }) => {
    ctx.fillStyle = S.mute;
    ctx.font = `15px ${S.serif}`;
    ctx.fillText(k, S.pad, y + 2);
    ctx.fillStyle = S.cream;
    ctx.font = `17px ${S.serif}`;
    lines.forEach((line, i) => ctx.fillText(line, S.pad + labelW + 16, y + i * 28));
    y += Math.max(1, lines.length) * 28 + 10;
  });

  // 水印：右下角
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255,214,153,.55)";
  ctx.font = `14px ${S.serif}`;
  ctx.fillText(`花舞之街·薰风花语町，${snap.dayLabel}`, S.width - S.pad, height - S.pad - 14);

  return canvas;
}

function saveTicketImage() {
  if (!ticketResultSnapshot) return;
  const canvas = drawTicketImage(ticketResultSnapshot);
  const download = (url, revoke) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = `花街购票登记_${ticketResultSnapshot.dayLabel}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    showToast("图片已保存到下载目录");
    if (revoke) setTimeout(() => URL.revokeObjectURL(url), 20000);
  };
  if (canvas.toBlob) {
    canvas.toBlob((blob) => blob ? download(URL.createObjectURL(blob), true) : openTicketImageFallback(canvas), "image/png");
  } else {
    openTicketImageFallback(canvas);
  }
}

/* 个别浏览器（老版本 iOS Safari）不支持直接下载：新窗口打开让用户长按保存 */
function openTicketImageFallback(canvas) {
  const url = canvas.toDataURL("image/png");
  const w = window.open();
  if (w) {
    w.document.write(`<title>购票登记</title><img src="${url}" style="max-width:100%">`);
    showToast("长按图片即可保存");
  } else {
    showToast("浏览器拦截了新窗口，请直接截屏保存");
  }
}

/* 查询 -------------------------------------------------------------------------- */
async function lookupTicket() {
  const msg = $("ticketLookupMsg");
  const list = $("ticketLookupList");
  const contact = $("ticketLookupContact").value.trim();
  const firstName = normalizeTicketName($("ticketLookupName").value);
  $("ticketLookupName").value = firstName;
  list.innerHTML = "";
  if (!contact || !firstName) {
    setMsg(msg, "联系方式和第一位持票人 id 都要填写");
    return;
  }
  setMsg(msg, "");
  const btn = $("ticketLookupBtn");
  btn.disabled = true;
  const data = await callWorker({ action: "lookup_ticket", contact, firstName });
  btn.disabled = false;
  if (!data || !data.ok) {
    setMsg(msg, data?.error === "rate_limited" ? "查询太频繁了，请稍后再试" : "查询失败，请稍后再试");
    return;
  }
  if (!data.items.length) {
    setMsg(msg, "没有找到对应的登记记录，检查一下填写是否与登记时完全一致");
    return;
  }
  list.innerHTML = data.items.map((o) => `
    <div class="ticket-lookup-item${o.voided ? " is-void" : o.overLimit ? " is-over" : ""}">
      <div class="tli-head">${escapeHtml(o.day)} · 第 ${o.seq} 号 · ${o.qty} 张${
        o.voided ? " · 此单已作废，请联系活动群确认" : o.overLimit ? " · 超额登记，待确认" : ""}</div>
      <div class="tli-body">${o.holders.map((h) => escapeHtml(formatHolder(h))).join("、")}</div>
    </div>`).join("");
}

function initTicket() {
  $("ticketQtyMinus").addEventListener("click", () => setTicketQty(ticketState.qty - 1));
  $("ticketQtyPlus").addEventListener("click", () => setTicketQty(ticketState.qty + 1));
  $("ticketForm").addEventListener("submit", submitTicket);
  $("ticketAgainBtn").addEventListener("click", resetTicketForm);
  $("ticketSaveImgBtn").addEventListener("click", saveTicketImage);
  $("ticketNoticeClose").addEventListener("click", closeTicketNotice);
  $("ticketNoticeOverlay").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeTicketNotice();
  });
  $("ticketLookupBtn").addEventListener("click", lookupTicket);
  initTicketCaptcha();
  $("ticketLookupName").addEventListener("keydown", (e) => {
    if (e.key === "Enter") lookupTicket();
  });
  setTicketQty(1);
}

/* 首页购票入口 ----------------------------------------------------------------------
   两个入口都带 data-ticket-entry：
     · 收起视频时，最新活动卡片右下角的圆形按钮（#tileTicketEntry）
     · 展开视频时，视频下方那行最右侧的「进入购票」（#videoTicketEntry）
   只有「购票已开放」且「管理页没勾（测试）」时才出现；点任何一个都先弹「购票须知」，确认后进购票页。
   管理页设了定时开启 / 关闭时，页面会在那个时间点自己再查一次，不用访客刷新 */
let ticketEntryShown = false;
let ticketEntryChecked = false;   // 第一次查询回来之前入口一直藏着：宁可晚一点出现，也别闪一下再消失
let ticketEntryTimer = 0;
let ticketEntryRetries = 0;
let ticketEntryLastCheck = 0;

function applyTicketEntryVisibility(show) {
  ticketEntryShown = !!show;
  document.querySelectorAll("[data-ticket-entry]").forEach((el) => { el.hidden = !show; });
  $("latestTile")?.classList.toggle("has-ticket-entry", !!show);
  $("latestVideoActions")?.classList.toggle("has-ticket-entry", !!show);
}

/* 状态里的 open / testMode 决定入口显不显示 */
const ticketEntryVisibleFor = (st) => !!(st && st.open && !st.testMode);

/* 到下一个定时开关的时间点再查一次（加几秒随机错峰，别让所有人同一秒打到 Worker） */
function scheduleTicketEntryCheck(st) {
  clearTimeout(ticketEntryTimer);
  if (!st || !st.ok) return;
  const now = Date.now();
  const next = [st.openAt, st.closeAt].filter((t) => t > 0).sort((a, b) => a - b)[0];
  if (!next) { ticketEntryRetries = 0; return; }
  let delay = next - now;
  /* 时间已经过了但服务端还没结算（访客电脑时钟偏快）：隔 20 秒再看，最多重试 10 次 */
  if (delay <= 0) {
    if (ticketEntryRetries >= 10) return;
    ticketEntryRetries++;
    delay = 20000;
  } else {
    ticketEntryRetries = 0;
  }
  if (delay > 24 * 3600 * 1000) return;   // 太远了就不挂定时器，访客总会刷新页面的
  ticketEntryTimer = setTimeout(refreshTicketEntry, delay + 1000 + Math.floor(Math.random() * 14000));
}

async function refreshTicketEntry() {
  if (!document.querySelector("[data-ticket-entry]")) return;
  if (!ticketEntryChecked) applyTicketEntryVisibility(false);
  ticketEntryLastCheck = Date.now();
  const st = await callWorker({ action: "get_ticket_status" });
  ticketEntryChecked = true;
  if (!st || !st.ok) return;   // 读失败就维持现状，下次切回页面时再查
  applyTicketEntryVisibility(ticketEntryVisibleFor(st));
  scheduleTicketEntryCheck(st);
}

/* 购票须知 --------------------------------------------------------------------------
   mode = "enter"：从首页入口点进来，确认按钮 =「我已阅读，进入购票」
   mode = "ack"  ：直接拿链接进了购票页、还没看过须知，自动弹一次，确认按钮 =「我已阅读」
   mode = "view" ：购票页里点「购票须知」重新打开，确认按钮 =「知道了」 */
let ticketGuideMode = "view";
/* 看过一次就记在本次会话里（sessionStorage），刷新购票页不会再弹；关掉浏览器再来会重新弹 */
const TICKET_GUIDE_ACK_KEY = "hj_ticket_guide_ack";
let ticketGuideAcked = (() => { try { return sessionStorage.getItem(TICKET_GUIDE_ACK_KEY) === "1"; } catch (e) { return false; } })();
const TICKET_GUIDE_OK_TEXT = { enter: "我已阅读，进入购票", ack: "我已阅读", view: "知道了" };

function openTicketGuide(mode = "view") {
  ticketGuideMode = mode;
  $("ticketGuideOkBtn").textContent = TICKET_GUIDE_OK_TEXT[mode] || TICKET_GUIDE_OK_TEXT.view;
  $("ticketGuideOverlay").hidden = false;
  $("ticketGuideScroll").scrollTop = 0;
  playEnterAnim($("ticketGuideBox"));
}

function closeTicketGuide() {
  $("ticketGuideOverlay").hidden = true;
}

function confirmTicketGuide() {
  ticketGuideAcked = true;
  try { sessionStorage.setItem(TICKET_GUIDE_ACK_KEY, "1"); } catch (e) { /* 隐私模式等：只记在内存里 */ }
  closeTicketGuide();
  if (ticketGuideMode === "enter") setRoute(TICKET_HASH);   // hashchange → openTicketView
}

function onTicketEntryClick(e) {
  e.preventDefault();
  e.stopPropagation();   // 卡片上的按钮：不触发卡片本身的「进入详情」
  openTicketGuide("enter");
}

function initTicketEntry() {
  $("tileTicketEntry").addEventListener("click", onTicketEntryClick);
  $("videoTicketEntry").addEventListener("click", onTicketEntryClick);
  $("ticketGuideReopenBtn").addEventListener("click", () => openTicketGuide("view"));
  $("ticketGuideOkBtn").addEventListener("click", confirmTicketGuide);
  $("ticketGuideClose").addEventListener("click", closeTicketGuide);
  closeOnBackdrop($("ticketGuideOverlay"), closeTicketGuide);
  $("ticketGuideCopyBtn").addEventListener("click", () => copyText(GROUP_QQ, "群号已复制", "群号：" + GROUP_QQ));
  /* 切回这个标签页时，距上次查询超过 3 分钟就再查一次（开票前挂着页面等的人能及时看到入口） */
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && Date.now() - ticketEntryLastCheck > 3 * 60 * 1000) {
      refreshTicketEntry();
    }
  });
}
