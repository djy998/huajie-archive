/* =============================================================================
   花舞之街 · 薰风花语町 —— 管理页 admin.js
   -----------------------------------------------------------------------------
   从 index.html 拆出来的独立脚本。普通访客用不到，所以不在页面里直接引用：
   进入 #internal 时由主脚本的 openInternalView() → loadAdminJs() 按需加载，
   加载完在文件末尾自己完成初始化，并设置 window.HJ_ADMIN_READY = true。
   内容：内部入口（密码 / 公告板 / 公告配图）、分享功能开关、机器人验证开关、星芒节面板、
         「查看购票情况」只读页（查看密码登录，只能看和导出 Excel，不能改任何东西）、
         购票管理（三个子标签：购票管理 / 详细订单 / 售票统计；编辑、部分作废、取票勾选、票额轮次、
         购票须知编辑、只读端权限与操作日志、Excel 导出、清空）、反馈建议箱、
         场地预约（场地使用登记的列表 / 新增 / 修改 / 作废，表单与文字对照在 venue.js）、
         活动问卷（统计 / 逐份查看 / 作废 / 开放关闭 / Excel 导出，题目定义在 survey.js）、
         首页弹窗公告（开关 / 标题 / 正文 / 一张配图 / 预览；访客端在 index.html 主脚本 12c 节）。
   依赖主脚本（$、callWorker、setMsg、showToast、escapeHtml、playEnterAnim、closeOnBackdrop、copyText、
   openCaptcha、workerBase、workerImageUrl、siteLockdown、captchaOn、applyCaptchaEnabled、
   hjStarlight、applyStarlight、refreshStarlightStatus、FEEDBACK_CATEGORIES…）
   和 ticket.js（formatHolder、minutesToHHMM、applyTicketEntryVisibility…）。
   改了本文件之后把 index.html 主脚本里的 ADMIN_JS_VERSION +1。
   ============================================================================= */

/* ---- 5. 内部入口与公告板 ---- */
/* =============================================================================
   5. 内部入口与公告板
   密码由 Worker 校验（get_announcements 兼作登录），身份：A / B 只读，C 为管理员。
   ============================================================================= */

let internalAdminPassword = null;   // 管理员登录后保存，用于后续写操作
let editingAnnouncementId = null;
let pendingAnnouncementImageUrl = null;

/* 密码累计输错计数（存本地，刷新不清零）：每满 PW_FAIL_CAPTCHA_EVERY 次弹一次人机验证 */
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
    setMsg(msg, "「购票情况」页面目前已关闭，请联系管理员");
    return;
  }
  if (!data.ok) {
    // 此处直接 openCaptcha：不享受 5 分钟免验证窗口
    const fails = getPwFailCount() + 1;
    setPwFailCount(fails);
    if (fails % PW_FAIL_CAPTCHA_EVERY === 0) {
      setMsg(msg, "密码不对，错误次数太多，先完成人机验证");
      openCaptcha("internal");
    } else {
      setMsg(msg, "密码不对，再试试");
    }
    return;
  }

  setPwFailCount(0);
  setMsg(msg, "");
  $("internalGate").hidden = true;
  /* 查看密码：只进「购票情况」只读页，不显示公告板（perms：管理员允许只读端看哪些） */
  if (data.isViewer) {
    enterTicketViewer(input.value, data.perms);
    return;
  }
  $("internalBoard").hidden = false;
  renderAnnouncements(data.items, data.isAdmin);

  // 管理面板都收进弹窗里，通过上方的胶囊按钮打开
  $("adminPills").hidden = !data.isAdmin;
  if (data.isAdmin) internalAdminPassword = input.value;
}

/* 查看购票情况（只读）-------------------------------------------------------------
   直接借用「购票管理」面板，加 is-readonly：只有「详细订单」和（管理员允许时）「售票统计」两个子标签，
   没有设置项、编辑 / 作废按钮和清空按钮。取票勾选看管理员有没有开放给只读端。
   管理员打开了「只读端显示活动问卷」时，上方多一排切换按钮，可以切到只读的「活动问卷」。
   Worker 端对查看密码同样只放行读取（和允许时的取票勾选），前端被改也改不了别的数据。
   页面开着时每分钟自动刷新一次（切到后台时不刷）。 */
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
  /* 活动问卷（只读） */
  const survey = $("surveyAdminPanel");
  const withSurvey = !!(ticketAdmin.perms.survey && window.HJ_SURVEY_READY);
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
    if (!document.hidden && !$("view-internal").hidden && !$("ticketViewBoard").hidden && !panel.hidden) refreshTicketAdmin();
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

/* 管理功能弹窗：把面板节点搬进弹窗，打开时刷新它自己的数据 */
const ADMIN_PANEL_REFRESH = {
  lockdownPanel: () => refreshLockdownStatus(),
  captchaPanel: () => refreshCaptchaSwitch(),
  starlightPanel: () => syncStarlightPanel(),
  ticketAdminPanel: () => refreshTicketAdmin(),
  feedbackAdminPanel: () => refreshFeedbackAdmin(),
  venueAdminPanel: () => refreshVenueAdmin(),
  popupAdminPanel: () => refreshPopupAdmin(),
  surveyAdminPanel: () => {
    if (window.HJ_SURVEY_READY) return refreshSurveyAdmin();
    $("surveyAdminStatus").textContent = "问卷脚本 survey.js 没有加载成功（没上传或被缓存挡住），刷新页面再试";
    return null;
  },
};

/* 关掉 / 切换面板时把节点搬回 stash，避免被下一个面板顶掉 */
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

function renderAnnouncements(items, isAdmin) {
  const list = $("announcementList");
  if (!items || !items.length) {
    list.innerHTML = `<div class="empty-note">公告板还没有内容</div>`;
    return;
  }

  list.innerHTML = items.map((a) => {
    let tag = "";
    let adminBtns = "";
    if (isAdmin) {
      const targets = [a.show_a && "A", a.show_b && "B"].filter(Boolean);
      tag = `<span class="announcement-audience">[${targets.length ? targets.join("+") : "谁都看不到"}]</span>`;
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
        <div class="date">${new Date(a.created_at).toLocaleDateString("zh-CN")}${tag}</div>
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

/* 公告配图 ------------------------------------------------------------------ */

function showAnnouncementImagePreview(url) {
  $("announcementImagePreviewImg").src = url || "";
  $("announcementImagePreview").hidden = !url;
}

const readAsDataURL = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error("read fail"));
  reader.readAsDataURL(blob);
});

/* 压缩为 WebP：长边不超过 maxDim，返回 { base64, contentType } */
async function compressImageFile(file, maxDim = 1600, quality = 0.82) {
  const dataUrl = await readAsDataURL(file);
  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("decode fail"));
    el.src = dataUrl;
  });

  let width = img.naturalWidth;
  let height = img.naturalHeight;
  const scale = Math.min(1, maxDim / Math.max(width, height));
  width = Math.round(width * scale);
  height = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(img, 0, 0, width, height);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
  if (!blob) throw new Error("encode fail");
  const encoded = await readAsDataURL(blob);
  return { base64: encoded.split(",")[1], contentType: blob.type || "image/webp" };
}

function initAnnouncementImageUpload() {
  const input = $("announcementImageInput");
  const pickBtn = $("announcementImagePickBtn");
  const status = $("announcementImageStatus");

  pickBtn.addEventListener("click", () => input.click());
  $("announcementImageRemoveBtn").addEventListener("click", () => {
    pendingAnnouncementImageUrl = null;
    showAnnouncementImagePreview(null);
  });

  input.addEventListener("change", async () => {
    const file = input.files && input.files[0];
    input.value = "";
    if (!file) return;
    setMsg(status, "图片处理中…");
    pickBtn.disabled = true;
    try {
      const { base64, contentType } = await compressImageFile(file);
      const data = await callWorker({
        action: "upload_announcement_image",
        password: internalAdminPassword,
        image: base64,
        content_type: contentType,
      });
      if (!data || !data.ok) throw new Error((data && data.error) || "upload failed");
      pendingAnnouncementImageUrl = new URL(`image/${data.key}`, workerBase()).href;
      showAnnouncementImagePreview(pendingAnnouncementImageUrl);
      setMsg(status, "");
    } catch (e) {
      setMsg(status, "图片上传失败，请重试");
    }
    pickBtn.disabled = false;
  });
}

/* 发布 / 编辑 / 删除 --------------------------------------------------------- */

function startEditAnnouncement(item) {
  openAdminPanel("postAnnouncementPanel");
  editingAnnouncementId = item.id;
  $("announcementText").value = item.body;
  $("announceShowA").checked = !!item.show_a;
  $("announceShowB").checked = !!item.show_b;
  pendingAnnouncementImageUrl = item.image_url || null;
  showAnnouncementImagePreview(pendingAnnouncementImageUrl);
  $("postAnnouncementBtn").textContent = "保存修改";
  $("cancelEditAnnouncementBtn").hidden = false;
  $("announcementText").focus({ preventScroll: true });
}

function cancelEditAnnouncement() {
  editingAnnouncementId = null;
  pendingAnnouncementImageUrl = null;
  showAnnouncementImagePreview(null);
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
    setMsg(msg, "写点内容再发布吧");
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
}

/* ---- 6. 管理员：分享功能开关 / 机器人验证开关 / 星芒节面板 ---- */
/* 分享功能开关：数据库里存的仍是 lockdown（1 = 分享功能关闭），
   界面按「分享功能」正向表述：开启 = 正常，关闭 = 纯静态展示 */
async function refreshLockdownStatus() {
  const status = $("lockdownStatus");
  status.textContent = "当前状态：读取中…";
  const data = await callWorker({ action: "get_lockdown" });
  if (!data) {
    status.textContent = "当前状态：读取失败";
    return;
  }
  siteLockdown = !!data.value;
  status.textContent = data.value
    ? "当前状态：已关闭（纯静态展示，联系方式 / 活动群 / 场地登记 / 活动问卷 / 点赞都不可用）"
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
      setMsg(msg, "切换失败，请重新登录内部入口后再试");
      return;
    }
    siteLockdown = !!data.value;
    showToast(data.value ? "分享功能已关闭（纯静态展示）" : "分享功能已开启");
    refreshLockdownStatus();
  });
}

async function refreshCaptchaSwitch() {
  const status = $("captchaStatus");
  status.textContent = "当前状态：读取中…";
  const data = await callWorker({ action: "get_captcha" });
  if (!data || !data.ok) {
    status.textContent = "当前状态：读取失败";
    return;
  }
  applyCaptchaEnabled(!!data.enabled);
  status.textContent = data.enabled
    ? "当前状态：已开启（正常验证）"
    : "当前状态：已关闭（全站不验证，任何人都能直接提交，请尽快开回来）";
  $("captchaToggleBtn").textContent = data.enabled ? "关闭机器人验证" : "开启机器人验证";
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
      setMsg(msg, "切换失败，请重新登录内部入口后再试");
      return;
    }
    applyCaptchaEnabled(!!data.enabled);
    showToast(data.enabled ? "机器人验证已开启" : "机器人验证已关闭（压测模式）");
    refreshCaptchaSwitch();
  });
}

/* 管理员登录后调用：刷新状态、回填输入框、清空提示 */
function syncStarlightPanel() {
  refreshStarlightStatus();
  $("starlightStart").value = hjStarlight ? epochMsToCnInput(hjStarlight.start) : "";
  $("starlightEnd").value = hjStarlight ? epochMsToCnInput(hjStarlight.end) : "";
  setMsg($("starlightMsg"), "");
}

/* value = { start, end } 保存；null 清除 */
async function saveStarlight(value) {
  const msg = $("starlightMsg");
  const buttons = [$("starlightSaveBtn"), $("starlightClearBtn")];

  setMsg(msg, "保存中…");
  buttons.forEach((b) => { b.disabled = true; });
  const data = await callWorker({ action: "set_starlight", password: internalAdminPassword, value });
  buttons.forEach((b) => { b.disabled = false; });

  if (!data) {
    setMsg(msg, "连接失败，检查一下网络后再试");
    return;
  }
  if (!data.ok) {
    setMsg(msg, "保存失败，请重新登录内部入口后再试");
    return;
  }
  applyStarlight(value);
  syncStarlightPanel();
  showToast(value ? "星芒节时段已保存，期间全站天气显示为小雪" : "已清除星芒节覆盖，天气恢复正常计算");
}

function initStarlightPanel() {
  $("starlightSaveBtn").addEventListener("click", () => {
    const msg = $("starlightMsg");
    const start = cnInputToEpochMs($("starlightStart").value);
    const end = cnInputToEpochMs($("starlightEnd").value);
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      setMsg(msg, "先把开始和结束时间都填完整");
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

/* ---- 6b. 活动购票：管理面板 / 只读端 / Excel 导出 ----
   2026-09-28 升级：面板分成三个子标签
     · 购票管理：各项设置（基本 / 票额与刷新 / 购票页显示 / 购票须知 / 只读端 / 数据）
     · 详细订单：订单表（编辑、部分作废、作废 / 恢复、取票勾选、搜索）
     · 售票统计：总计、售罄耗时、每小时售出、各服务器玩家、验证方式分布、未取票名单
   只读端（查看密码）只看得到「详细订单」和（管理员允许时）「售票统计」；
   取票勾选看「只读端可勾选取票」的设置，只读端的勾选记进操作日志（Worker 每 x 小时合并成一条）。 */
const ticketAdmin = {
  status: null,
  orders: [],
  rounds: [],
  role: "admin",
  perms: { stats: true, survey: true, pickup: true },
  tab: "settings",
  day: null,             // 详细订单：选中的轮次（"" = 全部轮次，null = 跟着当前这一轮）
  statsRound: "",        // 售票统计：选中的轮次（"" = 全部）
  search: "",
  edit: null,            // 正在编辑 / 部分作废的订单：{ mode: "edit" | "partial", id }
  editHolders: [],       // 编辑框里的持票人（改完一起保存）
  pointsDirty: false,    // 自定义刷新点改了还没保存（这时刷新数据不覆盖输入框）
  guideLoaded: false,
  logItems: null,
};
const TA_TABS = ["settings", "orders", "stats"];
const isTicketViewer = () => ticketAdmin.role === "viewer";
const ticketAdminPassword = () => internalAdminPassword || internalViewPassword;
const TA_CN_OFFSET = 8 * 3600 * 1000;
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

/* 所有轮次：Worker 记录的（ticket_rounds）+ 升级前老订单的票日（没有记录，开始时间按现在的每日刷新时间推算、
   票额按现在的每日票额估算）。按开始时间排序 */
function ticketRoundList() {
  const st = ticketAdmin.status;
  const map = new Map();
  ticketAdmin.rounds.forEach((r) => map.set(r.key, { ...r, legacy: false }));
  ticketAdmin.orders.forEach((o) => {
    if (map.has(o.day)) return;
    const m = /^(\d{4}-\d{2}-\d{2})(?: (\d{2}:\d{2}))?/.exec(o.day);
    const startAt = m
      ? Date.parse(`${m[1]}T${m[2] || "00:00"}:00+08:00`) + (m[2] ? 0 : (st?.resetMin || 0) * 60000)
      : 0;
    const q = st ? st.limit : 0;
    map.set(o.day, { key: o.day, startAt, base: q, extra: 0, quota: q, source: "legacy", openedAt: -1, legacy: true });
  });
  if (st?.round && !map.has(st.round.key)) map.set(st.round.key, { ...st.round, legacy: false });
  return [...map.values()].sort((a, b) => a.startAt - b.startAt || String(a.key).localeCompare(String(b.key)));
}

/* 重复标记：同一联系方式出现在多单；同一 id@区服 出现多次（待定、已作废的除外） */
function computeTicketDuplicates(orders) {
  const normContact = (c) => String(c).replace(/\s+/g, "").toLowerCase();
  const normHolder = (h) => `${String(h.name || "").replace(/\s+/g, "").toLowerCase()}@${h.server}`;
  const contactCount = new Map();
  const holderCount = new Map();
  /* 作废单不算重复：它已经不占票额了，再标红会让人以为还要处理 */
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
    ? { contact: false, holders: o.holders.map(() => false) }   // 作废单自己也不标重复
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

/* 一组订单的合计（统计 / 顶部小方块共用） */
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

/* 整个面板：顶部状态 + 小方块 + 子标签，再画当前子标签 */
function renderTicketAdmin() {
  const st = ticketAdmin.status;
  if (!st) return;
  const viewer = isTicketViewer();
  const cur = st.round || { key: st.day, quota: st.limit, base: st.limit, extra: 0, startAt: 0 };
  $("ticketAdminStatus").textContent = `当前这一轮：${ticketRoundLabel(cur.key, true)}`
    + (cur.startAt ? `（${formatCnTime(cur.startAt)} 开始，国服时间）` : "");

  const roundOrders = ticketAdmin.orders.filter((o) => o.day === cur.key && !o.voided);
  const overNow = roundOrders.filter((o) => o.overLimit).reduce((n, o) => n + o.qty, 0);
  const all = ticketTotals(ticketAdmin.orders);
  $("ticketAdminStats").innerHTML = tasItems([
    ["本轮已售", `${st.sold} 张`],
    ["本轮票额", `${cur.quota} 张${cur.extra ? `<small>临时 ${cur.extra > 0 ? "+" : ""}${cur.extra}</small>` : ""}`],
    ["本轮余票", `${st.remaining} 张`],
    ["本轮订单", `${roundOrders.length} 单${overNow ? `（超额 ${overNow} 张）` : ""}`],
    ["累计有效", `${all.liveOrders} 单 / ${all.liveTickets} 张`],
    ["已取票", `${all.pickedOrders} 单 / ${all.pickedTickets} 张`],
  ]);

  const allowed = viewer ? ["orders", ...(ticketAdmin.perms.stats ? ["stats"] : [])] : TA_TABS;
  if (!allowed.includes(ticketAdmin.tab)) ticketAdmin.tab = allowed[0];
  document.querySelectorAll("#ticketAdminTabs [data-ta-tab]").forEach((b) => {
    const on = b.dataset.taTab === ticketAdmin.tab;
    b.hidden = !allowed.includes(b.dataset.taTab);
    b.classList.toggle("is-active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  $("ticketAdminTabs").hidden = allowed.length < 2;
  document.querySelectorAll("#ticketAdminPanel [data-ta-pane]").forEach((p) => { p.hidden = p.dataset.taPane !== ticketAdmin.tab; });
  if (ticketAdmin.tab === "settings") renderTicketSettings(st);
  else if (ticketAdmin.tab === "orders") renderTicketOrders();
  else renderTicketStats();
}

/* =============================== 子标签一：购票管理 =============================== */
/* 通用开关按钮：<button class="ticket-switch" data-ta-flag="字段" data-on="开启时的字" data-off="关闭时的字"> */
function renderTicketFlagSwitches(st) {
  document.querySelectorAll("#ticketAdminPanel [data-ta-flag]").forEach((btn) => {
    setTicketSwitch(btn, !!st[btn.dataset.taFlag], btn.dataset.on, btn.dataset.off);
  });
}

/* 输入框正在被编辑时不覆盖，免得打字打到一半被刷新冲掉 */
const setIdle = (el, v) => { if (el && document.activeElement !== el) el.value = v; };

function renderTicketSettings(st) {
  /* ---- 基本 ---- */
  setTicketSwitch($("ticketOpenBtn"), st.open, "已开放（点击关闭）", "已关闭（点击开放）");
  setTicketSwitch($("ticketPendingBtn"), st.allowPending, "允许待定（点击关闭）", "不允许待定（点击开启）");
  setTicketSwitch($("ticketTestBtn"), !!st.testMode, "显示「（测试）」（点击去掉）", "不显示（点击加上）");
  setIdle($("ticketTitleInput"), st.title || TICKET_TITLE);
  $("ticketTitlePreview").textContent = `访客看到的标题：${st.title || TICKET_TITLE}${st.testMode ? "（测试）" : ""}`;
  $("ticketTitlePreview").hidden = false;
  setIdle($("ticketCooldownInput"), String(st.cooldownMin ?? 30));
  setIdle($("ticketPerPersonInput"), String(st.perPerson ?? ""));
  renderTicketSchedule(st);

  /* ---- 票额与刷新 ---- */
  const cur = st.round || { key: st.day, base: st.limit, extra: 0, quota: st.limit, startAt: 0, source: "" };
  const SOURCE_TEXT = { daily: "每日刷新", custom: "自定义刷新点", init: "升级时的当前轮" };
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
  /* 「当前这一轮也改」只在当前这一轮是每日刷新开始的时候有意义 */
  $("ticketLimitCurWrap").hidden = !(cur.source === "daily" || cur.source === "init");
  if (!ticketAdmin.pointsDirty) renderTicketPoints(st.points || [], cur.startAt);
  renderTicketNext(st);

  /* ---- 购票页显示 ---- */
  const mode = st.remainingMode || "full";
  setIdle($("ticketRemainModeSelect"), mode);
  const stockHtml = ticketStockHtml(mode, st.remaining, st.stockLevel, st.roundWord || "今日");
  $("ticketRemainPreview").textContent = `访客现在看到：${stockHtml ? stockHtml.replace(/<[^>]+>/g, "") : "（不显示余票）"}`
    + (mode === "range" ? `　｜ 档位：≤10 张「余票10张以内」，≤ 票额 50% 「余票不多」，其余「余票充裕」` : "");
  $("ticketRemainPreview").hidden = false;
  setTicketSwitch($("ticketShowSchedBtn"), st.showSchedule !== false, "显示（点击隐藏）", "不显示（点击显示）");
  setTicketSwitch($("ticketShowResetBtn"), st.showReset !== false, "显示（点击隐藏）", "不显示（点击显示）");
  setTicketSwitch($("ticketViewerBtn"), st.viewerEnabled !== false, "已开放（点击关闭）", "已关闭（点击开放）");
  renderTicketFlagSwitches(st);
  setIdle($("ticketIdleInput"), String(st.idleMin ?? 10));
  /* 与首页隔离时停留时间限制自动失效：整行置灰 */
  const iso = !!st.isolated;
  document.querySelectorAll(".ta-idle-row").forEach((row) => {
    row.classList.toggle("is-disabled", iso);
    row.querySelectorAll("input, button").forEach((el) => { el.disabled = iso; });
  });
  $("ticketIdleIsoNote").hidden = !iso;

  /* ---- 只读端 ---- */
  setIdle($("ticketLogHoursInput"), String(st.viewerLogHours ?? 24));
}

/* 定时开关：把服务端的 openAt / closeAt 回填到输入框，并用一句人话说明接下来会发生什么 */
function renderTicketSchedule(st) {
  setIdle($("ticketOpenAtInput"), epochToCnLocal(st.openAt));
  setIdle($("ticketCloseAtInput"), epochToCnLocal(st.closeAt));
  const parts = [];
  if (st.openAt) parts.push(`将于 ${formatCnTime(st.openAt)} 自动开启`);
  if (st.closeAt) parts.push(`将于 ${formatCnTime(st.closeAt)} 自动关闭`);
  const note = $("ticketSchedNote");
  note.textContent = parts.length ? `${parts.join("；")}（国服时间；计划执行后自动清除）` : "";
  note.hidden = !parts.length;
}

/* 自定义刷新点列表：只列还没执行的（晚于当前这一轮开始时刻的） */
function renderTicketPoints(points, curStart) {
  const list = points.filter((p) => p.at > (curStart || 0));
  $("ticketPointsList").innerHTML = list.length
    ? list.map((p) => ticketPointRowHtml(epochToCnLocal(p.at), p.qty)).join("")
    : `<p class="ta-empty" data-points-empty>还没有自定义刷新点</p>`;
}

function ticketPointRowHtml(at = "", qty = "") {
  return `<div class="ta-point" data-point>
    <input type="datetime-local" class="ta-point-at" value="${escapeHtml(at)}" aria-label="刷新时间（国服）">
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
    note.textContent = "每日刷新关着，也没有以后的自定义刷新点：票额不重置，一直用当前这一轮的票额。";
    note.hidden = false;
    return;
  }
  info.textContent = `${formatCnTime(next.at)}（${next.kind === "daily" ? "每日刷新" : "自定义刷新点"}）`;
  setIdle(input, String(next.qty));
  $("ticketNextResetBtn").hidden = !next.override;
  const lines = [];
  if (next.override) lines.push(`已单独设为 ${next.qty} 张（默认是 ${next.defaultQty} 张），只对这一次刷新有效。`);
  else if (next.kind === "custom") lines.push("改这里会同步改掉下面列表里这个刷新点的票额。");
  else lines.push(`默认按每日票额 ${next.defaultQty} 张；改这里只影响这一次，之后恢复每日票额。`);
  if (next.pendingOverride) lines.push(`另外已为 ${formatCnTime(next.pendingOverride.at)} 的每日刷新单独设了 ${next.pendingOverride.qty} 张。`);
  note.textContent = lines.join(" ");
  note.hidden = false;
}

/* =============================== 子标签二：详细订单 =============================== */
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
  $("ticketDaySelect").innerHTML = `<option value=""${all ? " selected" : ""}>全部轮次（${ticketTotals(orders).liveOrders} 单）</option>`
    + rounds.slice().reverse().map((r) => {
      const t = ticketTotals(orders.filter((o) => o.day === r.key));
      return `<option value="${escapeHtml(r.key)}"${r.key === ticketAdmin.day ? " selected" : ""}>${escapeHtml(ticketRoundLabel(r.key, true))}`
        + `（${t.liveOrders} 单 / ${t.liveTickets} 张${t.voidOrders ? ` · 作废 ${t.voidOrders}` : ""}）</option>`;
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
    const time = new Date(o.createdAt).toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai", hour12: false,
      ...(all ? { month: "numeric", day: "numeric" } : {}), hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
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
      <td>${time}</td>
      <td class="tt-actions"><div class="tt-acts">${acts}</div></td>
      <td class="tt-pick-cell">${pick}</td>
    </tr>`;
  }).join("") : `<tr><td colspan="8" class="tt-empty">${ticketAdmin.search ? "没有符合搜索条件的订单" : "这一轮还没有订单"}</td></tr>`;

  if (ticketAdmin.edit) {
    const o = orders.find((x) => x.id === ticketAdmin.edit.id);
    if (!o || o.voided) closeTicketEdit();
    else if (ticketAdmin.edit.mode === "partial") renderTicketPartial();
  }
}

/* ---- 编辑订单（订单表上方的编辑框）---- */
function ticketServerOptions(selected) {
  return `<option value="">选择区服</option>` + TICKET_SERVER_GROUPS.map((g) =>
    `<optgroup label="【${g.dc}】">${g.servers.map((s) => `<option value="${s}"${s === selected ? " selected" : ""}>${s}</option>`).join("")}</optgroup>`
  ).join("");
}

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
    <div class="ta-field"><span>持票人（张数 = 没作废的持票人数）</span><div id="teHolders"></div>
      <button type="button" class="tt-act" id="teAddHolder">+ 添加持票人</button></div>
    <label class="ta-field"><span>留言</span><textarea id="teMessage" maxlength="200"></textarea></label>
    <div class="ta-edit-checks">
      <label class="audience-opt"><input type="checkbox" id="teAnon"><span>匿名留言</span></label>
      <label class="audience-opt"><input type="checkbox" id="teOver"><span>超额（导出标红）</span></label>
    </div>
    <label class="ta-field"><span>管理备注（只有管理员能看到）</span><textarea id="teNote" maxlength="500"></textarea></label>
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
    ? `<div class="te-holder is-void"><span><s>${escapeHtml(formatHolder(h))}</s>（已作废，在「部分作废」里恢复）</span></div>`
    : `<div class="te-holder" data-h="${i}">
        <input type="text" class="te-name" maxlength="12" placeholder="角色名" autocomplete="off" spellcheck="false"${h.pending ? " disabled" : ""}>
        <select class="te-server"${h.pending ? " disabled" : ""}>${ticketServerOptions(h.server)}</select>
        <label class="audience-opt"><input type="checkbox" class="te-pending"${h.pending ? " checked" : ""}><span>待定</span></label>
        <button type="button" class="tt-act is-void" data-h-del>删除</button>
      </div>`)).join("");
  wrap.querySelectorAll(".te-holder[data-h]").forEach((row) => {
    const h = ticketAdmin.editHolders[Number(row.dataset.h)];
    row.querySelector(".te-name").value = h.pending ? "" : (h.name || "");
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
    const err = h.name ? ticketNameError(h.name) : "请填写持票人 id（或者勾「待定」）";
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
      conflict: "这一单刚刚被改过（编辑 / 作废 / 部分作废），已为你刷新，请重新打开编辑",
      bad_contact: "请填写联系方式", bad_holders: "持票人数量不对（1–50 位）",
      bad_holder_name: "有持票人没填 id", bad_holder_server: "有持票人没选区服",
      bad_holder_name_format: "持票人 id 不符合要求：不能有数字，最多 6 个字，只能用汉字、英文字母和「·」",
      no_active_holder: "至少要留一位持票人", bad_day: "所选轮次不存在，刷新后再试",
      "unknown action": "Worker 还是旧版本，请先部署新的 worker.js",
    };
    setMsg(msg, ERR[data?.error] || "保存失败，请重新登录内部入口后再试");
    if (data?.error === "conflict") { closeTicketEdit(); await refreshTicketAdmin(); }
    return;
  }
  ticketAdminApplyOrder(data.order, data.status);
  closeTicketEdit();
  renderTicketAdmin();
  showToast(data.overQuota ? `已保存。注意：${ticketRoundLabel(data.order.day)}这一轮已经超出票额` : `第 ${data.order.seq} 号已保存`);
}

/* 服务端回来的一单替换本地那一单 */
function ticketAdminApplyOrder(order, status) {
  const at = ticketAdmin.orders.findIndex((o) => o.id === order.id);
  if (at >= 0) ticketAdmin.orders[at] = { ...ticketAdmin.orders[at], ...order };
  if (status) ticketAdmin.status = status;
}

/* ---- 部分作废（订单表上方的小框：每位持票人一个作废 / 恢复按钮）---- */
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
    <h3 class="venue-edit-title">部分作废 · ${escapeHtml(ticketRoundLabel(o.day, true))} 第 ${o.seq} 号（现在 ${o.qty} 张）</h3>
    <p class="hint">作废的那张票额当场放回；恢复时这一轮票额不够的话，这一单会被标成超额。至少留一张，整单不要了请用「作废」。</p>
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
      conflict: "这一单刚刚被改过，已为你刷新，请再点一次",
      last_holder: "至少要留一张；整单不要了请用「作废」",
      order_voided: "这一单已经整单作废了",
      not_changed: "这一张的状态已经变过了，已为你刷新",
      "unknown action": "Worker 还是旧版本，请先部署新的 worker.js",
    };
    setMsg($("tpMsg"), ERR[data?.error] || "操作失败，请重新登录内部入口后再试");
    if (["conflict", "not_changed"].includes(data?.error)) { await refreshTicketAdmin(); }
    return;
  }
  ticketAdminApplyOrder(data.order, data.status);
  renderTicketAdmin();
  showToast(voided ? `已作废第 ${data.order.seq} 号的一张，现在 ${data.order.qty} 张`
    : `已恢复，现在 ${data.order.qty} 张${data.becameOver ? "（这一轮票额不够，这一单标成了超额）" : ""}`);
}

/* ---- 整单作废 / 恢复 ---- */
async function ticketAdminVoid(id, voided) {
  const msg = $("ticketAdminMsg");
  setMsg(msg, "");
  const data = await callWorker({ action: "ticket_admin_void", password: internalAdminPassword, id, voided });
  if (!data || !data.ok) {
    if (data && data.error === "not_changed") {
      /* 别人已经改过了（或重复点击）：直接拉一次最新数据，让界面回到真实状态 */
      setMsg(msg, "这一单的状态已经变过了，已为你刷新");
      await refreshTicketAdmin();
      return;
    }
    setMsg(msg, "操作失败，请重新登录内部入口后再试");
    return;
  }
  ticketAdminApplyOrder(data.order, data.status);
  renderTicketAdmin();
  showToast(data.order.voided
    ? `第 ${data.order.seq} 号已作废，票额已放回`
    : `第 ${data.order.seq} 号已恢复${data.order.overLimit ? "（票额已满，按超额票计）" : ""}`);
}

/* ---- 取票勾选（管理员；只读端要管理员允许）---- */
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
      order_voided: "这一单已作废，不能勾选取票",
      no_permission: "管理员没有开放只读端勾选取票",
      viewer_closed: "「购票情况」页面已被管理员关闭",
      "unknown action": "Worker 还是旧版本，请先部署新的 worker.js",
    };
    setMsg(msg, ERR[data?.error] || "勾选失败，检查一下网络后再试");
    if (!data?.order) input.checked = !picked;
    renderTicketAdmin();
    return;
  }
  renderTicketAdmin();
}

/* =============================== 子标签三：售票统计 =============================== */
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

/* 售罄耗时：从这一轮开始（这一轮是后来才开放购票的，就从开放那一刻）到卖满票额的时间；没卖满显示「未售罄」 */
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
  else if (list.length) { start = list[0].createdAt; approx = true; }   // 开放时刻没记录（升级前）：从第一单算
  let text;
  if (!list.length) text = round.openedAt ? "未售罄" : "还没开放";
  else if (!soldOutAt) text = "未售罄";
  else text = `${approx ? "约 " : ""}${fmtDuration(soldOutAt - start)}`;
  return { sold, soldOutAt, start, approx, text };
}

function ticketSelloutTable(rounds, sel) {
  if (!rounds.length) return `<p class="fb-empty">还没有轮次</p>`;
  const rows = rounds.slice().reverse().map((r) => {
    const s = ticketSelloutInfo(r);
    return `<tr class="${r.key === sel ? "is-sel" : ""}">
      <td>${escapeHtml(ticketRoundLabel(r.key, true))}</td>
      <td>${r.startAt ? escapeHtml(cnMdHm(r.startAt)) : "—"}${r.openedAt > 0 && r.openedAt > r.startAt ? `<small>开放 ${escapeHtml(cnMdHm(r.openedAt))}</small>` : ""}</td>
      <td>${r.quota}${r.legacy ? "<small>估</small>" : ""}</td>
      <td>${s.sold}</td>
      <td>${escapeHtml(s.text)}${s.soldOutAt ? `<small>${escapeHtml(cnMdHm(s.soldOutAt))} 售罄</small>` : ""}</td>
    </tr>`;
  }).join("");
  const legacy = rounds.some((r) => r.legacy) || rounds.some((r) => r.openedAt === -1);
  return `<div class="ticket-table-wrap"><table class="ticket-table ta-sellout">
    <thead><tr><th>轮次</th><th>开始</th><th>票额</th><th>售出</th><th>售罄耗时</th></tr></thead><tbody>${rows}</tbody></table></div>`
    + (legacy ? `<p class="ta-footnote">升级前的轮次没有记录开放时刻和票额：售罄耗时从第一单算（标「约」），票额按现在的每日票额估算（标「估」）。</p>` : "");
}

/* 每小时售出曲线（国服时间），一个点一个小时；跨度超过 14 天时改成一天一个点 */
function ticketHourlyChart(live, width) {
  if (!live.length) return `<p class="fb-empty">还没有订单</p>`;
  const HOUR = 3600 * 1000;
  const spanDays = (Math.max(...live.map((o) => o.createdAt)) - Math.min(...live.map((o) => o.createdAt))) / (24 * HOUR);
  const step = spanDays > 14 ? 24 : 1;   // 每根柱子几小时
  const slot = (t) => Math.floor((t + TA_CN_OFFSET) / (step * HOUR));
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
  const slotStart = (i) => (k0 + i) * step * HOUR - TA_CN_OFFSET;
  const label = (i) => {
    const d = new Date(slotStart(i) + TA_CN_OFFSET);
    const md = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
    return step === 24 || d.getUTCHours() === 0 ? md : `${d.getUTCHours()}时`;
  };
  /* 横轴标签：按图宽决定最多放几个，落在整点（按天时落在整天）上 */
  const maxLabels = Math.max(3, Math.floor(plotW / 64));
  const every = (step === 24 ? [1, 2, 3, 7, 14, 30] : [1, 2, 3, 6, 12, 24, 48, 72, 96, 168])
    .find((x) => n / x <= maxLabels) || (step === 24 ? 30 : 168);
  /* 纵轴刻度：0、顶部，再加一条中线（中线不是整数张时就不画） */
  const grid = (Number.isInteger(niceMax / 2) ? [0, 0.5, 1] : [0, 1]).map((f) => {
    const v = niceMax * f;
    return `<line x1="${padL}" x2="${width - padR}" y1="${y(v)}" y2="${y(v)}" class="ta-grid"/>`
      + `<text x="${padL - 6}" y="${y(v) + 4}" class="ta-axis" text-anchor="end">${Math.round(v)}</text>`;
  }).join("");
  /* 折线：每个时段一个点（画在时段中间），下面铺一层很淡的面积；有售出的时段画一个小圆点。
     整列都是透明的感应区，鼠标放上去显示这一时段的张数 / 单数 */
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
    + `<p class="ta-footnote">单位：张（有效票）· 国服时间 · ${step === 24 ? "跨度较长，每个点是一天" : "每个点是一小时"}。`
    + `最多的一${step === 24 ? "天" : "小时"}：${escapeHtml(cnMdHm(slotStart(peakI)))} 起，${vals[peakI].tickets} 张。把鼠标放到图上可以看每个时段的具体数字。</p>`;
}

/* 横向条形（服务器 / 验证方式共用，沿用问卷统计的样式） */
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
  if (!total) return `<p class="fb-empty">还没有持票人</p>`;
  const maxN = Math.max(1, pending, ...count.values());   // 各大区的条用同一把尺子，长短才能互相比
  const groups = TICKET_SERVER_GROUPS.map((g) => {
    const items = g.servers.map((s) => ({ label: s, n: count.get(s) || 0 })).filter((x) => x.n).sort((a, b) => b.n - a.n);
    const n = items.reduce((a, x) => a + x.n, 0);
    return n ? `<p class="ta-dc">【${g.dc}】${n} 人</p>${taBarsHtml(items, total, maxN)}` : "";
  }).join("");
  const other = [...count.entries()].filter(([s]) => !TICKET_SERVERS.includes(s)).map(([label, n]) => ({ label, n }));
  return `<p class="ta-footnote">按持票人计（一张票一位），共 ${total} 位；百分比按全部持票人算。</p>${groups}`
    + (other.length ? `<p class="ta-dc">其他</p>${taBarsHtml(other, total, maxN)}` : "")
    + (pending ? `<p class="ta-dc">待定</p>${taBarsHtml([{ label: "id 待定", n: pending }], total, maxN)}` : "");
}

function ticketVerifyBars(live) {
  if (!live.length) return `<p class="fb-empty">还没有订单</p>`;
  const count = {};
  live.forEach((o) => { const k = o.verifyMode || ""; count[k] = (count[k] || 0) + 1; });
  const order = ["cf", "ff14", "poem", "math", "manual", "off", ""];
  const items = order.filter((k) => count[k]).map((k) => ({ label: k ? VERIFY_MODE_TEXT[k] : "未记录（升级前的订单）", n: count[k] }));
  return `<p class="ta-footnote">按订单计，共 ${live.length} 单。</p>${taBarsHtml(items, live.length)}`;
}

/* 未取票名单：可以直接复制（含联系方式的给自己核对用；只有持票人的可以发群里） */
function ticketUnpickedList(live) {
  const rounds = ticketRoundList();
  const idx = new Map(rounds.map((r, i) => [r.key, i]));
  return live.filter((o) => !o.picked).sort((a, b) => (idx.get(a.day) ?? 0) - (idx.get(b.day) ?? 0) || a.seq - b.seq);
}

function ticketUnpickedHtml(live) {
  const list = ticketUnpickedList(live);
  const tickets = list.reduce((n, o) => n + o.qty, 0);
  const head = `<div class="ta-list-head"><h3 class="ta-stat-title">未取票名单</h3><span>${list.length} 单 / ${tickets} 张</span>
    ${list.length ? `<button type="button" class="tt-act" data-copy-unpicked="full">复制（含联系方式）</button>
    <button type="button" class="tt-act" data-copy-unpicked="ids">复制（只有持票人）</button>` : ""}</div>`;
  if (!list.length) return `${head}<p class="fb-empty">没有未取票的有效订单</p>`;
  /* 名单长的时候先收起来（复制按钮不受影响） */
  return `${head}<details class="ta-unpicked"${list.length <= 30 ? " open" : ""}><summary>${list.length <= 30 ? "名单" : `展开名单（${list.length} 单）`}</summary><div class="ticket-table-wrap"><table class="ticket-table">
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
    /* 浏览器不让写剪贴板：把名单放进文本框、全选，手动复制 */
    const box = $("ticketUnpickedFallback");
    box.value = text;
    box.hidden = false;
    box.focus();
    box.select();
    showToast("自动复制失败，已全选，请手动复制（Ctrl+C / 长按）");
  }
}

/* =============================== 读取 / 保存 =============================== */
let ticketAdminTimer = 0;

async function refreshTicketAdmin() {
  const data = await callWorker({ action: "ticket_admin_get", password: ticketAdminPassword() });
  if (data && data.error === "viewer_closed") {
    /* 查看页被管理员关掉了：清空已显示的数据，停止自动刷新 */
    clearInterval(ticketViewTimer);
    ticketAdmin.orders = [];
    $("ticketAdminStats").innerHTML = "";
    $("ticketAdminTbody").innerHTML = "";
    $("ticketStatsBody").innerHTML = "";
    $("ticketAdminStatus").textContent = "「购票情况」页面已被管理员关闭";
    return false;
  }
  if (!data || !data.ok) {
    $("ticketAdminStatus").textContent = data?.error === "unknown action"
      ? "读取失败：Worker 还是旧版本，请先部署新的 worker.js"
      : "读取失败：请重新登录内部入口后再试（若刚更新了 Worker，确认一下新代码已经部署成功）";
    return false;
  }
  ticketAdmin.status = data.status;
  ticketAdmin.orders = Array.isArray(data.orders) ? data.orders : [];
  ticketAdmin.rounds = Array.isArray(data.rounds) ? data.rounds : [];
  /* 用哪个密码登录的就是哪种身份（旧版 Worker 不回 role 时也不会把只读端当成管理员） */
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
      bad_cooldown: "购票间隔需为 0–1440 之间的整数（分钟）",
      bad_reset: "刷新时间格式不对",
      bad_title: "标题太长了（最多 60 个字）",
      bad_remaining_mode: "余票显示方式不对",
      bad_time: "定时时间格式不对",
      bad_schedule: "定时时间格式不对",
      bad_idle: "停留时间需为 0–1440 之间的整数（分钟）",
      bad_log_hours: "日志间隔需为 1–720 之间的整数（小时）",
      bad_extra: "临时加票的数量不对",
      extra_below_zero: "减得太多了：这一轮的票额不能小于 0",
      bad_points: "刷新点太多了（最多 60 个）",
      bad_point_time: "有刷新点的时间没填或格式不对",
      bad_point_qty: "有刷新点的票额不是 0 以上的整数",
      no_next_refresh: "现在没有下一次刷新（每日刷新关着，也没有自定义刷新点）",
      bad_next_qty: "下一次刷新的票额需为 0 以上的整数",
      bad_guide: "须知内容格式不对",
      guide_too_long: "须知太长了（最多 12000 个字）",
      no_texts_table: "保存失败：数据库里缺 site_texts 表（新版 Worker 会自动建，确认一下新代码已经部署）",
      "unknown action": "Worker 还是旧版本，请先部署新的 worker.js",
    };
    setMsg(msg, TICKET_SET_ERRORS[data?.error] || "保存失败，请重新登录内部入口后再试");
    return false;
  }
  ticketAdmin.status = data.status;
  renderTicketAdmin();
  applyTicketEntryVisibility(ticketEntryVisibleFor(data.status));   // 首页入口跟着「开放 + 非测试 + 不隔离」走
  scheduleTicketEntryCheck({ ok: true, ...data.status });
  if (okMsg) showToast(okMsg);
  return true;
}

/* 只读端操作日志（管理员）：每 x 小时一条，列出这段时间只读端勾了 / 取消了哪几单 */
async function loadTicketLog() {
  const box = $("ticketLogList");
  box.hidden = false;
  box.innerHTML = `<p class="fb-empty">读取中…</p>`;
  const data = await callWorker({ action: "ticket_log_get", password: internalAdminPassword });
  if (!data || !data.ok) {
    box.innerHTML = `<p class="fb-empty">${data?.error === "unknown action" ? "Worker 还是旧版本，请先部署新的 worker.js" : "读取失败，请重新登录内部入口后再试"}</p>`;
    return;
  }
  if (!data.items.length) { box.innerHTML = `<p class="fb-empty">只读端还没有勾选过取票</p>`; return; }
  box.innerHTML = data.items.map((w) => {
    const ops = w.ops.slice().sort((a, b) => a.lastAt - b.lastAt);
    const on = ops.filter((x) => x.picked).length;
    return `<div class="fb-item ta-log-item">
      <div class="fb-head"><span class="venue-date">${escapeHtml(cnMdHm(w.windowStart))} – ${escapeHtml(cnMdHm(w.windowStart + w.hours * 3600 * 1000))}</span>
        <span class="fb-time">${w.hours} 小时 · ${ops.length} 单（现在已取 ${on} 单）</span></div>
      <ul class="ta-log-ops">${ops.map((x) => `<li>${escapeHtml(ticketRoundLabel(x.day))} 第 ${x.seq} 号 → <b>${x.picked ? "已取票" : "取消取票"}</b>`
        + `<small>${escapeHtml(cnMdHm(x.lastAt))}${x.count > 1 ? `（这段时间里操作了 ${x.count} 次，第一次 ${escapeHtml(cnHm(x.firstAt))}）` : ""}</small></li>`).join("")}</ul>
    </div>`;
  }).join("");
}

/* 购票须知编辑：打开编辑框时从 Worker 读正文；没改过 = 默认须知 */
async function loadTicketGuideEditor() {
  if (ticketAdmin.guideLoaded) return;
  const data = await callWorker({ action: "get_ticket_guide" });
  if (!data || !data.ok) {
    setMsg($("ticketGuideMsg"), data?.error === "unknown action" ? "Worker 还是旧版本，请先部署新的 worker.js" : "须知读取失败，刷新后再试");
    return;
  }
  $("ticketGuideInput").value = data.text || TICKET_GUIDE_DEFAULT;
  $("ticketGuideState").textContent = data.text ? "（已修改过）" : "（现在用的是默认须知）";
  ticketAdmin.guideLoaded = true;
  renderTicketGuidePreview();
}

function renderTicketGuidePreview() {
  $("ticketGuidePreview").innerHTML = renderGuideMarkup($("ticketGuideInput").value);
}

async function saveTicketGuide(text) {
  /* 和默认须知一字不差时存成「空」= 用默认，以后默认须知更新了也能跟着变 */
  const value = text.trim() === TICKET_GUIDE_DEFAULT.trim() ? "" : text;
  const ok = await ticketAdminSet({ guide: value }, value ? "购票须知已保存" : "购票须知已恢复默认");
  if (!ok) return;
  $("ticketGuideState").textContent = value ? "（已修改过）" : "（现在用的是默认须知）";
  /* 这个页面里访客那边的须知也换成新的（下次打开时重新读） */
  ticketGuide.loaded = false;
  $("ticketGuideContent").innerHTML = renderGuideMarkup(value || TICKET_GUIDE_DEFAULT);
}

/* =============================== Excel 导出（ExcelJS 按需加载） =============================== */
let excelJsPromise = null;
function loadExcelJs() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  const urls = [
    "https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js",
    "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js",
  ];
  const load = (i) => new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = urls[i];
    s.onload = () => (window.ExcelJS ? resolve(window.ExcelJS) : reject(new Error("no ExcelJS")));
    s.onerror = () => {
      s.remove();
      if (i + 1 < urls.length) load(i + 1).then(resolve, reject);
      else reject(new Error("load failed"));
    };
    document.head.appendChild(s);
  });
  excelJsPromise ??= load(0).catch((e) => { excelJsPromise = null; throw e; });
  return excelJsPromise;
}

const XL_RED = "FFE02020";
const XL_ORANGE = "FFED7D31";
const XL_GREEN = "FF92D050";

/* 留言页的写法：实名 →「名字@服务器：留言」，匿名 →「来自服务器的冒险者：留言」（用第一位还有效、有 id 的持票人） */
function ticketMessageLine(o) {
  const h = ticketActiveHolders(o.holders).find((x) => !x.pending) || o.holders.find((x) => x && !x.pending);
  if (!h) return `某位冒险者：${o.message}`;
  return o.anonymous ? `来自${h.server}的冒险者：${o.message}` : `${h.name}@${h.server}：${o.message}`;
}

/* 三页：
   · 预售票：每一轮一块，从上往下排（轮次标题 + 售出票数，表头，订单），块与块之间空一行；
     只列有效的订单和有效的持票人，「是否取票」按后台勾选填好；
   · 留言：留言栏开着或者有留言时才有；
   · 已作废：整单作废的订单 + 部分作废的持票人（清空前的备份也靠它把作废记录留下来） */
async function buildTicketWorkbook(allOrders) {
  const ExcelJS = await loadExcelJs();
  const wb = new ExcelJS.Workbook();
  const center = { horizontal: "center", vertical: "middle" };
  const live = allOrders.filter((o) => !o.voided);
  const dup = computeTicketDuplicates(allOrders);
  const rounds = ticketRoundList().filter((r) => live.some((o) => o.day === r.key));

  const ID_COLS = Math.max(5, ...live.map((o) => ticketActiveHolders(o.holders).length));
  const COLS = ID_COLS + 4;   // 联系方式 / 序号 / 购票数量 / 购票id（1…N） / 是否取票
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
      title.value = ticketRoundLabel(rd.key, true);   // 例如「2026年9月29日 12:00 场」
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
    r++;   // 块与块之间空一行
  });
  if (!rounds.length) ws.getCell(1, 1).value = "还没有有效订单";

  ws.getColumn(1).width = 16;
  ws.getColumn(2).width = 6;
  ws.getColumn(3).width = 9;
  for (let i = 4; i < 4 + ID_COLS; i++) ws.getColumn(i).width = 22;
  ws.getColumn(COLS).width = 10;
  /* 图例放在右侧 */
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

  /* 留言 */
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

  /* 已作废 */
  const vw = wb.addWorksheet("已作废");
  vw.addRow(["轮次", "序号", "联系方式", "作废范围", "作废的持票人", "留言", "登记时间（国服）"]);
  vw.getRow(1).font = { bold: true };
  const cnFull = (ms) => new Date(ms).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
  allOrders.forEach((o) => {
    if (o.voided) {
      vw.addRow([ticketRoundLabel(o.day, true), o.seq, o.contact, `整单（${o.qty} 张）`,
        ticketActiveHolders(o.holders).map(formatHolder).join("、"), o.message || "", cnFull(o.createdAt)]);
    }
    const pv = o.holders.filter((h) => h && h.voided);
    if (pv.length) {
      vw.addRow([ticketRoundLabel(o.day, true), o.seq, o.contact, `部分（${pv.length} 张）${o.voided ? "，后来整单作废" : ""}`,
        pv.map(formatHolder).join("、"), o.message || "", cnFull(o.createdAt)]);
    }
  });
  [20, 6, 16, 18, 40, 40, 20].forEach((w, i) => { vw.getColumn(i + 1).width = w; });

  return wb;
}

async function exportTicketExcel(suffix = "") {
  const wb = await buildTicketWorkbook(ticketAdmin.orders);
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const stamp = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `花街购票信息${ticketAdmin.status?.testMode ? "（测试）" : ""}${suffix}_${stamp}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
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

/* =============================== 事件绑定 =============================== */
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

  /* 子标签 */
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
    if (title.length > 60) { setMsg(msgEl(), "标题太长了（最多 60 个字）"); return; }
    $("ticketTitleInput").blur();
    ticketAdminSet({ title }, title ? "购票页标题已保存" : "已恢复默认标题");
  };
  $("ticketTitleSaveBtn").addEventListener("click", saveTitle);
  onEnter("ticketTitleInput", saveTitle);
  $("ticketTestBtn").addEventListener("click", () => {
    const next = !ticketAdmin.status?.testMode;
    ticketAdminSet({ testMode: next }, next ? "标题已加上「（测试）」" : "标题已去掉「（测试）」");
  });
  const savePerPerson = () => {
    const n = intInput("ticketPerPersonInput", 1, 20, "单人限购需为 1–20 之间的整数");
    if (n !== null) ticketAdminSet({ perPerson: n }, `单人限购已设为 ${n} 张`);
  };
  $("ticketPerPersonSaveBtn").addEventListener("click", savePerPerson);
  onEnter("ticketPerPersonInput", savePerPerson);
  const saveCooldown = () => {
    const n = intInput("ticketCooldownInput", 0, 1440, "购票间隔需为 0–1440 之间的整数（分钟）");
    if (n !== null) ticketAdminSet({ cooldownMin: n }, n ? `再次购票间隔已设为 ${n} 分钟` : "已取消再次购票间隔");
  };
  $("ticketCooldownSaveBtn").addEventListener("click", saveCooldown);
  onEnter("ticketCooldownInput", saveCooldown);
  /* 定时开关：两个框都可以只填一个；留空表示不安排这个方向 */
  $("ticketSchedSaveBtn").addEventListener("click", () => {
    const openAt = cnLocalToEpoch($("ticketOpenAtInput").value);
    const closeAt = cnLocalToEpoch($("ticketCloseAtInput").value);
    if ($("ticketOpenAtInput").value && !openAt) { setMsg(msgEl(), "开启时间格式不对"); return; }
    if ($("ticketCloseAtInput").value && !closeAt) { setMsg(msgEl(), "关闭时间格式不对"); return; }
    if (!openAt && !closeAt) { setMsg(msgEl(), "至少填一个时间，或点「清除」取消定时"); return; }
    const now = Date.now();
    const past = [openAt && openAt <= now ? "开启" : "", closeAt && closeAt <= now ? "关闭" : ""].filter(Boolean);
    if (past.length && !confirm(`定时${past.join("和")}的时间已经过去了，保存后会立刻生效。确定吗？`)) return;
    const parts = [];
    if (openAt) parts.push(`${formatCnTime(openAt)} 开启`);
    if (closeAt) parts.push(`${formatCnTime(closeAt)} 关闭`);
    ticketAdminSet({ openAt, closeAt }, `已设定：${parts.join("，")}（国服时间）`);
  });
  $("ticketSchedClearBtn").addEventListener("click", () => {
    $("ticketOpenAtInput").value = "";
    $("ticketCloseAtInput").value = "";
    ticketAdminSet({ openAt: 0, closeAt: 0 }, "已清除定时开关");
  });

  /* ---- 票额与刷新 ---- */
  const extra = (sign) => {
    const n = intInput("ticketExtraInput", 1, 100000, "临时加票请填 1 以上的整数");
    if (n === null) return;
    const cur = ticketAdmin.status?.round;
    if (sign < 0 && cur && cur.quota - n < 0) { setMsg(msgEl(), `这一轮现在只有 ${cur.quota} 张票额，减不了 ${n} 张`); return; }
    ticketAdminSet({ extraDelta: sign * n }, `当前这一轮${sign > 0 ? "加" : "减"}了 ${n} 张票额`).then((ok) => { if (ok) $("ticketExtraInput").value = ""; });
  };
  $("ticketExtraAddBtn").addEventListener("click", () => extra(1));
  $("ticketExtraSubBtn").addEventListener("click", () => extra(-1));
  $("ticketExtraClearBtn").addEventListener("click", () => {
    if (!confirm("把当前这一轮的临时加票清零（恢复成这一轮开始时的票额）吗？")) return;
    ticketAdminSet({ extraSet: 0 }, "临时加票已清零");
  });
  $("ticketDailyBtn").addEventListener("click", () => {
    const next = ticketAdmin.status?.dailyOn === false;
    if (!next && !confirm("关闭每日刷新吗？\n\n关闭后只在下面的「自定义刷新点」刷新票额；没有自定义刷新点时票额一直不重置。\n当前这一轮不受影响。")) return;
    ticketAdminSet({ dailyOn: next }, next ? "已打开每日刷新" : "已关闭每日刷新");
  });
  const saveReset = () => {
    const m = hhmmToMinutes($("ticketResetInput").value);
    if (m === null) { setMsg(msgEl(), "请填写刷新时间（时:分）"); return; }
    if (m !== (ticketAdmin.status?.resetMin || 0) && !confirm(
      `确定把每日票额刷新时间改为 ${minutesToHHMM(m)}（国服时间）吗？\n\n`
      + "当前这一轮不受影响，从下一次到 " + minutesToHHMM(m) + " 起按新时间刷新。")) return;
    $("ticketResetInput").blur();
    ticketAdminSet({ resetMin: m }, `每日票额将在 ${minutesToHHMM(m)} 刷新（国服时间）`);
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

  /* 自定义刷新点：先在列表里改，点「保存刷新点」一起存 */
  const pointsList = $("ticketPointsList");
  pointsList.addEventListener("input", () => { ticketAdmin.pointsDirty = true; });
  pointsList.addEventListener("click", (e) => {
    const del = e.target.closest("[data-point-del]");
    if (!del) return;
    del.closest("[data-point]").remove();
    ticketAdmin.pointsDirty = true;
    if (!pointsList.querySelector("[data-point]")) pointsList.innerHTML = `<p class="ta-empty" data-points-empty>还没有自定义刷新点（记得点「保存刷新点」）</p>`;
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
      if (!at) { setMsg(msgEl(), `第 ${i + 1} 个刷新点没填时间`); return; }
      if (qtyRaw === "" || !Number.isInteger(qty) || qty < 0) { setMsg(msgEl(), `第 ${i + 1} 个刷新点的票额要填 0 以上的整数`); return; }
      points.push({ at, qty });
    }
    const minutes = points.map((p) => Math.floor(p.at / 60000));
    if (new Set(minutes).size !== minutes.length) { setMsg(msgEl(), "有两个刷新点是同一分钟，删掉一个再保存"); return; }
    const past = points.filter((p) => p.at <= Date.now());
    if (past.length && !confirm(`有 ${past.length} 个刷新点的时间已经过去了（${past.map((p) => formatCnTime(p.at)).join("、")}）。\n\n`
      + "保存后会立刻以其中最晚的那个开始新的一轮（这一轮没卖完的票不结转）。确定吗？")) return;
    ticketAdmin.pointsDirty = false;
    const ok = await ticketAdminSet({ points }, points.length ? `已保存 ${points.length} 个刷新点` : "已清空自定义刷新点");
    if (!ok) ticketAdmin.pointsDirty = true;
  });
  $("ticketPointResetBtn").addEventListener("click", () => {
    ticketAdmin.pointsDirty = false;
    renderTicketAdmin();
  });

  /* 下一次刷新的票额 */
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
    ticketAdminSet({ viewerEnabled: next }, next
      ? "「购票情况」查看页已开放"
      : "「购票情况」查看页已关闭，查看密码暂时进不去（已经打开的页面下次刷新时也会被挡住）");
  });
  /* 新增的开关（data-ta-flag）：点一下切换，提示文字写在按钮的 data-toast-on / data-toast-off 上 */
  document.querySelectorAll("#ticketAdminPanel [data-ta-flag]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const flag = btn.dataset.taFlag;
      const next = !ticketAdmin.status?.[flag];
      if (btn.dataset.confirmOn && next && !confirm(btn.dataset.confirmOn)) return;
      ticketAdminSet({ [flag]: next }, next ? btn.dataset.toastOn : btn.dataset.toastOff);
    });
  });
  const saveIdle = () => {
    const n = intInput("ticketIdleInput", 0, 1440, "停留时间需为 0–1440 之间的整数（分钟），0 = 不限制");
    if (n !== null) ticketAdminSet({ idleMin: n }, n ? `购票页停留超过 ${n} 分钟将跳回首页` : "已取消购票页停留时间限制");
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
    if (!ticketAdmin.guideLoaded) { setMsg($("ticketGuideMsg"), "须知还没读出来，稍等一下再保存"); return; }
    setMsg($("ticketGuideMsg"), "");
    await saveTicketGuide($("ticketGuideInput").value);
  }));
  $("ticketGuideResetBtn").addEventListener("click", (e) => withAdminBusy(e.currentTarget, async () => {
    if (!confirm("把购票须知恢复成默认内容吗？现在编辑框里的内容会被替换掉。")) return;
    $("ticketGuideInput").value = TICKET_GUIDE_DEFAULT;
    renderTicketGuidePreview();
    ticketAdmin.guideLoaded = true;
    await saveTicketGuide(TICKET_GUIDE_DEFAULT);
  }));

  /* ---- 只读端 ---- */
  const saveLogHours = () => {
    const n = intInput("ticketLogHoursInput", 1, 720, "日志间隔需为 1–720 之间的整数（小时）");
    if (n !== null) ticketAdminSet({ viewerLogHours: n }, `只读端操作日志改为每 ${n} 小时合并一条`);
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
    if (toVoid && !confirm(`确定作废第 ${order.seq} 号（${order.qty} 张）吗？\n\n作废后该单不会导出到「预售票」页，票额会放回这一轮。之后可以再恢复。`)) return;
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
    if (!confirm(`确定要清空全部购票数据吗？（共 ${n} 单${voidedN ? `，含 ${voidedN} 单已作废` : ""}）\n\n`
      + "清空前会先自动下载一份 Excel 备份（预售票 / 留言 / 已作废三页都在），"
      + "只读端操作日志和以前各轮的记录也会一起清掉，清空后无法恢复。")) return;
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
      setMsg(msg, "清空失败，请重新登录内部入口后再试");
      return;
    }
    await refreshTicketAdmin();
    showToast(n ? "已备份并清空购票数据" : "购票数据已清空");
  }));

  /* 管理员开着「购票管理」面板时每分钟自动刷新一次（只读端的勾选能同步过来）。
     正在编辑订单、改刷新点、或者在「购票管理」子标签里时不刷新，免得打断输入 */
  clearInterval(ticketAdminTimer);
  ticketAdminTimer = setInterval(() => {
    if (document.hidden || isTicketViewer() || !internalAdminPassword) return;
    const panel = $("ticketAdminPanel");
    if (panel.hidden || $("adminModalOverlay").hidden || ticketAdmin.edit || ticketAdmin.tab === "settings") return;
    refreshTicketAdmin();
  }, 60 * 1000);
}

/* ---- 7b. 管理员：反馈建议箱 ---- */
/* 管理员：反馈建议箱 ---------------------------------------------------------------- */
const feedbackAdmin = { items: [], loaded: false };

function renderFeedbackAdmin() {
  const cat = $("feedbackFilterCat").value;
  const state = $("feedbackFilterState").value;
  const items = feedbackAdmin.items;
  const openN = items.filter((i) => !i.handled).length;
  $("feedbackAdminStatus").textContent = items.length
    ? `共 ${items.length} 条，未处理 ${openN} 条`
    : "还没有收到反馈";
  const badge = $("feedbackPillBadge");
  badge.hidden = !openN;
  badge.textContent = openN > 99 ? "99+" : String(openN);

  const list = items.filter((i) => (!cat || i.category === cat)
    && (!state || (state === "done" ? i.handled : !i.handled)));
  $("feedbackAdminList").innerHTML = list.length ? list.map((i) => {
    const time = new Date(i.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
    return `<div class="fb-item${i.handled ? " is-done" : ""}" data-fb-id="${i.id}">
      <div class="fb-head">
        <span class="fb-cat fb-cat-${escapeHtml(i.category)}">${escapeHtml(FEEDBACK_CATEGORIES[i.category] || i.category)}</span>
        <span class="fb-time">${escapeHtml(time)}（国服）</span>
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
  }).join("") : `<p class="fb-empty">${items.length ? "没有符合筛选条件的反馈" : "反馈箱还是空的"}</p>`;
}

async function refreshFeedbackAdmin() {
  const data = await callWorker({ action: "feedback_admin_list", password: internalAdminPassword });
  if (!data || !data.ok) {
    $("feedbackAdminStatus").textContent = data?.error === "no_table"
      ? "读取失败：先在 D1 里执行 feedback-and-ticket-settings.sql 建 feedback 表"
      : data?.error === "unknown action"
        ? "读取失败：Worker 还是旧版本，请部署新的 worker.js"
        : "读取失败，请重新登录内部入口后再试";
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
    if (!data || !data.ok) { setMsg(msg, "操作失败，请重新登录内部入口后再试"); return; }
    if (act === "mark") item.handled = !!data.handled;
    else feedbackAdmin.items = feedbackAdmin.items.filter((i) => i.id !== id);
    renderFeedbackAdmin();
    showToast(act === "mark" ? (item.handled ? "已标记为已处理" : "已标记为未处理") : "已删除");
  });
}

/* ---- 7c. 管理员：场地预约（场地使用登记，原金数据问卷） ----
   列表：访客在 #venue 提交的登记 + 金数据导入的历史登记（Worker 建表时自动导入）。
   新增 / 修改用的是和访客页同一套表单（venue.js 的 buildVenueForm，admin 模式），
   后台录入不限日期、角色id与联系方式至少填一项，另外可以改「提交时间」和写「管理备注」。
   作废不删除：作废后默认筛选里看不到，切到「已作废」可以恢复。 */
const venueAdmin = { items: [], today: "", editingId: null, loaded: false };

const VENUE_SOURCE_TEXT = { web: "网站登记", admin: "后台录入", import: "金数据导入" };

function venueAdminFiltered() {
  const state = $("venueFilterState").value;
  const time = $("venueFilterTime").value;
  const today = venueAdmin.today || venueCnDate(0);
  const list = venueAdmin.items.filter((i) =>
    (!state || (state === "void" ? i.voided : !i.voided))
    && (!time || (time === "upcoming" ? i.date >= today : i.date < today)));
  /* 「今天及以后」按日期从近到远；其余按日期从新到旧 */
  list.sort((a, b) => (time === "upcoming"
    ? a.date.localeCompare(b.date) || a.id - b.id
    : b.date.localeCompare(a.date) || b.id - a.id));
  return list;
}

function renderVenueAdmin() {
  const items = venueAdmin.items;
  const today = venueAdmin.today || venueCnDate(0);
  const live = items.filter((i) => !i.voided);
  const upcoming = live.filter((i) => i.date >= today).length;
  const voided = items.length - live.length;
  $("venueAdminStatus").textContent = items.length
    ? `共 ${items.length} 条：有效 ${live.length} 条（今天及以后 ${upcoming} 条）${voided ? `，已作废 ${voided} 条` : ""}`
    : "还没有场地登记";

  const list = venueAdminFiltered();
  const fmt = (ms) => new Date(ms).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
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
      <p class="fb-contact">提交于 ${escapeHtml(fmt(i.createdAt))}（国服）${i.updatedAt ? ` · 最后修改 ${escapeHtml(fmt(i.updatedAt))}` : ""}</p>
      <div class="fb-actions">
        ${i.contact ? `<button type="button" class="tt-act is-copy" data-venue-act="copy">复制联系方式</button>` : ""}
        <button type="button" class="tt-act" data-venue-act="edit">修改</button>
        ${i.voided
          ? `<button type="button" class="tt-act is-restore" data-venue-act="restore">恢复</button>`
          : `<button type="button" class="tt-act is-void" data-venue-act="void">作废</button>`}
      </div>
    </div>`;
  }).join("") : `<p class="fb-empty">${items.length ? "没有符合筛选条件的登记" : "还没有场地登记"}</p>`;
}

async function refreshVenueAdmin() {
  const data = await callWorker({ action: "venue_admin_list", password: internalAdminPassword });
  if (!data || !data.ok) {
    $("venueAdminStatus").textContent = data?.error === "unknown action"
      ? "读取失败：Worker 还是旧版本，请部署新的 worker.js"
      : data?.error === "db_error"
        ? "读取失败：数据库出错，稍后再试"
        : "读取失败，请重新登录内部入口后再试";
    return false;
  }
  venueAdmin.items = data.items;
  venueAdmin.today = data.today || venueCnDate(0);
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
    setMsg(msg, !data ? "连接失败，检查一下网络后再试"
      : VENUE_ERRORS[data.error] || "保存失败，请重新登录内部入口后再试");
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
      setMsg(msg, "这条登记的状态已经变过了，已为你刷新");
      await refreshVenueAdmin();
      return;
    }
    setMsg(msg, "操作失败，请重新登录内部入口后再试");
    return;
  }
  const at = venueAdmin.items.findIndex((i) => i.id === data.item.id);
  if (at >= 0) venueAdmin.items[at] = data.item;
  renderVenueAdmin();
  showToast(voided ? `登记 #${item.id} 已作废（切到「已作废」可以恢复）` : `登记 #${item.id} 已恢复`);
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
        && !confirm(`正在修改 #${venueAdmin.editingId}，还没保存。放弃那边的修改、改为修改 #${id} 吗？`)) return;
      openVenueEditor(item);
      return;
    }
    if (act === "void" && !confirm(`确定作废登记 #${id}（${venueDateLabel(item.date)} · ${item.charId || item.contact}）吗？\n\n作废后不会删除，切到「已作废」还能恢复。`)) return;
    btn.disabled = true;
    try { await venueAdminVoid(item, act === "void"); } finally { btn.disabled = false; }
  });
}

/* ---- 7d. 管理员：活动问卷 ----
   访客在最新活动「反馈与建议」里填的问卷（题目定义、文字对照在 survey.js）。
   · 统计汇总：只算有效答卷（作废的不算）；每道打分题给平均分和 1～10 分分布，文字题可以展开看全部内容
   · 逐份查看：按有效 / 已作废 / 全部筛选；每份可以作废 / 恢复、复制联系方式。没有删除
   · 「第 n 份」= 有效答卷按提交先后的序号（要按提交顺序抽奖之类时用）；#编号 是数据库里的编号，作废也不变
   · 导出 Excel：答卷明细、统计、文字意见三张表，只含有效答卷 */
const surveyAdmin = { items: [], open: true, lockdown: false, loaded: false, readonly: false };

const surveyAdminValid = () => surveyAdmin.items.filter((i) => !i.voided);
const surveyAdminTime = (ms) => new Date(ms).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false,
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

function surveyAdminSeqMap() {
  const m = new Map();
  surveyAdminValid().forEach((it, i) => m.set(it.id, i + 1));
  return m;
}

/* 统计：字段 key → { n, counts / sum / dist / texts } */
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
    box.innerHTML = `<p class="fb-empty">${surveyAdmin.items.length ? "有效答卷为 0（都被作废了）" : "还没有人填写问卷"}</p>`;
    return;
  }
  const st = surveyAdminStats(valid);
  const seq = surveyAdminSeqMap();

  /* 评分一览：所有打分题的平均分，一眼看完（总评在前，各游玩项目在后） */
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
        const other = it.other ? surveyTextsHtml("「其他」补充说明", st[it.other.key].texts, seq) : "";
        return `<div class="sv-stat"><p class="sv-stat-title">${escapeHtml(it.label)}</p>`
          + `<p class="sv-stat-meta">${s.n} 人作答${it.multi ? "（多选，百分比按作答人数算）" : ""}</p>`
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
          + `<p class="sv-stat-meta">${s.n ? `${s.n} 人打分 · 平均 <b>${surveyAvg(s)}</b> 分` : "还没有人打分"}</p>`
          + (s.n ? `<div class="sv-hist" aria-label="1～10 分各有多少人">${hist}</div>` : "") + note + `</div>`;
      }
      return `<div class="sv-stat"><p class="sv-stat-title">${escapeHtml(it.label)}</p>`
        + `<p class="sv-stat-meta">${s.n ? `${s.n} 条` : "还没有人填写"}</p>`
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
    .slice().sort((a, b) => b.id - a.id);   // 新的在上面
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
        <span class="fb-time">#${i.id} · ${escapeHtml(surveyAdminTime(i.createdAt))}（国服）</span>
      </div>
      <dl class="venue-kv">${rows}</dl>
      <div class="fb-actions">
        ${a.contact ? `<button type="button" class="tt-act is-copy" data-sv-act="copy">复制联系方式</button>` : ""}
        ${surveyAdmin.readonly ? "" : i.voided
          ? `<button type="button" class="tt-act is-restore" data-sv-act="restore">恢复</button>`
          : `<button type="button" class="tt-act is-void" data-sv-act="void">作废</button>`}
      </div>
    </div>`;
  }).join("") : `<p class="fb-empty">${surveyAdmin.items.length ? "没有符合筛选条件的答卷" : "还没有人填写问卷"}</p>`;
}

function renderSurveyAdmin() {
  const items = surveyAdmin.items;
  const valid = surveyAdminValid().length;
  const voided = items.length - valid;
  $("surveyAdminStatus").textContent = items.length
    ? `共 ${items.length} 份：有效 ${valid} 份${voided ? `，已作废 ${voided} 份` : ""}`
    : "还没有人填写问卷";
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
  /* 只读端用查看密码读（管理员在购票管理里打开了「只读端显示活动问卷」才放行） */
  const data = await callWorker({ action: "survey_admin_list", password: internalAdminPassword || internalViewPassword, survey: SURVEY.id });
  if (!data || !data.ok) {
    $("surveyAdminStatus").textContent = data?.error === "unknown action"
      ? "读取失败：Worker 还是旧版本，请部署新的 worker.js"
      : data?.error === "db_error"
        ? "读取失败：数据库出错，稍后再试"
        : data?.error === "bad_survey"
          ? `读取失败：Worker 里没有「${SURVEY.id}」这份问卷，检查 worker.js 的 SURVEYS`
          : data?.error === "viewer_closed"
            ? "管理员没有开放「活动问卷」给只读端查看"
            : "读取失败，请重新登录内部入口后再试";
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

/* Excel：答卷明细 / 统计 / 文字意见（只含有效答卷） */
async function exportSurveyExcel() {
  const ExcelJS = await loadExcelJs();
  const wb = new ExcelJS.Workbook();
  const valid = surveyAdminValid();
  const bold = { bold: true };

  const ws = wb.addWorksheet("答卷");
  ws.addRow(["第几份", "编号", "提交时间（国服）", ...SURVEY_FIELDS.map((f) => surveyFieldHeader(f.key))]);
  ws.getRow(1).font = bold;
  valid.forEach((it, i) => {
    const a = it.answers || {};
    ws.addRow([i + 1, it.id, surveyAdminTime(it.createdAt), ...SURVEY_FIELDS.map((f) => {
      const v = a[f.key];
      if (f.type === "score") return typeof v === "number" ? v : null;
      return surveyAnswerText(f.key, v) || null;
    })]);
  });
  ws.getColumn(1).width = 7;
  ws.getColumn(2).width = 7;
  ws.getColumn(3).width = 18;
  SURVEY_FIELDS.forEach((f, i) => { ws.getColumn(i + 4).width = f.type === "score" ? 12 : f.type === "text" ? 30 : 24; });
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

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const stamp = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `花街活动问卷_${SURVEY.id}_${stamp}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 10000);
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
    setMsg(msg, "操作失败，请重新登录内部入口后再试");
    return;
  }
  const at = surveyAdmin.items.findIndex((i) => i.id === data.item.id);
  if (at >= 0) surveyAdmin.items[at] = data.item;
  renderSurveyAdmin();
  showToast(voided ? `答卷 #${item.id} 已作废（切到「已作废」可以恢复）` : `答卷 #${item.id} 已恢复`);
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
        setMsg($("surveyAdminMsg"), data?.error === "unknown action" ? "切换失败：Worker 还是旧版本，请部署新的 worker.js" : "切换失败，请重新登录内部入口后再试");
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
      if (!surveyAdminValid().length) { setMsg(msg, "还没有有效答卷，没有可导出的内容"); return; }
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
    copyText(url, "问卷链接已复制，可以直接发群里", url);
  });
  $("surveyAdminList").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-sv-act]");
    if (!btn) return;
    const id = Number(btn.closest("[data-sv-id]").dataset.svId);
    const item = surveyAdmin.items.find((i) => i.id === id);
    if (!item) return;
    const act = btn.dataset.svAct;
    if (act === "copy") { copyText(item.answers.contact, "联系方式已复制", item.answers.contact); return; }
    if (act === "void" && !confirm(`确定作废答卷 #${id} 吗？\n\n作废后不进统计和导出，但不会删除，切到「已作废」还能恢复。`)) return;
    btn.disabled = true;
    try { await surveyAdminVoid(item, act === "void"); } finally { btn.disabled = false; }
  });
}

/* ---- 首页弹窗公告 ----------------------------------------------------------------
   Worker：popup_admin_get / popup_admin_save / popup_admin_set；配图复用 upload_announcement_image。
   开关按钮只管开 / 关；「保存」只存内容（不动开关）。有没保存的修改时点「开启」，会先问要不要一起保存。 */
const POPUP_IMAGE_MAX_BYTES = 50 * 1024 * 1024;   // 选图上限 50MB（上传前会压缩）
const POPUP_IMAGE_MAX_DIM = 2560;
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

function showPopupImagePreview(url) {
  $("popupImagePreviewImg").src = url ? workerImageUrl(url) : "";
  $("popupImagePreview").hidden = !url;
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
  const when = p.updated_at ? `（内容最后修改：${new Date(p.updated_at).toLocaleString("zh-CN", { hour12: false })}）` : "";
  $("popupAdminStatus").textContent = p.enabled
    ? `当前状态：已开启，访客打开首页会弹出${when}`
    : `当前状态：已关闭${when}`;
  btn.textContent = p.enabled ? "关闭弹窗" : "开启弹窗";
  btn.disabled = false;
}

function fillPopupAdminForm(p) {
  $("popupTitleInput").value = p.title || "";
  $("popupBodyInput").value = p.body || "";
  popupAdmin.imageUrl = p.image_url || null;
  showPopupImagePreview(popupAdmin.imageUrl);
  updatePopupBodyCount();
}

async function refreshPopupAdmin() {
  $("popupAdminStatus").textContent = "当前状态：读取中…";
  $("popupToggleBtn").disabled = true;
  setMsg($("popupAdminMsg"), "");
  const data = await callWorker({ action: "popup_admin_get", password: internalAdminPassword });
  if (!data || !data.ok) {
    popupAdmin.saved = null;
    renderPopupAdminStatus();
    setMsg($("popupAdminMsg"), data && data.ok === false && !data.error
      ? "登录状态失效了，重新登录内部入口后再试"
      : "读取失败（Worker 可能还没更新到 2026-09-27a 版），刷新后再试");
    return;
  }
  /* 第一次打开，或者表单没有改过：用服务器上的内容填表；改了一半关掉再打开，保留正在改的内容 */
  const keepEdits = popupAdmin.loaded && popupFormDirty();
  popupAdmin.saved = data.popup;
  popupAdmin.loaded = true;
  if (!keepEdits) fillPopupAdminForm(data.popup);
  renderPopupAdminStatus();
  if (keepEdits) setMsg($("popupAdminMsg"), "有还没保存的修改");
}

function popupErrorText(error) {
  return ({
    empty: "标题、正文、配图至少要有一样",
    title_too_long: "标题太长了（最多 60 字）",
    body_too_long: "正文太长了（最多 3000 字）",
    bad_image_url: "配图地址不对，重新上传一次图片",
    rate_limited: "操作太频繁，歇一会儿再试",
  })[error] || "保存失败，请重试";
}

async function savePopupAdmin(extra = {}) {
  const v = popupFormValue();
  if (!v.title && !v.body && !v.image_url) {
    setMsg($("popupAdminMsg"), popupErrorText("empty"));
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
    setMsg($("popupAdminMsg"), !data ? "连接失败，检查一下网络后再试"
      : (!data.error ? "登录状态失效了，重新登录内部入口后再试" : popupErrorText(data.error)));
    return false;
  }
  popupAdmin.saved = data.popup;
  fillPopupAdminForm(data.popup);
  renderPopupAdminStatus();
  setMsg($("popupAdminMsg"), "");
  return true;
}

/* 压成 WebP：长边不超过 POPUP_IMAGE_MAX_DIM。
   用 objectURL 解码（比把几十 MB 的原图读成 base64 省内存）；压完还太大就降质量 / 降尺寸再压一次 */
async function compressPopupImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode fail"));
      el.src = url;
    });
    const attempts = [[POPUP_IMAGE_MAX_DIM, 0.9], [POPUP_IMAGE_MAX_DIM, 0.8], [2000, 0.8], [1600, 0.75]];
    for (const [maxDim, quality] of attempts) {
      const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
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

function initPopupAdmin() {
  const input = $("popupImageInput");
  const pickBtn = $("popupImagePickBtn");
  const status = $("popupImageStatus");

  $("popupBodyInput").addEventListener("input", updatePopupBodyCount);
  pickBtn.addEventListener("click", () => input.click());
  $("popupImageRemoveBtn").addEventListener("click", () => {
    popupAdmin.imageUrl = null;
    showPopupImagePreview(null);
  });

  input.addEventListener("change", async () => {
    const file = input.files && input.files[0];
    input.value = "";
    if (!file) return;
    if (!/^image\//.test(file.type)) { setMsg(status, "只能选图片"); return; }
    if (file.size > POPUP_IMAGE_MAX_BYTES) {
      setMsg(status, `图片太大了（${(file.size / 1024 / 1024).toFixed(1)}MB），限 50MB`);
      return;
    }
    setMsg(status, "图片处理中…");
    pickBtn.disabled = true;
    try {
      const { base64, contentType } = await compressPopupImage(file);
      setMsg(status, "上传中…");
      const data = await callWorker({
        action: "upload_announcement_image",
        password: internalAdminPassword,
        image: base64,
        content_type: contentType,
      });
      if (!data || !data.ok) throw new Error((data && data.error) || "upload failed");
      popupAdmin.imageUrl = new URL(`image/${data.key}`, workerBase()).href;
      showPopupImagePreview(popupAdmin.imageUrl);
      setMsg(status, "已上传，记得点「保存」");
    } catch (e) {
      setMsg(status, e.message === "decode fail" ? "这张图浏览器打不开，换一张试试（或先转成 JPG / PNG）"
        : e.message === "rate_limited" ? "上传太频繁了（每小时 10 张），歇一会儿再试"
        : "图片上传失败，请重试");
    }
    pickBtn.disabled = false;
  });

  $("popupSaveBtn").addEventListener("click", () => withAdminBusy($("popupSaveBtn"), async () => {
    if (await savePopupAdmin()) {
      showToast(popupAdmin.saved.enabled ? "已保存，访客打开首页会看到新内容" : "已保存（弹窗目前是关着的）");
    }
  }));

  $("popupPreviewBtn").addEventListener("click", () => {
    const v = popupFormValue();
    if (!v.title && !v.body && !v.image_url) { setMsg($("popupAdminMsg"), "先写点内容再预览"); return; }
    openSitePopup(v, true);
  });

  $("popupToggleBtn").addEventListener("click", () => withAdminBusy($("popupToggleBtn"), async () => {
    const saved = popupAdmin.saved;
    if (!saved) return;
    const turnOn = !saved.enabled;
    setMsg($("popupAdminMsg"), "");
    if (turnOn && popupFormDirty()) {
      if (!confirm("有还没保存的修改，保存并开启弹窗吗？\n\n（点「取消」什么都不做）")) return;
      if (await savePopupAdmin({ enabled: true })) showToast("已保存并开启弹窗");
      return;
    }
    const data = await callWorker({ action: "popup_admin_set", password: internalAdminPassword, enabled: turnOn });
    if (!data || !data.ok) {
      setMsg($("popupAdminMsg"), data && data.error === "empty" ? "还没有内容，先写好并保存再开启"
        : !data ? "连接失败，检查一下网络后再试" : "切换失败，请重新登录内部入口后再试");
      return;
    }
    popupAdmin.saved = data.popup;
    renderPopupAdminStatus();
    showToast(turnOn ? "弹窗公告已开启" : "弹窗公告已关闭");
  }));
}

/* ---- 初始化（本文件加载完立即执行） ---- */
initInternal();
initAdminPanels();
initLockdownToggle();
initCaptchaSwitch();
initStarlightPanel();
initTicketAdmin();
initViewerPills();
initFeedbackAdmin();
if (typeof buildVenueForm === "function") initVenueAdmin();
else console.error("[场地预约] venue.js 没有加载成功，管理页的「场地预约」不可用");
if (window.HJ_SURVEY_READY) initSurveyAdmin();
else console.error("[活动问卷] survey.js 没有加载成功，管理页的「活动问卷」不可用");
initPostAnnouncement();
initAnnouncementImageUpload();
initPopupAdmin();
window.HJ_ADMIN_READY = true;
