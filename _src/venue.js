/* 花舞之街 · 场地使用登记。选项 key 与 Worker 一致 */
const VENUE_TITLE = "场地使用登记";
const VENUE_INTRO = "感谢大人对【薰风花语町】与【花舞之街】的青睐和垂询！为了更好地对接您的需求，从而为您量身打造完美的活动体验，烦请协助提供以下信息。有任何疑问和需求等也欢迎在下方填写！";
const VENUE_MIN_DAYS = 1;
const VENUE_MAX_DAYS = 90;

const VENUE_IDENTITIES = [
  { key: "personal", label: "个人" },
  { key: "friends", label: "亲友团" },
  { key: "team", label: "部队" },
  { key: "rp", label: "rp店/乐队/剧团等" },
  { key: "other", label: "其他", other: true },
];
const VENUE_PURPOSES = [
  { key: "small", label: "小型内部团建（8人及以下）" },
  { key: "large", label: "大型内部团建（9人及以上）" },
  { key: "public_free", label: "对外活动（非盈利）" },
  { key: "public_paid", label: "对外活动（盈利）" },
  { key: "big_event", label: "策划大型活动" },
  { key: "other", label: "其他", other: true },
];
/* 场地：key 用门牌号（街区整体为 22-street / 23-street），文字可以随时改 */
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
    title: "其他项目",
    places: [
      ["ticket-system", "花街购票系统"],
    ],
  },
];
const VENUE_PLACE_LABELS = new Map(VENUE_PLACE_GROUPS.flatMap((g) => g.places));

const VENUE_TEXT = {
  identity: { label: "您的申请身份", desc: "使用意向为个人逛街/进店参观/挂机的客人，无需填写此登记表，感谢您对于我们的关注和支持！" },
  purpose: { label: "您的使用意向" },
  teamName: { label: "您所代表部队的名称或简称" },
  groupName: { label: "您所代表店家/乐队/剧团等团体的名称" },
  charId: { label: "您或者团体代表的游戏角色id", desc: "如：乔薇塔@梦羽宝境" },
  contact: { label: "您或者团体代表的联系方式", desc: "QQ 或邮箱等" },
  date: { label: "您想要预约使用的日期", desc: "如果需要预约多个日期，麻烦您对应填写多个登记表，对此造成的不便表示歉意！" },
  places: { label: "您想要预约使用的场地", desc: "场地在莫古力区-梦羽宝境-高脚孤丘22和23扩建区。场地情况可能会发生变动，敬请谅解" },
  service: { label: "您是否想要活动相关服务？", desc: "我们尽量帮忙联系可能的店家或老师，具体费用和事项待您和对方商谈。" },
  remark: { label: "备注", desc: "对于场地等任何询问、想法或需求都可以自由填写，我们在联系您时会做出答复！" },
};

const VENUE_ERRORS = {
  closed: STATIC_MODE_MSG,
  bad_identity: "请选择申请身份",
  bad_identity_other: "请补充申请身份",
  bad_purpose: "请选择您的使用意向",
  bad_purpose_other: "请补充使用意向",
  bad_team_name: "请填写部队名称",
  bad_char_id: "请填写角色 id",
  bad_contact: "请填写联系方式",
  bad_char_or_contact: "角色 id 与联系方式至少填一项",
  bad_date: "请选择预约日期",
  date_out_of_range: `仅可预约明天起 ${VENUE_MAX_DAYS} 天内的日期`,
  bad_places: "请至少选择一个场地或项目",
  service_too_long: "活动相关服务最多 500 字",
  remark_too_long: "备注最多 1000 字",
  note_too_long: "管理备注最多 500 字",
  bad_created_at: "提交时间无效",
  not_found: "登记不存在，请刷新列表",
  rate_limited: "提交过于频繁，请稍后再试",
  server_error: "服务器错误，请稍后再试",
  unknown_action: "网站后台暂时无法接收登记，请联系活动群群主",
};

/* 文字对照（结果页、管理页共用） */
function venueChoiceText(list, key, otherText) {
  const o = list.find((x) => x.key === key);
  if (!o) return key || "";
  return o.other && otherText ? `${o.label}：${otherText}` : o.label;
}
const venueIdentityText = (item) => venueChoiceText(VENUE_IDENTITIES, item.identity, item.identityOther);
const venuePurposeText = (item) => venueChoiceText(VENUE_PURPOSES, item.purpose, item.purposeOther);
const venuePlaceLabel = (key) => VENUE_PLACE_LABELS.get(key) || key;

const VENUE_WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
function venueDateLabel(ymd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd || "")) return ymd || "";
  const [y, m, d] = ymd.split("-").map(Number);
  return `${y}年${m}月${d}日（周${VENUE_WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}）`;
}

/* 表单（访客页与管理页共用），字段以 data-vf 标记；admin 模式放宽必填与日期范围 */
function buildVenueForm(root, { prefix, admin = false }) {
  const id = (k) => `${prefix}-${k}`;
  const T = VENUE_TEXT;
  const sub = (text) => (text ? `<p class="ticket-sub">${escapeHtml(text)}</p>` : "");
  const showAttr = (show) => (show ? ` data-show="${show}"` : "");

  const radioField = (name, list, show) => `
    <div class="ticket-field venue-field" data-vf-field="${name}"${showAttr(show)}>
      <span class="ticket-label is-required" id="${id(name)}-label">${escapeHtml(T[name].label)}</span>
      ${sub(T[name].desc)}
      <div class="venue-choices" role="radiogroup" aria-labelledby="${id(name)}-label">
        ${list.map((o) => `<label class="venue-choice"><input type="radio" name="${id(name)}" value="${o.key}" data-vf-radio="${name}"><span>${escapeHtml(o.label)}</span></label>`).join("")}
      </div>
      <input type="text" class="venue-other" data-vf="${name}Other" maxlength="30" placeholder="请补充说明" aria-label="「其他」的补充说明" hidden>
    </div>`;

  const textField = (name, { required = false, show = "any", max, tag = "input", type = "text", desc = T[name]?.desc, label = T[name].label }) => `
    <div class="ticket-field venue-field" data-vf-field="${name}"${showAttr(show)}>
      <label class="ticket-label${required ? " is-required" : ""}" for="${id(name)}">${escapeHtml(label)}</label>
      ${sub(desc)}
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
              ${g.places.map(([key, label]) => `<label class="venue-choice venue-place"><input type="checkbox" value="${key}" data-vf-place><span>${escapeHtml(label)}</span></label>`).join("")}
            </div>
          </div>`).join("")}
      </div>
    </div>`;

  root.innerHTML = [
    radioField("identity", VENUE_IDENTITIES),
    radioField("purpose", VENUE_PURPOSES, "any"),
    textField("teamName", { required: !admin, show: "team", max: 40 }),
    textField("groupName", { show: "rp", max: 40 }),
    textField("charId", { required: !admin, max: 40 }),
    textField("contact", { required: !admin, max: 60, desc: admin ? "与角色 id 至少填一项" : T.contact.desc }),
    textField("date", { required: true, type: "date", desc: admin ? "不限日期范围" : T.date.desc }),
    places,
    textField("service", { tag: "textarea", max: 500 }),
    textField("remark", { tag: "textarea", max: 1000 }),
    admin ? textField("createdAt", { type: "datetime-local", label: "提交时间", desc: "留空为当前时间" }) : "",
    admin ? textField("adminNote", { tag: "textarea", max: 500, label: "管理备注", desc: "仅管理员可见" }) : "",
  ].join("");

  root.dataset.vfAdmin = admin ? "1" : "";
  root.addEventListener("change", (e) => {
    syncVenueForm(root);
    /* 刚选中「其他」：光标直接放进补充说明框 */
    const r = e.target.closest("[data-vf-radio]");
    if (r && r.value === "other" && r.checked) venueInput(root, `${r.dataset.vfRadio}Other`).focus();
  });
  syncVenueForm(root);
}

const venueRadio = (root, name) => root.querySelector(`[data-vf-radio="${name}"]:checked`)?.value || "";
const venueInput = (root, name) => root.querySelector(`[data-vf="${name}"]`);

/* 按第 1 题显示 / 隐藏其余题目 */
function syncVenueForm(root) {
  const identity = venueRadio(root, "identity");
  root.querySelectorAll("[data-show]").forEach((el) => {
    const rule = el.dataset.show;
    el.hidden = !identity || (rule !== "any" && rule !== identity);
  });
  ["identity", "purpose"].forEach((name) => { venueInput(root, `${name}Other`).hidden = venueRadio(root, name) !== "other"; });
  root.dispatchEvent(new CustomEvent("venue:sync", { detail: { identity } }));
}

/* 读表单：{ payload } 或 { error, focus }；隐藏的题目不提交 */
function readVenueForm(root) {
  const admin = root.dataset.vfAdmin === "1";
  const val = (name) => (venueInput(root, name)?.value || "").trim();
  const fail = (error, name) => ({ error, focus: venueInput(root, name) || root.querySelector(`[data-vf-radio="${name}"]`) });

  const identity = venueRadio(root, "identity");
  if (!identity) return fail(VENUE_ERRORS.bad_identity, "identity");
  const identityOther = identity === "other" ? val("identityOther") : "";
  if (identity === "other" && !identityOther && !admin) return fail(VENUE_ERRORS.bad_identity_other, "identityOther");

  const purpose = venueRadio(root, "purpose");
  if (!purpose) return fail(VENUE_ERRORS.bad_purpose, "purpose");
  const purposeOther = purpose === "other" ? val("purposeOther") : "";
  if (purpose === "other" && !purposeOther && !admin) return fail(VENUE_ERRORS.bad_purpose_other, "purposeOther");

  const teamName = identity === "team" ? val("teamName") : "";
  if (identity === "team" && !teamName && !admin) return fail(VENUE_ERRORS.bad_team_name, "teamName");
  const groupName = identity === "rp" ? val("groupName") : "";

  const charId = val("charId");
  const contact = val("contact");
  if (admin && !charId && !contact) return fail(VENUE_ERRORS.bad_char_or_contact, "charId");
  if (!admin && !charId) return fail(VENUE_ERRORS.bad_char_id, "charId");
  if (!admin && !contact) return fail(VENUE_ERRORS.bad_contact, "contact");

  const date = val("date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(VENUE_ERRORS.bad_date, "date");
  const [first, last] = [cnDate(VENUE_MIN_DAYS), cnDate(VENUE_MAX_DAYS)];
  if (!admin && (date < first || date > last)) return fail(`${VENUE_ERRORS.date_out_of_range}（${first} ~ ${last}）`, "date");

  const places = [...root.querySelectorAll("[data-vf-place]:checked")].map((el) => el.value);
  if (!places.length) return { error: VENUE_ERRORS.bad_places, focus: root.querySelector("[data-vf-place]") };

  const payload = {
    identity, identityOther, purpose, purposeOther, teamName, groupName, charId, contact, date, places,
    service: val("service"), remark: val("remark"),
  };
  if (admin) {
    payload.adminNote = val("adminNote");
    const at = val("createdAt");
    if (at) {
      payload.createdAt = cnLocalToEpoch(at);
      if (!payload.createdAt) return fail(VENUE_ERRORS.bad_created_at, "createdAt");
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

/* 把一条登记填回表单（管理页「修改」） */
function fillVenueForm(root, item) {
  clearVenueForm(root);
  ["identity", "purpose"].forEach((name) => {
    const el = root.querySelector(`[data-vf-radio="${name}"][value="${item[name]}"]`);
    if (el) el.checked = true;
  });
  ["identityOther", "purposeOther", "teamName", "groupName", "charId", "contact", "date", "service", "remark", "adminNote"].forEach((name) => {
    const el = venueInput(root, name);
    if (el) el.value = item[name] || "";
  });
  const at = venueInput(root, "createdAt");
  if (at) at.value = item.createdAt ? epochToCnLocal(item.createdAt) : "";
  const places = new Set(item.places || []);
  root.querySelectorAll("[data-vf-place]").forEach((el) => { el.checked = places.has(el.value); });
  syncVenueForm(root);
}

/* 一条登记的「题目 → 答案」（结果页、管理页共用） */
function venueSummaryRows(item) {
  const rows = [["申请身份", venueIdentityText(item)], ["使用意向", venuePurposeText(item)]];
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

/* 访客页 ------------------------------------------------------------------------------------ */
let venueGate = null;
let venueSubmitting = false;

function setVenueMode(mode, text = "") {
  setMsg($("venueBlocked"), mode === "blocked" ? text : "");
  $("venueForm").hidden = mode !== "form";
  $("venueResult").hidden = mode !== "result";
  if (mode === "form") venueGate.open();
}

/* 日期的可选范围每天都在变：每次进页面重新设 */
function applyVenueDateRange() {
  const el = venueInput($("venueFields"), "date");
  el.min = cnDate(VENUE_MIN_DAYS);
  el.max = cnDate(VENUE_MAX_DAYS);
}

async function openVenueView() {
  showView("view-venue");
  document.title = `${VENUE_TITLE} · 花舞之街`;
  applyVenueDateRange();
  if (!$("venueResult").hidden) {   // 登记完又进来：空白表单，验证等选了第 1 题再出
    clearVenueForm($("venueFields"));
    venueGate.close();
  }
  setVenueMode(siteLockdown ? "blocked" : "form", STATIC_MODE_MSG);
  /* 再确认一次分享功能开关：管理员刚关掉的话这里挡住 */
  const locked = await isLockedDown();
  if (!$("view-venue").hidden && $("venueResult").hidden) setVenueMode(locked ? "blocked" : "form", STATIC_MODE_MSG);
}

async function submitVenue(e) {
  e.preventDefault();
  if (venueSubmitting) return;
  const msg = $("venueMsg");
  const form = readVenueForm($("venueFields"));
  if (form.error) {
    setMsg(msg, form.error);
    form.focus?.focus();
    return;
  }
  const need = venueGate.missing();
  if (need) { setMsg(msg, need); return; }

  setMsg(msg, "");
  venueSubmitting = true;
  const btn = $("venueSubmitBtn");
  btn.disabled = true;
  btn.textContent = "提交中…";
  const data = await callWorker({ action: "submit_venue", ...form.payload, ...venueGate.proof() });
  venueSubmitting = false;
  btn.disabled = false;
  btn.textContent = "提交";
  venueGate.afterSubmit(data);

  if (!data) {
    setMsg(msg, `网络中断，请联系活动群 ${GROUP_QQ} 群主确认是否已登记`);
  } else if (data.ok) {
    showVenueResult(form.payload, data);
  } else if (data.error === "closed") {
    siteLockdown = true;
    setVenueMode("blocked", STATIC_MODE_MSG);
    showToast(STATIC_MODE_MSG);
  } else {
    setMsg(msg, data.error === "captcha" ? CAPTCHA_FAILED_MSG : VENUE_ERRORS[data.error] || "提交失败，请稍后再试");
  }
}

function showVenueResult(p, data) {
  $("venueResultTitle").textContent = `登记成功 · 编号 ${data.id}`;
  $("venueResultNote").textContent = "我们会尽快与您联系。预约多个日期请再登记一份，已填内容会保留。";
  $("venueResultList").innerHTML = venueSummaryRows(p).map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join("");
  setVenueMode("result");
  $("venueResult").scrollIntoView({ behavior: "smooth", block: "center" });
}

/* 再登记一个日期：保留已填内容，只清空日期 */
function venueAgain() {
  const date = venueInput($("venueFields"), "date");
  date.value = "";
  applyVenueDateRange();
  setMsg($("venueMsg"), "");
  setVenueMode("form");
  date.scrollIntoView({ behavior: "smooth", block: "center" });
  date.focus({ preventScroll: true });
}

function initVenue() {
  const root = $("venueFields");
  const submitArea = document.querySelector("#venueForm [data-venue-submit]");
  /* 选择申请身份后才出题 */
  venueGate = createFormGate($("venueVerify"), {
    shouldOpen: () => !$("view-venue").hidden && !$("venueForm").hidden && !!venueRadio(root, "identity"),
    onPass: () => setMsg($("venueMsg"), ""),
  });
  root.addEventListener("venue:sync", (e) => {
    submitArea.hidden = !e.detail.identity;
    venueGate.open();
  });
  buildVenueForm(root, { prefix: "vf" });
  /* 改了内容就收起上一次的报错 */
  root.addEventListener("input", () => setMsg($("venueMsg"), ""));
  root.addEventListener("change", () => setMsg($("venueMsg"), ""));
  $("venueIntro").textContent = VENUE_INTRO;
  $("venueForm").addEventListener("submit", submitVenue);
  $("venueAgainBtn").addEventListener("click", venueAgain);
}
