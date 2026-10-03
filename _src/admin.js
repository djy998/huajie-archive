/* 花舞之街 · 管理页，进入 #internal 时加载 */

/* ==== 1. 内部入口与公告板 ==== */
/* 密码由 Worker 校验：A / B 仅公告，C 为管理员，查看密码进入只读页 */
function adminErr(data, fallback, map = {}) {
  if (!data) return "连接失败，检查一下网络后再试";
  if (map[data.error]) return map[data.error];
  if (data.error === "auth" || !data.error) return "登录已失效，请重新登录";
  if (data.error === "rate_limited") return "操作过于频繁，请稍后再试";
  if (data.error === "server_error") return "服务器出错，请稍后再试";
  return fallback;
}

/* 提交记录的 IP 属地（Worker 存「国家|地区|城市」）与验证方式 */
const VERIFY_MODE_NAMES = { cf: "自动验证", ff14: "狒科生", poem: "文科生", math: "理科生", manual: "手动验证", off: "验证已关闭" };
const CN_REGIONS = {
  Beijing: "北京", Tianjin: "天津", Hebei: "河北", Shanxi: "山西", "Inner Mongolia": "内蒙古", Liaoning: "辽宁",
  Jilin: "吉林", Heilongjiang: "黑龙江", Shanghai: "上海", Jiangsu: "江苏", Zhejiang: "浙江", Anhui: "安徽",
  Fujian: "福建", Jiangxi: "江西", Shandong: "山东", Henan: "河南", Hubei: "湖北", Hunan: "湖南", Guangdong: "广东",
  Guangxi: "广西", Hainan: "海南", Chongqing: "重庆", Sichuan: "四川", Guizhou: "贵州", Yunnan: "云南",
  Tibet: "西藏", Shaanxi: "陕西", Gansu: "甘肃", Qinghai: "青海", Ningxia: "宁夏", Xinjiang: "新疆",
};
const COUNTRY_SHORT = { HK: "香港", MO: "澳门", TW: "台湾", XX: "未知", T1: "未知" };
let countryNames = null;

function countryName(code) {
  if (COUNTRY_SHORT[code]) return COUNTRY_SHORT[code];
  try {
    countryNames ??= new Intl.DisplayNames(["zh-CN"], { type: "region" });
    return countryNames.of(code) || code;
  } catch (e) {
    return code;
  }
}

function geoText(geo) {
  const [country = "", region = ""] = String(geo || "").split("|");
  if (!country) return "";
  if (country !== "CN") return [countryName(country), region].filter(Boolean).join(" ");
  const key = Object.keys(CN_REGIONS).find((k) => region === k || region.startsWith(k + " "));
  return key ? CN_REGIONS[key] : ["中国", region].filter(Boolean).join(" ");
}

const geoTitle = (geo) => String(geo || "").split("|").filter(Boolean).join(" / ");
const verifyModeText = (mode) => VERIFY_MODE_NAMES[mode] || "";
/* 「广东 · 狒科生」，悬停显示完整属地 */
function submitMetaHtml(item) {
  const text = [geoText(item.geo), verifyModeText(item.verifyMode)].filter(Boolean).join(" · ");
  return text ? `<span class="submit-meta" title="${escapeHtml(geoTitle(item.geo))}">${escapeHtml(text)}</span>` : "";
}

let internalAdminPassword = null;
let editingAnnouncementId = null;
let pendingAnnouncementImageUrl = null;

/* 密码累计错误每满 5 次需人机验证 */
const PW_FAIL_CAPTCHA_EVERY = 5;
const getPwFailCount = () => Number(storage.get(STORE.pwFails)) || 0;
function setPwFailCount(n) {
  if (n > 0) storage.set(STORE.pwFails, n);
  else storage.remove(STORE.pwFails);
}

function initInternal() {
  $("internalSubmit").addEventListener("click", checkInternalPassword);
  $("internalPassword").addEventListener("keydown", (e) => {
    if (e.key === "Enter") checkInternalPassword();
  });
  $("internalPasswordShow").addEventListener("change", (e) => {
    $("internalPassword").type = e.target.checked ? "text" : "password";
  });
}

async function checkInternalPassword() {
  const input = $("internalPassword");
  const msg = $("internalMsg");
  const btn = $("internalSubmit");

  if (!WORKER_URL) {
    setMsg(msg, "数据库还没配置好，暂时无法验证密码。");
    return;
  }
  btn.disabled = true;
  setMsg(msg, "验证中…");
  const data = await callWorker({ action: "get_announcements", password: input.value });
  btn.disabled = false;

  if (!data) {
    setMsg(msg, "连接失败，检查一下网络后再试");
    return;
  }
  if (data.error === "viewer_closed") {
    setMsg(msg, "「购票情况」已关闭");
    return;
  }
  if (!data.ok) {
    const fails = getPwFailCount() + 1;
    setPwFailCount(fails);
    if (fails % PW_FAIL_CAPTCHA_EVERY === 0) {
      setMsg(msg, "密码错误次数过多，请完成人机验证");
      openCaptcha("internal");
    } else {
      setMsg(msg, "密码错误");
    }
    return;
  }

  setPwFailCount(0);
  setMsg(msg, "");
  $("internalGate").hidden = true;
  if (data.isViewer) {
    enterTicketViewer(input.value, data.perms);
    return;
  }
  $("internalBoard").hidden = false;
  renderAnnouncements(data.items, data.isAdmin);

  $("adminPills").hidden = !data.isAdmin;
  if (data.isAdmin) internalAdminPassword = input.value;
}

/* D1 的 datetime('now') 为 UTC 文本，Safari 无法直接解析，手动按 UTC 读取 */
function announcementDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(value || ""));
  const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])) : new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" });
}

function renderAnnouncements(items, isAdmin) {
  const list = $("announcementList");
  if (!items || !items.length) {
    list.innerHTML = `<div class="empty-note">暂无公告</div>`;
    return;
  }

  list.innerHTML = items.map((a) => {
    let tag = "";
    let adminBtns = "";
    if (isAdmin) {
      const targets = [a.show_a && "A", a.show_b && "B"].filter(Boolean);
      tag = `<span class="announcement-audience">[${targets.length ? targets.join("+") : "不可见"}]</span>`;
      adminBtns = `
        <div class="announcement-admin-btns">
          <button type="button" class="announcement-edit-btn" data-id="${a.id}">编辑</button>
          <button type="button" class="announcement-delete-btn" data-id="${a.id}">删除</button>
        </div>`;
    }
    const imageHtml = a.image_url
      ? `<img src="${escapeHtml(workerImageUrl(a.image_url))}" loading="lazy" class="announcement-image" data-lightbox>`
      : "";
    return `
      <div class="announcement">
        <div class="date">${escapeHtml(announcementDate(a.created_at))}${tag}</div>
        <div class="body">${escapeHtml(a.body)}</div>
        ${imageHtml}
        ${adminBtns}
      </div>`;
  }).join("");

  if (!isAdmin) return;
  list.querySelectorAll(".announcement-edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = items.find((x) => String(x.id) === btn.dataset.id);
      if (item) startEditAnnouncement(item);
    });
  });
  list.querySelectorAll(".announcement-delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => deleteAnnouncement(btn.dataset.id));
  });
}

async function refreshAnnouncements() {
  const data = await callWorker({ action: "get_announcements", password: internalAdminPassword });
  if (data && data.ok) renderAnnouncements(data.items, data.isAdmin);
}

/* 配图（公告、弹窗公告共用）：压缩为 WebP 后上传 ---------------------------------------- */
const IMAGE_MAX_BYTES = 50 * 1024 * 1024;

function showImagePreview(prefix, url) {
  const img = $(`${prefix}PreviewImg`);
  if (url) img.src = workerImageUrl(url);
  else img.removeAttribute("src");
  $(`${prefix}Preview`).hidden = !url;
}

const readAsDataURL = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error("read fail"));
  reader.readAsDataURL(blob);
});

/* 长边不超过 maxDim；过大时降低质量和尺寸重试 */
async function compressImage(file, maxDim) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode fail"));
      el.src = url;
    });
    for (const [k, quality] of [[1, 0.88], [1, 0.8], [0.78, 0.8], [0.62, 0.75]]) {
      const scale = Math.min(1, (maxDim * k) / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
      if (!blob) throw new Error("encode fail");
      const base64 = (await readAsDataURL(blob)).split(",")[1];
      if (base64.length <= 7.5 * 1024 * 1024) return { base64, contentType: blob.type || "image/webp" };
    }
    throw new Error("too large");
  } finally {
    URL.revokeObjectURL(url);
  }
}

const IMAGE_UPLOAD_TEXT = {
  notImage: "请选择图片",
  tooBig: () => "图片不能超过 50MB",
  processing: "处理中…",
  decodeFail: "无法读取该图片",
  rateLimited: "上传过于频繁，请稍后再试",
  failed: "上传失败，请重试",
};

function bindImageUpload(prefix, maxDim, onChange, text = IMAGE_UPLOAD_TEXT) {
  const input = $(`${prefix}Input`);
  const pick = $(`${prefix}PickBtn`);
  const status = $(`${prefix}Status`);
  pick.addEventListener("click", () => input.click());
  $(`${prefix}RemoveBtn`).addEventListener("click", () => onChange(null));
  input.addEventListener("change", async () => {
    const file = input.files[0];
    input.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setMsg(status, text.notImage); return; }
    if (file.size > IMAGE_MAX_BYTES) { setMsg(status, text.tooBig(file)); return; }
    setMsg(status, text.processing);
    pick.disabled = true;
    try {
      const { base64, contentType } = await compressImage(file, maxDim);
      setMsg(status, "上传中…");
      const data = await callWorker({ action: "upload_announcement_image", password: internalAdminPassword, image: base64, content_type: contentType });
      if (!data?.ok) throw new Error(data?.error || "upload failed");
      setMsg(status, "");
      onChange(new URL(`image/${data.key}`, workerBase()).href);
    } catch (e) {
      setMsg(status, e.message === "decode fail" ? text.decodeFail : e.message === "rate_limited" ? text.rateLimited : text.failed);
    }
    pick.disabled = false;
  });
}

function setAnnouncementImage(url) {
  pendingAnnouncementImageUrl = url;
  showImagePreview("announcementImage", url);
}

/* 发布 / 编辑 / 删除 --------------------------------------------------------- */

function startEditAnnouncement(item) {
  openAdminPanel("postAnnouncementPanel");
  editingAnnouncementId = item.id;
  $("announcementText").value = item.body;
  $("announceShowA").checked = !!item.show_a;
  $("announceShowB").checked = !!item.show_b;
  setAnnouncementImage(item.image_url || null);
  $("postAnnouncementBtn").textContent = "保存修改";
  $("cancelEditAnnouncementBtn").hidden = false;
  $("announcementText").focus({ preventScroll: true });
}

function cancelEditAnnouncement() {
  editingAnnouncementId = null;
  setAnnouncementImage(null);
  $("announcementText").value = "";
  $("announceShowA").checked = true;
  $("announceShowB").checked = true;
  $("postAnnouncementBtn").textContent = "发布";
  $("cancelEditAnnouncementBtn").hidden = true;
}

async function deleteAnnouncement(id) {
  if (!confirm("确定要删除这条公告吗？删除后无法恢复。")) return;
  const data = await callWorker({ action: "delete_announcement", password: internalAdminPassword, id });
  if (!data || !data.ok) {
    showToast("删除失败，请重试");
    return;
  }
  showToast("已删除");
  if (String(editingAnnouncementId) === String(id)) cancelEditAnnouncement();
  refreshAnnouncements();
}

async function submitAnnouncement() {
  const text = $("announcementText");
  const msg = $("postAnnouncementMsg");
  const btn = $("postAnnouncementBtn");
  const isEditing = !!editingAnnouncementId;

  setMsg(msg, "");
  if (!text.value.trim()) {
    setMsg(msg, "请填写内容");
    return;
  }

  btn.disabled = true;
  const data = await callWorker({
    action: isEditing ? "edit_announcement" : "post_announcement",
    password: internalAdminPassword,
    id: editingAnnouncementId,
    content: text.value,
    show_a: $("announceShowA").checked,
    show_b: $("announceShowB").checked,
    image_url: pendingAnnouncementImageUrl,
  });
  btn.disabled = false;

  if (!data || !data.ok) {
    setMsg(msg, isEditing ? "保存失败，请重试" : "发布失败，请重试");
    return;
  }
  cancelEditAnnouncement();
  closeAdminPanel();
  showToast(isEditing ? "公告已更新" : "公告已发布");
  refreshAnnouncements();
}

function initPostAnnouncement() {
  $("cancelEditAnnouncementBtn").addEventListener("click", cancelEditAnnouncement);
  $("postAnnouncementBtn").addEventListener("click", submitAnnouncement);
  bindImageUpload("announcementImage", 1600, setAnnouncementImage);
}

/* ==== 2. 只读页与管理弹窗 ==== */
let internalViewPassword = null;
let ticketViewTimer = 0;

function enterTicketViewer(password, perms) {
  internalViewPassword = password;
  ticketAdmin.role = "viewer";
  ticketAdmin.perms = perms || { stats: true, survey: false, pickup: false };
  ticketAdmin.tab = "orders";
  const panel = $("ticketAdminPanel");
  panel.classList.add("is-readonly");
  panel.querySelector("h2").textContent = "购票情况";
  $("ticketViewHost").appendChild(panel);
  panel.hidden = false;
  const survey = $("surveyAdminPanel");
  const withSurvey = !!ticketAdmin.perms.survey;
  if (withSurvey) {
    survey.classList.add("is-readonly");
    $("ticketViewHost").appendChild(survey);
    survey.hidden = true;
  }
  $("viewerPills").hidden = !withSurvey;
  $("ticketViewBoard").hidden = false;
  refreshTicketAdmin();
  clearInterval(ticketViewTimer);
  ticketViewTimer = setInterval(() => {
    if (!document.hidden && !$("view-internal").hidden && !$("ticketViewBoard").hidden && !panel.hidden) runQuietly(refreshTicketAdmin);
  }, 60 * 1000);
}

function initViewerPills() {
  $("viewerPills").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-viewer-panel]");
    if (!btn) return;
    const id = btn.dataset.viewerPanel;
    $("viewerPills").querySelectorAll("[data-viewer-panel]").forEach((b) => b.classList.toggle("is-active", b === btn));
    ["ticketAdminPanel", "surveyAdminPanel"].forEach((pid) => { $(pid).hidden = pid !== id; });
    if (id === "surveyAdminPanel") refreshSurveyAdmin();
    else refreshTicketAdmin();
  });
}

/* 管理弹窗：打开时把面板移入弹窗并刷新数据 */
const ADMIN_PANEL_REFRESH = {
  lockdownPanel: () => { refreshLockdownStatus(); refreshMaintStatus(); },
  captchaPanel: () => refreshCaptchaSwitch(),
  starlightPanel: () => syncStarlightPanel(),
  ticketAdminPanel: () => refreshTicketAdmin(),
  feedbackAdminPanel: () => refreshFeedbackAdmin(),
  venueAdminPanel: () => refreshVenueAdmin(),
  popupAdminPanel: () => refreshPopupAdmin(),
  huayuAdminPanel: () => refreshHuayuAdmin(),
  puzzleAdminPanel: () => refreshPuzzleAdmin(),
  surveyAdminPanel: () => {
    if (typeof window.mountSurvey === "function") return refreshSurveyAdmin();
    $("surveyAdminStatus").textContent = "问卷脚本 survey.js 没有加载成功（没上传或被缓存挡住），刷新页面再试";
    return null;
  },
};

function stashAdminPanels() {
  [...$("adminModalHost").children].forEach((el) => {
    el.hidden = true;
    $("adminPanelStash").appendChild(el);
  });
}

function openAdminPanel(id) {
  const panel = $(id);
  if (!panel) return;
  stashAdminPanels();
  $("adminModalHost").appendChild(panel);
  panel.hidden = false;
  $("adminModalOverlay").dataset.closeOnlyX = panel.dataset.closeOnlyX || "";
  $("adminModalOverlay").hidden = false;
  playEnterAnim(document.querySelector("#adminModalOverlay .admin-modal"));
  ADMIN_PANEL_REFRESH[id]?.();
}

function closeAdminPanel() {
  $("adminModalOverlay").hidden = true;
  stashAdminPanels();
}

function initAdminPanels() {
  $("adminPills").querySelectorAll("[data-admin-panel]").forEach((btn) => {
    btn.addEventListener("click", () => openAdminPanel(btn.dataset.adminPanel));
  });
  $("adminModalClose").addEventListener("click", closeAdminPanel);
  closeOnBackdrop($("adminModalOverlay"), closeAdminPanel);
}

/* ==== 3. 分享功能、人机验证、星芒节 ==== */
/* 分享功能：库里存的是 lockdown（1 = 关闭） */
async function refreshLockdownStatus() {
  const status = $("lockdownStatus");
  status.textContent = "当前状态：加载中…";
  const data = await callWorker({ action: "get_lockdown" });
  if (!data) {
    status.textContent = "当前状态：读取失败";
    return;
  }
  siteLockdown = !!data.value;
  status.textContent = data.value
    ? "当前状态：已关闭（纯静态展示，复制附言 / 活动群 / 场地登记 / 活动问卷 / 点赞都不可用）"
    : "当前状态：已开启（正常运行）";
  $("lockdownToggleBtn").textContent = data.value ? "开启分享功能" : "关闭分享功能";
  $("lockdownToggleBtn").dataset.current = data.value ? "1" : "0";
}

function initLockdownToggle() {
  const btn = $("lockdownToggleBtn");
  btn.addEventListener("click", async () => {
    const msg = $("lockdownMsg");
    setMsg(msg, "");
    btn.disabled = true;
    const data = await callWorker({
      action: "set_lockdown",
      password: internalAdminPassword,
      value: btn.dataset.current !== "1",
    });
    btn.disabled = false;
    if (!data || !data.ok) {
      setMsg(msg, adminErr(data, "切换失败，请重新登录内部入口后再试"));
      return;
    }
    siteLockdown = !!data.value;
    showToast(data.value ? "分享功能已关闭（纯静态展示）" : "分享功能已开启");
    refreshLockdownStatus();
  });
}

/* 全站开关：库里存的是 maintenance（1 = 维护中，全站关闭） */
const MAINT_ERRORS = {
  unknown_action: "Worker 还没有更新，暂时用不了全站开关（见更新说明）",
  bad_action: "Worker 还没有更新，暂时用不了全站开关（见更新说明）",
};
const MAINT_FALLBACK = "操作失败：Worker 可能还没更新（见更新说明），或登录已失效";

async function refreshMaintStatus() {
  const status = $("maintStatus");
  const btn = $("maintToggleBtn");
  status.textContent = "当前状态：加载中…";
  btn.disabled = true;
  const data = await callWorker({ action: "get_maintenance" });
  if (!data || !data.ok) {
    status.textContent = `当前状态：${adminErr(data, MAINT_FALLBACK, MAINT_ERRORS)}`;
    return;
  }
  btn.disabled = false;
  applyMaintenance(!!data.value);
  status.textContent = data.value
    ? "当前状态：已关闭（维护中，访客只能看到维护提示）"
    : "当前状态：已开启（正常访问）";
  btn.textContent = data.value ? "开启全站" : "关闭全站（进入维护）";
  btn.dataset.current = data.value ? "1" : "0";
  delete btn.dataset.armed;
}

function initMaintToggle() {
  const btn = $("maintToggleBtn");
  btn.addEventListener("click", async () => {
    const msg = $("maintMsg");
    setMsg(msg, "");
    const closing = btn.dataset.current !== "1";
    /* 关闭全站要点两次确认 */
    if (closing && !(btn.dataset.armed && Date.now() - Number(btn.dataset.armed) < 4000)) {
      btn.dataset.armed = String(Date.now());
      setMsg(msg, "关闭后访客将无法浏览网站，4 秒内再点一次确认");
      return;
    }
    delete btn.dataset.armed;
    btn.disabled = true;
    const data = await callWorker({ action: "set_maintenance", password: internalAdminPassword, value: closing });
    btn.disabled = false;
    if (!data || !data.ok) {
      setMsg(msg, adminErr(data, MAINT_FALLBACK, MAINT_ERRORS));
      return;
    }
    applyMaintenance(!!data.value);
    showToast(data.value ? "全站已关闭，访客只能看到维护提示" : "全站已开启");
    refreshMaintStatus();
  });
}

async function refreshCaptchaSwitch() {
  const status = $("captchaStatus");
  status.textContent = "当前状态：加载中…";
  const data = await callWorker({ action: "get_captcha" });
  if (!data || !data.ok) {
    status.textContent = "当前状态：读取失败";
    return;
  }
  applyCaptchaEnabled(!!data.enabled);
  status.textContent = data.enabled
    ? "当前状态：已开启（正常验证）"
    : "当前状态：已关闭（全站不验证，任何人都能直接提交，请尽快开回来）";
  $("captchaToggleBtn").textContent = data.enabled ? "关闭人机验证" : "开启人机验证";
  $("captchaToggleBtn").dataset.current = data.enabled ? "1" : "0";
}

function initCaptchaSwitch() {
  const btn = $("captchaToggleBtn");
  btn.addEventListener("click", async () => {
    const msg = $("captchaSwitchMsg");
    setMsg(msg, "");
    btn.disabled = true;
    const data = await callWorker({
      action: "set_captcha",
      password: internalAdminPassword,
      enabled: btn.dataset.current !== "1",
    });
    btn.disabled = false;
    if (!data || !data.ok) {
      setMsg(msg, adminErr(data, "切换失败，请重新登录内部入口后再试"));
      return;
    }
    applyCaptchaEnabled(!!data.enabled);
    showToast(data.enabled ? "人机验证已开启" : "人机验证已关闭");
    refreshCaptchaSwitch();
  });
}

function syncStarlightPanel() {
  const s = hjStarlight;
  $("starlightStatus").textContent = !s ? "当前状态：未设置"
    : `当前时段：${formatCnLabel(s.start)} — ${formatCnLabel(s.end)}${hjStarlightActiveAt(hjNow()) ? " · 进行中" : ""}`;
  $("starlightStart").value = hjStarlight ? epochToCnLocal(hjStarlight.start) : "";
  $("starlightEnd").value = hjStarlight ? epochToCnLocal(hjStarlight.end) : "";
  setMsg($("starlightMsg"), "");
}

/* value：{ start, end }，null 为清除 */
async function saveStarlight(value) {
  const msg = $("starlightMsg");
  const buttons = [$("starlightSaveBtn"), $("starlightClearBtn")];

  setMsg(msg, "保存中…");
  buttons.forEach((b) => { b.disabled = true; });
  const data = await callWorker({ action: "set_starlight", password: internalAdminPassword, value });
  buttons.forEach((b) => { b.disabled = false; });

  if (!data || !data.ok) {
    setMsg(msg, adminErr(data, "保存失败，请重新登录内部入口后再试"));
    return;
  }
  applyStarlight(value);
  syncStarlightPanel();
  showToast(value ? "星芒节时段已保存，期间全站天气显示为小雪" : "已清除星芒节覆盖，天气恢复正常计算");
}

function initStarlightPanel() {
  $("starlightSaveBtn").addEventListener("click", () => {
    const msg = $("starlightMsg");
    const start = cnLocalToEpoch($("starlightStart").value);
    const end = cnLocalToEpoch($("starlightEnd").value);
    if (!start || !end) {
      setMsg(msg, "请填写开始和结束时间");
      return;
    }
    if (end <= start) {
      setMsg(msg, "结束时间要晚于开始时间");
      return;
    }
    saveStarlight({ start, end });
  });
  $("starlightClearBtn").addEventListener("click", () => saveStarlight(null));
}

/* ==== 4. 购票管理 ==== */
const ticketAdmin = {
  status: null,
  orders: [],
  rounds: [],
  role: "admin",
  perms: { stats: true, survey: true, pickup: true },
  tab: "settings",
  day: null,             // 详细订单的轮次："" 全部，null 当前轮
  statsRound: "",
  search: "",
  edit: null,            // { mode: "edit" | "partial", id }
  editHolders: [],
  pointsDirty: false,    // 自定义刷新点有未保存的修改
  guideLoaded: false,
  logItems: null,
};
const TA_TABS = ["settings", "orders", "stats"];
const isTicketViewer = () => ticketAdmin.role === "viewer";
const ticketAdminPassword = () => internalAdminPassword || internalViewPassword;
const cnHm = (ms) => (ms ? formatCnTime(ms).slice(11) : "");
const cnMdHm = (ms) => (ms ? `${Number(formatCnTime(ms).slice(5, 7))}/${Number(formatCnTime(ms).slice(8, 10))} ${cnHm(ms)}` : "");
const VERIFY_MODE_TEXT = { cf: "自动验证", ff14: "狒科生", poem: "文科生", math: "理科生", off: "验证关闭时提交", manual: "手动验证" };

function fmtDuration(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} 秒`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} 分 ${s % 60} 秒`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时 ${m % 60} 分`;
  return `${Math.floor(h / 24)} 天 ${h % 24} 小时`;
}

/* 全部轮次：Worker 记录的轮次，加上只出现在订单里的票日（开始时间与票额为估算，estimated） */
function ticketRoundList() {
  const st = ticketAdmin.status;
  const map = new Map();
  ticketAdmin.rounds.forEach((r) => map.set(r.key, { ...r, estimated: false }));
  ticketAdmin.orders.forEach((o) => {
    if (map.has(o.day)) return;
    const m = /^(\d{4}-\d{2}-\d{2})(?: (\d{2}:\d{2}))?/.exec(o.day);
    const startAt = m
      ? Date.parse(`${m[1]}T${m[2] || "00:00"}:00+08:00`) + (m[2] ? 0 : (st?.resetMin || 0) * 60000)
      : 0;
    const q = st ? st.limit : 0;
    map.set(o.day, { key: o.day, startAt, base: q, extra: 0, quota: q, source: "", openedAt: -1, estimated: true });
  });
  if (st?.round && !map.has(st.round.key)) map.set(st.round.key, { ...st.round, estimated: false });
  return [...map.values()].sort((a, b) => a.startAt - b.startAt || String(a.key).localeCompare(String(b.key)));
}

/* 重复：联系方式或 id@区服 出现在多单（作废、待定除外） */
function computeTicketDuplicates(orders) {
  const normContact = (c) => String(c).replace(/\s+/g, "").toLowerCase();
  const normHolder = (h) => `${String(h.name || "").replace(/\s+/g, "").toLowerCase()}@${h.server}`;
  const contactCount = new Map();
  const holderCount = new Map();
  orders.filter((o) => !o.voided).forEach((o) => {
    const c = normContact(o.contact);
    contactCount.set(c, (contactCount.get(c) || 0) + 1);
    ticketActiveHolders(o.holders).forEach((h) => {
      if (h.pending) return;
      const k = normHolder(h);
      holderCount.set(k, (holderCount.get(k) || 0) + 1);
    });
  });
  return new Map(orders.map((o) => [o.id, o.voided
    ? { contact: false, holders: o.holders.map(() => false) }
    : {
        contact: contactCount.get(normContact(o.contact)) > 1,
        holders: o.holders.map((h) => !h.voided && !h.pending && holderCount.get(normHolder(h)) > 1),
      }]));
}

function setTicketSwitch(btn, on, onText, offText) {
  btn.setAttribute("aria-pressed", on ? "true" : "false");
  btn.classList.toggle("is-on", on);
  btn.textContent = on ? onText : offText;
}

function ticketTotals(orders) {
  const live = orders.filter((o) => !o.voided);
  const sum = (list, f) => list.reduce((n, o) => n + f(o), 0);
  const picked = live.filter((o) => o.picked);
  const over = live.filter((o) => o.overLimit);
  const voided = orders.filter((o) => o.voided);
  return {
    liveOrders: live.length,
    liveTickets: sum(live, (o) => o.qty),
    pickedOrders: picked.length,
    pickedTickets: sum(picked, (o) => o.qty),
    overOrders: over.length,
    overTickets: sum(over, (o) => o.qty),
    voidOrders: voided.length,
    voidTickets: sum(voided, (o) => o.qty),
    partialVoidTickets: sum(live, (o) => o.holders.filter((h) => h && h.voided).length),
    pending: sum(live, (o) => ticketActiveHolders(o.holders).filter((h) => h.pending).length),
  };
}

const tasItems = (items) => items.map(([k, v]) => `<div class="tas-item"><span>${k}</span><b>${v}</b></div>`).join("");

function renderTicketAdmin() {
  const st = ticketAdmin.status;
  if (!st) return;
  const viewer = isTicketViewer();
  const cur = st.round || { key: st.day, quota: st.limit, base: st.limit, extra: 0, startAt: 0 };
  $("ticketAdminStatus").textContent = `当前轮次：${ticketRoundLabel(cur.key, true)}`
    + (cur.startAt ? ` · ${formatCnTime(cur.startAt)} 开始` : "");

  const roundOrders = ticketAdmin.orders.filter((o) => o.day === cur.key && !o.voided);
  const overNow = roundOrders.filter((o) => o.overLimit).reduce((n, o) => n + o.qty, 0);
  const all = ticketTotals(ticketAdmin.orders);
  $("ticketAdminStats").innerHTML = tasItems([
    ["本轮已售", `${st.sold} 张`],
    ["本轮票额", `${cur.quota} 张${cur.extra ? `<small>临时 ${cur.extra > 0 ? "+" : ""}${cur.extra}</small>` : ""}`],
    ["本轮余票", `${st.remaining} 张`],
    ["本轮订单", `${roundOrders.length} 单${overNow ? `<small>超额 ${overNow}</small>` : ""}`],
    ["累计有效", `${all.liveOrders} 单 / ${all.liveTickets} 张`],
    ["已取票", `${all.pickedOrders} 单 / ${all.pickedTickets} 张`],
  ]);

  const allowed = viewer ? ["orders", ...(ticketAdmin.perms.stats ? ["stats"] : [])] : TA_TABS;
  if (!allowed.includes(ticketAdmin.tab)) ticketAdmin.tab = allowed[0];
  const tabs = document.querySelectorAll("#ticketAdminTabs [data-ta-tab]");
  tabs.forEach((b) => { b.hidden = !allowed.includes(b.dataset.taTab); });
  markTabs(tabs, (b) => b.dataset.taTab === ticketAdmin.tab);
  $("ticketAdminTabs").hidden = allowed.length < 2;
  document.querySelectorAll("#ticketAdminPanel [data-ta-pane]").forEach((p) => { p.hidden = p.dataset.taPane !== ticketAdmin.tab; });
  if (ticketAdmin.tab === "settings") renderTicketSettings(st);
  else if (ticketAdmin.tab === "orders") renderTicketOrders();
  else renderTicketStats();
}

/* 设置 -------------------------------------------------------------------------------- */
/* <button class="ticket-switch" data-ta-flag="字段" data-on data-off data-toast-on data-toast-off> */
function renderTicketFlagSwitches(st) {
  document.querySelectorAll("#ticketAdminPanel [data-ta-flag]").forEach((btn) => {
    setTicketSwitch(btn, !!st[btn.dataset.taFlag], btn.dataset.on, btn.dataset.off);
  });
}

/* 输入框获得焦点时不覆盖 */
const setIdle = (el, v) => { if (el && document.activeElement !== el) el.value = v; };

function renderTicketSettings(st) {
  /* ---- 基本 ---- */
  setTicketSwitch($("ticketOpenBtn"), st.open, "已开放（点击关闭）", "已关闭（点击开放）");
  setTicketSwitch($("ticketPendingBtn"), st.allowPending, "允许待定（点击关闭）", "不允许待定（点击开启）");
  setTicketSwitch($("ticketTestBtn"), !!st.testMode, "显示「（测试）」（点击去掉）", "不显示（点击加上）");
  setIdle($("ticketTitleInput"), st.title || TICKET_TITLE);
  $("ticketTitlePreview").textContent = `访客看到：${st.title || TICKET_TITLE}${st.testMode ? "（测试）" : ""}`;
  $("ticketTitlePreview").hidden = false;
  setIdle($("ticketCooldownInput"), String(st.cooldownMin ?? 30));
  setIdle($("ticketPerPersonInput"), String(st.perPerson ?? ""));
  renderTicketSchedule(st);

  /* ---- 票额与刷新 ---- */
  const cur = st.round || { key: st.day, base: st.limit, extra: 0, quota: st.limit, startAt: 0, source: "" };
  const SOURCE_TEXT = { daily: "每日刷新", custom: "自定义刷新点", init: "首次记录的轮次" };
  $("ticketRoundBox").innerHTML = `
    <p><b>${escapeHtml(ticketRoundLabel(cur.key, true))}</b>`
    + (cur.startAt ? `<small>${escapeHtml(formatCnTime(cur.startAt))} 开始 · ${SOURCE_TEXT[cur.source] || ""}</small>` : "") + `</p>
    <p>票额：基础 <b>${cur.base}</b> 张${cur.extra ? ` ${cur.extra > 0 ? "+" : "−"} 临时 <b>${Math.abs(cur.extra)}</b> 张` : ""} = <b>${cur.quota}</b> 张
      · 已售 <b>${st.sold}</b> · 余 <b>${st.remaining}</b></p>`;
  $("ticketExtraClearBtn").disabled = !cur.extra;
  setTicketSwitch($("ticketDailyBtn"), st.dailyOn !== false, "开（点击关闭）", "关（点击打开）");
  setIdle($("ticketResetInput"), minutesToHHMM(st.resetMin || 0));
  setIdle($("ticketLimitInput"), String(st.limit));
  document.querySelectorAll(".ta-daily-only").forEach((el) => el.classList.toggle("is-off", st.dailyOn === false));
  /* 「当前这一轮也改」仅当本轮由每日刷新开始时有效 */
  $("ticketLimitCurWrap").hidden = !(cur.source === "daily" || cur.source === "init");
  if (!ticketAdmin.pointsDirty) renderTicketPoints(st.points || [], cur.startAt);
  renderTicketNext(st);

  /* ---- 购票页显示 ---- */
  const mode = st.remainingMode || "full";
  setIdle($("ticketRemainModeSelect"), mode);
  const stockHtml = ticketStockHtml(mode, st.remaining, st.stockLevel, st.roundWord || "今日");
  $("ticketRemainPreview").textContent = `访客现在看到：${stockHtml ? stockHtml.replace(/<[^>]+>/g, "") : "（不显示余票）"}`
    + (mode === "range" ? " · ≤10 张为「余票10张以内」，≤ 票额一半为「余票不多」" : "");
  $("ticketRemainPreview").hidden = false;
  setTicketSwitch($("ticketShowSchedBtn"), st.showSchedule !== false, "显示（点击隐藏）", "不显示（点击显示）");
  setTicketSwitch($("ticketShowResetBtn"), st.showReset !== false, "显示（点击隐藏）", "不显示（点击显示）");
  setTicketSwitch($("ticketViewerBtn"), st.viewerEnabled !== false, "已开放（点击关闭）", "已关闭（点击开放）");
  renderTicketFlagSwitches(st);
  setIdle($("ticketIdleInput"), String(st.idleMin ?? 10));
  /* 与首页隔离时停留时限失效 */
  const iso = !!st.isolated;
  document.querySelectorAll(".ta-idle-row").forEach((row) => {
    row.classList.toggle("is-disabled", iso);
    row.querySelectorAll("input, button").forEach((el) => { el.disabled = iso; });
  });
  $("ticketIdleIsoNote").hidden = !iso;

  /* ---- 只读端 ---- */
  setIdle($("ticketLogHoursInput"), String(st.viewerLogHours ?? 24));
}


function renderTicketSchedule(st) {
  setIdle($("ticketOpenAtInput"), epochToCnLocal(st.openAt));
  setIdle($("ticketCloseAtInput"), epochToCnLocal(st.closeAt));
  const parts = [];
  if (st.openAt) parts.push(`将于 ${formatCnTime(st.openAt)} 自动开启`);
  if (st.closeAt) parts.push(`将于 ${formatCnTime(st.closeAt)} 自动关闭`);
  const note = $("ticketSchedNote");
  note.textContent = parts.join("；");
  note.hidden = !parts.length;
}

/* 只列出尚未执行的刷新点 */
function renderTicketPoints(points, curStart) {
  const list = points.filter((p) => p.at > (curStart || 0));
  $("ticketPointsList").innerHTML = list.length
    ? list.map((p) => ticketPointRowHtml(epochToCnLocal(p.at), p.qty)).join("")
    : `<p class="ta-empty" data-points-empty>暂无自定义刷新点</p>`;
}

function ticketPointRowHtml(at = "", qty = "") {
  return `<div class="ta-point" data-point>
    <input type="datetime-local" class="ta-point-at" value="${escapeHtml(at)}" aria-label="刷新时间">
    <input type="number" class="ta-point-qty" min="0" max="100000" step="1" inputmode="numeric" value="${escapeHtml(String(qty))}" placeholder="票额" aria-label="这一轮的票额">
    <span class="ta-point-unit">张</span>
    <button type="button" class="tt-act is-void" data-point-del>删除</button>
  </div>`;
}

function renderTicketNext(st) {
  const next = st.nextRefresh;
  const info = $("ticketNextInfo");
  const input = $("ticketNextInput");
  const note = $("ticketNextNote");
  $("ticketNextSaveBtn").disabled = !next;
  input.disabled = !next;
  if (!next) {
    info.textContent = "不会再刷新";
    setIdle(input, "");
    $("ticketNextResetBtn").hidden = true;
    note.textContent = "每日刷新已关闭且没有自定义刷新点，票额不再重置。";
    note.hidden = false;
    return;
  }
  info.textContent = `${formatCnTime(next.at)} · ${next.kind === "daily" ? "每日刷新" : "自定义刷新点"}`;
  setIdle(input, String(next.qty));
  $("ticketNextResetBtn").hidden = !next.override;
  const lines = [];
  if (next.override) lines.push(`已单独设为 ${next.qty} 张（默认是 ${next.defaultQty} 张），只对这一次刷新有效。`);
  else if (next.kind === "custom") lines.push("与对应的自定义刷新点同步。");
  else lines.push(`默认 ${next.defaultQty} 张，修改仅对本次有效。`);
  if (next.pendingOverride) lines.push(`${formatCnTime(next.pendingOverride.at)} 的每日刷新已单独设为 ${next.pendingOverride.qty} 张。`);
  note.textContent = lines.join(" ");
  note.hidden = false;
}

/* 详细订单 ---------------------------------------------------------------------------- */
function ticketOrderMatches(o, q) {
  if (!q) return true;
  const hay = [o.contact, String(o.seq), ...o.holders.map((h) => formatHolder(h))].join(" ").toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

function renderTicketOrders() {
  const st = ticketAdmin.status;
  const viewer = isTicketViewer();
  const orders = ticketAdmin.orders;
  const rounds = ticketRoundList().filter((r) => r.key === st.day || orders.some((o) => o.day === r.key));
  if (ticketAdmin.day === null || (ticketAdmin.day && !rounds.some((r) => r.key === ticketAdmin.day))) ticketAdmin.day = st.day;
  const all = ticketAdmin.day === "";
  $("ticketDaySelect").innerHTML = `<option value=""${all ? " selected" : ""}>全部轮次 · ${ticketTotals(orders).liveOrders} 单</option>`
    + rounds.slice().reverse().map((r) => {
      const t = ticketTotals(orders.filter((o) => o.day === r.key));
      return `<option value="${escapeHtml(r.key)}"${r.key === ticketAdmin.day ? " selected" : ""}>${escapeHtml(ticketRoundLabel(r.key, true))}`
        + ` · ${t.liveOrders} 单 / ${t.liveTickets} 张${t.voidOrders ? ` · 作废 ${t.voidOrders}` : ""}</option>`;
    }).join("");
  setIdle($("ticketSearchInput"), ticketAdmin.search);

  const dup = computeTicketDuplicates(orders);
  const roundIndex = new Map(rounds.map((r, i) => [r.key, i]));
  const rows = orders
    .filter((o) => (all || o.day === ticketAdmin.day) && ticketOrderMatches(o, ticketAdmin.search))
    .sort((a, b) => (roundIndex.get(a.day) ?? 0) - (roundIndex.get(b.day) ?? 0) || a.seq - b.seq);
  const canPick = !viewer || ticketAdmin.perms.pickup;
  $("ticketAdminPanel").classList.toggle("can-pick", canPick);

  $("ticketAdminTbody").innerHTML = rows.length ? rows.map((o) => {
    const d = dup.get(o.id) || { contact: false, holders: [] };
    const holders = o.holders.map((h, i) => (h.voided
      ? `<span class="tt-h-void"><s>${escapeHtml(formatHolder(h))}</s><small>已作废</small></span>`
      : `<span class="${d.holders[i] ? "is-dup" : ""}">${escapeHtml(formatHolder(h))}</span>`)).join("<br>");
    const msgText = [
      o.message ? `${escapeHtml(o.message)}<small>${o.anonymous ? "匿名" : "实名"}</small>` : "",
      !viewer && o.adminNote ? `<small class="tt-note">备注：${escapeHtml(o.adminNote)}</small>` : "",
    ].join("");
    const time = formatCnClock(o.createdAt);
    const date = all ? `${cnMdHm(o.createdAt).split(" ")[0]} ` : "";
    const acts = viewer ? "" : [
      !o.voided ? `<button type="button" class="tt-act" data-act="edit">编辑</button>` : "",
      !o.voided && o.holders.length > 1 ? `<button type="button" class="tt-act" data-act="partial">部分作废</button>` : "",
      o.voided
        ? `<button type="button" class="tt-act is-restore" data-act="restore">恢复</button>`
        : `<button type="button" class="tt-act is-void" data-act="void">作废</button>`,
    ].join("");
    const pickTitle = o.picked && o.pickedAt ? `${o.pickedBy === "viewer" ? "只读端" : "管理员"} ${cnMdHm(o.pickedAt)} 勾选` : "";
    const pick = o.voided ? "—"
      : canPick
        ? `<label class="tt-pick" title="${escapeHtml(pickTitle)}"><input type="checkbox" data-pick${o.picked ? " checked" : ""} aria-label="第 ${o.seq} 号已取票"><span>${o.picked ? "已取" : "未取"}</span></label>`
        : (o.picked ? `<span class="tt-picked" title="${escapeHtml(pickTitle)}">已取</span>` : `<span class="tt-unpicked">未取</span>`);
    const cls = [o.voided ? "is-void" : o.overLimit ? "is-over" : "", o.picked && !o.voided ? "is-picked" : ""].filter(Boolean).join(" ");
    return `<tr class="${cls}" data-order-id="${o.id}">
      <td>${o.seq}${all ? `<small class="tt-round">${escapeHtml(ticketRoundLabel(o.day))}</small>` : ""}</td>
      <td class="${d.contact ? "is-dup" : ""}">${escapeHtml(o.contact)}</td>
      <td>${o.qty}</td>
      <td>${holders}</td>
      <td class="tt-msg">${msgText}</td>
      <td>${date}${time}${viewer ? "" : submitMetaHtml(o)}</td>
      <td class="tt-actions"><div class="tt-acts">${acts}</div></td>
      <td class="tt-pick-cell">${pick}</td>
    </tr>`;
  }).join("") : `<tr><td colspan="8" class="tt-empty">${ticketAdmin.search ? "没有符合搜索条件的订单" : "暂无订单"}</td></tr>`;

  if (ticketAdmin.edit) {
    const o = orders.find((x) => x.id === ticketAdmin.edit.id);
    if (!o || o.voided) closeTicketEdit();
    else if (ticketAdmin.edit.mode === "partial") renderTicketPartial();
  }
}

/* 编辑订单 */

function openTicketEdit(order) {
  ticketAdmin.edit = { mode: "edit", id: order.id };
  ticketAdmin.editHolders = order.holders.map((h) => ({ ...h }));
  const rounds = ticketRoundList();
  const box = $("ticketEditBox");
  box.innerHTML = `
    <h3 class="venue-edit-title">编辑订单 · ${escapeHtml(ticketRoundLabel(order.day, true))} 第 ${order.seq} 号</h3>
    <div class="ta-edit-grid">
      <label class="ta-field"><span>所属轮次</span><select id="teDay">${rounds.map((r) =>
        `<option value="${escapeHtml(r.key)}"${r.key === order.day ? " selected" : ""}>${escapeHtml(ticketRoundLabel(r.key, true))}</option>`).join("")}</select></label>
      <label class="ta-field"><span>联系方式</span><input type="text" id="teContact" maxlength="40" autocomplete="off"></label>
    </div>
    <div class="ta-field"><span>持票人</span><div id="teHolders"></div>
      <button type="button" class="tt-act" id="teAddHolder">+ 添加持票人</button></div>
    <label class="ta-field"><span>留言</span><textarea id="teMessage" maxlength="200"></textarea></label>
    <div class="ta-edit-checks">
      <label class="audience-opt"><input type="checkbox" id="teAnon"><span>匿名留言</span></label>
      <label class="audience-opt"><input type="checkbox" id="teOver"><span>超额</span></label>
    </div>
    <label class="ta-field"><span>管理备注</span><textarea id="teNote" maxlength="500"></textarea></label>
    <div class="venue-edit-actions">
      <button type="button" id="teSave">保存</button>
      <button type="button" class="ticket-btn-ghost" id="teCancel">取消</button>
    </div>
    <p class="form-msg" id="teMsg" hidden></p>`;
  $("teContact").value = order.contact;
  $("teMessage").value = order.message || "";
  $("teAnon").checked = order.anonymous;
  $("teOver").checked = order.overLimit;
  $("teNote").value = order.adminNote || "";
  renderTicketEditHolders();
  box.hidden = false;
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderTicketEditHolders() {
  const wrap = $("teHolders");
  wrap.innerHTML = ticketAdmin.editHolders.map((h, i) => (h.voided
    ? `<div class="te-holder is-void"><span><s>${escapeHtml(formatHolder(h))}</s> 已作废</span></div>`
    : `<div class="te-holder" data-h="${i}">
        <input type="text" class="te-name" maxlength="12" placeholder="角色名" autocomplete="off" spellcheck="false"${h.pending ? " disabled" : ""}>
        <select class="te-server"${h.pending ? " disabled" : ""}>${TICKET_SERVER_OPTIONS}</select>
        <label class="audience-opt"><input type="checkbox" class="te-pending"${h.pending ? " checked" : ""}><span>待定</span></label>
        <button type="button" class="tt-act is-void" data-h-del>删除</button>
      </div>`)).join("");
  wrap.querySelectorAll(".te-holder[data-h]").forEach((row) => {
    const h = ticketAdmin.editHolders[Number(row.dataset.h)];
    row.querySelector(".te-name").value = h.pending ? "" : (h.name || "");
    row.querySelector(".te-server").value = h.pending ? "" : (h.server || "");
  });
}

function collectTicketEditHolders() {
  $("teHolders").querySelectorAll(".te-holder[data-h]").forEach((row) => {
    const i = Number(row.dataset.h);
    const pending = row.querySelector(".te-pending").checked;
    ticketAdmin.editHolders[i] = pending
      ? { pending: true }
      : { name: normalizeTicketName(row.querySelector(".te-name").value), server: row.querySelector(".te-server").value };
  });
}

function closeTicketEdit() {
  ticketAdmin.edit = null;
  ticketAdmin.editHolders = [];
  const box = $("ticketEditBox");
  box.hidden = true;
  box.innerHTML = "";
}

async function saveTicketEdit() {
  const msg = $("teMsg");
  const o = ticketAdmin.orders.find((x) => x.id === ticketAdmin.edit?.id);
  if (!o) { closeTicketEdit(); return; }
  collectTicketEditHolders();
  const contact = $("teContact").value.trim();
  if (!contact) { setMsg(msg, "请填写联系方式"); return; }
  const holders = ticketAdmin.editHolders;
  for (const [i, h] of holders.entries()) {
    if (h.voided || h.pending) continue;
    const err = h.name ? ticketNameError(h.name) : "请填写持票人 id";
    if (err) { setMsg(msg, `第 ${i + 1} 位持票人：${err}`); return; }
    if (!h.server) { setMsg(msg, `第 ${i + 1} 位持票人：请选择区服`); return; }
  }
  if (!ticketActiveHolders(holders).length) { setMsg(msg, "至少要留一位持票人；整单不要了请用「作废」"); return; }
  setMsg(msg, "");
  $("teSave").disabled = true;
  const data = await callWorker({
    action: "ticket_admin_edit", password: internalAdminPassword, id: o.id, rev: o.rev,
    contact, holders, day: $("teDay").value, message: $("teMessage").value, anonymous: $("teAnon").checked,
    overLimit: $("teOver").checked, adminNote: $("teNote").value,
  });
  if ($("teSave")) $("teSave").disabled = false;
  if (!data || !data.ok) {
    const ERR = {
      conflict: "订单已被修改，已刷新",
      bad_contact: "请填写联系方式", bad_holders: "持票人数量需为 1–50",
      bad_holder_name: "有持票人未填写 id", bad_holder_server: "有持票人未选择区服",
      bad_holder_name_format: "持票人 id 格式不符",
      no_active_holder: "至少要留一位持票人；整单不要了请用「作废」", bad_day: "所选轮次不存在，刷新后再试",
    };
    setMsg(msg, adminErr(data, "保存失败，请重新登录内部入口后再试", ERR));
    if (data?.error === "conflict") { closeTicketEdit(); await refreshTicketAdmin(); }
    return;
  }
  ticketAdminApplyOrder(data.order, data.status);
  closeTicketEdit();
  renderTicketAdmin();
  showToast(data.overQuota ? `已保存。注意：${ticketRoundLabel(data.order.day)}这一轮已经超出票额` : `第 ${data.order.seq} 号已保存`);
}

function ticketAdminApplyOrder(order, status) {
  const at = ticketAdmin.orders.findIndex((o) => o.id === order.id);
  if (at >= 0) ticketAdmin.orders[at] = { ...ticketAdmin.orders[at], ...order };
  if (status) ticketAdmin.status = status;
}

/* 部分作废 */
function openTicketPartial(order) {
  ticketAdmin.edit = { mode: "partial", id: order.id };
  renderTicketPartial();
  $("ticketEditBox").hidden = false;
  $("ticketEditBox").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderTicketPartial() {
  const o = ticketAdmin.orders.find((x) => x.id === ticketAdmin.edit?.id);
  if (!o) { closeTicketEdit(); return; }
  const active = ticketActiveHolders(o.holders).length;
  $("ticketEditBox").innerHTML = `
    <h3 class="venue-edit-title">部分作废 · ${escapeHtml(ticketRoundLabel(o.day, true))} 第 ${o.seq} 号 · ${o.qty} 张</h3>
    <p class="hint">作废后票额放回本轮；恢复时若票额不足则标为超额。</p>
    <div class="ta-partial">${o.holders.map((h, i) => `
      <div class="ta-partial-row${h.voided ? " is-void" : ""}">
        <span>${i + 1}. ${h.voided ? `<s>${escapeHtml(formatHolder(h))}</s> <small>已作废</small>` : escapeHtml(formatHolder(h))}</span>
        ${h.voided
          ? `<button type="button" class="tt-act is-restore" data-pv="${i}" data-pv-void="0">恢复</button>`
          : `<button type="button" class="tt-act is-void" data-pv="${i}" data-pv-void="1"${active <= 1 ? " disabled title=\"至少留一张\"" : ""}>作废这张</button>`}
      </div>`).join("")}</div>
    <div class="venue-edit-actions"><button type="button" class="ticket-btn-ghost" id="tpClose">关闭</button></div>
    <p class="form-msg" id="tpMsg" hidden></p>`;
}

async function ticketPartialVoid(index, voided) {
  const o = ticketAdmin.orders.find((x) => x.id === ticketAdmin.edit?.id);
  if (!o) return;
  const h = o.holders[index];
  if (voided && !confirm(`确定作废第 ${o.seq} 号里的「${formatHolder(h)}」这一张吗？\n\n这张的票额会放回这一轮，之后可以再恢复。`)) return;
  const data = await callWorker({ action: "ticket_admin_void_holder", password: internalAdminPassword, id: o.id, index, voided, rev: o.rev });
  if (!data || !data.ok) {
    const ERR = {
      conflict: "订单已被修改，已刷新",
      last_holder: "至少要留一张；整单不要了请用「作废」",
      order_voided: "该订单已作废",
      not_changed: "状态已变化，已刷新",
    };
    setMsg($("tpMsg"), adminErr(data, "操作失败，请重新登录内部入口后再试", ERR));
    if (["conflict", "not_changed"].includes(data?.error)) { await refreshTicketAdmin(); }
    return;
  }
  ticketAdminApplyOrder(data.order, data.status);
  renderTicketAdmin();
  showToast(voided ? `已作废第 ${data.order.seq} 号的一张，现在 ${data.order.qty} 张`
    : `已恢复，现在 ${data.order.qty} 张${data.becameOver ? "（这一轮票额不够，这一单标成了超额）" : ""}`);
}

async function ticketAdminVoid(id, voided) {
  const msg = $("ticketAdminMsg");
  setMsg(msg, "");
  const data = await callWorker({ action: "ticket_admin_void", password: internalAdminPassword, id, voided });
  if (!data || !data.ok) {
    if (data && data.error === "not_changed") {
      setMsg(msg, "状态已变化，已刷新");
      await refreshTicketAdmin();
      return;
    }
    setMsg(msg, adminErr(data, "操作失败，请重新登录内部入口后再试"));
    return;
  }
  ticketAdminApplyOrder(data.order, data.status);
  renderTicketAdmin();
  showToast(data.order.voided
    ? `第 ${data.order.seq} 号已作废，票额已放回`
    : `第 ${data.order.seq} 号已恢复${data.order.overLimit ? "，已标为超额" : ""}`);
}

async function ticketTogglePickup(id, picked, input) {
  const msg = $("ticketAdminMsg");
  setMsg(msg, "");
  input.disabled = true;
  const data = await callWorker({ action: "ticket_pickup", password: ticketAdminPassword(), id, picked });
  input.disabled = false;
  if (data && data.order) ticketAdminApplyOrder(data.order);
  if (!data || !data.ok) {
    const ERR = {
      not_changed: "这一单已经是这个状态了（可能别人刚勾过），已同步",
      order_voided: "该订单已作废",
      no_permission: "无取票勾选权限",
      viewer_closed: "「购票情况」已关闭",
    };
    setMsg(msg, adminErr(data, "勾选失败，请重新登录后再试", ERR));
    if (!data?.order) input.checked = !picked;
    renderTicketAdmin();
    return;
  }
  renderTicketAdmin();
}

/* 售票统计 ---------------------------------------------------------------------------- */
function renderTicketStats() {
  const orders = ticketAdmin.orders;
  const rounds = ticketRoundList().filter((r) => r.key === ticketAdmin.status.day || orders.some((o) => o.day === r.key));
  if (ticketAdmin.statsRound && !rounds.some((r) => r.key === ticketAdmin.statsRound)) ticketAdmin.statsRound = "";
  const sel = ticketAdmin.statsRound;
  $("ticketStatsRound").innerHTML = `<option value="">全部轮次</option>` + rounds.slice().reverse().map((r) =>
    `<option value="${escapeHtml(r.key)}"${r.key === sel ? " selected" : ""}>${escapeHtml(ticketRoundLabel(r.key, true))}</option>`).join("");
  const scope = orders.filter((o) => !sel || o.day === sel);
  const live = scope.filter((o) => !o.voided);
  const t = ticketTotals(scope);
  const width = Math.max(300, ($("ticketStatsBody").clientWidth || 640) - 2);

  const totals = `<div class="ticket-admin-stats">${tasItems([
    ["有效订单", `${t.liveOrders} 单`],
    ["有效票数", `${t.liveTickets} 张`],
    ["已取票", `${t.pickedOrders} 单 / ${t.pickedTickets} 张`],
    ["未取票", `${t.liveOrders - t.pickedOrders} 单 / ${t.liveTickets - t.pickedTickets} 张`],
    ["超额", `${t.overOrders} 单 / ${t.overTickets} 张`],
    ["已作废", `${t.voidOrders} 单 / ${t.voidTickets} 张${t.partialVoidTickets ? `，另部分作废 ${t.partialVoidTickets} 张` : ""}`],
    ["持票人待定", `${t.pending} 位`],
  ])}</div>`;

  const sections = [
    totals,
    `<h3 class="ta-stat-title">售罄耗时</h3>${ticketSelloutTable(rounds, sel)}`,
    `<h3 class="ta-stat-title">每小时售出</h3>${ticketHourlyChart(live, width)}`,
    `<h3 class="ta-stat-title">各服务器玩家数量</h3>${ticketServerBars(live)}`,
    `<h3 class="ta-stat-title">验证方式分布</h3>${ticketVerifyBars(live)}`,
    ticketUnpickedHtml(live),
  ];
  $("ticketStatsBody").innerHTML = sections.join("");
}

/* 售罄耗时：从本轮开始（或开放购票）到售满票额 */
function ticketSelloutInfo(round) {
  const list = ticketAdmin.orders.filter((o) => o.day === round.key && !o.voided).sort((a, b) => a.createdAt - b.createdAt);
  const sold = list.reduce((n, o) => n + o.qty, 0);
  let soldOutAt = 0;
  let acc = 0;
  if (round.quota > 0) {
    for (const o of list) { acc += o.qty; if (acc >= round.quota) { soldOutAt = o.createdAt; break; } }
  }
  let start = 0;
  let approx = false;
  if (round.openedAt > 0) start = Math.max(round.startAt, round.openedAt);
  else if (list.length) { start = list[0].createdAt; approx = true; }
  let text;
  if (!list.length) text = round.openedAt ? "未售罄" : "未开放";
  else if (!soldOutAt) text = "未售罄";
  else text = `${approx ? "约 " : ""}${fmtDuration(soldOutAt - start)}`;
  return { sold, soldOutAt, start, approx, text };
}

function ticketSelloutTable(rounds, sel) {
  if (!rounds.length) return `<p class="fb-empty">暂无轮次</p>`;
  const rows = rounds.slice().reverse().map((r) => {
    const s = ticketSelloutInfo(r);
    return `<tr class="${r.key === sel ? "is-sel" : ""}">
      <td>${escapeHtml(ticketRoundLabel(r.key, true))}</td>
      <td>${r.startAt ? escapeHtml(cnMdHm(r.startAt)) : "—"}${r.openedAt > 0 && r.openedAt > r.startAt ? `<small>开放 ${escapeHtml(cnMdHm(r.openedAt))}</small>` : ""}</td>
      <td>${r.quota}${r.estimated ? "<small>估</small>" : ""}</td>
      <td>${s.sold}</td>
      <td>${escapeHtml(s.text)}${s.soldOutAt ? `<small>${escapeHtml(cnMdHm(s.soldOutAt))} 售罄</small>` : ""}</td>
    </tr>`;
  }).join("");
  const estimated = rounds.some((r) => r.estimated || r.openedAt === -1);
  return `<div class="ticket-table-wrap"><table class="ticket-table ta-sellout">
    <thead><tr><th>轮次</th><th>开始</th><th>票额</th><th>售出</th><th>售罄耗时</th></tr></thead><tbody>${rows}</tbody></table></div>`
    + (estimated ? `<p class="ta-footnote">约：从第一单起算；估：按当前每日票额估算</p>` : "");
}

/* 每小时售出，跨度超过 14 天时按天 */
function ticketHourlyChart(live, width) {
  if (!live.length) return `<p class="fb-empty">暂无订单</p>`;
  const HOUR = 3600 * 1000;
  const spanDays = (Math.max(...live.map((o) => o.createdAt)) - Math.min(...live.map((o) => o.createdAt))) / (24 * HOUR);
  const step = spanDays > 14 ? 24 : 1;   // 小时
  const slot = (t) => Math.floor((t + CN_TZ_OFFSET_MS) / (step * HOUR));
  const buckets = new Map();
  live.forEach((o) => {
    const k = slot(o.createdAt);
    const b = buckets.get(k) || { tickets: 0, orders: 0 };
    b.tickets += o.qty;
    b.orders += 1;
    buckets.set(k, b);
  });
  const k0 = Math.min(...buckets.keys());
  const k1 = Math.max(...buckets.keys());
  const n = k1 - k0 + 1;
  const vals = Array.from({ length: n }, (_, i) => buckets.get(k0 + i) || { tickets: 0, orders: 0 });
  const max = Math.max(1, ...vals.map((v) => v.tickets));
  const niceMax = (() => { const p = 10 ** Math.floor(Math.log10(max)); const f = [1, 2, 2.5, 5, 10].find((x) => x * p >= max); return f * p; })();

  const H = 190;
  const padL = 34;
  const padR = 8;
  const padT = 12;
  const padB = 26;
  const plotW = width - padL - padR;
  const plotH = H - padT - padB;
  const slotW = plotW / n;
  const y = (v) => padT + plotH - (v / niceMax) * plotH;
  const slotStart = (i) => (k0 + i) * step * HOUR - CN_TZ_OFFSET_MS;
  const label = (i) => {
    const d = new Date(slotStart(i) + CN_TZ_OFFSET_MS);
    const md = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
    return step === 24 || d.getUTCHours() === 0 ? md : `${d.getUTCHours()}时`;
  };
  const maxLabels = Math.max(3, Math.floor(plotW / 64));
  const every = (step === 24 ? [1, 2, 3, 7, 14, 30] : [1, 2, 3, 6, 12, 24, 48, 72, 96, 168])
    .find((x) => n / x <= maxLabels) || (step === 24 ? 30 : 168);
  const grid = (Number.isInteger(niceMax / 2) ? [0, 0.5, 1] : [0, 1]).map((f) => {
    const v = niceMax * f;
    return `<line x1="${padL}" x2="${width - padR}" y1="${y(v)}" y2="${y(v)}" class="ta-grid"/>`
      + `<text x="${padL - 6}" y="${y(v) + 4}" class="ta-axis" text-anchor="end">${Math.round(v)}</text>`;
  }).join("");
  /* 折线加面积，每列为透明的悬停区 */
  const cx = (i) => padL + i * slotW + slotW / 2;
  const pts = vals.map((v, i) => `${cx(i).toFixed(1)},${y(v.tickets).toFixed(1)}`);
  const line = n === 1
    ? `<line x1="${padL}" x2="${width - padR}" y1="${y(vals[0].tickets)}" y2="${y(vals[0].tickets)}" class="ta-line"/>`
    : `<path class="ta-area" d="M${cx(0)},${y(0)} L${pts.join(" L")} L${cx(n - 1)},${y(0)} Z"/><polyline class="ta-line" points="${pts.join(" ")}"/>`;
  const dotR = slotW >= 8 ? 4 : 3;
  const bars = vals.map((v, i) => {
    const tip = `${cnMdHm(slotStart(i))}–${cnHm(slotStart(i) + step * HOUR) || "24:00"}：${v.tickets} 张 / ${v.orders} 单`;
    return `<g class="ta-bar-g"><title>${escapeHtml(tip)}</title><rect x="${padL + i * slotW}" y="${padT}" width="${slotW}" height="${plotH}" class="ta-hit"/>`
      + (v.tickets ? `<circle cx="${cx(i)}" cy="${y(v.tickets)}" r="${dotR}" class="ta-dot"/>` : "") + `</g>`;
  }).join("");
  const xLabels = vals.map((_, i) => {
    if ((k0 + i) % every !== 0) return "";
    return `<text x="${padL + i * slotW + slotW / 2}" y="${H - 8}" class="ta-axis" text-anchor="middle">${escapeHtml(label(i))}</text>`;
  }).join("");
  const peakI = vals.reduce((best, v, i) => (v.tickets > vals[best].tickets ? i : best), 0);
  return `<div class="ta-chart"><svg width="${width}" height="${H}" viewBox="0 0 ${width} ${H}" role="img" aria-label="每${step === 24 ? "天" : "小时"}售出张数">`
    + `${grid}<line x1="${padL}" x2="${width - padR}" y1="${y(0)}" y2="${y(0)}" class="ta-base"/>${line}${bars}${xLabels}</svg></div>`
    + `<p class="ta-footnote">单位：张 · 每点一${step === 24 ? "天" : "小时"} · 峰值 ${escapeHtml(cnMdHm(slotStart(peakI)))} 起 ${vals[peakI].tickets} 张</p>`;
}

/* 横向条形图（服务器、验证方式） */
function taBarsHtml(items, total, maxN) {
  const max = maxN || Math.max(1, ...items.map((x) => x.n));
  return `<div class="sv-bars">${items.map((x) => `<div class="sv-bar-row"><span class="sv-bar-key">${escapeHtml(x.label)}</span>`
    + `<span class="sv-bar"><i style="width:${(x.n / max) * 100}%"></i></span>`
    + `<span class="sv-bar-n">${x.n}<small>${total ? Math.round((x.n / total) * 100) : 0}%</small></span></div>`).join("")}</div>`;
}

function ticketServerBars(live) {
  const count = new Map();
  let pending = 0;
  live.forEach((o) => ticketActiveHolders(o.holders).forEach((h) => {
    if (h.pending) pending++;
    else count.set(h.server, (count.get(h.server) || 0) + 1);
  }));
  const total = [...count.values()].reduce((a, b) => a + b, 0) + pending;
  if (!total) return `<p class="fb-empty">暂无持票人</p>`;
  const maxN = Math.max(1, pending, ...count.values());   // 各大区共用比例尺
  const groups = TICKET_SERVER_GROUPS.map((g) => {
    const items = g.servers.map((s) => ({ label: s, n: count.get(s) || 0 })).filter((x) => x.n).sort((a, b) => b.n - a.n);
    const n = items.reduce((a, x) => a + x.n, 0);
    return n ? `<p class="ta-dc">【${g.dc}】${n} 人</p>${taBarsHtml(items, total, maxN)}` : "";
  }).join("");
  const other = [...count.entries()].filter(([s]) => !TICKET_SERVERS.includes(s)).map(([label, n]) => ({ label, n }));
  return `<p class="ta-footnote">按持票人计，共 ${total} 位</p>${groups}`
    + (other.length ? `<p class="ta-dc">其他</p>${taBarsHtml(other, total, maxN)}` : "")
    + (pending ? `<p class="ta-dc">待定</p>${taBarsHtml([{ label: "id 待定", n: pending }], total, maxN)}` : "");
}

function ticketVerifyBars(live) {
  if (!live.length) return `<p class="fb-empty">暂无订单</p>`;
  const count = {};
  live.forEach((o) => { const k = o.verifyMode || ""; count[k] = (count[k] || 0) + 1; });
  const order = ["cf", "ff14", "poem", "math", "manual", "off", ""];
  const items = order.filter((k) => count[k]).map((k) => ({ label: k ? VERIFY_MODE_TEXT[k] : "未记录", n: count[k] }));
  return `<p class="ta-footnote">按订单计，共 ${live.length} 单</p>${taBarsHtml(items, live.length)}`;
}

function ticketUnpickedList(live) {
  const rounds = ticketRoundList();
  const idx = new Map(rounds.map((r, i) => [r.key, i]));
  return live.filter((o) => !o.picked).sort((a, b) => (idx.get(a.day) ?? 0) - (idx.get(b.day) ?? 0) || a.seq - b.seq);
}

function ticketUnpickedHtml(live) {
  const list = ticketUnpickedList(live);
  const tickets = list.reduce((n, o) => n + o.qty, 0);
  const head = `<div class="ta-list-head"><h3 class="ta-stat-title">未取票名单</h3><span>${list.length} 单 / ${tickets} 张</span>
    ${list.length ? `<button type="button" class="tt-act" data-copy-unpicked="full">复制完整名单</button>
    <button type="button" class="tt-act" data-copy-unpicked="ids">复制持票人</button>` : ""}</div>`;
  if (!list.length) return `${head}<p class="fb-empty">没有未取票的有效订单</p>`;
  return `${head}<details class="ta-unpicked"${list.length <= 30 ? " open" : ""}><summary>${list.length <= 30 ? "名单" : `展开 · ${list.length} 单`}</summary><div class="ticket-table-wrap"><table class="ticket-table">
    <thead><tr><th>轮次</th><th>序号</th><th>联系方式</th><th>张数</th><th>持票人</th></tr></thead><tbody>${list.map((o) => `<tr>
      <td>${escapeHtml(ticketRoundLabel(o.day))}</td><td>${o.seq}</td><td>${escapeHtml(o.contact)}</td><td>${o.qty}</td>
      <td>${ticketActiveHolders(o.holders).map((h) => escapeHtml(formatHolder(h))).join("、")}</td></tr>`).join("")}</tbody></table></div></details>
    <textarea class="ta-copy-fallback" id="ticketUnpickedFallback" readonly hidden></textarea>`;
}

function ticketUnpickedText(mode) {
  const sel = ticketAdmin.statsRound;
  const live = ticketAdmin.orders.filter((o) => !o.voided && (!sel || o.day === sel));
  const list = ticketUnpickedList(live);
  const lines = [];
  let lastDay = null;
  list.forEach((o) => {
    if (o.day !== lastDay) { lines.push(`【${ticketRoundLabel(o.day)}】`); lastDay = o.day; }
    const ids = ticketActiveHolders(o.holders).map(formatHolder).join("、");
    lines.push(mode === "full" ? `${o.seq}. ${o.contact}：${ids}（${o.qty} 张）` : `${o.seq}. ${ids}`);
  });
  return lines.join("\n");
}

async function copyTicketUnpicked(mode) {
  const text = ticketUnpickedText(mode);
  try {
    await navigator.clipboard.writeText(text);
    showToast("未取票名单已复制");
  } catch (e) {
    const box = $("ticketUnpickedFallback");
    box.value = text;
    box.hidden = false;
    box.focus();
    box.select();
    showToast("自动复制失败，已全选，请手动复制（Ctrl+C / 长按）");
  }
}

/* 读取与保存 -------------------------------------------------------------------------- */
let ticketAdminTimer = 0;

async function refreshTicketAdmin() {
  const data = await callWorker({ action: "ticket_admin_get", password: ticketAdminPassword() });
  if (data && data.error === "viewer_closed") {
    clearInterval(ticketViewTimer);
    ticketAdmin.orders = [];
    $("ticketAdminStats").innerHTML = "";
    $("ticketAdminTbody").innerHTML = "";
    $("ticketStatsBody").innerHTML = "";
    $("ticketAdminStatus").textContent = "「购票情况」已关闭";
    return false;
  }
  if (!data || !data.ok) {
    $("ticketAdminStatus").textContent = adminErr(data, "读取失败，请重新登录内部入口后再试");
    return false;
  }
  ticketAdmin.status = data.status;
  ticketAdmin.orders = Array.isArray(data.orders) ? data.orders : [];
  ticketAdmin.rounds = Array.isArray(data.rounds) ? data.rounds : [];
  ticketAdmin.role = data.role === "viewer" || !internalAdminPassword ? "viewer" : "admin";
  ticketAdmin.perms = data.perms || (isTicketViewer() ? { stats: true, survey: false, pickup: false } : { stats: true, survey: true, pickup: true });
  renderTicketAdmin();
  return true;
}

async function ticketAdminSet(patch, okMsg) {
  const msg = $("ticketAdminMsg");
  setMsg(msg, "");
  const data = await callWorker({ action: "ticket_admin_set", password: internalAdminPassword, ...patch });
  if (!data || !data.ok) {
    const TICKET_SET_ERRORS = {
      bad_limit: "票额需为 0 以上的整数",
      bad_per_person: "单人限购需为 1–20 之间的整数",
      bad_cooldown: "购票间隔需为 0–1440 的整数",
      bad_reset: "刷新时间无效",
      bad_title: "标题最多 60 字",
      bad_remaining_mode: "余票显示方式无效",
      bad_schedule: "定时时间无效",
      bad_idle: "停留时限需为 0–1440 的整数",
      bad_log_hours: "日志间隔需为 1–720 的整数",
      bad_extra: "加票数量无效",
      extra_below_zero: "票额不能小于 0",
      bad_points: "刷新点最多 60 个",
      bad_point_time: "刷新点时间无效",
      bad_point_qty: "刷新点票额需为 0 以上的整数",
      no_next_refresh: "现在没有下一次刷新（每日刷新关着，也没有自定义刷新点）",
      bad_next_qty: "下一次刷新的票额需为 0 以上的整数",
      bad_guide: "须知格式无效",
      guide_too_long: "须知最多 12000 字",
    };
    setMsg(msg, adminErr(data, "保存失败，请重新登录内部入口后再试", TICKET_SET_ERRORS));
    return false;
  }
  ticketAdmin.status = data.status;
  renderTicketAdmin();
  showTicketEntry(ticketEntryVisible(data.status));
  scheduleTicketEntryCheck(data.status);
  if (okMsg) showToast(okMsg);
  return true;
}

/* 只读端操作日志 */
async function loadTicketLog() {
  const box = $("ticketLogList");
  box.hidden = false;
  box.innerHTML = `<p class="fb-empty">加载中…</p>`;
  const data = await callWorker({ action: "ticket_log_get", password: internalAdminPassword });
  if (!data || !data.ok) {
    box.innerHTML = `<p class="fb-empty">${escapeHtml(adminErr(data, "读取失败"))}</p>`;
    return;
  }
  if (!data.items.length) { box.innerHTML = `<p class="fb-empty">暂无记录</p>`; return; }
  box.innerHTML = data.items.map((w) => {
    const ops = w.ops.slice().sort((a, b) => a.lastAt - b.lastAt);
    const on = ops.filter((x) => x.picked).length;
    return `<div class="fb-item ta-log-item">
      <div class="fb-head"><span class="venue-date">${escapeHtml(cnMdHm(w.windowStart))} – ${escapeHtml(cnMdHm(w.windowStart + w.hours * 3600 * 1000))}</span>
        <span class="fb-time">${w.hours} 小时 · ${ops.length} 单 · 已取 ${on} 单</span></div>
      <ul class="ta-log-ops">${ops.map((x) => `<li>${escapeHtml(ticketRoundLabel(x.day))} 第 ${x.seq} 号 → <b>${x.picked ? "已取票" : "取消取票"}</b>`
        + `<small>${escapeHtml(cnMdHm(x.lastAt))}${x.count > 1 ? ` · 共 ${x.count} 次，首次 ${escapeHtml(cnHm(x.firstAt))}` : ""}</small></li>`).join("")}</ul>
    </div>`;
  }).join("");
}

/* 购票须知：正文为空即使用默认须知 */
async function loadTicketGuideEditor() {
  if (ticketAdmin.guideLoaded) return;
  const data = await callWorker({ action: "get_ticket_guide" });
  if (!data || !data.ok) {
    setMsg($("ticketGuideMsg"), adminErr(data, "读取失败"));
    return;
  }
  $("ticketGuideInput").value = data.text || TICKET_GUIDE_DEFAULT;
  $("ticketGuideState").textContent = data.text ? "· 已修改" : "· 默认";
  ticketAdmin.guideLoaded = true;
  renderTicketGuidePreview();
}

function renderTicketGuidePreview() {
  $("ticketGuidePreview").innerHTML = renderGuideMarkup($("ticketGuideInput").value);
}

async function saveTicketGuide(text) {
  /* 与默认须知相同时存为空，以跟随默认须知的更新 */
  const value = text.trim() === TICKET_GUIDE_DEFAULT.trim() ? "" : text;
  const ok = await ticketAdminSet({ guide: value }, value ? "购票须知已保存" : "购票须知已恢复默认");
  if (!ok) return;
  $("ticketGuideState").textContent = value ? "· 已修改" : "· 默认";
  ticketGuide.loaded = false;
  $("ticketGuideContent").innerHTML = renderGuideMarkup(value || TICKET_GUIDE_DEFAULT);
}

/* Excel 导出（assets/lib/exceljs.min.js 按需加载）------------------------------------------ */
const loadExcelJs = () => loadLateScript("assets/lib/exceljs.min.js", () => !!window.ExcelJS).then(() => window.ExcelJS);

async function saveWorkbook(wb, name) {
  const buf = await wb.xlsx.writeBuffer();
  const stamp = epochToCnLocal(Date.now()).replace(/[-:]/g, "").replace("T", "-");
  downloadBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${name}_${stamp}.xlsx`);
}

const XL_RED = "FFE02020";
const XL_ORANGE = "FFED7D31";
const XL_GREEN = "FF92D050";

/* 留言：实名「名字@服务器：留言」，匿名「来自服务器的冒险者：留言」 */
function ticketMessageLine(o) {
  const h = ticketActiveHolders(o.holders).find((x) => !x.pending) || o.holders.find((x) => x && !x.pending);
  if (!h) return `某位冒险者：${o.message}`;
  return o.anonymous ? `来自${h.server}的冒险者：${o.message}` : `${h.name}@${h.server}：${o.message}`;
}

/* 预售票（每轮一块，仅有效订单）/ 留言 / 已作废 */
async function buildTicketWorkbook(allOrders) {
  const ExcelJS = await loadExcelJs();
  const wb = new ExcelJS.Workbook();
  const center = { horizontal: "center", vertical: "middle" };
  const live = allOrders.filter((o) => !o.voided);
  const dup = computeTicketDuplicates(allOrders);
  const rounds = ticketRoundList().filter((r) => live.some((o) => o.day === r.key));

  const ID_COLS = Math.max(5, ...live.map((o) => ticketActiveHolders(o.holders).length));
  const COLS = ID_COLS + 4;
  const ws = wb.addWorksheet("预售票");
  const header = ["联系方式", "序号", "购票数量", ...Array.from({ length: ID_COLS }, (_, i) => `购票id（${i + 1}）`), "是否取票"];
  let r = 1;
  rounds.forEach((rd) => {
    const list = live.filter((o) => o.day === rd.key).sort((a, b) => a.seq - b.seq);
    const sum = list.reduce((n, o) => n + o.qty, 0);
    ws.mergeCells(r, 1, r, COLS - 2);
    const title = ws.getCell(r, 1);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rd.key);
    if (m) {
      title.value = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
      title.numFmt = "yyyy/m/d";
    } else {
      title.value = ticketRoundLabel(rd.key, true);
    }
    title.alignment = center;
    title.font = { bold: true };
    title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL_GREEN } };
    ws.getCell(r, COLS - 1).value = "售出票数：";
    ws.getCell(r, COLS - 1).alignment = center;
    const first = r + 2;
    const last = r + 1 + Math.max(1, list.length);
    ws.getCell(r, COLS).value = { formula: `SUM(C${first}:C${last})`, result: sum };
    ws.getCell(r, COLS).alignment = center;
    r++;
    header.forEach((h, i) => {
      const cell = ws.getCell(r, i + 1);
      cell.value = h;
      cell.alignment = center;
      cell.font = { bold: true };
    });
    r++;
    if (!list.length) r++;
    list.forEach((o) => {
      const flags = dup.get(o.id) || { contact: false, holders: [] };
      const act = o.holders.map((h, i) => ({ h, i })).filter((x) => !x.h.voided);
      const values = [o.contact, o.seq, o.qty,
        ...Array.from({ length: ID_COLS }, (_, k) => (act[k] ? formatHolder(act[k].h) : null)), o.picked ? "是" : null];
      values.forEach((v, i) => {
        const cell = ws.getCell(r, i + 1);
        cell.value = v;
        cell.alignment = center;
        let color = o.overLimit ? XL_RED : null;
        if (i === 0 && flags.contact) color = XL_ORANGE;
        if (i >= 3 && i < 3 + ID_COLS && act[i - 3] && flags.holders[act[i - 3].i]) color = XL_ORANGE;
        if (color) cell.font = { color: { argb: color }, bold: o.overLimit };
      });
      r++;
    });
    r++;
  });
  if (!rounds.length) ws.getCell(1, 1).value = "还没有有效订单";

  ws.getColumn(1).width = 16;
  ws.getColumn(2).width = 6;
  ws.getColumn(3).width = 9;
  for (let i = 4; i < 4 + ID_COLS; i++) ws.getColumn(i).width = 22;
  ws.getColumn(COLS).width = 10;
  const lc = COLS + 2;
  [
    ["标注说明", { bold: true }],
    ["每一块是一轮（两次票额刷新之间）；绿色格是这一轮的日期", null],
    ["红字：提交时这一轮票额已满（超额登记，整单标红）", { color: { argb: XL_RED } }],
    ["橙字：联系方式或持票 id 与其他订单重复", { color: { argb: XL_ORANGE } }],
    ["作废的订单和持票人不在本页，见「已作废」页", null],
  ].forEach(([text, font], i) => {
    const cell = ws.getCell(i + 1, lc);
    cell.value = text;
    if (font) cell.font = font;
  });
  ws.getColumn(lc).width = 50;

  const msgs = live.filter((o) => o.message);
  if (ticketAdmin.status?.messageOn !== false || msgs.length) {
    const mw = wb.addWorksheet("留言");
    mw.addRow(["轮次", "序号", "留言"]);
    mw.getRow(1).font = { bold: true };
    msgs.forEach((o) => mw.addRow([ticketRoundLabel(o.day, true), o.seq, ticketMessageLine(o)]));
    mw.getColumn(1).width = 20;
    mw.getColumn(2).width = 6;
    mw.getColumn(3).width = 90;
    mw.getColumn(3).alignment = { wrapText: true, vertical: "top" };
  }

  const vw = wb.addWorksheet("已作废");
  vw.addRow(["轮次", "序号", "联系方式", "作废范围", "作废的持票人", "留言", "登记时间"]);
  vw.getRow(1).font = { bold: true };
  allOrders.forEach((o) => {
    if (o.voided) {
      vw.addRow([ticketRoundLabel(o.day, true), o.seq, o.contact, `整单（${o.qty} 张）`,
        ticketActiveHolders(o.holders).map(formatHolder).join("、"), o.message || "", formatCnSeconds(o.createdAt)]);
    }
    const pv = o.holders.filter((h) => h && h.voided);
    if (pv.length) {
      vw.addRow([ticketRoundLabel(o.day, true), o.seq, o.contact, `部分（${pv.length} 张）${o.voided ? "，后来整单作废" : ""}`,
        pv.map(formatHolder).join("、"), o.message || "", formatCnSeconds(o.createdAt)]);
    }
  });
  [20, 6, 16, 18, 40, 40, 20].forEach((w, i) => { vw.getColumn(i + 1).width = w; });

  const iw = wb.addWorksheet("登记信息");
  iw.addRow(["轮次", "序号", "联系方式", "张数", "状态", "登记时间", "IP 属地", "验证方式"]);
  iw.getRow(1).font = { bold: true };
  allOrders.forEach((o) => {
    const state = o.voided ? "已作废" : o.overLimit ? "超额" : "有效";
    iw.addRow([ticketRoundLabel(o.day, true), o.seq, o.contact, o.qty, state, formatCnSeconds(o.createdAt),
      geoText(o.geo), verifyModeText(o.verifyMode)]);
  });
  [20, 6, 16, 6, 8, 20, 14, 10].forEach((w, i) => { iw.getColumn(i + 1).width = w; });

  return wb;
}

async function exportTicketExcel(suffix = "") {
  await saveWorkbook(await buildTicketWorkbook(ticketAdmin.orders), `花街购票信息${ticketAdmin.status?.testMode ? "（测试）" : ""}${suffix}`);
}

async function withAdminBusy(btn, fn) {
  const msg = $("ticketAdminMsg");
  setMsg(msg, "");
  btn.disabled = true;
  try {
    await fn(msg);
  } finally {
    btn.disabled = false;
  }
}

/* 事件绑定 ---------------------------------------------------------------------------- */
function initTicketAdmin() {
  const msgEl = () => $("ticketAdminMsg");
  const intInput = (id, lo, hi, err) => {
    const raw = $(id).value.trim();
    const n = Number(raw);
    if (raw === "" || !Number.isInteger(n) || n < lo || n > hi) { setMsg(msgEl(), err); return null; }
    $(id).blur();
    return n;
  };
  const onEnter = (id, fn) => $(id).addEventListener("keydown", (e) => { if (e.key === "Enter") fn(); });

  $("ticketAdminTabs").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-ta-tab]");
    if (!btn) return;
    ticketAdmin.tab = btn.dataset.taTab;
    renderTicketAdmin();
  });

  /* ---- 基本 ---- */
  $("ticketOpenBtn").addEventListener("click", () => {
    const next = !ticketAdmin.status?.open;
    ticketAdminSet({ open: next }, next ? "购票已开放" : "购票已关闭");
  });
  $("ticketPendingBtn").addEventListener("click", () => {
    const next = !ticketAdmin.status?.allowPending;
    ticketAdminSet({ allowPending: next }, next ? "已允许持票 id 待定" : "已关闭持票 id 待定");
  });
  const saveTitle = () => {
    const title = $("ticketTitleInput").value.trim();
    if (title.length > 60) { setMsg(msgEl(), "标题最多 60 字"); return; }
    $("ticketTitleInput").blur();
    ticketAdminSet({ title }, title ? "购票页标题已保存" : "已恢复默认标题");
  };
  $("ticketTitleSaveBtn").addEventListener("click", saveTitle);
  onEnter("ticketTitleInput", saveTitle);
  $("ticketTestBtn").addEventListener("click", () => {
    const next = !ticketAdmin.status?.testMode;
    ticketAdminSet({ testMode: next }, next ? "已加上「测试」后缀" : "已去掉「测试」后缀");
  });
  const savePerPerson = () => {
    const n = intInput("ticketPerPersonInput", 1, 20, "单人限购需为 1–20 之间的整数");
    if (n !== null) ticketAdminSet({ perPerson: n }, `单人限购已设为 ${n} 张`);
  };
  $("ticketPerPersonSaveBtn").addEventListener("click", savePerPerson);
  onEnter("ticketPerPersonInput", savePerPerson);
  const saveCooldown = () => {
    const n = intInput("ticketCooldownInput", 0, 1440, "购票间隔需为 0–1440 的整数");
    if (n !== null) ticketAdminSet({ cooldownMin: n }, n ? `再次购票间隔已设为 ${n} 分钟` : "已取消再次购票间隔");
  };
  $("ticketCooldownSaveBtn").addEventListener("click", saveCooldown);
  onEnter("ticketCooldownInput", saveCooldown);
  /* 定时开关，可只填一项 */
  $("ticketSchedSaveBtn").addEventListener("click", () => {
    const openAt = cnLocalToEpoch($("ticketOpenAtInput").value);
    const closeAt = cnLocalToEpoch($("ticketCloseAtInput").value);
    if ($("ticketOpenAtInput").value && !openAt) { setMsg(msgEl(), "开启时间无效"); return; }
    if ($("ticketCloseAtInput").value && !closeAt) { setMsg(msgEl(), "关闭时间无效"); return; }
    if (!openAt && !closeAt) { setMsg(msgEl(), "请至少填写一个时间"); return; }
    const now = Date.now();
    const past = [openAt && openAt <= now ? "开启" : "", closeAt && closeAt <= now ? "关闭" : ""].filter(Boolean);
    if (past.length && !confirm(`定时${past.join("和")}时间已过，保存后立即生效，继续？`)) return;
    const parts = [];
    if (openAt) parts.push(`${formatCnTime(openAt)} 开启`);
    if (closeAt) parts.push(`${formatCnTime(closeAt)} 关闭`);
    ticketAdminSet({ openAt, closeAt }, `已设定：${parts.join("，")}`);
  });
  $("ticketSchedClearBtn").addEventListener("click", () => {
    $("ticketOpenAtInput").value = "";
    $("ticketCloseAtInput").value = "";
    ticketAdminSet({ openAt: 0, closeAt: 0 }, "已清除定时开关");
  });

  /* ---- 票额与刷新 ---- */
  const extra = (sign) => {
    const n = intInput("ticketExtraInput", 1, 100000, "请填写 1 以上的整数");
    if (n === null) return;
    const cur = ticketAdmin.status?.round;
    if (sign < 0 && cur && cur.quota - n < 0) { setMsg(msgEl(), `本轮票额仅 ${cur.quota} 张`); return; }
    ticketAdminSet({ extraDelta: sign * n }, `本轮票额 ${sign > 0 ? "+" : "−"}${n}`).then((ok) => { if (ok) $("ticketExtraInput").value = ""; });
  };
  $("ticketExtraAddBtn").addEventListener("click", () => extra(1));
  $("ticketExtraSubBtn").addEventListener("click", () => extra(-1));
  $("ticketExtraClearBtn").addEventListener("click", () => {
    if (!confirm("清零本轮临时加票？")) return;
    ticketAdminSet({ extraSet: 0 }, "临时加票已清零");
  });
  $("ticketDailyBtn").addEventListener("click", () => {
    const next = ticketAdmin.status?.dailyOn === false;
    if (!next && !confirm("关闭每日刷新？\n\n之后仅在自定义刷新点刷新票额，当前轮次不受影响。")) return;
    ticketAdminSet({ dailyOn: next }, next ? "已打开每日刷新" : "已关闭每日刷新");
  });
  const saveReset = () => {
    const m = hhmmToMinutes($("ticketResetInput").value);
    if (m === null) { setMsg(msgEl(), "请填写刷新时间"); return; }
    if (m !== (ticketAdmin.status?.resetMin || 0) && !confirm(`每日刷新时间改为 ${minutesToHHMM(m)}？\n\n当前轮次不受影响。`)) return;
    $("ticketResetInput").blur();
    ticketAdminSet({ resetMin: m }, `每日刷新时间：${minutesToHHMM(m)}`);
  };
  $("ticketResetSaveBtn").addEventListener("click", saveReset);
  onEnter("ticketResetInput", saveReset);
  const saveLimit = () => {
    const n = intInput("ticketLimitInput", 0, 100000, "每日票额需为 0 以上的整数");
    if (n === null) return;
    const applyCur = !$("ticketLimitCurWrap").hidden && $("ticketLimitCurChk").checked;
    ticketAdminSet({ limit: n, limitApplyCurrent: applyCur },
      applyCur ? `每日票额已设为 ${n} 张（当前这一轮也改成 ${n} 张）` : `每日票额已设为 ${n} 张（从下一次每日刷新开始）`);
  };
  $("ticketLimitSaveBtn").addEventListener("click", saveLimit);
  onEnter("ticketLimitInput", saveLimit);

  const pointsList = $("ticketPointsList");
  pointsList.addEventListener("input", () => { ticketAdmin.pointsDirty = true; });
  pointsList.addEventListener("click", (e) => {
    const del = e.target.closest("[data-point-del]");
    if (!del) return;
    del.closest("[data-point]").remove();
    ticketAdmin.pointsDirty = true;
    if (!pointsList.querySelector("[data-point]")) pointsList.innerHTML = `<p class="ta-empty" data-points-empty>暂无自定义刷新点</p>`;
  });
  $("ticketPointAddBtn").addEventListener("click", () => {
    pointsList.querySelector("[data-points-empty]")?.remove();
    pointsList.insertAdjacentHTML("beforeend", ticketPointRowHtml("", ticketAdmin.status?.limit ?? ""));
    ticketAdmin.pointsDirty = true;
    pointsList.querySelector("[data-point]:last-child .ta-point-at")?.focus();
  });
  $("ticketPointSaveBtn").addEventListener("click", async () => {
    const rows = [...pointsList.querySelectorAll("[data-point]")];
    const points = [];
    for (const [i, row] of rows.entries()) {
      const atRaw = row.querySelector(".ta-point-at").value;
      const qtyRaw = row.querySelector(".ta-point-qty").value.trim();
      const at = cnLocalToEpoch(atRaw);
      const qty = Number(qtyRaw);
      if (!at) { setMsg(msgEl(), `第 ${i + 1} 个刷新点缺少时间`); return; }
      if (qtyRaw === "" || !Number.isInteger(qty) || qty < 0) { setMsg(msgEl(), `第 ${i + 1} 个刷新点票额无效`); return; }
      points.push({ at, qty });
    }
    const minutes = points.map((p) => Math.floor(p.at / 60000));
    if (new Set(minutes).size !== minutes.length) { setMsg(msgEl(), "刷新点时间重复"); return; }
    const past = points.filter((p) => p.at <= Date.now());
    if (past.length && !confirm(`${past.length} 个刷新点时间已过：${past.map((p) => formatCnTime(p.at)).join("、")}\n\n保存后将立即以最晚的一个开始新一轮，继续？`)) return;
    ticketAdmin.pointsDirty = false;
    const ok = await ticketAdminSet({ points }, points.length ? `已保存 ${points.length} 个刷新点` : "已清空自定义刷新点");
    if (!ok) ticketAdmin.pointsDirty = true;
  });
  $("ticketPointResetBtn").addEventListener("click", () => {
    ticketAdmin.pointsDirty = false;
    renderTicketAdmin();
  });

  const saveNext = () => {
    const n = intInput("ticketNextInput", 0, 100000, "下一次刷新的票额需为 0 以上的整数");
    if (n === null) return;
    if (ticketAdmin.pointsDirty && ticketAdmin.status?.nextRefresh?.kind === "custom"
      && !confirm("自定义刷新点列表里有还没保存的修改，会被这次保存覆盖。继续吗？")) return;
    ticketAdmin.pointsDirty = false;
    ticketAdminSet({ nextQty: n }, `下一次刷新的票额已设为 ${n} 张`);
  };
  $("ticketNextSaveBtn").addEventListener("click", saveNext);
  onEnter("ticketNextInput", saveNext);
  $("ticketNextResetBtn").addEventListener("click", () => ticketAdminSet({ nextQty: null }, "下一次刷新恢复默认票额"));

  /* ---- 购票页显示 ---- */
  const REMAIN_MODE_TEXT = { full: "购票页显示具体余票张数", range: "购票页只显示余票大致范围", hidden: "购票页不显示余票" };
  $("ticketRemainModeSelect").addEventListener("change", (e) => {
    const v = e.target.value;
    e.target.blur();
    ticketAdminSet({ remainingMode: v }, REMAIN_MODE_TEXT[v] || "已保存");
  });
  $("ticketShowSchedBtn").addEventListener("click", () => {
    const next = ticketAdmin.status?.showSchedule === false;
    ticketAdminSet({ showSchedule: next }, next ? "购票页显示定时开启 / 关闭时间" : "购票页不显示定时开启 / 关闭时间");
  });
  $("ticketShowResetBtn").addEventListener("click", () => {
    const next = ticketAdmin.status?.showReset === false;
    ticketAdminSet({ showReset: next }, next ? "购票页显示刷新时间" : "购票页不显示刷新时间");
  });
  $("ticketViewerBtn").addEventListener("click", () => {
    const next = ticketAdmin.status?.viewerEnabled === false;
    ticketAdminSet({ viewerEnabled: next }, next ? "「购票情况」已开放" : "「购票情况」已关闭");
  });
  document.querySelectorAll("#ticketAdminPanel [data-ta-flag]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const flag = btn.dataset.taFlag;
      const next = !ticketAdmin.status?.[flag];
      if (btn.dataset.confirmOn && next && !confirm(btn.dataset.confirmOn)) return;
      ticketAdminSet({ [flag]: next }, next ? btn.dataset.toastOn : btn.dataset.toastOff);
    });
  });
  const saveIdle = () => {
    const n = intInput("ticketIdleInput", 0, 1440, "停留时限需为 0–1440 的整数");
    if (n !== null) ticketAdminSet({ idleMin: n }, n ? `停留时限：${n} 分钟` : "已取消停留时限");
  };
  $("ticketIdleSaveBtn").addEventListener("click", saveIdle);
  onEnter("ticketIdleInput", saveIdle);

  /* ---- 购票须知 ---- */
  $("ticketGuideEditor").addEventListener("toggle", (e) => { if (e.currentTarget.open) loadTicketGuideEditor(); });
  $("ticketGuideInput").addEventListener("input", () => {
    clearTimeout($("ticketGuideInput")._t);
    $("ticketGuideInput")._t = setTimeout(renderTicketGuidePreview, 250);
  });
  $("ticketGuideSaveBtn").addEventListener("click", (e) => withAdminBusy(e.currentTarget, async () => {
    if (!ticketAdmin.guideLoaded) { setMsg($("ticketGuideMsg"), "读取中，请稍候"); return; }
    setMsg($("ticketGuideMsg"), "");
    await saveTicketGuide($("ticketGuideInput").value);
  }));
  $("ticketGuideResetBtn").addEventListener("click", (e) => withAdminBusy(e.currentTarget, async () => {
    if (!confirm("恢复默认须知？")) return;
    $("ticketGuideInput").value = TICKET_GUIDE_DEFAULT;
    renderTicketGuidePreview();
    ticketAdmin.guideLoaded = true;
    await saveTicketGuide(TICKET_GUIDE_DEFAULT);
  }));

  /* ---- 只读端 ---- */
  const saveLogHours = () => {
    const n = intInput("ticketLogHoursInput", 1, 720, "日志间隔需为 1–720 的整数");
    if (n !== null) ticketAdminSet({ viewerLogHours: n }, `日志间隔：${n} 小时`);
  };
  $("ticketLogHoursSaveBtn").addEventListener("click", saveLogHours);
  onEnter("ticketLogHoursInput", saveLogHours);
  $("ticketLogBtn").addEventListener("click", (e) => withAdminBusy(e.currentTarget, loadTicketLog));

  /* ---- 详细订单 ---- */
  $("ticketDaySelect").addEventListener("change", (e) => {
    ticketAdmin.day = e.target.value;
    renderTicketAdmin();
  });
  $("ticketSearchInput").addEventListener("input", (e) => {
    ticketAdmin.search = e.target.value.trim();
    renderTicketOrders();
  });
  $("ticketAdminTbody").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const id = Number(btn.closest("[data-order-id]").dataset.orderId);
    const order = ticketAdmin.orders.find((o) => o.id === id);
    if (!order) return;
    const act = btn.dataset.act;
    if (act === "edit") { openTicketEdit(order); return; }
    if (act === "partial") { openTicketPartial(order); return; }
    const toVoid = act === "void";
    if (toVoid && !confirm(`作废第 ${order.seq} 号（${order.qty} 张）？票额将放回本轮。`)) return;
    btn.disabled = true;
    try { await ticketAdminVoid(id, toVoid); } finally { btn.disabled = false; }
  });
  $("ticketAdminTbody").addEventListener("change", (e) => {
    const input = e.target.closest("[data-pick]");
    if (!input) return;
    const id = Number(input.closest("[data-order-id]").dataset.orderId);
    ticketTogglePickup(id, input.checked, input);
  });
  $("ticketEditBox").addEventListener("click", (e) => {
    const t = e.target;
    if (t.closest("#teCancel") || t.closest("#tpClose")) { closeTicketEdit(); return; }
    if (t.closest("#teSave")) { saveTicketEdit(); return; }
    if (t.closest("#teAddHolder")) {
      collectTicketEditHolders();
      if (ticketAdmin.editHolders.length >= 50) { setMsg($("teMsg"), "一单最多 50 位持票人"); return; }
      ticketAdmin.editHolders.push({ name: "", server: "" });
      renderTicketEditHolders();
      return;
    }
    const del = t.closest("[data-h-del]");
    if (del) {
      collectTicketEditHolders();
      ticketAdmin.editHolders.splice(Number(del.closest("[data-h]").dataset.h), 1);
      renderTicketEditHolders();
      return;
    }
    const pv = t.closest("[data-pv]");
    if (pv) {
      pv.disabled = true;
      ticketPartialVoid(Number(pv.dataset.pv), pv.dataset.pvVoid === "1").finally(() => { pv.disabled = false; });
    }
  });
  $("ticketEditBox").addEventListener("change", (e) => {
    const chk = e.target.closest(".te-pending");
    if (chk) {
      const row = chk.closest("[data-h]");
      row.querySelector(".te-name").disabled = chk.checked;
      row.querySelector(".te-server").disabled = chk.checked;
    }
  });
  $("ticketEditBox").addEventListener("focusout", (e) => {
    const input = e.target.closest(".te-name");
    if (input) input.value = normalizeTicketName(input.value);
  });

  /* ---- 售票统计 ---- */
  $("ticketStatsRound").addEventListener("change", (e) => {
    ticketAdmin.statsRound = e.target.value;
    renderTicketStats();
  });
  $("ticketStatsBody").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-copy-unpicked]");
    if (btn) copyTicketUnpicked(btn.dataset.copyUnpicked);
  });

  /* ---- 刷新 / 导出 / 清空 ---- */
  $("ticketRefreshBtn").addEventListener("click", (e) => withAdminBusy(e.currentTarget, async () => {
    if (await refreshTicketAdmin()) showToast("已刷新");
  }));
  $("ticketExportBtn").addEventListener("click", (e) => withAdminBusy(e.currentTarget, async (msg) => {
    if (!(await refreshTicketAdmin())) {
      setMsg(msg, "读取购票数据失败，未导出");
      return;
    }
    try {
      await exportTicketExcel();
    } catch (err) {
      console.error(err);
      setMsg(msg, "导出失败：表格组件加载不出来，检查一下网络后再试");
    }
  }));
  $("ticketClearBtn").addEventListener("click", (e) => withAdminBusy(e.currentTarget, async (msg) => {
    if (!(await refreshTicketAdmin())) {
      setMsg(msg, "读取购票数据失败，未执行清空");
      return;
    }
    const n = ticketAdmin.orders.length;
    const voidedN = ticketAdmin.orders.filter((o) => o.voided).length;
    if (!confirm(`清空全部购票数据？共 ${n} 单${voidedN ? `，含作废 ${voidedN} 单` : ""}\n\n将先下载 Excel 备份，清空后无法恢复。`)) return;
    if (n) {
      try {
        await exportTicketExcel("_清空前备份");
      } catch (err) {
        console.error(err);
        setMsg(msg, "备份导出失败，已取消清空。检查网络后再试");
        return;
      }
    }
    const data = await callWorker({ action: "ticket_admin_clear", password: internalAdminPassword, confirm: "CLEAR" });
    if (!data || !data.ok) {
      setMsg(msg, adminErr(data, "清空失败，请重新登录内部入口后再试"));
      return;
    }
    await refreshTicketAdmin();
    showToast(n ? "已备份并清空购票数据" : "购票数据已清空");
  }));

  /* 每分钟自动刷新（编辑中或在设置页时跳过） */
  clearInterval(ticketAdminTimer);
  ticketAdminTimer = setInterval(() => {
    if (document.hidden || isTicketViewer() || !internalAdminPassword) return;
    const panel = $("ticketAdminPanel");
    if (panel.hidden || $("adminModalOverlay").hidden || ticketAdmin.edit || ticketAdmin.tab === "settings") return;
    runQuietly(refreshTicketAdmin);
  }, 60 * 1000);
}

/* ==== 5. 反馈建议箱 ==== */
const feedbackAdmin = { items: [], loaded: false };

function renderFeedbackAdmin() {
  const cat = $("feedbackFilterCat").value;
  const state = $("feedbackFilterState").value;
  const items = feedbackAdmin.items;
  const openN = items.filter((i) => !i.handled).length;
  $("feedbackAdminStatus").textContent = items.length
    ? `共 ${items.length} 条，未处理 ${openN} 条`
    : "暂无反馈";
  const badge = $("feedbackPillBadge");
  badge.hidden = !openN;
  badge.textContent = openN > 99 ? "99+" : String(openN);

  const list = items.filter((i) => (!cat || i.category === cat)
    && (!state || (state === "done" ? i.handled : !i.handled)));
  $("feedbackAdminList").innerHTML = list.length ? list.map((i) => {
    return `<div class="fb-item${i.handled ? " is-done" : ""}" data-fb-id="${i.id}">
      <div class="fb-head">
        <span class="fb-cat fb-cat-${escapeHtml(i.category)}">${escapeHtml(FEEDBACK_CATEGORIES[i.category] || i.category)}</span>
        <span class="fb-time">${escapeHtml(formatCnTime(i.createdAt))}</span>
        ${submitMetaHtml(i)}
        ${i.handled ? `<span class="fb-state">已处理</span>` : ""}
      </div>
      <div class="fb-body">${escapeHtml(i.content)}</div>
      <div class="fb-contact">${i.contact ? `联系方式：<b>${escapeHtml(i.contact)}</b>` : "未留联系方式"}</div>
      <div class="fb-actions">
        ${i.contact ? `<button type="button" class="tt-act is-copy" data-fb-act="copy">复制联系方式</button>` : ""}
        <button type="button" class="tt-act ${i.handled ? "is-reopen" : "is-restore"}" data-fb-act="mark">${i.handled ? "标记为未处理" : "标记已处理"}</button>
        <button type="button" class="tt-act is-void" data-fb-act="delete">删除</button>
      </div>
    </div>`;
  }).join("") : `<p class="fb-empty">${items.length ? "无匹配结果" : "暂无反馈"}</p>`;
}

async function refreshFeedbackAdmin() {
  const data = await callWorker({ action: "feedback_admin_list", password: internalAdminPassword });
  if (!data || !data.ok) {
    $("feedbackAdminStatus").textContent = adminErr(data, "读取失败，请重新登录内部入口后再试");
    return false;
  }
  feedbackAdmin.items = data.items;
  feedbackAdmin.loaded = true;
  renderFeedbackAdmin();
  return true;
}

function initFeedbackAdmin() {
  $("feedbackFilterCat").insertAdjacentHTML("beforeend",
    Object.entries(FEEDBACK_CATEGORIES).map(([k, v]) => `<option value="${k}">${v}</option>`).join(""));
  $("feedbackFilterCat").addEventListener("change", renderFeedbackAdmin);
  $("feedbackFilterState").addEventListener("change", renderFeedbackAdmin);
  $("feedbackRefreshBtn").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try { if (await refreshFeedbackAdmin()) showToast("已刷新"); } finally { btn.disabled = false; }
  });
  $("feedbackAdminList").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-fb-act]");
    if (!btn) return;
    const id = Number(btn.closest("[data-fb-id]").dataset.fbId);
    const item = feedbackAdmin.items.find((i) => i.id === id);
    if (!item) return;
    const msg = $("feedbackAdminMsg");
    setMsg(msg, "");
    const act = btn.dataset.fbAct;
    if (act === "copy") { copyText(item.contact, "联系方式已复制", item.contact); return; }
    if (act === "delete" && !confirm("确定删除这条反馈吗？删除后无法恢复。")) return;
    btn.disabled = true;
    const data = act === "mark"
      ? await callWorker({ action: "feedback_admin_mark", password: internalAdminPassword, id, handled: !item.handled })
      : await callWorker({ action: "feedback_admin_delete", password: internalAdminPassword, id });
    btn.disabled = false;
    if (!data || !data.ok) { setMsg(msg, adminErr(data, "操作失败，请重新登录内部入口后再试")); return; }
    if (act === "mark") item.handled = !!data.handled;
    else feedbackAdmin.items = feedbackAdmin.items.filter((i) => i.id !== id);
    renderFeedbackAdmin();
    showToast(act === "mark" ? (item.handled ? "已标记为已处理" : "已标记为未处理") : "已删除");
  });
}

/* ==== 6. 场地预约 ==== */
const venueAdmin = { items: [], today: "", editingId: null, loaded: false };

const VENUE_SOURCE_TEXT = { web: "网站登记", admin: "后台录入", import: "金数据导入" };

function venueAdminFiltered() {
  const state = $("venueFilterState").value;
  const time = $("venueFilterTime").value;
  const today = venueAdmin.today || cnDate(0);
  const list = venueAdmin.items.filter((i) =>
    (!state || (state === "void" ? i.voided : !i.voided))
    && (!time || (time === "upcoming" ? i.date >= today : i.date < today)));
  list.sort((a, b) => (time === "upcoming"
    ? a.date.localeCompare(b.date) || a.id - b.id
    : b.date.localeCompare(a.date) || b.id - a.id));
  return list;
}

function renderVenueAdmin() {
  const items = venueAdmin.items;
  const today = venueAdmin.today || cnDate(0);
  const live = items.filter((i) => !i.voided);
  const upcoming = live.filter((i) => i.date >= today).length;
  const voided = items.length - live.length;
  $("venueAdminStatus").textContent = items.length
    ? `共 ${items.length} 条 · 有效 ${live.length} 条 · 近期 ${upcoming} 条${voided ? ` · 已作废 ${voided} 条` : ""}`
    : "暂无登记";

  const list = venueAdminFiltered();
  $("venueAdminList").innerHTML = list.length ? list.map((i) => {
    const past = i.date < today;
    const rows = venueSummaryRows(i).filter(([k]) => !["预约日期", "申请身份", "使用意向", "预约场地"].includes(k));
    return `<div class="fb-item venue-item${i.voided ? " is-void" : ""}${past ? " is-past" : ""}" data-venue-id="${i.id}">
      <div class="fb-head">
        <span class="venue-date">${escapeHtml(venueDateLabel(i.date))}</span>
        ${i.voided ? `<span class="venue-tag is-void">已作废</span>` : past ? `<span class="venue-tag">已过去</span>` : ""}
        <span class="fb-time">#${i.id} · ${escapeHtml(VENUE_SOURCE_TEXT[i.source] || i.source)}</span>
      </div>
      <div class="venue-tags">
        <span class="fb-cat">${escapeHtml(venueIdentityText(i))}</span>
        <span class="fb-cat venue-purpose">${escapeHtml(venuePurposeText(i))}</span>
      </div>
      <div class="venue-places-line">${(i.places || []).map((p) => `<span class="venue-chip">${escapeHtml(venuePlaceLabel(p))}</span>`).join("")}</div>
      <dl class="venue-kv">${rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join("")}</dl>
      ${i.adminNote ? `<p class="venue-note"><b>管理备注</b>${escapeHtml(i.adminNote)}</p>` : ""}
      <p class="fb-contact">提交于 ${escapeHtml(formatCnTime(i.createdAt))}${i.updatedAt ? ` · 修改于 ${escapeHtml(formatCnTime(i.updatedAt))}` : ""}${submitMetaHtml(i)}</p>
      <div class="fb-actions">
        ${i.contact ? `<button type="button" class="tt-act is-copy" data-venue-act="copy">复制联系方式</button>` : ""}
        <button type="button" class="tt-act" data-venue-act="edit">修改</button>
        ${i.voided
          ? `<button type="button" class="tt-act is-restore" data-venue-act="restore">恢复</button>`
          : `<button type="button" class="tt-act is-void" data-venue-act="void">作废</button>`}
      </div>
    </div>`;
  }).join("") : `<p class="fb-empty">${items.length ? "无匹配结果" : "暂无登记"}</p>`;
}

async function refreshVenueAdmin() {
  const data = await callWorker({ action: "venue_admin_list", password: internalAdminPassword });
  if (!data || !data.ok) {
    $("venueAdminStatus").textContent = adminErr(data, "读取失败，请重新登录内部入口后再试");
    return false;
  }
  venueAdmin.items = data.items;
  venueAdmin.today = data.today || cnDate(0);
  venueAdmin.loaded = true;
  renderVenueAdmin();
  return true;
}

function openVenueEditor(item = null) {
  venueAdmin.editingId = item ? item.id : null;
  const root = $("venueAdminFields");
  if (item) fillVenueForm(root, item);
  else clearVenueForm(root);
  $("venueEditTitle").textContent = item ? `修改登记 #${item.id}` : "新增预约";
  $("venueAdminSaveBtn").textContent = item ? "保存修改" : "保存";
  setMsg($("venueAdminFormMsg"), "");
  $("venueEditBox").hidden = false;
  $("venueNewBtn").disabled = true;
  $("venueEditBox").scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeVenueEditor() {
  venueAdmin.editingId = null;
  $("venueEditBox").hidden = true;
  $("venueNewBtn").disabled = false;
  clearVenueForm($("venueAdminFields"));
}

async function saveVenueAdmin(e) {
  e.preventDefault();
  const msg = $("venueAdminFormMsg");
  const form = readVenueForm($("venueAdminFields"));
  if (form.error) {
    setMsg(msg, form.error);
    form.focus?.focus();
    return;
  }
  const id = venueAdmin.editingId;
  const btn = $("venueAdminSaveBtn");
  btn.disabled = true;
  setMsg(msg, "");
  const data = await callWorker({
    action: "venue_admin_save", password: internalAdminPassword, ...(id ? { id } : {}), ...form.payload,
  });
  btn.disabled = false;
  if (!data || !data.ok) {
    setMsg(msg, adminErr(data, "保存失败，请重新登录内部入口后再试", VENUE_ERRORS));
    return;
  }
  const at = venueAdmin.items.findIndex((i) => i.id === data.item.id);
  if (at >= 0) venueAdmin.items[at] = data.item;
  else venueAdmin.items.push(data.item);
  closeVenueEditor();
  renderVenueAdmin();
  showToast(id ? `登记 #${id} 已保存` : `已新增登记 #${data.item.id}`);
}

async function venueAdminVoid(item, voided) {
  const msg = $("venueAdminMsg");
  setMsg(msg, "");
  const data = await callWorker({ action: "venue_admin_void", password: internalAdminPassword, id: item.id, voided });
  if (!data || !data.ok) {
    if (data && data.error === "not_changed") {
      setMsg(msg, "状态已变化，已刷新");
      await refreshVenueAdmin();
      return;
    }
    setMsg(msg, adminErr(data, "操作失败，请重新登录内部入口后再试"));
    return;
  }
  const at = venueAdmin.items.findIndex((i) => i.id === data.item.id);
  if (at >= 0) venueAdmin.items[at] = data.item;
  renderVenueAdmin();
  showToast(voided ? `登记 #${item.id} 已作废` : `登记 #${item.id} 已恢复`);
}

function initVenueAdmin() {
  buildVenueForm($("venueAdminFields"), { prefix: "vfa", admin: true });
  ["input", "change"].forEach((t) => $("venueAdminFields").addEventListener(t, () => setMsg($("venueAdminFormMsg"), "")));
  $("venueFilterState").addEventListener("change", renderVenueAdmin);
  $("venueFilterTime").addEventListener("change", renderVenueAdmin);
  $("venueRefreshBtn").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try { if (await refreshVenueAdmin()) showToast("已刷新"); } finally { btn.disabled = false; }
  });
  $("venueNewBtn").addEventListener("click", () => openVenueEditor(null));
  $("venueAdminCancelBtn").addEventListener("click", closeVenueEditor);
  $("venueAdminForm").addEventListener("submit", saveVenueAdmin);
  $("venueAdminList").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-venue-act]");
    if (!btn) return;
    const id = Number(btn.closest("[data-venue-id]").dataset.venueId);
    const item = venueAdmin.items.find((i) => i.id === id);
    if (!item) return;
    const act = btn.dataset.venueAct;
    if (act === "copy") { copyText(item.contact, "联系方式已复制", item.contact); return; }
    if (act === "edit") {
      if (venueAdmin.editingId && venueAdmin.editingId !== id
        && !confirm(`#${venueAdmin.editingId} 的修改尚未保存，放弃并改为修改 #${id}？`)) return;
      openVenueEditor(item);
      return;
    }
    if (act === "void" && !confirm(`确定作废登记 #${id}（${venueDateLabel(item.date)} · ${item.charId || item.contact}）吗？\n\n作废后不会删除，切到「已作废」还能恢复。`)) return;
    btn.disabled = true;
    try { await venueAdminVoid(item, act === "void"); } finally { btn.disabled = false; }
  });
}

/* ==== 7. 活动问卷 ==== */
/* 统计仅含有效答卷；「第 n 份」为有效答卷顺序，#编号 为数据库编号 */
const surveyAdmin = { items: [], open: true, lockdown: false, loaded: false, readonly: false };

const surveyAdminValid = () => surveyAdmin.items.filter((i) => !i.voided);

function surveyAdminSeqMap() {
  const m = new Map();
  surveyAdminValid().forEach((it, i) => m.set(it.id, i + 1));
  return m;
}

/* 字段 → { n, counts, sum, dist, texts } */
function surveyAdminStats(items) {
  const st = {};
  SURVEY_FIELDS.forEach((f) => {
    st[f.key] = { n: 0, counts: {}, sum: 0, dist: Array(11).fill(0), texts: [] };
  });
  items.forEach((it) => {
    const a = it.answers || {};
    SURVEY_FIELDS.forEach((f) => {
      const v = a[f.key];
      if (v === undefined || v === null || v === "") return;
      const s = st[f.key];
      if (f.type === "score") {
        if (!Number.isInteger(v) || v < 1 || v > 10) return;
        s.n++; s.sum += v; s.dist[v]++;
      } else if (f.type === "single" || f.type === "multi") {
        const list = Array.isArray(v) ? v : [v];
        if (!list.length) return;
        s.n++;
        list.forEach((k) => { s.counts[k] = (s.counts[k] || 0) + 1; });
      } else {
        s.n++;
        s.texts.push({ id: it.id, text: String(v) });
      }
    });
  });
  return st;
}

const surveyAvg = (s) => (s.n ? (s.sum / s.n).toFixed(1) : "—");
const surveyPct = (k, n) => (n ? Math.round((k / n) * 100) : 0);

function surveyTextsHtml(title, texts, seq) {
  if (!texts.length) return "";
  return `<details class="sv-texts"><summary>${escapeHtml(title)}（${texts.length} 条）</summary><ul>`
    + texts.map((t) => `<li><span class="sv-text-id">${seq.has(t.id) ? `第 ${seq.get(t.id)} 份` : `#${t.id}`}</span>${escapeHtml(t.text)}</li>`).join("")
    + `</ul></details>`;
}

function renderSurveyAdminStats() {
  const valid = surveyAdminValid();
  const box = $("surveyAdminStats");
  if (!valid.length) {
    box.innerHTML = `<p class="fb-empty">${surveyAdmin.items.length ? "暂无有效答卷" : "暂无答卷"}</p>`;
    return;
  }
  const st = surveyAdminStats(valid);
  const seq = surveyAdminSeqMap();

  /* 评分一览：总评在前，各项目在后 */
  const scoreItems = [
    ...SURVEY_ITEMS.filter((it) => it.kind === "score" && !it.card),
    ...SURVEY_ITEMS.filter((it) => it.kind === "score" && it.card),
  ];
  const overview = `<div class="sv-overview"><p class="sv-stat-sec">评分一览（平均分，满分 10 分）</p><dl class="sv-overview-list">`
    + scoreItems.map((it) => {
      const s = st[it.key];
      return `<div class="sv-ov-item${s.n ? "" : " is-empty"}"><dt>${escapeHtml(it.card ? `项目 · ${it.card.title}` : it.short || it.label)}</dt>`
        + `<dd><b>${surveyAvg(s)}</b><small>${s.n} 人</small></dd></div>`;
    }).join("") + `</dl></div>`;

  const blocks = SURVEY.sections.map((sec, si) => {
    const inner = SURVEY_ITEMS.filter((it) => it.section === si).map((it) => {
      const s = st[it.key];
      if (it.kind === "choice") {
        const max = Math.max(1, ...it.options.map((o) => s.counts[o.key] || 0));
        const bars = it.options.map((o) => {
          const k = s.counts[o.key] || 0;
          return `<div class="sv-bar-row"><span class="sv-bar-key">${escapeHtml(o.label)}</span>`
            + `<span class="sv-bar"><i style="width:${(k / max) * 100}%"></i></span>`
            + `<span class="sv-bar-n">${k}<small>${surveyPct(k, s.n)}%</small></span></div>`;
        }).join("");
        const other = it.other ? surveyTextsHtml("其他", st[it.other.key].texts, seq) : "";
        return `<div class="sv-stat"><p class="sv-stat-title">${escapeHtml(it.label)}</p>`
          + `<p class="sv-stat-meta">${s.n} 人作答</p>`
          + `<div class="sv-bars">${bars}</div>${other}</div>`;
      }
      if (it.kind === "score") {
        const max = Math.max(1, ...s.dist.slice(1));
        const hist = s.dist.slice(1).map((k, i) => `<span class="sv-hist-col" title="${i + 1} 分：${k} 人">`
          + `<span class="sv-hist-bar"><i style="height:${(k / max) * 100}%"></i></span>`
          + `<span class="sv-hist-n">${k}</span><span class="sv-hist-k">${i + 1}</span></span>`).join("");
        const note = it.comment ? surveyTextsHtml("意见或建议", st[it.comment.key].texts, seq) : "";
        const title = it.card
          ? `${escapeHtml(it.card.title)}<small>${escapeHtml(it.card.sub)}</small>`
          : escapeHtml(it.label);
        return `<div class="sv-stat${it.card ? " is-card" : ""}"><p class="sv-stat-title">${title}</p>`
          + `<p class="sv-stat-meta">${s.n ? `${s.n} 人 · 平均 <b>${surveyAvg(s)}</b> 分` : "暂无评分"}</p>`
          + (s.n ? `<div class="sv-hist" aria-label="1～10 分各有多少人">${hist}</div>` : "") + note + `</div>`;
      }
      return `<div class="sv-stat"><p class="sv-stat-title">${escapeHtml(it.label)}</p>`
        + `<p class="sv-stat-meta">${s.n ? `${s.n} 条` : "暂无"}</p>`
        + surveyTextsHtml("展开查看", s.texts, seq) + `</div>`;
    }).join("");
    return `<p class="sv-stat-sec">${SURVEY_SECTION_NO[si] || si + 1}、${escapeHtml(sec.title)}</p>${inner}`;
  }).join("");
  box.innerHTML = overview + blocks;
}

function renderSurveyAdminList() {
  const state = $("surveyFilterState").value;
  const seq = surveyAdminSeqMap();
  const list = surveyAdmin.items
    .filter((i) => !state || (state === "void" ? i.voided : !i.voided))
    .slice().sort((a, b) => b.id - a.id);
  $("surveyAdminList").innerHTML = list.length ? list.map((i) => {
    const a = i.answers || {};
    const rows = SURVEY_FIELDS.filter((f) => a[f.key] !== undefined && a[f.key] !== "").map((f) => {
      const v = f.type === "score" ? `${a[f.key]} 分` : surveyAnswerText(f.key, a[f.key]);
      return `<dt>${escapeHtml(surveyFieldHeader(f.key))}</dt><dd>${escapeHtml(v)}</dd>`;
    }).join("");
    return `<div class="fb-item venue-item survey-item${i.voided ? " is-void" : ""}" data-sv-id="${i.id}">
      <div class="fb-head">
        <span class="venue-date">${i.voided ? `#${i.id}` : `第 ${seq.get(i.id)} 份`}</span>
        ${i.voided ? `<span class="venue-tag is-void">已作废</span>` : ""}
        <span class="fb-time">#${i.id} · ${escapeHtml(formatCnTime(i.createdAt))}</span>
        ${submitMetaHtml(i)}
      </div>
      <dl class="venue-kv">${rows}</dl>
      <div class="fb-actions">
        ${a.contact ? `<button type="button" class="tt-act is-copy" data-sv-act="copy">复制联系方式</button>` : ""}
        ${surveyAdmin.readonly ? "" : i.voided
          ? `<button type="button" class="tt-act is-restore" data-sv-act="restore">恢复</button>`
          : `<button type="button" class="tt-act is-void" data-sv-act="void">作废</button>`}
      </div>
    </div>`;
  }).join("") : `<p class="fb-empty">${surveyAdmin.items.length ? "无匹配结果" : "暂无答卷"}</p>`;
}

function renderSurveyAdmin() {
  const items = surveyAdmin.items;
  const valid = surveyAdminValid().length;
  const voided = items.length - valid;
  $("surveyAdminStatus").textContent = items.length
    ? `共 ${items.length} 份 · 有效 ${valid} 份${voided ? ` · 已作废 ${voided} 份` : ""}`
    : "暂无答卷";
  setTicketSwitch($("surveyOpenBtn"), surveyAdmin.open, "已开放（点击关闭）", "已关闭（点击开放）");
  $("surveyLockNote").hidden = !surveyAdmin.lockdown;
  const view = $("surveyViewSelect").value;
  $("surveyFilterState").hidden = view !== "list";
  $("surveyAdminStats").hidden = view !== "stats";
  $("surveyAdminList").hidden = view !== "list";
  if (view === "list") renderSurveyAdminList();
  else renderSurveyAdminStats();
}

async function refreshSurveyAdmin() {
  const data = await callWorker({ action: "survey_admin_list", password: internalAdminPassword || internalViewPassword, survey: SURVEY.id });
  if (!data || !data.ok) {
    $("surveyAdminStatus").textContent = data?.error === "viewer_closed"
      ? "未开放"
      : adminErr(data, "读取失败", { bad_survey: `问卷「${SURVEY.id}」不存在` });
    return false;
  }
  surveyAdmin.readonly = !!data.readonly;
  $("surveyAdminPanel").classList.toggle("is-readonly", surveyAdmin.readonly);
  surveyAdmin.items = Array.isArray(data.items) ? data.items : [];
  surveyAdmin.open = data.open !== false;
  surveyAdmin.lockdown = !!data.lockdown;
  surveyAdmin.loaded = true;
  renderSurveyAdmin();
  return true;
}

/* Excel：答卷 / 统计 / 文字意见 */
async function exportSurveyExcel() {
  const ExcelJS = await loadExcelJs();
  const wb = new ExcelJS.Workbook();
  const valid = surveyAdminValid();
  const bold = { bold: true };

  const ws = wb.addWorksheet("答卷");
  ws.addRow(["第几份", "编号", "提交时间", "IP 属地", "验证方式", ...SURVEY_FIELDS.map((f) => surveyFieldHeader(f.key))]);
  ws.getRow(1).font = bold;
  valid.forEach((it, i) => {
    const a = it.answers || {};
    ws.addRow([i + 1, it.id, formatCnTime(it.createdAt), geoText(it.geo), verifyModeText(it.verifyMode), ...SURVEY_FIELDS.map((f) => {
      const v = a[f.key];
      if (f.type === "score") return typeof v === "number" ? v : null;
      return surveyAnswerText(f.key, v) || null;
    })]);
  });
  ws.getColumn(1).width = 7;
  ws.getColumn(2).width = 7;
  ws.getColumn(3).width = 18;
  ws.getColumn(4).width = 12;
  ws.getColumn(5).width = 10;
  SURVEY_FIELDS.forEach((f, i) => { ws.getColumn(i + 6).width = f.type === "score" ? 12 : f.type === "text" ? 30 : 24; });
  ws.views = [{ state: "frozen", xSplit: 1, ySplit: 1 }];

  const st = surveyAdminStats(valid);
  const sw = wb.addWorksheet("统计");
  sw.addRow([`有效答卷 ${valid.length} 份`]).font = bold;
  sw.addRow([]);
  sw.addRow(["打分题", "作答人数", "平均分", ...Array.from({ length: 10 }, (_, i) => `${i + 1}分`)]).font = bold;
  SURVEY_ITEMS.filter((it) => it.kind === "score").forEach((it) => {
    const s = st[it.key];
    sw.addRow([it.card ? `${it.card.title}（${it.card.sub}）` : it.label, s.n, s.n ? Number((s.sum / s.n).toFixed(2)) : null, ...s.dist.slice(1)]);
  });
  sw.addRow([]);
  sw.addRow(["选择题", "选项", "人数", "占作答人数"]).font = bold;
  SURVEY_ITEMS.filter((it) => it.kind === "choice").forEach((it) => {
    const s = st[it.key];
    it.options.forEach((o, oi) => {
      const k = s.counts[o.key] || 0;
      sw.addRow([oi === 0 ? `${it.label}（${s.n} 人作答）` : "", o.label, k, s.n ? `${surveyPct(k, s.n)}%` : "—"]);
    });
  });
  sw.getColumn(1).width = 52;
  sw.getColumn(2).width = 28;
  for (let c = 3; c <= 13; c++) sw.getColumn(c).width = 9;

  const tw = wb.addWorksheet("文字意见");
  tw.addRow(["题目", "第几份", "编号", "内容"]).font = bold;
  const seq = surveyAdminSeqMap();
  SURVEY_FIELDS.filter((f) => f.type === "text").forEach((f) => {
    st[f.key].texts.forEach((t) => tw.addRow([surveyFieldHeader(f.key), seq.get(t.id), t.id, t.text]));
  });
  tw.getColumn(1).width = 34;
  tw.getColumn(2).width = 8;
  tw.getColumn(3).width = 7;
  tw.getColumn(4).width = 80;
  tw.getColumn(4).alignment = { wrapText: true, vertical: "top" };

  await saveWorkbook(wb, `花街活动问卷_${SURVEY.id}`);
}

async function surveyAdminVoid(item, voided) {
  const msg = $("surveyAdminMsg");
  setMsg(msg, "");
  const data = await callWorker({ action: "survey_admin_void", password: internalAdminPassword, id: item.id, voided });
  if (!data || !data.ok) {
    if (data && data.error === "not_changed") {
      setMsg(msg, "这份答卷的状态已经变过了，已为你刷新");
      await refreshSurveyAdmin();
      return;
    }
    setMsg(msg, adminErr(data, "操作失败，请重新登录内部入口后再试"));
    return;
  }
  const at = surveyAdmin.items.findIndex((i) => i.id === data.item.id);
  if (at >= 0) surveyAdmin.items[at] = data.item;
  renderSurveyAdmin();
  showToast(voided ? `答卷 #${item.id} 已作废` : `答卷 #${item.id} 已恢复`);
}

function initSurveyAdmin() {
  $("surveyViewSelect").addEventListener("change", renderSurveyAdmin);
  $("surveyFilterState").addEventListener("change", renderSurveyAdmin);
  $("surveyRefreshBtn").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try { if (await refreshSurveyAdmin()) showToast("已刷新"); } finally { btn.disabled = false; }
  });
  $("surveyOpenBtn").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const next = !surveyAdmin.open;
    if (!next && !confirm("确定关闭问卷吗？\n\n关闭后访客看到「问卷已经结束收集」，不能再提交；已经收到的答卷不受影响，之后随时可以再开放。")) return;
    setMsg($("surveyAdminMsg"), "");
    btn.disabled = true;
    try {
      const data = await callWorker({ action: "survey_admin_set", password: internalAdminPassword, survey: SURVEY.id, open: next });
      if (!data || !data.ok) {
        setMsg($("surveyAdminMsg"), adminErr(data, "切换失败，请重新登录内部入口后再试"));
        return;
      }
      surveyAdmin.open = data.open;
      renderSurveyAdmin();
      showToast(data.open ? "问卷已开放" : "问卷已关闭");
    } finally {
      btn.disabled = false;
    }
  });
  $("surveyExportBtn").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const msg = $("surveyAdminMsg");
    setMsg(msg, "");
    btn.disabled = true;
    try {
      if (!(await refreshSurveyAdmin())) { setMsg(msg, "读取问卷数据失败，未导出"); return; }
      if (!surveyAdminValid().length) { setMsg(msg, "暂无有效答卷"); return; }
      await exportSurveyExcel();
    } catch (err) {
      console.error(err);
      setMsg(msg, "导出失败：表格组件加载不出来，检查一下网络后再试");
    } finally {
      btn.disabled = false;
    }
  });
  $("surveyCopyLinkBtn").addEventListener("click", () => {
    const url = `${location.origin}${location.pathname}${SURVEY_HASH}`;
    copyText(url, "问卷链接已复制", url);
  });
  $("surveyAdminList").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-sv-act]");
    if (!btn) return;
    const id = Number(btn.closest("[data-sv-id]").dataset.svId);
    const item = surveyAdmin.items.find((i) => i.id === id);
    if (!item) return;
    const act = btn.dataset.svAct;
    if (act === "copy") { copyText(item.answers.contact, "联系方式已复制", item.answers.contact); return; }
    if (act === "void" && !confirm(`作废答卷 #${id}？`)) return;
    btn.disabled = true;
    try { await surveyAdminVoid(item, act === "void"); } finally { btn.disabled = false; }
  });
}

/* ==== 8. 弹窗公告 ==== */
const popupAdmin = { saved: null, imageUrl: null, loaded: false };

const popupFormValue = () => ({
  title: $("popupTitleInput").value.trim(),
  body: $("popupBodyInput").value.replace(/\r\n?/g, "\n").trim(),
  image_url: popupAdmin.imageUrl || null,
});

function popupFormDirty() {
  const saved = popupAdmin.saved;
  if (!saved) return false;
  const v = popupFormValue();
  return v.title !== (saved.title || "") || v.body !== (saved.body || "") || v.image_url !== (saved.image_url || null);
}

function updatePopupBodyCount() {
  $("popupBodyCount").textContent = `${$("popupBodyInput").value.length} / 3000`;
}

function renderPopupAdminStatus() {
  const p = popupAdmin.saved;
  const btn = $("popupToggleBtn");
  if (!p) {
    $("popupAdminStatus").textContent = "当前状态：读取失败";
    btn.disabled = true;
    return;
  }
  const when = p.updated_at ? ` · 更新于 ${formatCnTime(p.updated_at)}` : "";
  $("popupAdminStatus").textContent = `当前状态：${p.enabled ? "已开启" : "已关闭"}${when}`;
  btn.textContent = p.enabled ? "关闭弹窗" : "开启弹窗";
  btn.disabled = false;
}

function fillPopupAdminForm(p) {
  $("popupTitleInput").value = p.title || "";
  $("popupBodyInput").value = p.body || "";
  popupAdmin.imageUrl = p.image_url || null;
  showImagePreview("popupImage", popupAdmin.imageUrl);
  updatePopupBodyCount();
}

async function refreshPopupAdmin() {
  $("popupAdminStatus").textContent = "当前状态：加载中…";
  $("popupToggleBtn").disabled = true;
  setMsg($("popupAdminMsg"), "");
  const data = await callWorker({ action: "popup_admin_get", password: internalAdminPassword });
  if (!data || !data.ok) {
    popupAdmin.saved = null;
    renderPopupAdminStatus();
    setMsg($("popupAdminMsg"), adminErr(data, "读取失败，请重新登录内部入口后再试"));
    return;
  }
  /* 表单有未保存的修改时保留 */
  const keepEdits = popupAdmin.loaded && popupFormDirty();
  popupAdmin.saved = data.popup;
  popupAdmin.loaded = true;
  if (!keepEdits) fillPopupAdminForm(data.popup);
  renderPopupAdminStatus();
  if (keepEdits) setMsg($("popupAdminMsg"), "有未保存的修改");
}

const POPUP_ERRORS = {
  empty: "标题、正文、配图至少填写一项",
  title_too_long: "标题最多 60 字",
  body_too_long: "正文最多 3000 字",
  bad_image_url: "配图无效，请重新上传",
};

async function savePopupAdmin(extra = {}) {
  const v = popupFormValue();
  if (!v.title && !v.body && !v.image_url) {
    setMsg($("popupAdminMsg"), POPUP_ERRORS.empty);
    return false;
  }
  const data = await callWorker({
    action: "popup_admin_save",
    password: internalAdminPassword,
    title: v.title,
    content: v.body,
    image_url: v.image_url,
    ...extra,
  });
  if (!data || !data.ok) {
    setMsg($("popupAdminMsg"), adminErr(data, "保存失败，请重新登录内部入口后再试", { ...POPUP_ERRORS, auth: "登录状态失效了，重新登录内部入口后再试" }));
    return false;
  }
  popupAdmin.saved = data.popup;
  fillPopupAdminForm(data.popup);
  renderPopupAdminStatus();
  setMsg($("popupAdminMsg"), "");
  return true;
}

function initPopupAdmin() {
  $("popupBodyInput").addEventListener("input", updatePopupBodyCount);
  bindImageUpload("popupImage", 2560, (url) => {
    popupAdmin.imageUrl = url;
    showImagePreview("popupImage", url);
    if (url) setMsg($("popupImageStatus"), "已上传，记得点「保存」");
  }, {
    notImage: "只能选图片",
    tooBig: (file) => `图片太大了（${(file.size / 1024 / 1024).toFixed(1)}MB），限 50MB`,
    processing: "图片处理中…",
    decodeFail: "这张图浏览器打不开，换一张试试（或先转成 JPG / PNG）",
    rateLimited: "上传太频繁了（每小时 10 张），歇一会儿再试",
    failed: "图片上传失败，请重试",
  });

  $("popupSaveBtn").addEventListener("click", () => withAdminBusy($("popupSaveBtn"), async () => {
    if (await savePopupAdmin()) {
      showToast(popupAdmin.saved.enabled ? "已保存，访客打开首页会看到新内容" : "已保存（弹窗目前是关着的）");
    }
  }));

  $("popupPreviewBtn").addEventListener("click", () => {
    const v = popupFormValue();
    if (!v.title && !v.body && !v.image_url) { setMsg($("popupAdminMsg"), "请先填写内容"); return; }
    openSitePopup(v, true);
  });

  $("popupToggleBtn").addEventListener("click", () => withAdminBusy($("popupToggleBtn"), async () => {
    const saved = popupAdmin.saved;
    if (!saved) return;
    const turnOn = !saved.enabled;
    setMsg($("popupAdminMsg"), "");
    if (turnOn && popupFormDirty()) {
      if (!confirm("保存修改并开启弹窗？")) return;
      if (await savePopupAdmin({ enabled: true })) showToast("已保存并开启弹窗");
      return;
    }
    const data = await callWorker({ action: "popup_admin_set", password: internalAdminPassword, enabled: turnOn });
    if (!data || !data.ok) {
      setMsg($("popupAdminMsg"), adminErr(data, "切换失败，请重新登录内部入口后再试", { empty: "请先保存内容" }));
      return;
    }
    popupAdmin.saved = data.popup;
    renderPopupAdminStatus();
    showToast(turnOn ? "弹窗公告已开启" : "弹窗公告已关闭");
  }));
}

/* ==== 9. 花语加密 ==== */
const HUAYU_ADMIN_MAX = 20000;
const HUAYU_MODE_NAME = { open: "完全开放", decrypt: "仅开放解密", off: "彻底关闭" };
const HUAYU_MODE_NOTE = {
  open: "访客可生成和解读花语",
  decrypt: "访客仅可解读花语",
  off: "隐藏入口，拒绝访客请求",
};
const HUAYU_ALGO_NOTE = {
  1: "一代：「听花语：」+ 草木字，篇幅最短",
  2: "二代：散文句式，长度约为一代的四五倍",
};
const HUAYU_ADMIN_ERRORS = {
  bad_key: "解密失败：密钥错误或花语被改动",
  need_key: "请输入自定义密钥",
  bad_key_input: "密钥不能为空，最长 128 字",
  bad_mode: "参数无效，请刷新页面",
  bad_algo: "参数无效，请刷新页面",
  no_key: "请先设置站点密钥",
  too_long: "内容过长",
  bad_input: "内容无效",
  empty: "请输入内容",
};
const huayuAdmin = { clearArmedAt: 0, resultCopy: "", detectTimer: 0 };

function setHuayuSeg(segId, value) {
  $(segId).querySelectorAll("input").forEach((r) => { r.checked = r.value === String(value); });
  syncSegments($(segId));
}
const huayuSegValue = (segId) => $(segId).querySelector("input:checked")?.value;

function renderHuayuAdmin(d) {
  setHuayuSeg("huayuModeSeg", d.mode);
  setHuayuSeg("huayuAlgoSeg", d.algo);
  setHuayuSeg("huayuAdminAlgoSeg", d.algo);
  $("huayuModeNote").textContent = HUAYU_MODE_NOTE[d.mode] || "";
  $("huayuAlgoNote").textContent = HUAYU_ALGO_NOTE[d.algo] || "";
  $("huayuAdminStatus").textContent = `当前状态：${HUAYU_MODE_NAME[d.mode] || d.mode} · ${d.algo === 1 ? "一代" : "二代"}算法`
    + (d.updatedAt ? ` · 更新于 ${formatCnTime(d.updatedAt)}` : "");
  const input = $("huayuKeyInput");
  if (document.activeElement !== input) input.value = d.key || "";
  $("huayuOldText").textContent = d.oldCount ? `保留着 ${d.oldCount} 个旧密钥，用它们写的花语仍能解开` : "没有保留旧密钥";
  $("huayuClearOldBtn").hidden = !d.oldCount;
  applyHuayuMode(d);
}

async function refreshHuayuVisits() {
  const summary = $("huayuVisitSummary");
  const data = await callWorker({ action: "huayu_admin_visits", password: internalAdminPassword });
  if (!data || !data.ok) {
    summary.textContent = adminErr(data, "读取失败");
    return;
  }
  summary.textContent = data.total ? `共 ${data.total} 次，今日 ${data.today} 次；显示最近 ${data.items.length} 次` : "暂无记录";
  $("huayuVisitList").innerHTML = data.items.map((v) => `<li>
    <span class="hy-visit-time">${escapeHtml(formatCnSeconds(v.at))}</span>
    <span title="${escapeHtml(geoTitle(v.geo))}">${escapeHtml(geoText(v.geo) || "—")}</span>
    <span>${escapeHtml(verifyModeText(v.verifyMode) || "—")}</span>
    <span class="hy-visit-id" title="访客标识">${escapeHtml(v.visitor)}</span>
  </li>`).join("");
}

async function refreshHuayuAdmin() {
  refreshHuayuVisits();
  $("huayuAdminStatus").textContent = "当前状态：加载中…";
  setMsg($("huayuSettingMsg"), "");
  loadHuayuJs({ quiet: true }).catch(() => {});   // 先在后台取，用到时多半已经好了
  const data = await callWorker({ action: "huayu_admin_get", password: internalAdminPassword });
  if (!data || !data.ok) {
    $("huayuAdminStatus").textContent = adminErr(data, "读取失败，请重新登录内部入口后再试");
    return;
  }
  renderHuayuAdmin(data);
}

async function saveHuayuAdmin(patch, okMsg, btn) {
  const msg = $("huayuSettingMsg");
  setMsg(msg, "");
  if (btn) btn.disabled = true;
  const data = await callWorker({ action: "huayu_admin_set", password: internalAdminPassword, ...patch });
  if (btn) btn.disabled = false;
  if (!data || !data.ok) {
    setMsg(msg, adminErr(data, "保存失败，请重新登录内部入口后再试", HUAYU_ADMIN_ERRORS));
    return false;
  }
  renderHuayuAdmin(data);
  showToast(okMsg);
  return true;
}

function syncHuayuAdminKeySeg() {
  syncSegments($("huayuAdminKeySeg"));
  const custom = huayuSegValue("huayuAdminKeySeg") === "custom";
  $("huayuAdminCustomKey").hidden = !custom;
  return custom;
}

/* 显示字数与花语代数；自定义密钥的花语自动切到「自定义密钥」 */
function syncHuayuAdminInput() {
  clearTimeout(huayuAdmin.detectTimer);
  if ($("huayuAdminInput").value.length > HUAYU_DETECT_NOW) huayuAdmin.detectTimer = setTimeout(syncHuayuAdminInputNow, 300);
  else syncHuayuAdminInputNow();
}

function syncHuayuAdminInputNow() {
  const text = $("huayuAdminInput").value;
  const H = window.HJHuayu;
  if (!H || !text) { $("huayuAdminCount").textContent = text ? `${text.length} 字` : ""; return; }
  const info = H.detect(text);
  if (!info.ok) { $("huayuAdminCount").textContent = `${H.countChars(text)} 字`; return; }
  $("huayuAdminCount").textContent = `${H.ALGO_NAMES[info.algo]}花语 ${H.countChars(text)} 字`;
  if (info.kind === 1) {
    setHuayuSeg("huayuAdminKeySeg", "custom");
    syncHuayuAdminKeySeg();
  }
}

function showHuayuAdminResult(label, text, meta, copyLabel) {
  $("huayuAdminResultLabel").textContent = label;
  $("huayuAdminResultMeta").textContent = meta;
  $("huayuAdminResultText").textContent = text;
  $("huayuAdminCopyBtn").textContent = copyLabel;
  huayuAdmin.resultCopy = text;
  $("huayuAdminResult").hidden = false;
}

async function huayuAdminConvert(dir, btn) {
  const msg = $("huayuAdminMsg");
  setMsg(msg, "");
  try {
    await loadHuayuJs();
  } catch (e) {
    setMsg(msg, "花语脚本 huayu.js 没有加载成功（没上传或被缓存挡住），刷新页面再试");
    return;
  }
  const H = window.HJHuayu;
  const input = $("huayuAdminInput").value;
  const custom = syncHuayuAdminKeySeg();
  const key = custom ? $("huayuAdminCustomKey").value.trim() : "";
  const auth = { password: internalAdminPassword };
  if (!input.trim()) { setMsg(msg, HUAYU_ADMIN_ERRORS.empty); return; }
  if (custom && !key) { setMsg(msg, "请输入自定义密钥"); $("huayuAdminCustomKey").focus(); return; }
  btn.disabled = true;
  try {
    if (dir === "seal") {
      if (H.countChars(input) > HUAYU_ADMIN_MAX) { setMsg(msg, `最多 ${HUAYU_ADMIN_MAX} 字`); return; }
      const algo = Number(huayuSegValue("huayuAdminAlgoSeg")) || 2;
      const res = await H.encrypt(input, { algo, post: callWorker, auth, key });
      if (!res.ok) { setMsg(msg, adminErr(res.error === "net" ? null : res, "加密失败", HUAYU_ADMIN_ERRORS)); return; }
      showHuayuAdminResult("花语", res.text,
        `${H.ALGO_NAMES[algo]} · 原文 ${res.plainChars} 字 → 花语 ${res.cipherChars} 字 · ${custom ? "自定义密钥" : "站点密钥"}`,
        "复制花语");
      return;
    }
    const res = await H.decrypt(input, { post: callWorker, auth, key });
    if (!res.ok) {
      if (res.error === "need_key") {
        setHuayuSeg("huayuAdminKeySeg", "custom");
        syncHuayuAdminKeySeg();
        $("huayuAdminCustomKey").focus();
      }
      setMsg(msg, HUAYU_ERRORS[res.error] && !HUAYU_ADMIN_ERRORS[res.error] ? HUAYU_ERRORS[res.error]
        : adminErr(res.error === "net" ? null : res, "解密失败", HUAYU_ADMIN_ERRORS));
      return;
    }
    const used = res.kind === 1 ? "自定义密钥" : res.old ? "旧的站点密钥" : "当前站点密钥";
    showHuayuAdminResult("原文", res.text,
      `${H.ALGO_NAMES[res.algo]}花语 ${H.countChars(input)} 字 → 原文 ${H.countChars(res.text)} 字 · ${used}`, "复制原文");
  } finally {
    btn.disabled = false;
  }
}

function initHuayuAdmin() {
  $("huayuModeSeg").addEventListener("change", async (e) => {
    const mode = e.target.value;
    syncSegments($("huayuModeSeg"));
    $("huayuModeNote").textContent = HUAYU_MODE_NOTE[mode] || "";
    const ok = await saveHuayuAdmin({ mode }, `花语访客端：${HUAYU_MODE_NAME[mode]}`);
    if (!ok) refreshHuayuAdmin();
  });
  $("huayuAlgoSeg").addEventListener("change", async (e) => {
    const algo = Number(e.target.value);
    syncSegments($("huayuAlgoSeg"));
    $("huayuAlgoNote").textContent = HUAYU_ALGO_NOTE[algo] || "";
    const ok = await saveHuayuAdmin({ algo }, `访客写花语改用${algo === 1 ? "一代" : "二代"}算法`);
    if (!ok) refreshHuayuAdmin();
  });
  $("huayuKeyShow").addEventListener("change", (e) => {
    $("huayuKeyInput").type = e.target.checked ? "text" : "password";
  });
  $("huayuKeySaveBtn").addEventListener("click", (e) => {
    const key = $("huayuKeyInput").value.trim();
    if (!key) { setMsg($("huayuSettingMsg"), "密钥不能为空"); return; }
    saveHuayuAdmin({ key }, "站点密钥已保存", e.currentTarget);
  });
  $("huayuKeyInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("huayuKeySaveBtn").click();
  });
  $("huayuKeyRandomBtn").addEventListener("click", (e) => {
    saveHuayuAdmin({ randomKey: true }, "已换成一个随机密钥", e.currentTarget);
  });
  /* 清除旧密钥需在 4 秒内点两次 */
  $("huayuClearOldBtn").addEventListener("click", (e) => {
    const btn = e.currentTarget;
    if (Date.now() - huayuAdmin.clearArmedAt > 4000) {
      huayuAdmin.clearArmedAt = Date.now();
      btn.textContent = "再点一次确认清除";
      setTimeout(() => {
        if (Date.now() - huayuAdmin.clearArmedAt >= 4000) btn.textContent = "清除旧密钥";
      }, 4100);
      return;
    }
    huayuAdmin.clearArmedAt = 0;
    btn.textContent = "清除旧密钥";
    saveHuayuAdmin({ clearOld: true }, "旧密钥已清除", btn);
  });
  $("huayuAdminAlgoSeg").addEventListener("change", (e) => syncSegments(e.currentTarget));
  $("huayuAdminKeySeg").addEventListener("change", syncHuayuAdminKeySeg);
  $("huayuAdminInput").addEventListener("input", () => {
    syncHuayuAdminInput();
    setMsg($("huayuAdminMsg"), "");
  });
  $("huayuAdminSealBtn").addEventListener("click", (e) => huayuAdminConvert("seal", e.currentTarget));
  $("huayuAdminOpenBtn").addEventListener("click", (e) => huayuAdminConvert("open", e.currentTarget));
  $("huayuAdminCopyBtn").addEventListener("click", () => {
    copyText(huayuAdmin.resultCopy, "已复制", "复制失败，请手动选中复制");
  });
  $("huayuVisitRefreshBtn").addEventListener("click", refreshHuayuVisits);
}

/* ==== 花街拼图 ==== */
/* 中断继续开关；大赛的时段、难度、图片（裁剪后走公告配图上传）；参赛记录 */
const PZ_ADMIN_DIFFS = { easy: "鱼信 · 36块", normal: "鱼丽 · 60块", hard: "光风院霁月 · 128块" };
const PZ_ADMIN_AIDS = { preview: "原图", edges: "边框", grid: "网格" };
const pzAidsText = (aids, sep = "、") => (aids && aids.length ? aids.map((a) => PZ_ADMIN_AIDS[a] || a).join(sep) : "");
const PZ_ADMIN_ERRORS = {
  no_image: "请先上传并裁剪大赛图片",
  bad_range: "开启大赛需要填写开始和结束时间，结束要晚于开始",
  bad_time: "时间无效",
  bad_title: "大赛名称最多 30 字",
  bad_diff: "难度无效，请刷新页面",
  bad_image: "图片无效，请重新上传",
  unknown_action: "Worker 还没有更新，暂时用不了（见更新说明）",
};
const PZ_CROP_RATIOS = { "16:9": 16 / 9, "4:3": 4 / 3, "3:2": 3 / 2, "1:1": 1, "3:4": 3 / 4 };
const PZ_CROP_MAX = 1600;   // 裁剪输出的长边
const puzzleAdmin = { s: null, image: "", records: [], crop: null };

const pzImageUrl = (key) => (key ? new URL(`image/${key}`, workerBase()).href : "");

function pzFmtMs(ms) {
  const t = Math.max(0, Math.round(ms));
  const total = Math.floor(t / 1000);
  const h = Math.floor(total / 3600);
  const mmss = `${pad2(Math.floor(total / 60) % 60)}:${pad2(total % 60)}.${Math.floor(t / 100) % 10}`;
  return h ? `${h}:${mmss}` : mmss;
}

function pzContestStatusText(c, now) {
  if (!c.enabled) return "大赛未开启";
  if (!c.image) return "大赛已开启，但还没有图片";
  if (now < c.start) return `大赛已开启 · 未开始（${formatCnTime(c.start)} 开始）`;
  if (now <= c.end) return `大赛进行中（${formatCnTime(c.end)} 结束）`;
  return `大赛已结束（${formatCnTime(c.end)}）`;
}

function renderPuzzleAdmin(d) {
  puzzleAdmin.s = d;
  const c = d.contest;
  const now = hjNow();
  puzzleAdmin.image = c.image;
  $("pzAdminStatus").textContent = `中断继续${d.resume ? "已开启" : "已关闭"} · ${pzContestStatusText(c, now)} · 当前第 ${c.rev} 届`;
  $("pzAdminResumeStatus").textContent = d.resume ? "当前：已开启" : "当前：已关闭（默认）";
  $("pzAdminResumeBtn").textContent = d.resume ? "关闭中断继续" : "开启中断继续";
  $("pzAdminTitle").value = c.title;
  $("pzAdminStart").value = c.start ? epochToCnLocal(c.start) : "";
  $("pzAdminEnd").value = c.end ? epochToCnLocal(c.end) : "";
  setHuayuSeg("pzAdminDiffSeg", c.diff);
  const tools = c.tools || {};
  $("pzAdminToolPreview").checked = tools.preview !== false;
  $("pzAdminToolEdges").checked = tools.edges !== false;
  $("pzAdminToolGrid").checked = tools.grid !== false;
  $("pzAdminContestStatus").textContent = `当前：${pzContestStatusText(c, now)}`;
  $("pzAdminToggleBtn").textContent = c.enabled ? "关闭大赛" : "开启大赛";
  showPzAdminImage();
}

function showPzAdminImage() {
  const url = pzImageUrl(puzzleAdmin.image);
  const img = $("pzAdminImagePreview");
  img.hidden = !url;
  if (url && img.src !== url) img.src = url;
  $("pzAdminImageNone").hidden = !!url;
  const changed = !!puzzleAdmin.s && puzzleAdmin.image !== puzzleAdmin.s.contest.image;
  $("pzAdminImageNote").textContent = changed ? "新图片已上传，点「保存设置」后生效（更换图片算新一届）" : "";
}

async function refreshPuzzleAdmin() {
  $("pzAdminStatus").textContent = "加载中…";
  setMsg($("pzAdminMsg"), "");
  const data = await callWorker({ action: "puzzle_admin_get", password: internalAdminPassword });
  if (!data || !data.ok) {
    $("pzAdminStatus").textContent = adminErr(data, "读取失败，请重新登录内部入口后再试", PZ_ADMIN_ERRORS);
    return;
  }
  renderPuzzleAdmin(data);
  refreshPuzzleRecords();
}

function pzContestForm() {
  return {
    title: $("pzAdminTitle").value.trim(),
    start: cnLocalToEpoch($("pzAdminStart").value),
    end: cnLocalToEpoch($("pzAdminEnd").value),
    diff: huayuSegValue("pzAdminDiffSeg") || "easy",
    image: puzzleAdmin.image || "",
    tools: { preview: $("pzAdminToolPreview").checked, edges: $("pzAdminToolEdges").checked, grid: $("pzAdminToolGrid").checked },
  };
}

async function savePuzzleAdmin(patch, okMsg, btn) {
  const msg = $("pzAdminMsg");
  setMsg(msg, "");
  const c = patch.contest;
  if (c) {
    if (c.title.length > 30) return setMsg(msg, PZ_ADMIN_ERRORS.bad_title);
    if (c.start && c.end && c.end <= c.start) return setMsg(msg, "结束时间要晚于开始时间");
    if (c.enabled && !c.image) return setMsg(msg, PZ_ADMIN_ERRORS.no_image);
    if (c.enabled && (!c.start || !c.end)) return setMsg(msg, PZ_ADMIN_ERRORS.bad_range);
  }
  if (btn) btn.disabled = true;
  const before = puzzleAdmin.s?.contest.rev;
  const data = await callWorker({ action: "puzzle_admin_set", password: internalAdminPassword, ...patch });
  if (btn) btn.disabled = false;
  if (!data || !data.ok) {
    setMsg(msg, adminErr(data, "保存失败，请重新登录内部入口后再试", PZ_ADMIN_ERRORS));
    return;
  }
  renderPuzzleAdmin(data);
  if (typeof puzzleSiteState !== "undefined") puzzleSiteState = null;   // 下次打开拼图时重新读取
  showToast(before !== undefined && data.contest.rev !== before ? `${okMsg}，已开始第 ${data.contest.rev} 届` : okMsg);
  renderPuzzleRecords();
}

/* ---- 裁剪：选框比例固定，拖动移动，拖四角缩放 ---- */
function openPzCrop(file) {
  const msg = $("pzAdminImageMsg");
  setMsg(msg, "");
  if (!file.type.startsWith("image/")) return setMsg(msg, "请选择图片");
  if (file.size > IMAGE_MAX_BYTES) return setMsg(msg, "图片不能超过 50MB");
  closePzCrop();
  const url = URL.createObjectURL(file);
  const img = $("pzCropImg");
  img.onload = () => {
    puzzleAdmin.crop = { url, nw: img.naturalWidth, nh: img.naturalHeight, ratio: PZ_CROP_RATIOS[huayuSegValue("pzCropRatioSeg")] || 16 / 9 };
    resetPzCrop();
    $("pzCropBox").hidden = false;
    layoutPzCrop();
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    setMsg(msg, "无法读取该图片");
  };
  img.src = url;
}

function closePzCrop() {
  const c = puzzleAdmin.crop;
  if (c) URL.revokeObjectURL(c.url);
  puzzleAdmin.crop = null;
  $("pzCropBox").hidden = true;
  $("pzCropImg").removeAttribute("src");
}

function resetPzCrop() {
  const c = puzzleAdmin.crop;
  let w = c.nw;
  let h = w / c.ratio;
  if (h > c.nh) { h = c.nh; w = h * c.ratio; }
  Object.assign(c, { w, h, x: (c.nw - w) / 2, y: (c.nh - h) / 2 });
}

function layoutPzCrop() {
  const c = puzzleAdmin.crop;
  if (!c || $("pzCropBox").hidden) return;
  const k = $("pzCropImg").clientWidth / c.nw;
  Object.assign($("pzCropRect").style, { left: c.x * k + "px", top: c.y * k + "px", width: c.w * k + "px", height: c.h * k + "px" });
  const out = Math.min(1, PZ_CROP_MAX / Math.max(c.w, c.h));
  $("pzCropInfo").textContent = `选中 ${Math.round(c.w)}×${Math.round(c.h)}，输出 ${Math.round(c.w * out)}×${Math.round(c.h * out)}`
    + (Math.max(c.w, c.h) < 900 ? " · 图片偏小，拼块可能模糊" : "");
}

function initPzCrop() {
  const rect = $("pzCropRect");
  let drag = null;
  rect.addEventListener("pointerdown", (e) => {
    const c = puzzleAdmin.crop;
    if (!c || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault();
    const h = e.target.dataset.h || "";
    drag = { id: e.pointerId, k: $("pzCropImg").clientWidth / c.nw, sx: e.clientX, sy: e.clientY, x: c.x, y: c.y, w: c.w, h: c.h, handle: h };
    if (h) {
      drag.dx = h.includes("w") ? -1 : 1;
      drag.dy = h.includes("n") ? -1 : 1;
      drag.ax = drag.dx < 0 ? c.x + c.w : c.x;   // 对角固定不动
      drag.ay = drag.dy < 0 ? c.y + c.h : c.y;
    }
    try { rect.setPointerCapture(e.pointerId); } catch (err) {}
  });
  rect.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const c = puzzleAdmin.crop;
    const mx = (e.clientX - drag.sx) / drag.k;
    const my = (e.clientY - drag.sy) / drag.k;
    if (!drag.handle) {
      c.x = clamp(drag.x + mx, 0, c.nw - c.w);
      c.y = clamp(drag.y + my, 0, c.nh - c.h);
    } else {
      const px = (drag.dx > 0 ? drag.x + drag.w : drag.x) + mx;
      const py = (drag.dy > 0 ? drag.y + drag.h : drag.y) + my;
      const maxW = Math.min(drag.dx > 0 ? c.nw - drag.ax : drag.ax, (drag.dy > 0 ? c.nh - drag.ay : drag.ay) * c.ratio);
      const w = clamp(Math.max(Math.abs(px - drag.ax), Math.abs(py - drag.ay) * c.ratio), Math.min(60, maxW), maxW);
      c.w = w;
      c.h = w / c.ratio;
      c.x = drag.dx > 0 ? drag.ax : drag.ax - w;
      c.y = drag.dy > 0 ? drag.ay : drag.ay - c.h;
    }
    layoutPzCrop();
  });
  const end = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
  rect.addEventListener("pointerup", end);
  rect.addEventListener("pointercancel", end);
  window.addEventListener("resize", layoutPzCrop);
  $("pzCropRatioSeg").addEventListener("change", () => {
    syncSegments($("pzCropRatioSeg"));
    const c = puzzleAdmin.crop;
    if (!c) return;
    c.ratio = PZ_CROP_RATIOS[huayuSegValue("pzCropRatioSeg")] || 16 / 9;
    resetPzCrop();
    layoutPzCrop();
  });
  $("pzCropCancelBtn").addEventListener("click", closePzCrop);
  $("pzCropOkBtn").addEventListener("click", uploadPzCrop);
}

async function uploadPzCrop() {
  const c = puzzleAdmin.crop;
  if (!c) return;
  const btn = $("pzCropOkBtn");
  const msg = $("pzAdminImageMsg");
  btn.disabled = true;
  setMsg(msg, "处理中…");
  try {
    const k = Math.min(1, PZ_CROP_MAX / Math.max(c.w, c.h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(c.w * k));
    canvas.height = Math.max(1, Math.round(c.h * k));
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage($("pzCropImg"), c.x, c.y, c.w, c.h, 0, 0, canvas.width, canvas.height);
    let blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
    if (!blob || blob.type !== "image/webp") blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) throw new Error("encode fail");
    const base64 = (await readAsDataURL(blob)).split(",")[1];
    setMsg(msg, "上传中…");
    const data = await callWorker({ action: "upload_announcement_image", password: internalAdminPassword, image: base64, content_type: blob.type });
    if (!data?.ok) throw new Error(data?.error || "upload failed");
    puzzleAdmin.image = data.key;
    closePzCrop();
    setMsg(msg, "");
    showPzAdminImage();
    showToast("图片已上传，记得点「保存设置」");
  } catch (e) {
    setMsg(msg, e.message === "rate_limited" ? "上传过于频繁，请稍后再试" : "上传失败，请重试");
  }
  btn.disabled = false;
}

/* ---- 参赛记录 ---- */
async function refreshPuzzleRecords() {
  $("pzRecSummary").textContent = "加载中…";
  const data = await callWorker({ action: "puzzle_admin_records", password: internalAdminPassword });
  if (!data || !data.ok) {
    $("pzRecSummary").textContent = adminErr(data, "读取失败", PZ_ADMIN_ERRORS);
    return;
  }
  puzzleAdmin.records = data.items || [];
  renderPuzzleRecords();
}

/* 按届筛选；按耗时排序时有名次，「每人最好成绩」只留每位玩家最快的有效记录 */
function pzRecordsShown() {
  const round = $("pzRecRound").value || "cur";
  const rev = puzzleAdmin.s?.contest.rev ?? 0;
  const byTime = $("pzRecSort").value !== "at";
  let list = puzzleAdmin.records.filter((r) => round === "all" || r.rev === (round === "cur" ? rev : Number(round)));
  list = list.slice().sort((a, b) => (byTime ? a.voided - b.voided || a.elapsed - b.elapsed || a.at - b.at : b.at - a.at));
  if ($("pzRecBest").checked) {
    const seen = new Set();
    list = list.filter((r) => {
      if (r.voided) return false;
      const key = `${r.rev}|${r.player}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  let rank = 0;
  return list.map((r) => ({ ...r, rank: byTime && !r.voided ? ++rank : 0 }));
}

function renderPuzzleRecords() {
  const sel = $("pzRecRound");
  const keep = sel.value || "cur";
  const rev = puzzleAdmin.s?.contest.rev ?? 0;
  const revs = [...new Set(puzzleAdmin.records.map((r) => r.rev))].filter((r) => r !== rev).sort((a, b) => b - a);
  sel.innerHTML = `<option value="cur">本届（第 ${rev} 届）</option><option value="all">全部</option>`
    + revs.map((r) => `<option value="${r}">第 ${r} 届</option>`).join("");
  sel.value = [...sel.options].some((o) => o.value === keep) ? keep : "cur";
  const list = pzRecordsShown();
  const valid = list.filter((r) => !r.voided);
  $("pzRecSummary").textContent = list.length
    ? `共 ${list.length} 条（有效 ${valid.length} 条，${new Set(valid.map((r) => r.player)).size} 位玩家）`
    : "暂无记录";
  $("pzRecBody").innerHTML = list.map((r) => `<tr class="${r.voided ? "is-voided" : ""}">
    <td>${r.rank || ""}</td>
    <td>No.${r.id}</td>
    <td class="pz-rec-player">${escapeHtml(r.player)}</td>
    <td>${escapeHtml(PZ_ADMIN_DIFFS[r.diff] || r.diff)}</td>
    <td title="开局到登记 ${escapeHtml(pzFmtMs(r.serverMs))}">${escapeHtml(pzFmtMs(r.elapsed))}</td>
    <td>${escapeHtml(pzAidsText(r.aids) || "—")}</td>
    <td>${escapeHtml(formatCnSeconds(r.at))}</td>
    <td title="${escapeHtml(geoTitle(r.geo))}">${escapeHtml(geoText(r.geo) || "—")}</td>
    <td class="hy-visit-id">${escapeHtml(r.visitor)}</td>
    <td><button type="button" class="pz-rec-void" data-id="${r.id}" data-voided="${r.voided ? 1 : 0}">${r.voided ? "恢复" : "作废"}</button></td>
  </tr>`).join("") || `<tr><td colspan="10" class="pz-rec-empty">暂无记录</td></tr>`;
}

function exportPuzzleRecords() {
  const list = pzRecordsShown();
  if (!list.length) return showToast("没有可导出的记录");
  const safe = (v) => (/^[=+\-@\t\r]/.test(String(v)) ? `'${v}` : String(v));   // 防止表格软件把 ID 当公式
  const head = ["名次", "登记号", "届", "玩家ID", "难度", "块数", "耗时(秒)", "耗时", "开局到登记(秒)", "辅助功能", "登记时间", "IP属地", "访客标识", "状态"];
  const rows = list.map((r) => [r.rank || "", r.id, r.rev, safe(r.player), PZ_ADMIN_DIFFS[r.diff] || r.diff, r.pieces,
    (r.elapsed / 1000).toFixed(1), pzFmtMs(r.elapsed), (r.serverMs / 1000).toFixed(1), pzAidsText(r.aids) || "未使用", formatCnSeconds(r.at),
    geoText(r.geo), r.visitor, r.voided ? "已作废" : "有效"]);
  const csv = [head, ...rows].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const stamp = epochToCnLocal(Date.now()).replace(/[-:]/g, "").replace("T", "-");
  downloadBlob(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }), `拼图大赛记录_${stamp}.csv`);
}

function initPuzzleAdmin() {
  $("pzAdminResumeBtn").addEventListener("click", (e) => {
    const on = !puzzleAdmin.s?.resume;
    savePuzzleAdmin({ resume: on }, on ? "中断继续已开启" : "中断继续已关闭", e.currentTarget);
  });
  $("pzAdminDiffSeg").addEventListener("change", () => syncSegments($("pzAdminDiffSeg")));
  $("pzAdminSaveBtn").addEventListener("click", (e) => savePuzzleAdmin({ contest: pzContestForm() }, "大赛设置已保存", e.currentTarget));
  $("pzAdminToggleBtn").addEventListener("click", (e) => {
    const on = !puzzleAdmin.s?.contest.enabled;
    savePuzzleAdmin({ contest: { ...pzContestForm(), enabled: on } }, on ? "大赛已开启" : "大赛已关闭", e.currentTarget);
  });
  $("pzAdminPickBtn").addEventListener("click", () => $("pzAdminFile").click());
  $("pzAdminFile").addEventListener("change", () => {
    const file = $("pzAdminFile").files[0];
    $("pzAdminFile").value = "";
    if (file) openPzCrop(file);
  });
  initPzCrop();
  ["pzRecRound", "pzRecSort", "pzRecBest"].forEach((id) => $(id).addEventListener("change", renderPuzzleRecords));
  $("pzRecRefreshBtn").addEventListener("click", refreshPuzzleRecords);
  $("pzRecExportBtn").addEventListener("click", exportPuzzleRecords);
  $("pzRecBody").addEventListener("click", async (e) => {
    const btn = e.target.closest(".pz-rec-void");
    if (!btn) return;
    btn.disabled = true;
    const data = await callWorker({
      action: "puzzle_admin_void", password: internalAdminPassword, id: Number(btn.dataset.id), voided: btn.dataset.voided !== "1",
    });
    if (!data || !data.ok) {
      btn.disabled = false;
      showToast(adminErr(data, "操作失败，刷新后再试"));
      return;
    }
    const i = puzzleAdmin.records.findIndex((r) => r.id === data.item.id);
    if (i >= 0) puzzleAdmin.records[i] = data.item;
    renderPuzzleRecords();
  });
}

/* ==== 10. 管理面板 ==== */
const ADMIN_PANELS_HTML = `
<div class="gate-card admin-card" id="lockdownPanel" hidden>
  <h2>分享功能开关</h2>
  <p class="hint">关闭后为纯静态展示：活动群、复制附言、场地登记、问卷、点赞不可用。</p>
  <p class="hint" id="lockdownStatus">当前状态：加载中…</p>
  <button id="lockdownToggleBtn">切换</button>
  <p class="form-msg" id="lockdownMsg" hidden></p>
  <div class="maint-box">
    <h3 class="maint-title">全站开关</h3>
    <p class="hint">关闭后全站进入维护状态：除内部入口（#internal）外，首页及其他页面都只显示背景和「网站正在维护中……」。</p>
    <p class="hint" id="maintStatus">当前状态：加载中…</p>
    <button id="maintToggleBtn">切换</button>
    <p class="form-msg" id="maintMsg" hidden></p>
  </div>
</div>
<div class="gate-card admin-card" id="captchaPanel" hidden>
  <h2>人机验证开关</h2>
  <p class="hint">关闭后全站不进行人机验证，仅用于压力测试。</p>
  <p class="hint" id="captchaStatus">当前状态：加载中…</p>
  <button id="captchaToggleBtn">切换</button>
  <p class="form-msg" id="captchaSwitchMsg" hidden></p>
</div>
<div class="gate-card admin-card" id="starlightPanel" hidden>
  <h2>星芒节时间覆盖</h2>
  <p class="hint">星芒节期间游戏内全境下雪，设置的时段内天气显示为小雪。</p>
  <p class="hint" id="starlightStatus">当前状态：加载中…</p>
  <div class="starlight-fields">
    <label class="starlight-field">
      <span>从（国服时间）</span>
      <input type="datetime-local" id="starlightStart">
    </label>
    <span class="starlight-sep" aria-hidden="true">—</span>
    <label class="starlight-field">
      <span>到（国服时间）</span>
      <input type="datetime-local" id="starlightEnd">
    </label>
  </div>
  <div class="starlight-actions">
    <button id="starlightSaveBtn">保存</button>
    <button id="starlightClearBtn" type="button">清除</button>
  </div>
  <p class="form-msg" id="starlightMsg" hidden></p>
</div>
<div class="gate-card admin-card ticket-admin" id="ticketAdminPanel" hidden>
  <h2>活动购票管理</h2>
  <p class="hint" id="ticketAdminStatus">加载中…</p>
  <div class="tabs ticket-admin-tabs" id="ticketAdminTabs" role="tablist" aria-label="购票管理">
    <button type="button" class="tab-btn is-active" role="tab" data-ta-tab="settings" aria-selected="true">购票管理</button>
    <button type="button" class="tab-btn" role="tab" data-ta-tab="orders" aria-selected="false">详细订单</button>
    <button type="button" class="tab-btn" role="tab" data-ta-tab="stats" aria-selected="false">售票统计</button>
  </div>
  <div class="ticket-admin-stats" id="ticketAdminStats"></div>
  <div class="ticket-admin-actions ta-topbar">
    <button type="button" id="ticketExportBtn">导出 Excel</button>
    <button type="button" id="ticketRefreshBtn" class="ticket-btn-ghost">刷新</button>
  </div>
  <p class="form-msg" id="ticketAdminMsg" hidden></p>

  <div class="ta-pane" data-ta-pane="settings">
    <section class="ta-group">
      <h3 class="ta-group-title">基本</h3>
      <div class="ticket-admin-row">
        <label class="ticket-admin-key" for="ticketTitleInput">购票页标题</label>
        <span class="ticket-limit-edit ticket-title-edit">
          <input type="text" id="ticketTitleInput" maxlength="60" placeholder="留空则恢复默认标题">
          <button type="button" id="ticketTitleSaveBtn">保存</button>
        </span>
      </div>
      <div class="ticket-admin-row">
        <span class="ticket-admin-key">标题后缀「测试」</span>
        <button type="button" class="ticket-switch" id="ticketTestBtn" aria-pressed="false">—</button>
      </div>
      <p class="ticket-sched-note ticket-title-preview" id="ticketTitlePreview" hidden></p>
      <div class="ticket-admin-row">
        <span class="ticket-admin-key">购票开放</span>
        <button type="button" class="ticket-switch" id="ticketOpenBtn" aria-pressed="false">—</button>
      </div>
      <div class="ticket-admin-row ticket-sched-row">
        <span class="ticket-admin-key">定时开关</span>
        <span class="ticket-sched-edit">
          <label for="ticketOpenAtInput">开启</label>
          <input type="datetime-local" id="ticketOpenAtInput">
          <label for="ticketCloseAtInput">关闭</label>
          <input type="datetime-local" id="ticketCloseAtInput">
          <button type="button" id="ticketSchedSaveBtn">保存</button>
          <button type="button" id="ticketSchedClearBtn" class="ticket-btn-ghost">清除</button>
        </span>
      </div>
      <p class="ticket-sched-note" id="ticketSchedNote" hidden></p>
      <div class="ticket-admin-row">
        <span class="ticket-admin-key">持票 id 可待定</span>
        <button type="button" class="ticket-switch" id="ticketPendingBtn" aria-pressed="false">—</button>
      </div>
      <div class="ticket-admin-row">
        <label class="ticket-admin-key" for="ticketPerPersonInput">单人限购（张）</label>
        <span class="ticket-limit-edit">
          <input type="number" id="ticketPerPersonInput" min="1" max="20" step="1" inputmode="numeric">
          <button type="button" id="ticketPerPersonSaveBtn">保存</button>
        </span>
      </div>
      <div class="ticket-admin-row">
        <label class="ticket-admin-key" for="ticketCooldownInput">再次购票间隔（分钟，0 = 不限）</label>
        <span class="ticket-limit-edit">
          <input type="number" id="ticketCooldownInput" min="0" max="1440" step="1" inputmode="numeric">
          <button type="button" id="ticketCooldownSaveBtn">保存</button>
        </span>
      </div>
    </section>

    <section class="ta-group">
      <h3 class="ta-group-title">票额与刷新</h3>
      <p class="ta-group-hint">两次刷新之间为一轮，未售出的票不结转。</p>
      <div class="ta-round" id="ticketRoundBox"></div>
      <div class="ticket-admin-row">
        <label class="ticket-admin-key" for="ticketExtraInput">本轮临时加票</label>
        <span class="ticket-limit-edit">
          <input type="number" id="ticketExtraInput" min="1" max="100000" step="1" inputmode="numeric" placeholder="张数">
          <button type="button" id="ticketExtraAddBtn">加上</button>
          <button type="button" id="ticketExtraSubBtn" class="ticket-btn-ghost">减去</button>
          <button type="button" id="ticketExtraClearBtn" class="ticket-btn-ghost">清零</button>
        </span>
      </div>
      <div class="ticket-admin-row">
        <span class="ticket-admin-key">每日刷新</span>
        <button type="button" class="ticket-switch" id="ticketDailyBtn" aria-pressed="false">—</button>
      </div>
      <div class="ticket-admin-row ta-daily-only">
        <label class="ticket-admin-key" for="ticketResetInput">每日刷新时间</label>
        <span class="ticket-limit-edit">
          <input type="time" id="ticketResetInput" step="60">
          <button type="button" id="ticketResetSaveBtn">保存</button>
        </span>
      </div>
      <div class="ticket-admin-row ta-daily-only">
        <label class="ticket-admin-key" for="ticketLimitInput">每日票额（张）</label>
        <span class="ticket-limit-edit">
          <input type="number" id="ticketLimitInput" min="0" max="100000" step="1" inputmode="numeric">
          <label class="audience-opt ta-inline-opt" id="ticketLimitCurWrap"><input type="checkbox" id="ticketLimitCurChk" checked><span>当前这一轮也改</span></label>
          <button type="button" id="ticketLimitSaveBtn">保存</button>
        </span>
      </div>
      <div class="ta-sub">
        <p class="ta-sub-title">自定义刷新点</p>
        <p class="ta-group-hint">到点开始新一轮并使用该票额；与每日刷新同一分钟时以此为准。</p>
        <div class="ta-points" id="ticketPointsList"></div>
        <div class="ta-sub-actions">
          <button type="button" id="ticketPointAddBtn" class="ticket-btn-ghost">+ 添加刷新点</button>
          <button type="button" id="ticketPointSaveBtn">保存刷新点</button>
          <button type="button" id="ticketPointResetBtn" class="ticket-btn-ghost">撤销修改</button>
        </div>
      </div>
      <div class="ticket-admin-row">
        <span class="ticket-admin-key">下一次刷新：<b id="ticketNextInfo">—</b></span>
        <span class="ticket-limit-edit">
          <input type="number" id="ticketNextInput" min="0" max="100000" step="1" inputmode="numeric" aria-label="下一次刷新的票额">
          <button type="button" id="ticketNextSaveBtn">保存</button>
          <button type="button" id="ticketNextResetBtn" class="ticket-btn-ghost" hidden>恢复默认</button>
        </span>
      </div>
      <p class="ticket-sched-note" id="ticketNextNote" hidden></p>
    </section>

    <section class="ta-group">
      <h3 class="ta-group-title">购票页显示</h3>
      <div class="ticket-admin-row">
        <label class="ticket-admin-key" for="ticketRemainModeSelect">余票</label>
        <select id="ticketRemainModeSelect">
          <option value="full">具体张数</option>
          <option value="range">大致范围</option>
          <option value="hidden">不显示</option>
        </select>
      </div>
      <p class="ticket-sched-note ticket-title-preview" id="ticketRemainPreview" hidden></p>
      <div class="ticket-admin-row">
        <span class="ticket-admin-key">定时开启 / 关闭时间</span>
        <button type="button" class="ticket-switch" id="ticketShowSchedBtn" aria-pressed="false">—</button>
      </div>
      <div class="ticket-admin-row">
        <span class="ticket-admin-key">刷新时间</span>
        <button type="button" class="ticket-switch" id="ticketShowResetBtn" aria-pressed="false">—</button>
      </div>
      <div class="ticket-admin-row">
        <span class="ticket-admin-key">向访客显示超额标记</span>
        <button type="button" class="ticket-switch" data-ta-flag="showOver" data-on="显示（点击隐藏）" data-off="不显示（点击显示）"
                data-toast-on="已显示超额标记" data-toast-off="已隐藏超额标记">—</button>
      </div>
      <div class="ticket-admin-row">
        <span class="ticket-admin-key">向访客显示重复标记</span>
        <button type="button" class="ticket-switch" data-ta-flag="showDup" data-on="显示（点击隐藏）" data-off="不显示（点击显示）"
                data-toast-on="已显示重复标记" data-toast-off="已隐藏重复标记">—</button>
      </div>
      <div class="ticket-admin-row">
        <span class="ticket-admin-key">购票留言栏</span>
        <button type="button" class="ticket-switch" data-ta-flag="messageOn" data-on="有（点击去掉）" data-off="没有（点击加上）"
                data-toast-on="已开启留言栏" data-toast-off="已关闭留言栏">—</button>
      </div>
      <div class="ticket-admin-row">
        <span class="ticket-admin-key">显示网站标题（标题、地址、时间天气）</span>
        <button type="button" class="ticket-switch" data-ta-flag="showBrand" data-on="显示（点击隐藏）" data-off="不显示（点击显示）"
                data-toast-on="购票页显示网站标题" data-toast-off="购票页不显示网站标题、地址和时间天气">—</button>
      </div>
      <div class="ticket-admin-row">
        <span class="ticket-admin-key">与首页隔离</span>
        <button type="button" class="ticket-switch" data-ta-flag="isolated" data-on="已隔离（点击取消）" data-off="不隔离（点击隔离）"
                data-toast-on="购票页已与首页隔离" data-toast-off="已取消隔离"
                data-confirm-on="与首页隔离？&#10;&#10;购票页将没有返回按钮，首页不显示入口，停留时限失效。">—</button>
      </div>
      <div class="ticket-admin-row ta-idle-row">
        <label class="ticket-admin-key" for="ticketIdleInput">停留时限（分钟，0 为不限）</label>
        <span class="ticket-limit-edit">
          <input type="number" id="ticketIdleInput" min="0" max="1440" step="1" inputmode="numeric">
          <button type="button" id="ticketIdleSaveBtn">保存</button>
        </span>
      </div>
      <div class="ticket-admin-row ta-idle-row">
        <span class="ticket-admin-key">向访客显示剩余时间</span>
        <button type="button" class="ticket-switch" data-ta-flag="showIdle" data-on="显示（点击隐藏）" data-off="不显示（点击显示）"
                data-toast-on="购票页显示剩余时间" data-toast-off="购票页不显示剩余时间">—</button>
      </div>
      <p class="ticket-sched-note" id="ticketIdleIsoNote" hidden>已与首页隔离，停留时限不生效。</p>
    </section>

    <section class="ta-group">
      <h3 class="ta-group-title">购票须知</h3>
      <div class="ticket-admin-row">
        <span class="ticket-admin-key">显示购票须知</span>
        <button type="button" class="ticket-switch" data-ta-flag="guideOn" data-on="显示（点击关闭）" data-off="不显示（点击打开）"
                data-toast-on="购票须知已开启" data-toast-off="购票须知已关闭：首页入口直接进购票页，购票页也没有须知按钮">—</button>
      </div>
      <details class="ta-guide" id="ticketGuideEditor">
        <summary>编辑购票须知正文 <span id="ticketGuideState"></span></summary>
        <div class="ta-guide-help">
          <ul>
            <li><code>^ 文字</code> 标题上方小字　<code># 文字</code> 大标题　<code>## 文字</code> 小节标题</li>
            <li><code>[票价] 名称 | 价格 | 标签 | 时间</code> 票价卡片，连续多行并排</li>
            <li><code>### 标题</code> 卡片，连续多张并排</li>
            <li><code>1. 文字</code> 有序列表　<code>- 文字</code> 无序列表</li>
            <li><code>Q1：问题</code> 问答，其后各行为回答</li>
            <li><code>&gt; 文字</code> 结尾说明　<code>-- 文字</code> 署名　<code>---</code> 分隔线</li>
            <li><code>**加粗**</code>　<code>__下划线__</code>　网址自动转为链接</li>
          </ul>
        </div>
        <textarea id="ticketGuideInput" maxlength="12000" spellcheck="false" aria-label="购票须知正文"></textarea>
        <div class="ta-sub-actions">
          <button type="button" id="ticketGuideSaveBtn">保存须知</button>
          <button type="button" id="ticketGuideResetBtn" class="ticket-btn-ghost">恢复默认</button>
        </div>
        <p class="form-msg" id="ticketGuideMsg" hidden></p>
        <p class="ta-sub-title">预览（访客看到的样子）</p>
        <div class="ta-guide-preview" id="ticketGuidePreview"></div>
      </details>
    </section>

    <section class="ta-group">
      <h3 class="ta-group-title">只读端（查看密码登录的「购票情况」）</h3>
      <div class="ticket-admin-row">
        <span class="ticket-admin-key">「购票情况」查看页</span>
        <button type="button" class="ticket-switch" id="ticketViewerBtn" aria-pressed="false">—</button>
      </div>
      <div class="ticket-admin-row">
        <span class="ticket-admin-key">显示「售票统计」</span>
        <button type="button" class="ticket-switch" data-ta-flag="viewerStats" data-on="显示（点击隐藏）" data-off="不显示（点击显示）"
                data-toast-on="只读端可查看售票统计" data-toast-off="只读端不可查看售票统计">—</button>
      </div>
      <div class="ticket-admin-row">
        <span class="ticket-admin-key">显示「活动问卷」（只读）</span>
        <button type="button" class="ticket-switch" data-ta-flag="viewerSurvey" data-on="显示（点击隐藏）" data-off="不显示（点击显示）"
                data-toast-on="只读端可查看活动问卷" data-toast-off="只读端不可查看活动问卷">—</button>
      </div>
      <div class="ticket-admin-row">
        <span class="ticket-admin-key">可以勾选取票</span>
        <button type="button" class="ticket-switch" data-ta-flag="viewerPickup" data-on="可以（点击关闭）" data-off="不可以（点击打开）"
                data-toast-on="只读端可以勾选取票了（操作会记日志）" data-toast-off="只读端不可勾选取票">—</button>
      </div>
      <div class="ticket-admin-row">
        <label class="ticket-admin-key" for="ticketLogHoursInput">操作日志合并间隔（小时）</label>
        <span class="ticket-limit-edit">
          <input type="number" id="ticketLogHoursInput" min="1" max="720" step="1" inputmode="numeric">
          <button type="button" id="ticketLogHoursSaveBtn">保存</button>
        </span>
      </div>
      <div class="ta-sub-actions"><button type="button" id="ticketLogBtn" class="ticket-btn-ghost">查看只读端操作日志</button></div>
      <div class="fb-admin-list ta-log" id="ticketLogList" hidden></div>
    </section>

    <section class="ta-group ta-danger">
      <h3 class="ta-group-title">数据</h3>
      <div class="ta-sub-actions">
        <button type="button" id="ticketClearBtn" class="ticket-btn-danger">清空购票数据</button>
      </div>
    </section>
  </div>

  <div class="ta-pane" data-ta-pane="orders" hidden>
    <div class="ticket-admin-list-head">
      <label for="ticketDaySelect">轮次</label>
      <select id="ticketDaySelect"></select>
      <input type="search" id="ticketSearchInput" class="ta-search" placeholder="搜联系方式 / 持票人 / 序号" autocomplete="off" aria-label="搜索订单">
      <span class="ticket-legend"><i class="lg-over"></i>超额 <i class="lg-dup"></i>重复 <i class="lg-void"></i>已作废 <i class="lg-picked"></i>已取票</span>
    </div>
    <div class="venue-edit ta-edit" id="ticketEditBox" hidden></div>
    <div class="ticket-table-wrap">
      <table class="ticket-table ta-orders">
        <thead><tr><th>序号</th><th>联系方式</th><th>数量</th><th>持票人</th><th>留言</th><th>时间</th><th class="tt-actions-th">操作</th><th>取票</th></tr></thead>
        <tbody id="ticketAdminTbody"></tbody>
      </table>
    </div>
  </div>

  <div class="ta-pane" data-ta-pane="stats" hidden>
    <div class="ticket-admin-list-head">
      <label for="ticketStatsRound">范围</label>
      <select id="ticketStatsRound"></select>
    </div>
    <div class="ta-stats" id="ticketStatsBody"></div>
  </div>
</div>
<div class="gate-card admin-card ticket-admin feedback-admin venue-admin" id="venueAdminPanel" hidden>
  <h2>场地预约</h2>
  <p class="hint" id="venueAdminStatus">加载中…</p>
  <div class="fb-admin-filters">
    <select id="venueFilterState" aria-label="按状态筛选">
      <option value="active" selected>有效</option>
      <option value="void">已作废</option>
      <option value="">全部状态</option>
    </select>
    <select id="venueFilterTime" aria-label="按预约日期筛选">
      <option value="" selected>全部日期</option>
      <option value="upcoming">今天及以后</option>
      <option value="past">已过去</option>
    </select>
    <button type="button" id="venueRefreshBtn" class="ticket-btn-ghost">刷新</button>
    <button type="button" id="venueNewBtn">新增预约</button>
  </div>
  <p class="form-msg" id="venueAdminMsg" hidden></p>
  <div class="venue-edit" id="venueEditBox" hidden>
    <h3 class="venue-edit-title" id="venueEditTitle">新增预约</h3>
    <form id="venueAdminForm" novalidate autocomplete="off">
      <div class="venue-form" id="venueAdminFields"></div>
      <div class="venue-edit-actions">
        <button type="submit" id="venueAdminSaveBtn">保存</button>
        <button type="button" id="venueAdminCancelBtn" class="ticket-btn-ghost">取消</button>
      </div>
      <p class="form-msg" id="venueAdminFormMsg" hidden></p>
    </form>
  </div>
  <div class="fb-admin-list venue-admin-list" id="venueAdminList"></div>
</div>
<div class="gate-card admin-card ticket-admin feedback-admin survey-admin" id="surveyAdminPanel" hidden>
  <h2>活动问卷</h2>
  <p class="hint" id="surveyAdminStatus">加载中…</p>
  <div class="ticket-admin-row">
    <span class="ticket-admin-key">问卷开放</span>
    <button type="button" class="ticket-switch" id="surveyOpenBtn" aria-pressed="false">—</button>
  </div>
  <p class="ticket-sched-note" id="surveyLockNote" hidden>分享功能已关闭，访客暂时无法提交问卷。</p>
  <div class="fb-admin-filters">
    <select id="surveyViewSelect" aria-label="查看方式">
      <option value="stats" selected>统计汇总</option>
      <option value="list">逐份查看</option>
    </select>
    <select id="surveyFilterState" aria-label="按状态筛选" hidden>
      <option value="active" selected>有效</option>
      <option value="void">已作废</option>
      <option value="">全部</option>
    </select>
    <button type="button" id="surveyRefreshBtn" class="ticket-btn-ghost">刷新</button>
    <button type="button" id="surveyExportBtn">导出 Excel</button>
    <button type="button" id="surveyCopyLinkBtn" class="ticket-btn-ghost">复制问卷链接</button>
  </div>
  <p class="form-msg" id="surveyAdminMsg" hidden></p>
  <div class="survey-stats" id="surveyAdminStats"></div>
  <div class="fb-admin-list survey-admin-list" id="surveyAdminList" hidden></div>
</div>
<div class="gate-card admin-card ticket-admin feedback-admin" id="feedbackAdminPanel" hidden>
  <h2>反馈建议箱</h2>
  <p class="hint" id="feedbackAdminStatus">加载中…</p>
  <div class="fb-admin-filters">
    <select id="feedbackFilterCat" aria-label="按类别筛选">
      <option value="">全部类别</option>
    </select>
    <select id="feedbackFilterState" aria-label="按处理状态筛选">
      <option value="">全部状态</option>
      <option value="open" selected>未处理</option>
      <option value="done">已处理</option>
    </select>
    <button type="button" id="feedbackRefreshBtn" class="ticket-btn-ghost">刷新</button>
  </div>
  <p class="form-msg" id="feedbackAdminMsg" hidden></p>
  <div class="fb-admin-list" id="feedbackAdminList"></div>
</div>
<div class="gate-card admin-card" id="popupAdminPanel" hidden>
  <h2>弹窗公告</h2>
  <p class="hint">开启后访客打开首页时弹出，每次打开网站最多一次；修改内容并保存后会重新弹出。</p>
  <p class="hint" id="popupAdminStatus">当前状态：加载中…</p>
  <button type="button" id="popupToggleBtn" disabled>切换</button>

  <label class="popup-admin-label" for="popupTitleInput">标题（选填）</label>
  <input type="text" id="popupTitleInput" maxlength="60" placeholder="例如：中秋月轮祭 活动回顾上线啦" autocomplete="off">
  <label class="popup-admin-label" for="popupBodyInput">正文</label>
  <textarea id="popupBodyInput" maxlength="3000" placeholder="写点什么…（可以换行；http 开头的网址会自动变成链接）"></textarea>
  <p class="popup-admin-count" id="popupBodyCount">0 / 3000</p>

  <div class="announcement-image-field">
    <input type="file" id="popupImageInput" accept="image/*" hidden>
    <button type="button" id="popupImagePickBtn" class="pill-btn-outline">配图（限 50MB）</button>
    <span class="form-msg" id="popupImageStatus" hidden></span>
    <div class="announcement-image-preview" id="popupImagePreview" hidden>
      <img id="popupImagePreviewImg" alt="">
      <button type="button" id="popupImageRemoveBtn" aria-label="移除图片">×</button>
    </div>
  </div>
  <p class="hint popup-admin-note">配图只能一张。上传前会自动压成 WebP（长边不超过 2560 像素），访客手机上也打得开；动图会变成静态图。</p>

  <div class="popup-admin-btns">
    <button type="button" id="popupSaveBtn">保存</button>
    <button type="button" id="popupPreviewBtn" class="pill-btn-outline">预览</button>
  </div>
  <p class="form-msg" id="popupAdminMsg" hidden></p>
</div>
<div class="gate-card admin-card huayu-admin" id="huayuAdminPanel" data-close-only-x="1" hidden>
  <h2>花语加密</h2>
  <p class="hint">首页「更多」中的「听得花间语」。明文在浏览器中压缩后由后端加密，密钥仅保存在后端，不保存明文和花语。</p>
  <p class="hint" id="huayuAdminStatus">当前状态：加载中…</p>

  <section class="ta-group">
    <h3 class="ta-group-title">访客端</h3>
    <div class="alarm-seg" id="huayuModeSeg">
      <label><input type="radio" name="huayuMode" value="open"><span>完全开放</span></label>
      <label><input type="radio" name="huayuMode" value="decrypt"><span>仅开放解密</span></label>
      <label><input type="radio" name="huayuMode" value="off"><span>彻底关闭</span></label>
    </div>
    <p class="ta-group-hint" id="huayuModeNote"></p>
  </section>

  <section class="ta-group">
    <h3 class="ta-group-title">加密算法</h3>
    <div class="alarm-seg" id="huayuAlgoSeg">
      <label><input type="radio" name="huayuAlgo" value="1"><span>一代算法（V1）</span></label>
      <label><input type="radio" name="huayuAlgo" value="2"><span>二代算法（V2）</span></label>
    </div>
    <p class="ta-group-hint" id="huayuAlgoNote"></p>
    <p class="ta-group-hint">用于访客生成花语；解读时自动识别两代。</p>
  </section>

  <section class="ta-group">
    <h3 class="ta-group-title">站点密钥</h3>
    <p class="ta-group-hint">访客写的花语、这里选「站点密钥」写的花语都用它加密。<br>换了密钥以后，以前的花语仍能用旧密钥解开（最多保留 5 个）。</p>
    <div class="hy-key-row">
      <input type="password" id="huayuKeyInput" maxlength="128" autocomplete="off" spellcheck="false" placeholder="站点密钥">
      <button type="button" id="huayuKeySaveBtn">保存</button>
    </div>
    <div class="hy-key-tools">
      <label class="audience-opt" for="huayuKeyShow"><input type="checkbox" id="huayuKeyShow"><span>显示密钥</span></label>
      <button type="button" id="huayuKeyRandomBtn" class="pill-btn-outline">换成随机密钥</button>
    </div>
    <div class="hy-old-row">
      <span id="huayuOldText"></span>
      <button type="button" id="huayuClearOldBtn" class="pill-btn-outline" hidden>清除旧密钥</button>
    </div>
    <p class="form-msg" id="huayuSettingMsg" hidden></p>
  </section>

  <section class="ta-group">
    <h3 class="ta-group-title">转换</h3>
    <p class="ta-group-hint">不受访客端开关限制。自定义密钥生成的花语需输入密钥才能解读。</p>
    <textarea id="huayuAdminInput" maxlength="400000" spellcheck="false" placeholder="明文或花语"></textarea>
    <p class="popup-admin-count" id="huayuAdminCount"></p>
    <div class="alarm-seg" id="huayuAdminAlgoSeg">
      <label><input type="radio" name="huayuAdminAlgo" value="1"><span>加密用一代</span></label>
      <label class="is-active"><input type="radio" name="huayuAdminAlgo" value="2" checked><span>加密用二代</span></label>
    </div>
    <div class="alarm-seg" id="huayuAdminKeySeg">
      <label class="is-active"><input type="radio" name="huayuAdminKey" value="site" checked><span>站点密钥</span></label>
      <label><input type="radio" name="huayuAdminKey" value="custom"><span>自定义密钥</span></label>
    </div>
    <input type="text" id="huayuAdminCustomKey" class="hy-custom-key" maxlength="128" autocomplete="off" spellcheck="false" placeholder="自定义密钥" hidden>
    <div class="popup-admin-btns">
      <button type="button" id="huayuAdminSealBtn">加密</button>
      <button type="button" id="huayuAdminOpenBtn">解密</button>
    </div>
    <p class="form-msg" id="huayuAdminMsg" hidden></p>
    <div class="huayu-result" id="huayuAdminResult" hidden>
      <div class="huayu-result-head">
        <span class="huayu-result-label" id="huayuAdminResultLabel"></span>
        <span class="huayu-result-meta" id="huayuAdminResultMeta"></span>
      </div>
      <div class="huayu-result-text" id="huayuAdminResultText"></div>
      <div class="huayu-btns">
        <button type="button" id="huayuAdminCopyBtn">复制</button>
      </div>
    </div>
  </section>

  <section class="ta-group">
    <h3 class="ta-group-title">打开记录</h3>
    <p class="ta-group-hint">访客通过人机验证后打开「听得花间语」的记录，访客标识由 IP 散列得到，不保存 IP 本身。</p>
    <p class="ta-group-hint" id="huayuVisitSummary">加载中…</p>
    <ol class="hy-visits" id="huayuVisitList"></ol>
    <div class="popup-admin-btns"><button type="button" id="huayuVisitRefreshBtn">刷新</button></div>
  </section>
</div>
<div class="gate-card admin-card pz-admin" id="puzzleAdminPanel" data-close-only-x="1" hidden>
  <h2>花街拼图</h2>
  <p class="hint" id="pzAdminStatus">加载中…</p>
  <section class="ta-group">
    <h3 class="ta-group-title">中断继续</h3>
    <p class="ta-group-hint">开启后，访客关掉拼图、刷新或切走页面，再打开时可以从中断处继续（进度存在访客自己的浏览器里）。关闭时关掉拼图即放弃本局。</p>
    <p class="ta-group-hint" id="pzAdminResumeStatus"></p>
    <div class="popup-admin-btns"><button type="button" id="pzAdminResumeBtn">切换</button></div>
  </section>
  <section class="ta-group">
    <h3 class="ta-group-title">大赛拼图</h3>
    <p class="ta-group-hint">开启后在设定时段内，拼图首页出现大赛入口。大赛用下面的图片和难度、正计时；通关后访客填写游戏 ID 登记成绩，并自动生成一代通关码。更换图片或难度算新一届，记录分开显示。</p>
    <p class="ta-group-hint" id="pzAdminContestStatus"></p>
    <label class="pz-admin-field"><span>大赛名称</span><input type="text" id="pzAdminTitle" maxlength="30" placeholder="如：中秋花街拼图大赛"></label>
    <div class="starlight-fields">
      <label class="starlight-field">
        <span>开始（国服时间）</span>
        <input type="datetime-local" id="pzAdminStart">
      </label>
      <span class="starlight-sep" aria-hidden="true">—</span>
      <label class="starlight-field">
        <span>结束（国服时间）</span>
        <input type="datetime-local" id="pzAdminEnd">
      </label>
    </div>
    <span class="pz-admin-label">难度</span>
    <div class="alarm-seg pz-admin-seg" id="pzAdminDiffSeg">
      <label class="is-active"><input type="radio" name="pzAdminDiff" value="easy" checked><span>鱼信 36块</span></label>
      <label><input type="radio" name="pzAdminDiff" value="normal"><span>鱼丽 60块</span></label>
      <label><input type="radio" name="pzAdminDiff" value="hard"><span>光风院霁月 128块</span></label>
    </div>
    <span class="pz-admin-label">大赛中可以使用</span>
    <div class="pz-admin-tools">
      <label class="audience-opt"><input type="checkbox" id="pzAdminToolPreview" checked><span>显示原图</span></label>
      <label class="audience-opt"><input type="checkbox" id="pzAdminToolEdges" checked><span>仅显示边框图块</span></label>
      <label class="audience-opt"><input type="checkbox" id="pzAdminToolGrid" checked><span>网格提示</span></label>
    </div>
    <span class="pz-admin-label">图片</span>
    <div class="pz-admin-image">
      <img id="pzAdminImagePreview" alt="大赛图片" hidden>
      <p class="ta-group-hint" id="pzAdminImageNone">还没有上传图片</p>
      <p class="ta-group-hint pz-admin-note" id="pzAdminImageNote"></p>
    </div>
    <div class="popup-admin-btns">
      <input type="file" id="pzAdminFile" accept="image/*" hidden>
      <button type="button" id="pzAdminPickBtn">选择图片并裁剪</button>
    </div>
    <div class="pz-crop-box" id="pzCropBox" hidden>
      <div class="alarm-seg pz-admin-seg" id="pzCropRatioSeg">
        <label class="is-active"><input type="radio" name="pzCropRatio" value="16:9" checked><span>16:9</span></label>
        <label><input type="radio" name="pzCropRatio" value="4:3"><span>4:3</span></label>
        <label><input type="radio" name="pzCropRatio" value="3:2"><span>3:2</span></label>
        <label><input type="radio" name="pzCropRatio" value="1:1"><span>1:1</span></label>
        <label><input type="radio" name="pzCropRatio" value="3:4"><span>3:4</span></label>
      </div>
      <div class="pz-crop-stage">
        <img id="pzCropImg" alt="" draggable="false">
        <div class="pz-crop-rect" id="pzCropRect">
          <span class="pz-crop-handle" data-h="nw"></span><span class="pz-crop-handle" data-h="ne"></span>
          <span class="pz-crop-handle" data-h="sw"></span><span class="pz-crop-handle" data-h="se"></span>
        </div>
      </div>
      <p class="ta-group-hint pz-crop-info" id="pzCropInfo"></p>
      <p class="ta-group-hint">拖动选框移动位置，拖四角调整大小；推荐 16:9，和相册图片一致</p>
      <div class="popup-admin-btns">
        <button type="button" id="pzCropOkBtn">裁剪并上传</button>
        <button type="button" id="pzCropCancelBtn">取消</button>
      </div>
    </div>
    <p class="form-msg" id="pzAdminImageMsg" hidden></p>
    <div class="popup-admin-btns">
      <button type="button" id="pzAdminSaveBtn">保存设置</button>
      <button type="button" id="pzAdminToggleBtn">开启大赛</button>
    </div>
    <p class="form-msg" id="pzAdminMsg" hidden></p>
  </section>
  <section class="ta-group">
    <h3 class="ta-group-title">参赛记录</h3>
    <p class="ta-group-hint">耗时为拼图计时（暂停、切后台不计）；鼠标停在耗时上可以看开局到登记的服务器时长，相差很大的可以留意。「辅助」为本局用过的原图、边框块、网格提示。IP 属地与访客标识不含 IP 本身。</p>
    <div class="pz-rec-tools">
      <select id="pzRecRound" aria-label="届"><option value="cur">本届</option></select>
      <select id="pzRecSort" aria-label="排序"><option value="time">按耗时</option><option value="at">按登记时间</option></select>
      <label class="audience-opt"><input type="checkbox" id="pzRecBest"><span>每人最好成绩</span></label>
      <button type="button" id="pzRecRefreshBtn">刷新</button>
      <button type="button" id="pzRecExportBtn">导出 CSV</button>
    </div>
    <p class="ta-group-hint" id="pzRecSummary"></p>
    <div class="ticket-table-wrap">
      <table class="ticket-table pz-rec-table">
        <thead><tr><th>名次</th><th>登记号</th><th>玩家 ID</th><th>难度</th><th>耗时</th><th>辅助</th><th>登记时间</th><th>属地</th><th>访客</th><th></th></tr></thead>
        <tbody id="pzRecBody"></tbody>
      </table>
    </div>
  </section>
</div>
<div class="gate-card admin-card" id="postAnnouncementPanel" hidden>
  <h2>发布公告</h2>
  <textarea id="announcementText" placeholder="公告内容"></textarea>
  <div class="announce-audience">
    <label class="audience-opt" for="announceShowA">
      <input type="checkbox" id="announceShowA" checked><span>给 A 显示</span>
    </label>
    <label class="audience-opt" for="announceShowB">
      <input type="checkbox" id="announceShowB" checked><span>给 B 显示</span>
    </label>
  </div>
  <div class="announcement-image-field">
    <input type="file" id="announcementImageInput" accept="image/*" hidden>
    <button type="button" id="announcementImagePickBtn" class="pill-btn-outline">配图</button>
    <span class="form-msg" id="announcementImageStatus" hidden></span>
    <div class="announcement-image-preview" id="announcementImagePreview" hidden>
      <img id="announcementImagePreviewImg" alt="">
      <button type="button" id="announcementImageRemoveBtn" aria-label="移除图片">×</button>
    </div>
  </div>
  <button id="postAnnouncementBtn">发布</button>
  <button id="cancelEditAnnouncementBtn" type="button" class="cancel-edit-btn" hidden>取消编辑</button>
  <p class="form-msg" id="postAnnouncementMsg" hidden></p>
</div>

`;

function mountAdminPanels() {
  $("adminPanelStash").innerHTML = ADMIN_PANELS_HTML;
}

mountAdminPanels();
[
  initInternal, initAdminPanels, initLockdownToggle, initMaintToggle, initCaptchaSwitch, initStarlightPanel, initTicketAdmin,
  initViewerPills, initFeedbackAdmin,
  typeof window.buildVenueForm === "function" ? initVenueAdmin
    : () => console.error("[场地预约] venue.js 没有加载成功，管理页的「场地预约」不可用"),
  typeof window.mountSurvey === "function" ? initSurveyAdmin
    : () => console.error("[活动问卷] survey.js 没有加载成功，管理页的「活动问卷」不可用"),
  initPostAnnouncement, initPopupAdmin, initHuayuAdmin, initPuzzleAdmin,
].forEach((init) => {
  try { init(); } catch (e) { console.error(e); }
});
HJ.adminReady = true;
