/* 花舞之街 · 购票：购票页、首页入口、购票须知、停留时限。票额与校验以 Worker 为准 */
const TICKET_PER_PERSON_FALLBACK = 5;   // 单人限购由 Worker 下发，这是读不到时的值
/* 区服按大区分组：下拉里显示【大区】标题，存的仍是服务器名 */
const TICKET_SERVER_GROUPS = [
  { dc: "陆行鸟", servers: ["拉诺西亚", "幻影群岛", "神意之地", "萌芽池", "红玉海", "宇宙和音", "沃仙曦染", "晨曦王座"] },
  { dc: "莫古力", servers: ["潮风亭", "神拳痕", "白银乡", "白金幻象", "旅人栈桥", "拂晓之间", "龙巢神殿", "梦羽宝境"] },
  { dc: "猫小胖", servers: ["紫水栈桥", "延夏", "静语庄园", "摩杜纳", "海猫茶屋", "柔风海湾", "琥珀原"] },
  { dc: "豆豆柴", servers: ["水晶塔", "银泪湖", "太阳海岸", "伊修加德", "红茶川"] },
];
const TICKET_SERVERS = TICKET_SERVER_GROUPS.flatMap((g) => g.servers);
const TICKET_MSG_CLOSED = "购票暂未开放，请留意活动群通知";
const TICKET_ERRORS = {
  closed: TICKET_MSG_CLOSED,
  bad_contact: "请填写联系方式",
  bad_qty: "购票数量超出单人限额，请调整后再试",
  bad_holders: "持票人信息不完整，请检查",
  bad_holder_name: "请填写每位持票人的 id",
  bad_holder_server: "请为每位持票人选择区服",
  bad_holder_name_format: "持票人 id 仅限汉字、英文字母和「·」，最多 6 个字",
  pending_not_allowed: "当前不支持 id 待定，请填写完整的持票人信息",
  first_holder_required: "第一位持票人不能待定",
  captcha: "人机验证未通过，请重新验证后再提交",
  cooldown: "刚刚已经成功登记过了，请稍后再提交",
  rate_limited: "提交过于频繁，请稍后再试",
  server_error: "服务器错误，请先在「查询登记」确认是否已登记",
};

/* 读到状态之前的默认值；之后以 get_ticket_status 下发的为准（管理页「购票管理」可改） */
const ticketState = {
  qty: 1,
  perPerson: TICKET_PER_PERSON_FALLBACK,
  allowPending: false,   // 第二位起的持票人可以「id 待定」
  remaining: null,
  submitting: false,
  title: TICKET_TITLE,
  testMode: true,
  cooldownMin: 30,       // 成功登记后隔多少分钟才能再交（0 = 不限）
  cooldownUntil: 0,      // 本机估算的冷却结束时刻，真正的判断在 Worker
  resetMin: 0,           // 每日刷新时间：国服 0 点之后的分钟数
  stockMode: "full",     // full 具体张数 / range 大致范围 / hidden 不显示
  stockLevel: "",        // range 时的档位：none / few / low / plenty
  soldOut: false,
  showSchedule: true,    // 显示定时开启 / 截止时间
  showReset: true,       // 显示刷新时间
  open: false,
  openAt: 0,
  closeAt: 0,
  roundWord: "今日",     // 「今日」还是「本轮」
  dailyOn: true,
  nextRefreshAt: 0,
  nextRefreshDaily: true,
  showOver: false,       // 超额提示给访客看
  messageOn: true,       // 留言栏
  guideOn: true,         // 购票须知
  showBrand: true,       // 购票页显示网站标题、地址、时间天气
  isolated: false,       // 与首页隔离：没有返回按钮，首页没有入口
  idleMin: 0,            // 停留超过几分钟回首页（0 = 不限）
  showIdle: false,       // 显示剩余时间
};
const TICKET_META_FLAGS = ["testMode", "showSchedule", "showReset", "open", "dailyOn", "showOver", "messageOn", "guideOn", "showBrand", "isolated", "showIdle"];
const TICKET_META_INTS = ["cooldownMin", "resetMin", "idleMin"];

const roundWord = () => ticketState.roundWord || "今日";
const ticketFullTitle = () => (ticketState.title || TICKET_TITLE) + (ticketState.testMode ? "（测试）" : "");
const ticketSoldOutText = () => `${roundWord()}活动票已售罄，可留意后续放票！`;

/* 分钟数 ↔ "HH:MM" */
const minutesToHHMM = (m) => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
function hhmmToMinutes(v) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(v || ""));
  return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null;
}

const waitText = (sec) => (sec >= 60 ? `约 ${Math.ceil(sec / 60)} 分钟` : `${Math.max(1, Math.ceil(sec))} 秒`);
function ticketCooldownText(sec) {
  const gap = ticketState.cooldownMin ? `每次成功登记后需间隔 ${ticketState.cooldownMin} 分钟才能再次提交，` : "";
  return `${gap}请${waitText(sec)}后再试`;
}

const TICKET_CN_NUM = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
const ticketHolderWho = (i) => (i === 0 ? "持票玩家" : `第${TICKET_CN_NUM[i] || i + 1}位持票玩家`);
const formatHolder = (h) => (!h || h.pending ? "待定" : `${h.name}@${h.server}`);
/* 部分作废的持票人（voided）不算张数 */
const ticketActiveHolders = (holders) => (Array.isArray(holders) ? holders : []).filter((h) => h && !h.voided);

/* 轮次编号 → 「9月21日」「9月29日 12:00 场」 */
function ticketRoundLabel(key, withYear = false) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}:\d{2}))?(.*)$/.exec(String(key || ""));
  if (!m) return String(key || "");
  const date = `${withYear ? `${m[1]}年` : ""}${+m[2]}月${+m[3]}日`;
  return m[4] ? `${date} ${m[4]} 场${m[5]}` : date;
}

/* 余票文案（管理页「访客看到」预览也用它），不显示时为 "" */
const TICKET_STOCK_LEVEL_HTML = {
  none: (w) => `${w}余票 <b>已售罄</b>`,
  few: (w) => `${w}<b>余票10张以内</b>`,
  low: (w) => `${w}<b>余票不多</b>`,
  plenty: (w) => `${w}<b>余票充裕</b>`,
};
function ticketStockHtml(mode, remaining, level, word = roundWord()) {
  if (mode === "hidden") return "";
  if (mode === "range") return TICKET_STOCK_LEVEL_HTML[level]?.(word) || "";
  return `${word}余票 <b>${Number.isFinite(remaining) ? remaining : "--"}</b> 张`;
}

/* 持票人 id：汉字、英文字母与「·」，最多 6 个字，规则与 Worker 一致 */
const TICKET_NAME_MAX_CHARS = 6;
const TICKET_NAME_DOTS = /[・･•‧∙⋅··᛫⸱]/g;
const isHanCodePoint = (cp) => (cp >= 0x3400 && cp <= 0x4DBF) || (cp >= 0x4E00 && cp <= 0x9FFF)
  || (cp >= 0xF900 && cp <= 0xFAFF) || (cp >= 0x20000 && cp <= 0x3FFFF);

/* 自动修正（数字、非法字符留着，交给校验提示） */
function normalizeTicketName(raw) {
  const s = String(raw ?? "").normalize("NFKC").replace(/[\s　]+/g, "").replace(TICKET_NAME_DOTS, "·");
  return Array.from(s).map((ch, i) => (/[A-Za-z]/.test(ch) ? (i === 0 ? ch.toUpperCase() : ch.toLowerCase()) : ch)).join("");
}

function ticketNameError(name) {
  const chars = Array.from(name);
  if (!chars.length) return "请填写持票人 id";
  if (/[@＠]/.test(name)) return "id 里不用写 @ 和服务器，服务器在右边选择";
  if (/[0-9]/.test(name)) return "id 不能包含数字";
  if (chars.some((ch) => ch !== "·" && !/[A-Za-z]/.test(ch) && !isHanCodePoint(ch.codePointAt(0)))) return "id 只能用汉字、英文字母和「·」";
  if (chars.every((ch) => ch === "·")) return "id 不能只有「·」";
  if (chars.length > TICKET_NAME_MAX_CHARS) return `id 最多 ${TICKET_NAME_MAX_CHARS} 个字，当前 ${chars.length} 个`;
  return "";
}

/* 输入时实时修正并提示；输入法拼字期间不改值，否则会打断拼音 */
function bindTicketNameInput(input, warn) {
  let composing = false;
  const fix = () => {
    const before = input.value;
    const after = normalizeTicketName(before);
    if (after !== before) {
      const pos = normalizeTicketName(before.slice(0, input.selectionStart ?? before.length)).length;
      input.value = after;
      try { input.setSelectionRange(pos, pos); } catch (e) {}
    }
    const err = input.value ? ticketNameError(input.value) : "";
    setMsg(warn, err);
    input.classList.toggle("is-invalid", !!err);
  };
  input.addEventListener("compositionstart", () => { composing = true; });
  input.addEventListener("compositionend", () => { composing = false; fix(); });
  input.addEventListener("input", (e) => { if (!composing && !e.isComposing) fix(); });
  input.addEventListener("blur", fix);
  if (input.value) fix();
}

/* 页面跟着状态走 ----------------------------------------------------------------------- */
function applyTicketMeta(st) {
  const t = ticketState;
  if (typeof st.title === "string" && st.title) t.title = st.title;
  if (typeof st.roundWord === "string" && st.roundWord) t.roundWord = st.roundWord;
  TICKET_META_FLAGS.forEach((k) => { if (typeof st[k] === "boolean") t[k] = st[k]; });
  TICKET_META_INTS.forEach((k) => { if (Number.isInteger(st[k])) t[k] = st[k]; });
  if (Number.isFinite(st.cooldownLeftSec)) t.cooldownUntil = st.cooldownLeftSec > 0 ? Date.now() + st.cooldownLeftSec * 1000 : 0;
  t.openAt = Number(st.openAt) || 0;
  t.closeAt = Number(st.closeAt) || 0;
  if (st.nextRefreshAt !== undefined) {
    t.nextRefreshAt = Number(st.nextRefreshAt) || 0;
    t.nextRefreshDaily = !!st.nextRefreshDaily;
  }
}

function showTicketTitle() {
  $("ticketTitle").textContent = ticketFullTitle();
  document.title = `${ticketFullTitle()} · 花舞之街`;
}

/* 网站标题、返回按钮、留言栏、须知按钮；标题与隔离状态存于本机，避免下次打开时闪烁 */
function applyTicketLook(bare, isolated) {
  document.documentElement.classList.toggle("hj-ticket-bare", bare);
  $("view-ticket").classList.toggle("is-isolated", isolated);
}

function applyTicketPageSwitches() {
  const bare = !ticketState.showBrand;
  applyTicketLook(bare, ticketState.isolated);
  storage.set(STORE.ticketLook, `${+bare}${+ticketState.isolated}`);
  $("ticketMessageField").hidden = !ticketState.messageOn;
  $("ticketGuideRow").hidden = !ticketState.guideOn;
}

/* 余票下面的小字：刷新时间、定时开启 / 截止时间 */
function ticketTimeLines() {
  const t = ticketState;
  const lines = [];
  if (t.showReset) {
    if (t.dailyOn && t.nextRefreshDaily) lines.push(`每日 ${minutesToHHMM(t.resetMin)} 刷新票额`);
    else if (t.nextRefreshAt) lines.push(`下次刷新票额：${formatCnTime(t.nextRefreshAt)}`);
  }
  if (t.showSchedule) {
    if (!t.open && t.openAt) lines.push(`预计 ${formatCnTime(t.openAt)} 开启购票`);
    if (t.open && t.closeAt) lines.push(`购票将于 ${formatCnTime(t.closeAt)} 截止`);
  }
  return lines;
}

/* info：get_ticket_status / submit_ticket 的返回（null = 读取失败） */
function renderTicketStock(info) {
  const t = ticketState;
  t.remaining = info && Number.isFinite(info.remaining) ? info.remaining : null;
  t.stockMode = info?.remainingMode || "full";
  t.stockLevel = info?.remainingLevel || "";
  t.soldOut = typeof info?.soldOut === "boolean" ? info.soldOut : t.remaining === 0;
  const html = ticketStockHtml(t.stockMode, t.remaining, t.stockLevel);
  const text = $("ticketStockText");
  text.innerHTML = html;
  text.hidden = !html;
  const lines = ticketTimeLines();
  setMsg($("ticketResetHint"), lines.join("\n"));
  $("ticketStock").hidden = !html && !lines.length;
  $("ticketStock").classList.toggle("is-empty", t.soldOut);
  updateTicketQtyWarn();
}

/* 只有显示具体张数、并且管理页打开了「超额提示」时才提示 */
function updateTicketQtyWarn() {
  const t = ticketState;
  const r = t.stockMode === "full" && t.showOver ? t.remaining : null;
  setMsg($("ticketQtyWarn"), r > 0 && t.qty > r ? `${roundWord()}仅剩 ${r} 张，超出部分待工作人员确认` : "");
}

/* 持票人与数量 ------------------------------------------------------------------------- */
const TICKET_SERVER_OPTIONS = `<option value="" disabled selected hidden>选择区服</option>` + TICKET_SERVER_GROUPS.map((g) =>
  `<optgroup label="【${g.dc}】">${g.servers.map((s) => `<option value="${s}">${s}</option>`).join("")}</optgroup>`).join("");

function renderTicketHolders() {
  const wrap = $("ticketHolders");
  const prev = [...wrap.querySelectorAll(".ticket-holder")].map((row) => ({   // 数量变化时已填的内容不丢
    name: row.querySelector(".th-name").value,
    server: row.querySelector(".th-server").value,
    pending: !!row.querySelector(".th-pending")?.checked,
  }));
  wrap.innerHTML = Array.from({ length: ticketState.qty }, (_, i) => {
    const label = `${ticketHolderWho(i)} id 和服务器`;
    return `
    <div class="ticket-field ticket-holder" data-index="${i}">
      <span class="ticket-label is-required">${label}</span>
      ${i ? `<p class="ticket-sub">购买 ${i + 1} 张票时填写</p>` : ""}
      <div class="ticket-holder-row">
        <input type="text" class="th-name" maxlength="12" placeholder="角色名" autocomplete="off" spellcheck="false" autocapitalize="off" aria-label="${label}：角色名">
        <select class="th-server" aria-label="${label}：服务器">${TICKET_SERVER_OPTIONS}</select>
        ${ticketState.allowPending && i ? `<label class="audience-opt th-pending-opt"><input type="checkbox" class="th-pending"><span>id 待定</span></label>` : ""}
      </div>
      <p class="ticket-warn th-warn" role="alert" hidden></p>
    </div>`;
  }).join("");

  wrap.querySelectorAll(".ticket-holder").forEach((row, i) => {
    const name = row.querySelector(".th-name");
    const server = row.querySelector(".th-server");
    const pending = row.querySelector(".th-pending");
    const warn = row.querySelector(".th-warn");
    if (prev[i]) {
      name.value = prev[i].name;
      server.value = prev[i].server;
      if (pending) pending.checked = prev[i].pending;
    }
    bindTicketNameInput(name, warn);
    const sync = () => {
      const on = !!pending?.checked;
      name.disabled = server.disabled = on;
      row.classList.toggle("is-pending", on);
      if (on) {
        setMsg(warn, "");
        name.classList.remove("is-invalid");
      }
    };
    pending?.addEventListener("change", sync);
    sync();
  });
}

function setTicketQty(n) {
  const t = ticketState;
  t.qty = clamp(n, 1, t.perPerson);
  $("ticketQty").textContent = String(t.qty);
  $("ticketQtyMinus").disabled = t.qty <= 1;
  $("ticketQtyPlus").disabled = t.qty >= t.perPerson;
  updateTicketQtyWarn();
  renderTicketHolders();
}

function applyTicketPerPerson(perPerson, allowPending) {
  const n = Number(perPerson);
  const next = Number.isInteger(n) && n >= 1 ? n : TICKET_PER_PERSON_FALLBACK;
  if (next === ticketState.perPerson && allowPending === ticketState.allowPending && $("ticketHolders").children.length) return;
  ticketState.perPerson = next;
  ticketState.allowPending = allowPending;
  $("ticketLimitHint").textContent = `每人限购 ${next} 张，批量购票请联系活动群群主`;
  setTicketQty(ticketState.qty);
}

/* 购票页 ------------------------------------------------------------------------------- */
function openTicketNotice(text) {
  $("ticketNoticeText").textContent = text;
  $("ticketNoticeOverlay").hidden = false;
}

const closeTicketNotice = () => { $("ticketNoticeOverlay").hidden = true; };

/* form 可填写 / blocked 未开放或售罄（显示 text）/ result 提交成功 */
function setTicketMode(mode, text = "") {
  if (mode !== "form") stopTicketIdle();   // 停留时间只在能填表的时候算
  $("ticketForm").hidden = mode !== "form";
  $("ticketResult").hidden = mode !== "result";
  setMsg($("ticketBlocked"), mode === "blocked" ? text : "");
}

function selectTicketTab(tab) {
  markTabs(document.querySelectorAll("#view-ticket [data-ticket-tab]"), (b) => b.dataset.ticketTab === tab);
  $("ticketBuyCard").hidden = tab !== "buy";
  $("ticketLookupCard").hidden = tab !== "lookup";
}

let ticketViewSeq = 0;   // 状态回来得晚、人已经离开或又进来了一次，就别再动页面
async function openTicketView() {
  const seq = ++ticketViewSeq;
  const look = storage.get(STORE.ticketLook) || "";
  applyTicketLook(look[0] === "1", look[1] === "1");
  showView("view-ticket");
  selectTicketTab("buy");
  showTicketTitle();
  if (!$("ticketResult").hidden) clearTicketForm();   // 登记成功后再进来：空白表单

  setTicketMode("blocked", "正在读取购票状态…");
  const st = await callWorker({ action: "get_ticket_status" });
  if (seq !== ticketViewSeq || $("view-ticket").hidden) return;
  if (!st || !st.ok) {
    ticketState.showReset = ticketState.showSchedule = false;
    renderTicketStock(null);
    setTicketMode("blocked", "购票状态读取失败，检查一下网络后刷新页面再试");
    return;
  }
  applyTicketMeta(st);
  showTicketTitle();
  applyTicketPageSwitches();
  applyTicketPerPerson(st.perPerson, !!st.allowPending);
  renderTicketStock(st);
  const blocked = !st.open
    ? (st.openAt && ticketState.showSchedule ? `${TICKET_MSG_CLOSED}（预计 ${formatCnTime(st.openAt)} 国服时间开启）` : TICKET_MSG_CLOSED)
    : ticketState.soldOut ? ticketSoldOutText() : "";
  if (blocked) {
    setTicketMode("blocked", blocked);
    openTicketNotice(blocked);
    return;
  }
  setTicketMode("form");
  startTicketIdle();
  ticketGate.open();
  /* 拿着链接直接进来、这次还没看过须知的先弹一次（从首页入口进来的已经看过） */
  if (ticketState.guideOn && !ticketGuide.acked && $("ticketGuideOverlay").hidden) openTicketGuide("ack");
  const left = (ticketState.cooldownUntil - Date.now()) / 1000;
  if (left > 0) setMsg($("ticketMsg"), ticketCooldownText(left));
}

/* 提交 --------------------------------------------------------------------------------- */
let ticketGate = null;

function collectTicketForm() {
  const contact = $("ticketContact").value.trim();
  if (!contact) return { error: "请填写联系方式", focus: $("ticketContact") };
  const holders = [];
  for (const row of $("ticketHolders").querySelectorAll(".ticket-holder")) {
    if (row.querySelector(".th-pending")?.checked) {
      holders.push({ pending: true });
      continue;
    }
    const who = ticketHolderWho(+row.dataset.index);
    const name = row.querySelector(".th-name");
    const server = row.querySelector(".th-server");
    name.value = normalizeTicketName(name.value);
    if (!name.value) return { error: `请填写${who} id`, focus: name };
    const nameErr = ticketNameError(name.value);
    if (nameErr) return { error: `${who}：${nameErr}`, focus: name };
    if (!server.value) return { error: `请为${who}选择服务器`, focus: server };
    holders.push({ name: name.value, server: server.value });
  }
  const withMessage = ticketState.messageOn;
  return {
    payload: {
      contact,
      qty: ticketState.qty,
      holders,
      message: withMessage ? $("ticketMessage").value.trim() : "",
      anonymous: withMessage ? $("ticketAnonymous").checked : true,
    },
  };
}

async function submitTicket(e) {
  e.preventDefault();
  if (ticketState.submitting) return;
  /* 手机锁屏 / 切后台时计时器可能被暂停，提交这一刻再核对一次停留时间 */
  if (ticketIdleLeftMs() <= 0) { kickTicketIdle(); return; }
  const msg = $("ticketMsg");
  const form = collectTicketForm();
  if (form.error) {
    setMsg(msg, form.error);
    form.focus.focus();
    return;
  }
  /* 冷却中就别让访客白做一遍验证（真正的判断在 Worker） */
  const cdLeft = (ticketState.cooldownUntil - Date.now()) / 1000;
  if (cdLeft > 0) { setMsg(msg, ticketCooldownText(cdLeft)); return; }
  const need = ticketGate.missing();
  if (need) { setMsg(msg, need); return; }

  setMsg(msg, "");
  ticketState.submitting = true;
  const btn = $("ticketSubmitBtn");
  btn.disabled = true;
  btn.textContent = "提交中…";
  const proof = ticketGate.proof();
  const data = await callWorker({ action: "submit_ticket", ...form.payload, ...proof });
  ticketState.submitting = false;
  btn.disabled = false;
  btn.textContent = "提交";
  ticketGate.afterSubmit(data);
  if (!data?.ok && ticketIdleLeftMs() <= 0) { kickTicketIdle(); return; }

  if (!data) {
    /* 回应丢失时无法确认是否已登记，提示先查询，避免重复下单 */
    setMsg(msg, "网络中断，请先在「查询登记」确认是否已登记");
    return;
  }
  if (data.ok) {
    if (Number.isInteger(data.cooldownMin)) ticketState.cooldownMin = data.cooldownMin;
    ticketState.cooldownUntil = ticketState.cooldownMin ? Date.now() + ticketState.cooldownMin * 60000 : 0;
    renderTicketStock(data);
    showTicketResult(form.payload, data);
  } else if (data.error === "closed") {
    setTicketMode("blocked", TICKET_MSG_CLOSED);
    openTicketNotice(TICKET_MSG_CLOSED);
  } else if (data.error === "cooldown") {
    if (Number.isInteger(data.cooldownMin)) ticketState.cooldownMin = data.cooldownMin;
    const wait = Number(data.waitSec);
    if (!wait) return setMsg(msg, TICKET_ERRORS.cooldown);
    ticketState.cooldownUntil = Date.now() + wait * 1000;
    setMsg(msg, ticketCooldownText(wait));
  } else if (data.error === "captcha" && proof?.verifyPass) {
    setMsg(msg, "人机验证凭证已过期或用过，已换一题，请重新验证后提交");
  } else {
    setMsg(msg, TICKET_ERRORS[data.error] || "提交失败，请稍后再试");
  }
}

let ticketResult = null;   // 保存凭证图用

function showTicketResult(p, data) {
  const dayLabel = ticketRoundLabel(data.day);
  const word = data.roundWord || roundWord();
  /* overLimit / dup 只有管理页打开了「对客户显示」时 Worker 才会给 */
  const warn = [];
  if (data.overLimit) warn.push(`提交时${word}票额已满，本单为超额登记，需等待工作人员确认。`);
  if (data.dup) warn.push("联系方式或持票人与其他登记重复，待工作人员核对。");
  const note = warn.length ? `${warn.join("")}请截图保存本页，并留意活动群 ${GROUP_QQ}。` : `请截图保存本页，付款与取票请留意活动群 ${GROUP_QQ}。`;
  const rows = [
    ["联系方式", p.contact],
    ["购票数量", `${p.qty} 张`],
    ...p.holders.map((h, i) => [`持票人 ${i + 1}`, formatHolder(h)]),
  ];
  if (ticketState.messageOn && p.message) rows.push(["留言", `${p.message}（${p.anonymous ? "匿名" : "实名"}）`]);
  ticketResult = { rows, dayLabel, note };
  $("ticketResultTitle").textContent = `登记成功 · ${dayLabel}`;
  $("ticketResultNote").textContent = note;
  $("ticketResultNote").classList.toggle("is-warn", warn.length > 0);
  $("ticketResultList").innerHTML = rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join("");
  setTicketMode("result");
  $("ticketResult").scrollIntoView({ behavior: "smooth", block: "center" });
}

function clearTicketForm() {
  $("ticketForm").reset();
  $("ticketHolders").innerHTML = "";
  setMsg($("ticketMsg"), "");
  setTicketQty(1);
  $("ticketResult").hidden = true;
}

/* 登记凭证图：用 canvas 自己画（不依赖外部库），右下角带水印 ---------------------------------- */
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

function wrapCanvasText(ctx, text, maxWidth) {
  const lines = [];
  for (const paragraph of String(text).split("\n")) {
    let line = "";
    for (const ch of paragraph) {
      if (line && ctx.measureText(line + ch).width > maxWidth) {
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

function roundRectPath(ctx, x, y, w, h, r) {
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
  const scale = clamp(window.devicePixelRatio || 1, 2, 3);
  const labelW = 110;
  const valueW = S.width - S.pad * 2 - labelW - 16;
  const measure = document.createElement("canvas").getContext("2d");
  measure.font = `16px ${S.serif}`;
  const noteLines = wrapCanvasText(measure, snap.note, S.width - S.pad * 2);
  const rowLines = snap.rows.map(([k, v]) => ({ k, lines: wrapCanvasText(measure, v, valueW) }));
  const rowsHeight = rowLines.reduce((n, r) => n + r.lines.length * 28 + 10, 0);
  const height = Math.round(S.pad + 46 + 40 + noteLines.length * 26 + 22 + rowsHeight + 40 + S.pad);

  const canvas = document.createElement("canvas");
  canvas.width = S.width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.textBaseline = "top";
  ctx.fillStyle = S.bg;
  ctx.fillRect(0, 0, S.width, height);
  roundRectPath(ctx, 14, 14, S.width - 28, height - 28, 22);
  ctx.fillStyle = S.card;
  ctx.fill();
  ctx.strokeStyle = S.line;
  ctx.lineWidth = 1;
  ctx.stroke();

  const text = (str, x, y, font, color) => {
    ctx.font = `${font} ${S.serif}`;
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  };
  let y = S.pad;
  ctx.textAlign = "center";
  text(ticketFullTitle(), S.width / 2, y, "bold 30px", S.gold);
  y += 46;
  text(`登记成功 · ${snap.dayLabel}`, S.width / 2, y, "bold 22px", S.cream);
  y += 40;
  noteLines.forEach((line) => {
    text(line, S.width / 2, y, "15px", S.soft);
    y += 26;
  });
  y += 22;
  ctx.textAlign = "left";
  rowLines.forEach(({ k, lines }) => {
    text(k, S.pad, y + 2, "15px", S.mute);
    lines.forEach((line, i) => text(line, S.pad + labelW + 16, y + i * 28, "17px", S.cream));
    y += lines.length * 28 + 10;
  });
  ctx.textAlign = "right";
  text(`花舞之街·薰风花语町，${snap.dayLabel}`, S.width - S.pad, height - S.pad - 14, "14px", "rgba(255,214,153,.55)");
  return canvas;
}

function saveTicketImage() {
  if (!ticketResult) return;
  const canvas = drawTicketImage(ticketResult);
  /* 不能直接下载时（旧版 iOS Safari）在新窗口打开，长按保存 */
  const openInWindow = () => {
    const w = window.open();
    if (!w) return showToast("浏览器拦截了新窗口，请直接截屏保存");
    w.document.write(`<title>购票登记</title><img src="${canvas.toDataURL("image/png")}" style="max-width:100%">`);
    showToast("长按图片保存");
  };
  if (!canvas.toBlob) return openInWindow();
  canvas.toBlob((blob) => {
    if (!blob) return openInWindow();
    downloadBlob(blob, `花街购票登记_${ticketResult.dayLabel}.png`);
    showToast("图片已保存");
  }, "image/png");
}

/* 查询登记 ------------------------------------------------------------------------------- */
async function lookupTicket() {
  const msg = $("ticketLookupMsg");
  const list = $("ticketLookupList");
  const contact = $("ticketLookupContact").value.trim();
  const firstName = normalizeTicketName($("ticketLookupName").value);
  $("ticketLookupName").value = firstName;
  list.innerHTML = "";
  if (!contact || !firstName) { setMsg(msg, "请填写联系方式和第一位持票人 id"); return; }
  setMsg(msg, "");
  const btn = $("ticketLookupBtn");
  btn.disabled = true;
  const data = await callWorker({ action: "lookup_ticket", contact, firstName });
  btn.disabled = false;
  if (!data?.ok) { setMsg(msg, data?.error === "rate_limited" ? "查询过于频繁，请稍后再试" : "查询失败，请稍后再试"); return; }
  if (!data.items.length) { setMsg(msg, "未找到登记记录，请核对填写内容"); return; }
  /* 作废的持票人划掉；超额 / 重复只有管理页打开了「对客户显示」时才会有 */
  list.innerHTML = data.items.map((o) => `
    <div class="ticket-lookup-item${o.voided ? " is-void" : o.overLimit ? " is-over" : ""}">
      <div class="tli-head">${escapeHtml(ticketRoundLabel(o.day))} · 第 ${o.seq} 号 · ${o.qty} 张${o.voided ? " · 此单已作废，请联系活动群确认" : o.overLimit ? " · 超额登记，待确认" : ""}</div>
      <div class="tli-body">${o.holders.map((h) => (h.voided ? `<span class="tli-void"><s>${escapeHtml(formatHolder(h))}</s> 已作废</span>` : escapeHtml(formatHolder(h)))).join("、")}</div>
      ${o.dup && !o.voided ? `<div class="tli-note">联系方式或持票人与其他登记重复，待核对</div>` : ""}
    </div>`).join("");
}

/* 首页购票入口：已开放、非测试、未隔离时显示 */
const ticketEntry = { status: null, timer: 0, retries: 0, lastCheck: 0 };

const ticketEntryVisible = (st) => !!(st && st.open && !st.testMode && !st.isolated);

function showTicketEntry(show) {
  document.querySelectorAll("[data-ticket-entry]").forEach((el) => { el.hidden = !show; });
  $("latestTile").classList.toggle("has-ticket-entry", show);
  $("latestVideoActions").classList.toggle("has-ticket-entry", show);
}

/* 到下一个定时开关时刻再查（随机错峰）；未结算则每 20 秒重试，最多 10 次 */
function scheduleTicketEntryCheck(st) {
  clearTimeout(ticketEntry.timer);
  const next = [st.openAt, st.closeAt].filter((t) => t > 0).sort((a, b) => a - b)[0];
  if (!next) { ticketEntry.retries = 0; return; }
  let delay = next - hjNow();
  if (delay > 0) ticketEntry.retries = 0;
  else if (ticketEntry.retries++ < 10) delay = 20000;
  else return;
  if (delay > 86400000) return;   // 太远了不挂定时器
  ticketEntry.timer = setTimeout(refreshTicketEntry, delay + 1000 + Math.floor(Math.random() * 14000));
}

async function refreshTicketEntry() {
  ticketEntry.lastCheck = Date.now();
  const st = await callWorker({ action: "get_ticket_status" });
  if (!st?.ok) return;   // 读失败维持现状，切回页面时再查
  ticketEntry.status = st;
  const show = ticketEntryVisible(st);
  showTicketEntry(show);
  if (show && st.guideOn !== false) loadTicketGuide();   // 须知先取回来，点的时候不用等
  scheduleTicketEntryCheck(st);
}

function onTicketEntryClick(e) {
  e.preventDefault();
  e.stopPropagation();   // 不触发卡片本身的「进入详情」
  if (ticketEntry.status?.guideOn === false) setRoute(TICKET_HASH);
  else openTicketGuide("enter");
}

/* 购票须知。mode：enter 从首页进入 / ack 直接打开购票页时 / view 重新查看 */
const TICKET_GUIDE_OK_TEXT = { enter: "我已阅读，进入购票", ack: "我已阅读", view: "知道了" };
const ticketGuide = { mode: "view", loaded: false, loading: null, acked: session.get(STORE.ticketGuideAck) === "1" };

function loadTicketGuide() {
  if (ticketGuide.loaded) return Promise.resolve();
  ticketGuide.loading ??= callWorker({ action: "get_ticket_guide" }).then((data) => {
    if (!data?.ok) return;
    $("ticketGuideContent").innerHTML = renderGuideMarkup(data.text || TICKET_GUIDE_DEFAULT);
    ticketGuide.loaded = true;
  }).finally(() => { ticketGuide.loading = null; });
  return ticketGuide.loading;
}

async function openTicketGuide(mode) {
  ticketGuide.mode = mode;
  if (!ticketGuide.loaded) await Promise.race([loadTicketGuide(), new Promise((r) => setTimeout(r, 2500))]);
  if (mode === "ack" && $("view-ticket").hidden) return;   // 等的时候人已经离开购票页了
  $("ticketGuideOkBtn").textContent = TICKET_GUIDE_OK_TEXT[mode];
  $("ticketGuideOverlay").hidden = false;
  $("ticketGuideScroll").scrollTop = 0;
  playEnterAnim($("ticketGuideBox"));
}

const closeTicketGuide = () => { $("ticketGuideOverlay").hidden = true; };

function confirmTicketGuide() {
  ticketGuide.acked = true;
  session.set(STORE.ticketGuideAck, "1");
  closeTicketGuide();
  if (ticketGuide.mode === "enter") setRoute(TICKET_HASH);
}

/* 停留时限：表单显示后计时，超时返回首页 */
const ticketIdle = { timer: 0, enteredAt: 0, limitMs: 0 };

function startTicketIdle() {
  stopTicketIdle();
  if (!ticketState.idleMin || ticketState.isolated) return;
  ticketIdle.enteredAt = Date.now();
  ticketIdle.limitMs = ticketState.idleMin * 60000;
  paintTicketIdle(ticketIdle.limitMs);
  ticketIdle.timer = setInterval(tickTicketIdle, 1000);
}

function stopTicketIdle() {
  clearInterval(ticketIdle.timer);
  ticketIdle.limitMs = 0;
  $("ticketIdle").hidden = true;
}

/* 还剩多少毫秒；没在计时为 Infinity */
const ticketIdleLeftMs = () => (ticketIdle.limitMs ? ticketIdle.enteredAt + ticketIdle.limitMs - Date.now() : Infinity);

function paintTicketIdle(left) {
  const el = $("ticketIdle");
  el.hidden = !ticketState.showIdle;
  if (el.hidden) return;
  const sec = Math.max(0, Math.ceil(left / 1000));
  el.textContent = `请在 ${Math.floor(sec / 60)}:${pad2(sec % 60)} 内完成提交，超时将返回首页`;
  el.classList.toggle("is-urgent", sec <= 60);
}

function tickTicketIdle() {
  if ($("view-ticket").hidden) { stopTicketIdle(); return; }
  if (ticketState.submitting) return;   // 正在提交就等结果回来
  const left = ticketIdleLeftMs();
  if (left <= 0) kickTicketIdle();
  else paintTicketIdle(left);
}

/* 返回首页触发的 hashchange 会关闭弹窗，提示须在其后弹出 */
function kickTicketIdle() {
  const text = `停留超过 ${ticketState.idleMin} 分钟，已返回首页`;
  stopTicketIdle();
  if (location.hash && location.hash !== "#") {
    window.addEventListener("hashchange", () => setTimeout(() => openTicketNotice(text), 0), { once: true });
    goHome();
  } else {
    goHome();
    openTicketNotice(text);
  }
}

function initTicket() {
  $("ticketQtyMinus").addEventListener("click", () => setTicketQty(ticketState.qty - 1));
  $("ticketQtyPlus").addEventListener("click", () => setTicketQty(ticketState.qty + 1));
  $("ticketForm").addEventListener("submit", submitTicket);
  $("ticketSaveImgBtn").addEventListener("click", saveTicketImage);
  $("ticketNoticeClose").addEventListener("click", closeTicketNotice);
  closeOnBackdrop($("ticketNoticeOverlay"), closeTicketNotice);
  $("ticketLookupBtn").addEventListener("click", lookupTicket);
  $("ticketLookupName").addEventListener("keydown", (e) => { if (e.key === "Enter") lookupTicket(); });
  document.querySelectorAll("#view-ticket [data-ticket-tab]").forEach((b) => b.addEventListener("click", () => {
    selectTicketTab(b.dataset.ticketTab);
    playEnterAnim(b.dataset.ticketTab === "buy" ? $("ticketBuyCard") : $("ticketLookupCard"));
  }));
  ticketGate = createFormGate($("ticketVerify"), {
    shouldOpen: () => !$("view-ticket").hidden && !$("ticketForm").hidden,
    onPass: () => setMsg($("ticketMsg"), ""),
  });
  setTicketQty(1);

  $("ticketGuideContent").innerHTML = renderGuideMarkup(TICKET_GUIDE_DEFAULT);
  $("tileTicketEntry").addEventListener("click", onTicketEntryClick);
  $("videoTicketEntry").addEventListener("click", onTicketEntryClick);
  $("ticketGuideReopenBtn").addEventListener("click", () => openTicketGuide("view"));
  $("ticketGuideOkBtn").addEventListener("click", confirmTicketGuide);
  $("ticketGuideClose").addEventListener("click", closeTicketGuide);
  closeOnBackdrop($("ticketGuideOverlay"), closeTicketGuide);
  $("ticketGuideCopyBtn").addEventListener("click", () => copyText(GROUP_QQ, "群号已复制", "群号：" + GROUP_QQ));
  /* 切回标签页时，距上次查询超过 3 分钟则重新查询 */
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && Date.now() - ticketEntry.lastCheck > 180000) refreshTicketEntry();
  });
  refreshTicketEntry();
}

/* 默认须知（2026 莫古力中秋月轮祭）。管理页「恢复默认」就是恢复成这份 */
const TICKET_GUIDE_DEFAULT = [
  "^ 2026莫古力中秋月轮祭",
  "# 购票须知",
  "",
  "## 1. 票价",
  "[票价] 预售票 | 110w/人 | 预售时间 | 2026年9月20日 12:00 – 2026年9月26日 12:00",
  "[票价] 现场票 | 140w/人 | 活动时间 | 2026年9月26日 20:30 – 23:30",
  "",
  "## 2. 购票方式",
  "### 预售票",
  "1. 登录花街网站 swayingsussurrusstreet.dpdns.org",
  "2. 预售开启后，网站首页将显示购票入口，在购票页面内根据提示填写登记信息并提交，保存登记信息截图",
  "3. 等待活动群（群号 453278026）发布取票通知，届时可前往取票地点交易取票",
  "### 现场票",
  "预售时间结束后，我们将统计购票情况和大家的需求，视情况在活动期间发放一定数量的现场票。",
  "购票方式和现场售票员位置等信息届时请关注游戏内喊话频道。",
  "",
  "## 3. 购票说明 Q&A",
  "Q1：购买活动票可以参与哪些项目，所有项目都可以凭票直接游玩吗？",
  "现场的活动项目分为免费活动，通票活动，额外付费活动和自营活动等。",
  "__其中通票活动占活动项目的多数__，客人凭活动票可直接参与该活动项目。但是活动现场也会存在凭票只享受一定优惠的额外付费项目，以及活动当天店家或个人在现场自行营业的收费活动。",
  "具体活动类型，活动事项详见后续发布的游园手册。",
  "",
  "Q2：活动票是否会限额限购？",
  "很抱歉由于游戏地图的玩家容载量和店家的客人接待能力有限，本次活动票将限额发放。",
  "限额方式分为当日放票限额和单次登记购票限额，若当日放票达到限额，翌日限额刷新后可以继续购票。想要多次购票的客人在前次购票登记提交后，__需等待一段时间__才能再次购票。",
  "",
  "Q3：我需要购买大量活动票 / 团队购票应该怎么做？",
  "需要购票 10 张以上的客人，请在__9月22日左右__在活动群（群号 453278026）私聊群主沟通购票事宜。",
  "由于存在上述放票限额，根据实时购票情况，团体票的数量和价格等方面可能无法让老板满意，对此深感抱歉。但我们保证在可行的范围内，尽全力满足每一位客人的需求。",
  "",
  "Q4：网站崩了 / 我连不上网站无法购票 / 购票后查不到我的登记怎么办？",
  "以上情况需要购票的客人，还请私聊群主进行沟通。为了提高沟通效率，麻烦您尽量提供您所持有的购票材料（网站错误信息 / 填写内容截图等），我们将及时为您处理。",
  "若网站出现故障，我们将尽量整理已有的信息，并在第一时间启动备用方案。感谢您对活动的理解和支持。",
  "",
  "Q5：提交购票登记后我随时都可以去取票吗？",
  "请加入活动群（群号 453278026），我们整理登记信息后将立即在群内发布购票名单，名单上显示的玩家即可在售票员上线时前往取票。",
  "为保证售票员正常工作，希望购票客人在名单公布后尽快前去取票。活动开始后再取票的客人，视现场工作繁忙程度可能会收取一定数额的取票手续费。",
  "",
  "Q6：填写后是否可以取消登记 / 取票后是否可以退票 / 活动票是否可以转让？",
  "请加入活动群（群号 453278026）私聊群主协商相关售后事宜，转让活动票还请私聊群主告知，原则上退票受理时间截止到活动开始。",
  "",
  "> 其他购票相关的问题请前往活动群（群号 453278026）私聊群主，感谢您对活动的支持！",
  "-- 花舞之街·薰风花语町",
].join("\n");

/* 购票须知排版语法见管理页「写法说明」；先整体转义再加标签 */
const guideInline = (text) => linkify(escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/__(.+?)__/g, "<u>$1</u>"));

function renderGuideMarkup(src) {
  const lines = String(src ?? "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let prices = null;   // [html]
  let ways = null;     // [{ title, body }]
  let qa = null;       // [{ q, body }]
  let list = null;     // { tag, items }
  let titled = false;

  /* 段落和列表写到哪里：问答里 → 当前回答；卡片里 → 当前卡片；否则 → 顶层 */
  const sink = () => (qa ? qa[qa.length - 1].body : ways ? ways[ways.length - 1].body : out);
  const closeList = () => {
    if (!list) return;
    const cls = list.tag === "ol" ? "guide-steps" : "guide-steps guide-bullets";
    sink().push(`<${list.tag} class="${cls}">${list.items.map((i) => `<li>${i}</li>`).join("")}</${list.tag}>`);
    list = null;
  };
  const closeBlocks = () => {
    closeList();
    if (prices) out.push(`<div class="guide-prices guide-n-${Math.min(prices.length, 3)}">${prices.join("")}</div>`);
    if (ways) {
      out.push(`<div class="guide-ways guide-n-${Math.min(ways.length, 3)}">${ways.map((w) =>
        `<div class="guide-way">${w.title ? `<h4>${w.title}</h4>` : ""}${w.body.join("")}</div>`).join("")}</div>`);
    }
    if (qa) out.push(`<dl class="guide-qa">${qa.map((x) => `<dt>${x.q}</dt><dd>${x.body.join("")}</dd>`).join("")}</dl>`);
    prices = ways = qa = null;
  };
  const pushList = (tag, item) => {
    if (prices) closeBlocks();
    if (list?.tag !== tag) {
      closeList();
      list = { tag, items: [] };
    }
    list.items.push(guideInline(item));
  };

  for (const raw of lines) {
    const t = raw.trim();
    let m;
    if (!t) closeList();
    else if ((m = /^\^\s*(.*)$/.exec(t))) {
      closeBlocks();
      out.push(`<p class="guide-eyebrow">${guideInline(m[1])}</p>`);
    } else if ((m = /^#\s+(.*)$/.exec(t))) {
      closeBlocks();
      out.push(`<h2 class="info-title guide-title"${titled ? "" : ' id="ticketGuideTitle"'}>${guideInline(m[1])}</h2>`);
      titled = true;
    } else if ((m = /^##\s+(.*)$/.exec(t))) {
      closeBlocks();
      out.push(`<h3 class="guide-h">${guideInline(m[1])}</h3>`);
    } else if ((m = /^###\s*(.*)$/.exec(t))) {
      closeList();
      if (prices || qa) closeBlocks();
      (ways ??= []).push({ title: guideInline(m[1]), body: [] });
    } else if ((m = /^\[票价\]\s*(.*)$/.exec(t))) {
      closeList();
      if (ways || qa) closeBlocks();
      const [name = "", price = "", label = "", time = ""] = m[1].split(/\s*[|｜]\s*/);
      const cut = price.search(/[/／]/);
      const num = cut >= 0 ? `${guideInline(price.slice(0, cut))}<small>${guideInline(price.slice(cut))}</small>` : guideInline(price);
      (prices ??= []).push(`<div class="guide-price"><span class="guide-price-name">${guideInline(name)}</span><b class="guide-price-num">${num}</b>`
        + (label ? `<span class="guide-price-label">${guideInline(label)}</span>` : "")
        + (time ? `<span class="guide-price-time">${guideInline(time)}</span>` : "") + "</div>");
    } else if (/^Q\d*\s*[：:]/i.test(t)) {
      closeList();
      if (ways || prices) closeBlocks();
      (qa ??= []).push({ q: guideInline(t), body: [] });
    } else if ((m = /^>\s*(.*)$/.exec(t))) {
      closeBlocks();
      out.push(`<p class="guide-end">${guideInline(m[1])}</p>`);
    } else if (/^-{3,}$/.test(t)) {
      closeBlocks();
      out.push('<hr class="guide-hr">');
    } else if ((m = /^(?:--|——)\s*(.+)$/.exec(t))) {
      closeBlocks();
      out.push(`<p class="guide-sign">${guideInline(m[1])}</p>`);
    } else if ((m = /^\d+[.．、]\s*(.*)$/.exec(t))) {
      pushList("ol", m[1]);
    } else if ((m = /^[-•·]\s+(.*)$/.exec(t))) {
      pushList("ul", m[1]);
    } else {
      /* 普通段落；问答里以「A：」开头的回答去掉「A：」 */
      closeList();
      if (prices) closeBlocks();
      sink().push(qa || ways ? `<p>${guideInline(qa ? t.replace(/^A\s*[：:]\s*/i, "") : t)}</p>` : `<p class="guide-p">${guideInline(t)}</p>`);
    }
  }
  closeBlocks();
  /* 弹窗靠 #ticketGuideTitle 读出标题；没写大标题时补一个只给读屏看的 */
  if (!titled) out.unshift('<h2 class="visually-hidden" id="ticketGuideTitle">购票须知</h2>');
  return out.join("\n");
}
