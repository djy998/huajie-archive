/* =============================================================================
   花舞之街 · 薰风花语町 —— 场地使用登记 venue.js
   -----------------------------------------------------------------------------
   原来首页「场地使用登记」卡片直接跳金数据问卷，现在改成站内表单（#venue），数据进 Worker 的 venue_bookings 表，
   管理员在内部入口的「场地预约」里查看、新增、修改、作废（见 admin.js 的 7c 节）。
   页面里紧跟 ticket.js 加载：
       <script src="ticket.js?v=3"></script>
       <script src="venue.js?v=1"></script>
       <script>initApp();</script>
   依赖主脚本：$、callWorker、setMsg、showToast、escapeHtml、showView、setRoute、captchaOn、siteLockdown、
   isLockedDown、GROUP_QQ、TURNSTILE_SITE_KEY；依赖 ticket.js：cnLocalToEpoch、epochToCnLocal。
   admin.js 也会用到这里的表单构建函数（buildVenueForm / readVenueForm / fillVenueForm）和文字对照表。
   改了本文件之后把 index.html 里 venue.js?v= 的数字 +1。

   题目、选项文字、显示逻辑都照搬金数据原问卷：
     - 先只显示第 1 题「申请身份」，选了之后其余题目才出现
     - 部队 → 多一题「部队名称或简称」（必填）；rp店/乐队/剧团等 → 多一题「团体名称」（选填）
     - 「其他」选项可以补充说明；日期只能选明天 ~ 90 天后（国服日期）
   选项的 key 要和 worker.js 的 VENUE_IDENTITIES / VENUE_PURPOSES / VENUE_PLACES 一致：
   只改文字不用动 Worker；增删选项时两边一起改。
   ============================================================================= */

const VENUE_HASH = "#venue";
const VENUE_TITLE = "场地使用登记";
const VENUE_INTRO = "感谢大人对【薰风花语町】与【花舞之街】的青睐和垂询！为了更好地对接您的需求，从而为您量身打造完美的活动体验，烦请协助提供以下信息。有任何疑问和需求等也欢迎在下方填写！";
const VENUE_MIN_DAYS = 1;    // 最早约明天
const VENUE_MAX_DAYS = 90;   // 最晚约 90 天后

const VENUE_IDENTITIES = [
  { key: "personal", label: "个人" },
  { key: "friends",  label: "亲友团" },
  { key: "team",     label: "部队" },
  { key: "rp",       label: "rp店/乐队/剧团等" },
  { key: "other",    label: "其他", other: true },
];
const VENUE_PURPOSES = [
  { key: "small",       label: "小型内部团建（8人及以下）" },
  { key: "large",       label: "大型内部团建（9人及以上）" },
  { key: "public_free", label: "对外活动（非盈利）" },
  { key: "public_paid", label: "对外活动（盈利）" },
  { key: "big_event",   label: "策划大型活动" },
  { key: "other",       label: "其他", other: true },
];
/* 场地：key 用门牌号（街区整体用 22-street / 23-street），文字可以随时改 */
const VENUE_PLACE_GROUPS = [
  {
    title: "22区 · 薰风花语町",
    places: [
      ["22-36", "22-36 毛坯房（未来规划）"],
      ["22-45", "22-45 毛坯房（未来规划）"],
      ["22-49", "22-49 紫苑浴场"],
      ["22-54", "22-54 垂丝棠茶室"],
      ["22-55", "22-55 卡特兰酒吧"],
      ["22-56", "22-56 金栗兰水族馆"],
      ["22-57", "22-57 铁线莲温馨小屋"],
      ["22-58", "22-58 高雪轮夜店"],
      ["22-59", "22-59 花滨匙服装店"],
      ["22-60", "22-60 三色堇剧院"],
      ["22-apt", "公寓3-17号房间-三色堇学园"],
      ["22-street", "22区扩建区南-花语町街区"],
    ],
  },
  {
    title: "23区 · 花舞之街",
    places: [
      ["23-31", "23-31 迷宫-沉船新月号"],
      ["23-32", "23-32 迷宫-切入"],
      ["23-33", "23-33 图书馆"],
      ["23-34", "23-34 迷宫-奇妙博物馆"],
      ["23-35", "23-35 大型舞台（使用需向房主支付300wgil）"],
      ["23-36", "23-36 迷宫-不醉不休"],
      ["23-37", "23-37 售票处"],
      ["23-38", "23-38 希冀部队房"],
      ["23-39", "23-39 夜店"],
      ["23-40", "23-40 教堂准备室"],
      ["23-41", "23-41 教堂"],
      ["23-42", "23-42 森系小舞台"],
      ["23-43", "23-43 《有间密室》场地（目前为舞台）"],
      ["23-44", "23-44 甜品屋"],
      ["23-45", "23-45 集训美术室"],
      ["23-49", "23-49 魔法屋"],
      ["23-52", "23-52 毛坯房（未来规划）"],
      ["23-street", "23区扩建区北-花舞之街街区"],
    ],
  },
  {
    /* 不是场地、但同样可以预约使用的项目 */
    title: "其他项目",
    places: [
      ["ticket-system", "花街购票系统"],
    ],
  },
];
const VENUE_PLACE_LABELS = new Map(VENUE_PLACE_GROUPS.flatMap((g) => g.places));

/* 题目文字（照搬金数据） */
const VENUE_TEXT = {
  identity: { label: "您的申请身份", desc: "使用意向为个人逛街/进店参观/挂机的客人，无需填写此登记表，感谢您对于我们的关注和支持！" },
  purpose:  { label: "您的使用意向" },
  teamName: { label: "您所代表部队的名称或简称" },
  groupName:{ label: "您所代表店家/乐队/剧团等团体的名称" },
  charId:   { label: "您或者团体代表的游戏角色id", desc: "如：乔薇塔@梦羽宝境" },
  contact:  { label: "您或者团体代表的联系方式", desc: "推荐qq或邮箱" },
  date:     { label: "您想要预约使用的日期", desc: "如果需要预约多个日期，麻烦您对应填写多个登记表，对此造成的不便表示歉意！" },
  places:   { label: "您想要预约使用的场地", desc: "场地在莫古力区-梦羽宝境-高脚孤丘22和23扩建区。场地情况可能会发生变动，敬请谅解" },
  service:  { label: "您是否想要活动相关服务？", desc: "我们尽量帮忙联系可能的店家或老师，具体费用和事项待您和对方商谈。" },
  remark:   { label: "备注栏", desc: "对于场地等任何询问、想法或需求都可以自由填写，我们在联系您时会做出答复！" },
};

const VENUE_ERRORS = {
  closed: "功能未开放，敬请谅解~",
  bad_identity: "请选择您的申请身份",
  bad_identity_other: "申请身份选了「其他」，请补充说明一下",
  bad_purpose: "请选择您的使用意向",
  bad_purpose_other: "使用意向选了「其他」，请补充说明一下",
  bad_team_name: "请填写您所代表部队的名称或简称",
  bad_char_id: "请填写游戏角色id",
  bad_contact: "请填写联系方式",
  bad_char_or_contact: "角色id和联系方式至少填一项",
  bad_date: "请选择预约日期",
  date_out_of_range: `只能预约明天到 ${VENUE_MAX_DAYS} 天后的日期`,
  bad_places: "请至少选择一个场地或项目",
  service_too_long: "「活动相关服务」写得太长了（最多 500 字）",
  remark_too_long: "备注太长了（最多 1000 字）",
  note_too_long: "管理备注太长了（最多 500 字）",
  bad_created_at: "提交时间不对（不能早于 2020 年，也不能晚于现在）",
  not_found: "这条登记已经不存在了，刷新一下列表",
  rate_limited: "提交太频繁了，请过一会儿再试",
  db_error: "登记表读写失败，请稍后再试（一直这样的话请联系管理员）",
  "unknown action": "网站后台还没更新，暂时无法登记，请联系活动群群主",
};

/* ---- 文字对照（管理页、结果页共用） ---- */
function venueChoiceText(list, key, otherText) {
  const o = list.find((x) => x.key === key);
  if (!o) return key || "";
  return o.other && otherText ? `${o.label}：${otherText}` : o.label;
}
const venueIdentityText = (item) => venueChoiceText(VENUE_IDENTITIES, item.identity, item.identityOther);
const venuePurposeText = (item) => venueChoiceText(VENUE_PURPOSES, item.purpose, item.purposeOther);
const venuePlaceLabel = (key) => VENUE_PLACE_LABELS.get(key) || key;

/* 国服日期 + N 天（YYYY-MM-DD） */
const venueCnDate = (days = 0) => new Date(Date.now() + 8 * 3600 * 1000 + days * 86400000).toISOString().slice(0, 10);
const VENUE_WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
function venueDateLabel(ymd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd || "")) return ymd || "";
  const [y, m, d] = ymd.split("-").map(Number);
  return `${y}年${m}月${d}日（周${VENUE_WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}）`;
}

/* =============================================================================
   表单构建（访客页、管理页共用）
   root 里的控件都用 data-vf="字段名" 标记，不靠 id，所以同一页面上可以有两份表单。
   opts.prefix：生成 id / name 用的前缀；opts.admin：管理页模式
     （多出「提交时间」「管理备注」，日期不限范围，部队名称 / 「其他」补充可空，角色id与联系方式至少一项）
   ============================================================================= */
function buildVenueForm(root, { prefix, admin = false }) {
  const id = (k) => `${prefix}-${k}`;
  const T = VENUE_TEXT;
  const sub = (text) => (text ? `<p class="ticket-sub">${escapeHtml(text)}</p>` : "");

  const choices = (name, list) => `
    <div class="venue-choices" role="radiogroup" aria-labelledby="${id(name)}-label">
      ${list.map((o) => `
        <label class="venue-choice">
          <input type="radio" name="${id(name)}" value="${o.key}" data-vf-radio="${name}">
          <span>${escapeHtml(o.label)}</span>
        </label>`).join("")}
    </div>
    <input type="text" class="venue-other" data-vf="${name}Other" maxlength="30"
           placeholder="请补充说明" aria-label="「其他」的补充说明" hidden>`;

  const radioField = (name, required, show) => `
    <div class="ticket-field venue-field" data-vf-field="${name}"${show ? ` data-show="${show}"` : ""}>
      <span class="ticket-label${required ? " is-required" : ""}" id="${id(name)}-label">${escapeHtml(T[name].label)}</span>
      ${sub(T[name].desc)}
      ${choices(name, name === "identity" ? VENUE_IDENTITIES : VENUE_PURPOSES)}
    </div>`;

  const textField = (name, { required, show, max, tag = "input", type = "text", desc, label }) => `
    <div class="ticket-field venue-field" data-vf-field="${name}"${show ? ` data-show="${show}"` : ""}>
      <label class="ticket-label${required ? " is-required" : ""}" for="${id(name)}">${escapeHtml(label || T[name].label)}</label>
      ${sub(desc !== undefined ? desc : T[name].desc)}
      ${tag === "textarea"
        ? `<textarea id="${id(name)}" data-vf="${name}" maxlength="${max}" placeholder="选填"></textarea>`
        : `<input type="${type}" id="${id(name)}" data-vf="${name}"${max ? ` maxlength="${max}"` : ""}>`}
    </div>`;

  const places = `
    <div class="ticket-field venue-field" data-vf-field="places" data-show="any">
      <span class="ticket-label is-required" id="${id("places")}-label">${escapeHtml(T.places.label)}</span>
      ${sub(T.places.desc)}
      <div class="venue-places" role="group" aria-labelledby="${id("places")}-label">
        ${VENUE_PLACE_GROUPS.map((g) => `
          <div class="venue-place-group">
            <p class="venue-place-title">${escapeHtml(g.title)}</p>
            <div class="venue-place-grid">
              ${g.places.map(([key, label]) => `
                <label class="venue-choice venue-place">
                  <input type="checkbox" value="${key}" data-vf-place>
                  <span>${escapeHtml(label)}</span>
                </label>`).join("")}
            </div>
          </div>`).join("")}
      </div>
    </div>`;

  root.innerHTML = [
    radioField("identity", true),
    radioField("purpose", true, "any"),
    textField("teamName", { required: !admin, show: "team", max: 40 }),
    textField("groupName", { required: false, show: "rp", max: 40 }),
    textField("charId", { required: !admin, show: "any", max: 40 }),
    textField("contact", { required: !admin, show: "any", max: 60,
      desc: admin ? "推荐qq或邮箱（后台录入时，角色id和联系方式至少填一项）" : undefined }),
    textField("date", { required: true, show: "any", type: "date",
      desc: admin ? "后台录入不限日期范围" : undefined }),
    places,
    textField("service", { show: "any", tag: "textarea", max: 500 }),
    textField("remark", { show: "any", tag: "textarea", max: 1000 }),
    admin ? textField("createdAt", { show: "any", type: "datetime-local", label: "提交时间（国服时间）",
      desc: "新增时留空 = 现在" }) : "",
    admin ? textField("adminNote", { show: "any", tag: "textarea", max: 500, label: "管理备注",
      desc: "只有管理员看得到，比如「已联系」「改到下周」" }) : "",
  ].join("");

  root.dataset.vfAdmin = admin ? "1" : "";
  root.addEventListener("change", (e) => {
    const r = e.target.closest("[data-vf-radio]");
    syncVenueForm(root);
    /* 刚选中「其他」：光标直接放进补充说明框 */
    if (r && r.value === "other" && r.checked) root.querySelector(`[data-vf="${r.dataset.vfRadio}Other"]`)?.focus();
  });
  syncVenueForm(root);
}

const venueRadio = (root, name) => root.querySelector(`[data-vf-radio="${name}"]:checked`)?.value || "";
const venueInput = (root, name) => root.querySelector(`[data-vf="${name}"]`);

/* 按第 1 题显示 / 隐藏其余题目（照搬金数据的显示规则） */
function syncVenueForm(root) {
  const identity = venueRadio(root, "identity");
  root.querySelectorAll("[data-show]").forEach((el) => {
    const rule = el.dataset.show;
    el.hidden = !identity || (rule !== "any" && rule !== identity);
  });
  ["identity", "purpose"].forEach((name) => {
    const other = venueInput(root, `${name}Other`);
    if (other) other.hidden = venueRadio(root, name) !== "other";
  });
  root.dispatchEvent(new CustomEvent("venue:sync", { detail: { identity } }));
}

/* 读表单：成功返回 { payload }，失败返回 { error, focus }。
   被隐藏的题目不交（和金数据一样：切换身份后，之前填的部队名称 / 团体名称作废） */
function readVenueForm(root) {
  const admin = root.dataset.vfAdmin === "1";
  const val = (name) => (venueInput(root, name)?.value || "").trim();
  const fail = (error, focus) => ({ error, focus });

  const identity = venueRadio(root, "identity");
  if (!identity) return fail(VENUE_ERRORS.bad_identity, root.querySelector('[data-vf-radio="identity"]'));
  const identityOther = identity === "other" ? val("identityOther") : "";
  if (identity === "other" && !identityOther && !admin) return fail(VENUE_ERRORS.bad_identity_other, venueInput(root, "identityOther"));

  const purpose = venueRadio(root, "purpose");
  if (!purpose) return fail(VENUE_ERRORS.bad_purpose, root.querySelector('[data-vf-radio="purpose"]'));
  const purposeOther = purpose === "other" ? val("purposeOther") : "";
  if (purpose === "other" && !purposeOther && !admin) return fail(VENUE_ERRORS.bad_purpose_other, venueInput(root, "purposeOther"));

  const teamName = identity === "team" ? val("teamName") : "";
  if (identity === "team" && !teamName && !admin) return fail(VENUE_ERRORS.bad_team_name, venueInput(root, "teamName"));
  const groupName = identity === "rp" ? val("groupName") : "";

  const charId = val("charId");
  const contact = val("contact");
  if (admin) {
    if (!charId && !contact) return fail(VENUE_ERRORS.bad_char_or_contact, venueInput(root, "charId"));
  } else {
    if (!charId) return fail(VENUE_ERRORS.bad_char_id, venueInput(root, "charId"));
    if (!contact) return fail(VENUE_ERRORS.bad_contact, venueInput(root, "contact"));
  }

  const date = val("date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(VENUE_ERRORS.bad_date, venueInput(root, "date"));
  if (!admin && (date < venueCnDate(VENUE_MIN_DAYS) || date > venueCnDate(VENUE_MAX_DAYS))) {
    return fail(`${VENUE_ERRORS.date_out_of_range}（${venueCnDate(VENUE_MIN_DAYS)} ~ ${venueCnDate(VENUE_MAX_DAYS)}）`, venueInput(root, "date"));
  }

  const places = [...root.querySelectorAll("[data-vf-place]:checked")].map((el) => el.value);
  if (!places.length) return fail(VENUE_ERRORS.bad_places, root.querySelector("[data-vf-place]"));

  const payload = {
    identity, identityOther, purpose, purposeOther, teamName, groupName, charId, contact, date, places,
    service: val("service"), remark: val("remark"),
  };
  if (admin) {
    payload.adminNote = val("adminNote");
    const at = val("createdAt");
    if (at) {
      const ms = cnLocalToEpoch(at);
      if (!ms) return fail(VENUE_ERRORS.bad_created_at, venueInput(root, "createdAt"));
      payload.createdAt = ms;
    }
  }
  return { payload };
}

function clearVenueForm(root) {
  root.querySelectorAll("input, textarea").forEach((el) => {
    if (el.type === "radio" || el.type === "checkbox") el.checked = false;
    else el.value = "";
  });
  syncVenueForm(root);
}

/* 把一条登记填回表单（管理页「修改」用） */
function fillVenueForm(root, item) {
  clearVenueForm(root);
  const check = (name, key) => {
    const el = root.querySelector(`[data-vf-radio="${name}"][value="${key}"]`);
    if (el) el.checked = true;
  };
  check("identity", item.identity);
  check("purpose", item.purpose);
  const set = (name, v) => { const el = venueInput(root, name); if (el) el.value = v || ""; };
  set("identityOther", item.identityOther);
  set("purposeOther", item.purposeOther);
  set("teamName", item.teamName);
  set("groupName", item.groupName);
  set("charId", item.charId);
  set("contact", item.contact);
  set("date", item.date);
  set("service", item.service);
  set("remark", item.remark);
  set("adminNote", item.adminNote);
  set("createdAt", item.createdAt ? epochToCnLocal(item.createdAt) : "");
  const places = new Set(item.places || []);
  root.querySelectorAll("[data-vf-place]").forEach((el) => { el.checked = places.has(el.value); });
  syncVenueForm(root);
}

/* 一条登记的「题目 → 答案」列表（结果页、管理页共用） */
function venueSummaryRows(item) {
  const rows = [
    ["申请身份", venueIdentityText(item)],
    ["使用意向", venuePurposeText(item)],
  ];
  if (item.teamName) rows.push(["部队名称", item.teamName]);
  if (item.groupName) rows.push(["团体名称", item.groupName]);
  rows.push(
    ["角色id", item.charId || "—"],
    ["联系方式", item.contact || "—"],
    ["预约日期", venueDateLabel(item.date)],
    ["预约场地", (item.places || []).map(venuePlaceLabel).join("\n")],
  );
  if (item.service) rows.push(["活动服务", item.service]);
  if (item.remark) rows.push(["备注", item.remark]);
  return rows;
}


/* =============================================================================
   访客页 #venue
   ============================================================================= */
const venueState = { proof: null, submitting: false, gateOpened: false };
let venueGate = null;

function setVenueMode(mode, blockedText = "") {
  $("venueBlocked").hidden = mode !== "blocked";
  $("venueBlocked").textContent = blockedText;
  $("venueForm").hidden = mode !== "form";
  $("venueResult").hidden = mode !== "result";
}

/* 日期框的可选范围每天都在变：每次进页面重新设 */
function applyVenueDateRange() {
  const el = venueInput($("venueFields"), "date");
  el.min = venueCnDate(VENUE_MIN_DAYS);
  el.max = venueCnDate(VENUE_MAX_DAYS);
}

async function openVenueView() {
  showView("view-venue");
  document.title = `${VENUE_TITLE} · 花舞之街`;
  applyVenueDateRange();
  if (!$("venueResult").hidden) {   // 上次登记完又进来：回到空白表单
    clearVenueForm($("venueFields"));
    resetVenueCaptcha();
  }
  setVenueMode(siteLockdown ? "blocked" : "form", siteLockdown ? STATIC_MODE_MSG : "");
  maybeOpenVenueGate();
  /* 再问一次「分享功能开关」：管理员刚关掉的话，这里就挡住 */
  if (await isLockedDown() && !$("view-venue").hidden) {
    setVenueMode("blocked", STATIC_MODE_MSG);
  } else if (!$("view-venue").hidden && $("venueResult").hidden) {
    setVenueMode("form");
    maybeOpenVenueGate();
  }
}

/* 人机验证：选了第 1 题（其余题目和提交按钮出现）之后才出题，不打扰只是点进来看看的访客 */
function initVenueCaptcha() {
  if (!captchaOn) { $("venueVerify").hidden = true; return; }
  if (!window.HJVerify) { console.error("[验证] verify.js 没有加载成功，场地登记的人机验证不可用"); return; }
  venueGate = HJVerify.createGate($("venueVerify"), {
    post: callWorker,
    turnstileSiteKey: TURNSTILE_SITE_KEY,
    onPass: (proof) => {
      venueState.proof = proof;
      setMsg($("venueMsg"), "");
    },
  });
}

function maybeOpenVenueGate() {
  const host = $("venueVerify");
  host.hidden = !captchaOn;
  if (!captchaOn || venueState.gateOpened) return;
  if ($("view-venue").hidden || $("venueForm").hidden) return;
  if (!venueRadio($("venueFields"), "identity")) return;
  if (!venueGate) initVenueCaptcha();
  if (!venueGate) return;
  venueState.proof = null;
  venueGate.open();
  venueState.gateOpened = true;
}

/* 机器人验证总开关变了（主脚本 applyCaptchaEnabled 调用） */
function syncVenueCaptcha(changed) {
  const host = $("venueVerify");
  if (host) host.hidden = !captchaOn;
  if (!changed) return;
  if (captchaOn) {
    venueState.gateOpened = false;
    maybeOpenVenueGate();
  } else {
    venueState.proof = null;
    if (venueGate) venueGate.hide();
    venueState.gateOpened = false;
  }
}

function resetVenueCaptcha() {
  venueState.proof = null;
  if (captchaOn && venueGate && venueState.gateOpened) venueGate.refresh();
}

async function submitVenue(e) {
  e.preventDefault();
  if (venueState.submitting) return;
  const msg = $("venueMsg");
  const form = readVenueForm($("venueFields"));
  if (form.error) {
    setMsg(msg, form.error);
    form.focus?.focus();
    return;
  }
  const proof = venueState.proof;
  if (captchaOn && !proof) {
    setMsg(msg, venueGate
      ? "请先完成下方的人机验证（自动验证，或点「自动验证不成功？点击手动验证」换手动验证）"
      : "人机验证组件没加载出来，刷新页面再试一次");
    return;
  }

  setMsg(msg, "");
  venueState.submitting = true;
  const btn = $("venueSubmitBtn");
  btn.disabled = true;
  btn.textContent = "提交中…";
  const data = await callWorker({ action: "submit_venue", ...form.payload, ...(proof || {}) });
  venueState.submitting = false;
  btn.disabled = false;
  btn.textContent = "提交";
  /* Worker 在「未开放 / 表单不对 / 限流」时还没走到验证那一步，凭证没被用掉，不用重做验证 */
  const PRE_VERIFY = ["closed", "rate_limited", "bad_identity", "bad_identity_other", "bad_purpose", "bad_purpose_other",
    "bad_team_name", "bad_char_id", "bad_contact", "bad_date", "date_out_of_range", "bad_places",
    "service_too_long", "remark_too_long", "unknown action"];
  if (!(data && !data.ok && PRE_VERIFY.includes(data.error))) resetVenueCaptcha();

  if (!data) {
    setMsg(msg, `连接中断，无法确认是否登记成功。可以加活动群（群号 ${GROUP_QQ}）私聊群主确认，确认没收到再重新提交`);
    return;
  }
  if (!data.ok) {
    if (data.error === "closed") {
      siteLockdown = true;
      setVenueMode("blocked", STATIC_MODE_MSG);
      showToast(STATIC_MODE_MSG);
      return;
    }
    if (data.error === "captcha") {
      setMsg(msg, "人机验证未通过或已过期，已换一题，请重新验证后提交");
      return;
    }
    setMsg(msg, VENUE_ERRORS[data.error] || "提交失败，请稍后再试");
    return;
  }
  showVenueResult(form.payload, data);
}

function showVenueResult(p, data) {
  $("venueResultTitle").textContent = `登记成功 · 编号 ${data.id}`;
  $("venueResultNote").textContent =
    `我们会尽快通过您留下的联系方式与您联系。需要预约多个日期的话，点下方按钮再登记一份（已填的内容会保留）。`;
  $("venueResultList").innerHTML = venueSummaryRows(p)
    .map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join("");
  setVenueMode("result");
  $("venueResult").scrollIntoView({ behavior: "smooth", block: "center" });
}

/* 再登记一个日期：保留已填内容，只清空日期 */
function venueAgain() {
  const root = $("venueFields");
  venueInput(root, "date").value = "";
  applyVenueDateRange();
  setMsg($("venueMsg"), "");
  setVenueMode("form");
  if (captchaOn && venueGate) {
    if (venueState.gateOpened) venueGate.refresh();
    else maybeOpenVenueGate();
  }
  const date = venueInput(root, "date");
  date.scrollIntoView({ behavior: "smooth", block: "center" });
  date.focus({ preventScroll: true });
}

function initVenue() {
  const root = $("venueFields");
  const submitArea = document.querySelector("#venueForm [data-venue-submit]");
  /* 和其余题目一样：选了第 1 题之后，验证和提交按钮才出现 */
  root.addEventListener("venue:sync", (e) => {
    submitArea.hidden = !e.detail.identity;
    maybeOpenVenueGate();
  });
  buildVenueForm(root, { prefix: "vf" });
  /* 改了内容就把上一次的报错收起来，免得改好了还挂着旧提示 */
  root.addEventListener("input", () => setMsg($("venueMsg"), ""));
  root.addEventListener("change", () => setMsg($("venueMsg"), ""));
  $("venueIntro").textContent = VENUE_INTRO;
  $("venueForm").addEventListener("submit", submitVenue);
  $("venueAgainBtn").addEventListener("click", venueAgain);
}
