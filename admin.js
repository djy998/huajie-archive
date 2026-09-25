/* =============================================================================
   花舞之街 · 薰风花语町 —— 管理页 admin.js
   -----------------------------------------------------------------------------
   从 index.html 拆出来的独立脚本。普通访客用不到，所以不在页面里直接引用：
   进入 #internal 时由主脚本的 openInternalView() → loadAdminJs() 按需加载，
   加载完在文件末尾自己完成初始化，并设置 window.HJ_ADMIN_READY = true。
   内容：内部入口（密码 / 公告板 / 公告配图）、分享功能开关、机器人验证开关、星芒节面板、
         「查看购票情况」只读页（查看密码登录，只能看和导出 Excel，不能改任何东西）、
         购票管理（订单表、作废 / 恢复、定时开关、Excel 导出、清空）、反馈建议箱、
         场地预约（场地使用登记的列表 / 新增 / 修改 / 作废，表单与文字对照在 venue.js）。
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
  /* 查看密码：只进「购票情况」只读页，不显示公告板 */
  if (data.isViewer) {
    enterTicketViewer(input.value);
    return;
  }
  $("internalBoard").hidden = false;
  renderAnnouncements(data.items, data.isAdmin);

  // 管理面板都收进弹窗里，通过上方的胶囊按钮打开
  $("adminPills").hidden = !data.isAdmin;
  if (data.isAdmin) internalAdminPassword = input.value;
}

/* 查看购票情况（只读）-------------------------------------------------------------
   直接借用「购票管理」面板，加 is-readonly 后由 CSS 藏掉所有设置项、作废按钮和清空按钮，
   只留统计、订单表、刷新、导出 Excel。Worker 端对查看密码同样只放行 ticket_admin_get，
   写操作（设置 / 作废 / 清空）一律拒绝，前端被改也改不了数据。
   页面开着时每分钟自动刷新一次（切到后台时不刷）。 */
let internalViewPassword = null;
let ticketViewTimer = 0;

function enterTicketViewer(password) {
  internalViewPassword = password;
  const panel = $("ticketAdminPanel");
  panel.classList.add("is-readonly");
  panel.querySelector("h2").textContent = "购票情况";
  $("ticketViewHost").appendChild(panel);
  panel.hidden = false;
  $("ticketViewBoard").hidden = false;
  refreshTicketAdmin();
  clearInterval(ticketViewTimer);
  ticketViewTimer = setInterval(() => {
    if (!document.hidden && !$("view-internal").hidden && !$("ticketViewBoard").hidden) refreshTicketAdmin();
  }, 60 * 1000);
}

/* 管理功能弹窗：把面板节点搬进弹窗，打开时刷新它自己的数据 */
const ADMIN_PANEL_REFRESH = {
  lockdownPanel: () => refreshLockdownStatus(),
  captchaPanel: () => refreshCaptchaSwitch(),
  starlightPanel: () => syncStarlightPanel(),
  ticketAdminPanel: () => refreshTicketAdmin(),
  feedbackAdminPanel: () => refreshFeedbackAdmin(),
  venueAdminPanel: () => refreshVenueAdmin(),
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
    ? "当前状态：已关闭（纯静态展示，联系方式 / 活动群 / 场地登记 / 点赞都不可用）"
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

/* ---- 6b. 活动购票：管理员面板 / Excel 导出 ---- */
/* 管理员面板 ---------------------------------------------------------------------- */
const ticketAdmin = { status: null, orders: [], day: "" };

/* 重复标记：同一联系方式出现在多单；同一 id@区服 出现多次（待定除外） */
function computeTicketDuplicates(orders) {
  const normContact = (c) => String(c).replace(/\s+/g, "").toLowerCase();
  const normHolder = (h) => `${h.name.replace(/\s+/g, "").toLowerCase()}@${h.server}`;
  const contactCount = new Map();
  const holderCount = new Map();
  /* 作废单不算重复：它已经不占票额了，再标红会让人以为还要处理 */
  orders.filter((o) => !o.voided).forEach((o) => {
    const c = normContact(o.contact);
    contactCount.set(c, (contactCount.get(c) || 0) + 1);
    o.holders.forEach((h) => {
      if (h.pending) return;
      const k = normHolder(h);
      holderCount.set(k, (holderCount.get(k) || 0) + 1);
    });
  });
  return new Map(orders.map((o) => [o.id, o.voided
    ? { contact: false, holders: o.holders.map(() => false) }   // 作废单自己也不标重复
    : {
        contact: contactCount.get(normContact(o.contact)) > 1,
        holders: o.holders.map((h) => !h.pending && holderCount.get(normHolder(h)) > 1),
      }]));
}

function setTicketSwitch(btn, on, onText, offText) {
  btn.setAttribute("aria-pressed", on ? "true" : "false");
  btn.classList.toggle("is-on", on);
  btn.textContent = on ? onText : offText;
}

function renderTicketAdmin() {
  const st = ticketAdmin.status;
  if (!st) return;
  const orders = ticketAdmin.orders;
  /* 统计一律只看未作废的单；作废的单单独列一项，方便核对 */
  const live = orders.filter((o) => !o.voided);
  const todayOrders = live.filter((o) => o.day === st.day);
  const overToday = todayOrders.filter((o) => o.overLimit).reduce((n, o) => n + o.qty, 0);
  const voidedAll = orders.filter((o) => o.voided);

  $("ticketAdminStatus").textContent = `当前票日：${st.day}（每日 ${minutesToHHMM(st.resetMin || 0)} 刷新，国服时间）`;
  $("ticketAdminStats").innerHTML = [
    ["已售", `${st.sold} 张`],
    ["今日限额", `${st.limit} 张`],
    ["今日余票", `${st.remaining} 张`],
    ["今日订单", `${todayOrders.length} 单${overToday ? `（超额 ${overToday} 张）` : ""}`],
    ["累计", `${live.length} 单 / ${live.reduce((n, o) => n + o.qty, 0)} 张`],
    ["已作废", `${voidedAll.length} 单 / ${voidedAll.reduce((n, o) => n + o.qty, 0)} 张`],
  ].map(([k, v]) => `<div class="tas-item"><span>${k}</span><b>${v}</b></div>`).join("");

  setTicketSwitch($("ticketOpenBtn"), st.open, "已开放（点击关闭）", "已关闭（点击开放）");
  setTicketSwitch($("ticketPendingBtn"), st.allowPending, "允许待定（点击关闭）", "不允许待定（点击开启）");
  setTicketSwitch($("ticketTestBtn"), !!st.testMode, "显示「（测试）」（点击去掉）", "不显示（点击加上）");
  if (document.activeElement !== $("ticketTitleInput")) $("ticketTitleInput").value = st.title || TICKET_TITLE;
  $("ticketTitlePreview").textContent = `访客看到的标题：${st.title || TICKET_TITLE}${st.testMode ? "（测试）" : ""}`;
  $("ticketTitlePreview").hidden = false;
  /* 购票页显示设置 */
  const mode = st.remainingMode || "full";
  if (document.activeElement !== $("ticketRemainModeSelect")) $("ticketRemainModeSelect").value = mode;
  const stockHtml = ticketStockHtml(mode, st.remaining, st.stockLevel);
  $("ticketRemainPreview").textContent = `访客现在看到：${stockHtml ? stockHtml.replace(/<[^>]+>/g, "") : "（不显示余票）"}`
    + (mode === "range" ? `　｜ 档位：≤10 张「余票10张以内」，≤ 限额 50% 「余票不多」，其余「余票充裕」` : "");
  $("ticketRemainPreview").hidden = false;
  setTicketSwitch($("ticketShowSchedBtn"), st.showSchedule !== false, "显示（点击隐藏）", "不显示（点击显示）");
  setTicketSwitch($("ticketShowResetBtn"), st.showReset !== false, "显示（点击隐藏）", "不显示（点击显示）");
  setTicketSwitch($("ticketViewerBtn"), st.viewerEnabled !== false, "已开放（点击关闭）", "已关闭（点击开放）");
  if (document.activeElement !== $("ticketCooldownInput")) $("ticketCooldownInput").value = String(st.cooldownMin ?? 30);
  if (document.activeElement !== $("ticketResetInput")) $("ticketResetInput").value = minutesToHHMM(st.resetMin || 0);
  if (document.activeElement !== $("ticketLimitInput")) $("ticketLimitInput").value = String(st.limit);
  if (document.activeElement !== $("ticketPerPersonInput")) $("ticketPerPersonInput").value = String(st.perPerson ?? "");
  renderTicketSchedule(st);

  // 日期下拉：所有有订单的日期 + 今天
  const days = [...new Set([...orders.map((o) => o.day), st.day])].sort().reverse();
  if (!days.includes(ticketAdmin.day)) ticketAdmin.day = st.day;
  $("ticketDaySelect").innerHTML = days.map((d) => {
    const list = live.filter((o) => o.day === d);
    const qty = list.reduce((n, o) => n + o.qty, 0);
    const voided = orders.filter((o) => o.day === d && o.voided).length;
    return `<option value="${d}"${d === ticketAdmin.day ? " selected" : ""}>${d}（${list.length} 单 / ${qty} 张${voided ? ` · 作废 ${voided}` : ""}）</option>`;
  }).join("");

  const dup = computeTicketDuplicates(orders);
  const rows = orders.filter((o) => o.day === ticketAdmin.day);
  $("ticketAdminTbody").innerHTML = rows.length ? rows.map((o) => {
    const d = dup.get(o.id) || { contact: false, holders: [] };
    const holders = o.holders.map((h, i) =>
      `<span class="${d.holders[i] ? "is-dup" : ""}">${escapeHtml(formatHolder(h))}</span>`).join("<br>");
    const msgText = o.message ? `${escapeHtml(o.message)}<small>${o.anonymous ? "匿名" : "实名"}</small>` : "";
    const time = new Date(o.createdAt).toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
    const act = o.voided
      ? `<button type="button" class="tt-act is-restore" data-void-id="${o.id}" data-void="0">恢复</button>`
      : `<button type="button" class="tt-act is-void" data-void-id="${o.id}" data-void="1">作废</button>`;
    return `<tr class="${o.voided ? "is-void" : o.overLimit ? "is-over" : ""}">
      <td>${o.seq}</td>
      <td class="${d.contact ? "is-dup" : ""}">${escapeHtml(o.contact)}</td>
      <td>${o.qty}</td>
      <td>${holders}</td>
      <td class="tt-msg">${msgText}</td>
      <td>${time}</td>
      <td class="tt-actions">${act}</td>
    </tr>`;
  }).join("") : `<tr><td colspan="7" class="tt-empty">这一天还没有订单</td></tr>`;
}

/* 定时开关：把服务端的 openAt / closeAt 回填到输入框，并用一句人话说明接下来会发生什么。
   输入框正在被编辑时不覆盖，免得打字打到一半被刷新冲掉。 */
function renderTicketSchedule(st) {
  const openIn = $("ticketOpenAtInput");
  const closeIn = $("ticketCloseAtInput");
  if (document.activeElement !== openIn) openIn.value = epochToCnLocal(st.openAt);
  if (document.activeElement !== closeIn) closeIn.value = epochToCnLocal(st.closeAt);

  const parts = [];
  if (st.openAt) parts.push(`将于 ${formatCnTime(st.openAt)} 自动开启`);
  if (st.closeAt) parts.push(`将于 ${formatCnTime(st.closeAt)} 自动关闭`);
  const note = $("ticketSchedNote");
  note.textContent = parts.length
    ? `${parts.join("；")}（国服时间；计划执行后自动清除）`
    : "";
  note.hidden = !parts.length;
}

/* 作废 / 恢复一单。服务端会连带把最新状态回传，所以这里直接用返回值更新，
   不用再多打一次 ticket_admin_get。 */
async function ticketAdminVoid(id, voided) {
  const msg = $("ticketAdminMsg");
  setMsg(msg, "");
  const data = await callWorker({
    action: "ticket_admin_void", password: internalAdminPassword, id, voided,
  });
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
  const row = ticketAdmin.orders.find((o) => o.id === data.order.id);
  if (row) {
    row.voided = data.order.voided;
    row.overLimit = data.order.overLimit;
  }
  ticketAdmin.status = data.status;
  renderTicketAdmin();
  showToast(data.order.voided
    ? `第 ${data.order.seq} 号已作废，票额已放回`
    : `第 ${data.order.seq} 号已恢复${data.order.overLimit ? "（票额已满，按超额票计）" : ""}`);
}

async function refreshTicketAdmin() {
  const data = await callWorker({ action: "ticket_admin_get", password: internalAdminPassword || internalViewPassword });
  if (data && data.error === "viewer_closed") {
    /* 查看页被管理员关掉了：清空已显示的数据，停止自动刷新 */
    clearInterval(ticketViewTimer);
    ticketAdmin.orders = [];
    $("ticketAdminStats").innerHTML = "";
    $("ticketAdminTbody").innerHTML = "";
    $("ticketAdminStatus").textContent = "「购票情况」页面已被管理员关闭";
    return false;
  }
  if (!data || !data.ok) {
    $("ticketAdminStatus").textContent = "读取失败：若是刚更新的 Worker，先在 D1 里执行 ticket-voided.sql 加上 voided 列；若是全新部署，先执行 schema.sql 建表";
    return false;
  }
  ticketAdmin.status = data.status;
  ticketAdmin.orders = data.orders;
  renderTicketAdmin();
  return true;
}

async function ticketAdminSet(patch, okMsg) {
  const msg = $("ticketAdminMsg");
  setMsg(msg, "");
  const data = await callWorker({ action: "ticket_admin_set", password: internalAdminPassword, ...patch });
  if (!data || !data.ok) {
    const TICKET_SET_ERRORS = {
      bad_limit: "限额需为 0 以上的整数",
      bad_per_person: "单人限购需为 1–20 之间的整数",
      bad_cooldown: "购票间隔需为 0–1440 之间的整数（分钟）",
      bad_reset: "刷新时间格式不对",
      bad_title: "标题太长了（最多 60 个字）",
      bad_remaining_mode: "余票显示方式不对",
      bad_time: "定时时间格式不对",
      bad_schedule: "定时时间格式不对",
      no_texts_table: "保存标题失败：先在 D1 里执行 feedback-and-ticket-settings.sql 建 site_texts 表",
    };
    setMsg(msg, TICKET_SET_ERRORS[data?.error] || "保存失败，请重新登录内部入口后再试");
    return;
  }
  ticketAdmin.status = data.status;
  renderTicketAdmin();
  applyTicketEntryVisibility(ticketEntryVisibleFor(data.status));   // 首页入口跟着「开放 + 非测试」走
  scheduleTicketEntryCheck({ ok: true, ...data.status });
  showToast(okMsg);
}

/* Excel 导出（ExcelJS 按需加载） --------------------------------------------------- */
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

/* orders：要写进表里的订单（调用方已经把作废单过滤掉了）
   voidedOrders：可选。给「清空前的备份」用——正常导出不带它，
   备份时带上，作废记录会单独放一张「已作废」表，免得清空后这部分数据彻底消失。 */
async function buildTicketWorkbook(orders, voidedOrders = null) {
  const ExcelJS = await loadExcelJs();
  const wb = new ExcelJS.Workbook();
  const center = { horizontal: "center", vertical: "middle" };
  const dup = computeTicketDuplicates(orders);
  const days = [...new Set(orders.map((o) => o.day))].sort();

  /* 第一页：预售票。每天一栏：联系方式 / 序号 / 购票数量 / 购票id（1…N） / 是否取票 + 1 列空隔。
     N 平时是 5（与往年表格一致）；后台把单人限购调到 5 张以上时自动加宽，
     否则多出来的持票人会被默默截掉。 */
  const ID_COLS = Math.max(5, ...orders.map((o) => o.qty), 0);
  const ws = wb.addWorksheet("预售票");
  const BLOCK = ID_COLS + 6;
  const header = ["联系方式", "序号", "购票数量",
    ...Array.from({ length: ID_COLS }, (_, i) => `购票id（${i + 1}）`), "是否取票"];
  const totalRefs = [];
  days.forEach((day, di) => {
    const c0 = di * BLOCK + 1;
    const list = orders.filter((o) => o.day === day);
    const lastRow = Math.max(3, list.length + 2);
    const [y, m, d] = day.split("-").map(Number);

    ws.mergeCells(1, c0, 1, c0 + ID_COLS + 1);
    const dateCell = ws.getCell(1, c0);
    dateCell.value = new Date(Date.UTC(y, m - 1, d));
    dateCell.numFmt = "yyyy/m/d";
    dateCell.alignment = center;
    dateCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: XL_GREEN } };
    ws.getCell(1, c0 + ID_COLS + 2).value = "售出票数：";
    ws.getCell(1, c0 + ID_COLS + 2).alignment = center;
    const qtyCol = ws.getColumn(c0 + 2).letter;
    const sum = list.reduce((n, o) => n + o.qty, 0);
    ws.getCell(1, c0 + ID_COLS + 3).value = { formula: `SUM(${qtyCol}3:${qtyCol}${lastRow})`, result: sum };
    ws.getCell(1, c0 + ID_COLS + 3).alignment = center;
    totalRefs.push(`预售票!${ws.getColumn(c0 + ID_COLS + 3).letter}1`);

    header.forEach((h, i) => {
      const cell = ws.getCell(2, c0 + i);
      cell.value = h;
      cell.alignment = center;
      cell.font = { bold: true };
    });

    list.forEach((o, ri) => {
      const r = ri + 3;
      const flags = dup.get(o.id);
      const values = [o.contact, o.seq, o.qty,
        ...Array.from({ length: ID_COLS }, (_, k) => o.holders[k] ? formatHolder(o.holders[k]) : null), null];
      values.forEach((v, i) => {
        const cell = ws.getCell(r, c0 + i);
        cell.value = v;
        cell.alignment = center;
        let color = o.overLimit ? XL_RED : null;
        if (i === 0 && flags.contact) color = XL_ORANGE;
        if (i >= 3 && i < 3 + ID_COLS && flags.holders[i - 3]) color = XL_ORANGE;
        if (color) cell.font = { color: { argb: color }, bold: o.overLimit };
      });
    });

    ws.getColumn(c0).width = 16;
    for (let i = 3; i < 3 + ID_COLS; i++) ws.getColumn(c0 + i).width = 22;
    ws.getColumn(c0 + 1).width = 6;
    ws.getColumn(c0 + 2).width = 9;
    ws.getColumn(c0 + ID_COLS + 3).width = 10;
    ws.getColumn(c0 + BLOCK - 1).width = 4;
  });

  // 图例放在所有日期栏右侧
  const lc = Math.max(1, days.length) * BLOCK + 1;
  ws.getCell(1, lc).value = "标注说明";
  ws.getCell(1, lc).font = { bold: true };
  ws.getCell(2, lc).value = "红字：提交时当日票额已满（超额登记，整单标红）";
  ws.getCell(2, lc).font = { color: { argb: XL_RED } };
  ws.getCell(3, lc).value = "橙字：联系方式或持票 id 与其他订单重复";
  ws.getCell(3, lc).font = { color: { argb: XL_ORANGE } };
  ws.getCell(4, lc).value = "已在后台作废的订单不会出现在本表中";
  ws.getColumn(lc).width = 44;
  ws.views = [{ state: "frozen", ySplit: 2 }];

  /* 其余工作表保持模板结构，内容留空 */
  const group = wb.addWorksheet("团购票");
  group.addRow(["id", "票数", "是否取票", "总计"]);
  group.getCell("D2").value = { formula: "SUM(B2:B2207)", result: 0 };
  group.getColumn(1).width = 15;

  const inner = wb.addWorksheet("内部票");
  inner.addRow(["店家/个人", "票数", "票价", "是否取票"]);
  inner.getCell("F5").value = "总计";
  inner.getCell("F6").value = { formula: "SUM(B2:B365)", result: 0 };
  inner.getColumn(1).width = 26;

  wb.addWorksheet("现场票");

  const stat = wb.addWorksheet("票务统计");
  stat.addRow(["票型", "单价（wgil）", "售票量", "收入"]);
  const presaleTotal = orders.reduce((n, o) => n + o.qty, 0);
  stat.addRow(["预售票", 98, { formula: totalRefs.length ? totalRefs.join("+") : "0", result: presaleTotal }, null]);
  stat.addRow(["团购票", 98, { formula: "团购票!D2", result: 0 }, null]);
  stat.addRow(["内部票①", 50, { formula: "内部票!F6", result: 0 }, null]);
  stat.addRow(["内部票②", 0, null, null]);
  stat.addRow(["现场票", 118, null, null]);
  stat.columns.forEach((c) => { c.width = 12; });

  /* 已作废（只有清空前的备份会带这张表） */
  if (voidedOrders && voidedOrders.length) {
    const vw = wb.addWorksheet("已作废");
    vw.addRow(["日期", "序号", "联系方式", "数量", "持票人", "留言", "登记时间"]);
    vw.getRow(1).font = { bold: true };
    voidedOrders.forEach((o) => {
      vw.addRow([o.day, o.seq, o.contact, o.qty, o.holders.map(formatHolder).join("、"), o.message || "",
        new Date(o.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })]);
    });
    [12, 6, 16, 6, 40, 40, 20].forEach((w, i) => { vw.getColumn(i + 1).width = w; });
  }

  /* 留言 */
  const msgWs = wb.addWorksheet("留言");
  msgWs.addRow(["日期", "序号", "联系方式", "第一位持票人", "留言", "是否匿名"]);
  msgWs.getRow(1).font = { bold: true };
  orders.filter((o) => o.message).forEach((o) => {
    msgWs.addRow([o.day, o.seq, o.contact, formatHolder(o.holders[0]), o.message, o.anonymous ? "是" : "否"]);
  });
  [12, 6, 16, 22, 60, 10].forEach((w, i) => { msgWs.getColumn(i + 1).width = w; });
  msgWs.getColumn(5).alignment = { wrapText: true, vertical: "top" };

  return wb;
}

/* withVoided：清空前的备份传 true，把作废记录也一并存进表里的「已作废」页。
   平时导出传 false（默认），作废单在整个文件里都不出现。 */
async function exportTicketExcel(withVoided = false) {
  /* 作废的单不进表：票额已经放回，导出时就当它不存在。
     这里过滤一次，后面的重复标记、留言页、票务统计就都自动跟着排除了。 */
  const orders = ticketAdmin.orders.filter((o) => !o.voided);
  const voided = withVoided ? ticketAdmin.orders.filter((o) => o.voided) : null;
  const wb = await buildTicketWorkbook(orders, voided);
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const stamp = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `花街购票信息${ticketAdmin.status?.testMode ? "（测试）" : ""}${withVoided ? "_含作废备份" : ""}_${stamp}.xlsx`;
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

function initTicketAdmin() {
  $("ticketOpenBtn").addEventListener("click", () => {
    const next = !ticketAdmin.status?.open;
    ticketAdminSet({ open: next }, next ? "购票已开放" : "购票已关闭");
  });
  $("ticketPendingBtn").addEventListener("click", () => {
    const next = !ticketAdmin.status?.allowPending;
    ticketAdminSet({ allowPending: next }, next ? "已允许持票 id 待定" : "已关闭持票 id 待定");
  });
  const saveLimit = () => {
    const raw = $("ticketLimitInput").value.trim();
    const n = Number(raw);
    if (raw === "" || !Number.isInteger(n) || n < 0) {
      setMsg($("ticketAdminMsg"), "限额需为 0 以上的整数");
      return;
    }
    $("ticketLimitInput").blur();
    ticketAdminSet({ limit: n }, `每日限额已设为 ${n} 张`);
  };
  $("ticketLimitSaveBtn").addEventListener("click", saveLimit);
  $("ticketLimitInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveLimit();
  });

  /* 单人限购 */
  const savePerPerson = () => {
    const raw = $("ticketPerPersonInput").value.trim();
    const n = Number(raw);
    if (raw === "" || !Number.isInteger(n) || n < 1 || n > 20) {
      setMsg($("ticketAdminMsg"), "单人限购需为 1–20 之间的整数");
      return;
    }
    $("ticketPerPersonInput").blur();
    ticketAdminSet({ perPerson: n }, `单人限购已设为 ${n} 张`);
  };
  $("ticketPerPersonSaveBtn").addEventListener("click", savePerPerson);
  $("ticketPerPersonInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") savePerPerson();
  });

  /* 购票页标题 / 「（测试）」后缀 */
  const saveTitle = () => {
    const title = $("ticketTitleInput").value.trim();
    if (title.length > 60) { setMsg($("ticketAdminMsg"), "标题太长了（最多 60 个字）"); return; }
    $("ticketTitleInput").blur();
    ticketAdminSet({ title }, title ? "购票页标题已保存" : "已恢复默认标题");
  };
  $("ticketTitleSaveBtn").addEventListener("click", saveTitle);
  $("ticketTitleInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveTitle();
  });
  $("ticketTestBtn").addEventListener("click", () => {
    const next = !ticketAdmin.status?.testMode;
    ticketAdminSet({ testMode: next }, next ? "标题已加上「（测试）」" : "标题已去掉「（测试）」");
  });

  /* 购票页显示设置：余票（具体 / 范围 / 不显示）、定时开关时间、每日刷新时间 */
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
  $("ticketViewerBtn").addEventListener("click", () => {
    const next = ticketAdmin.status?.viewerEnabled === false;
    ticketAdminSet({ viewerEnabled: next }, next
      ? "「购票情况」查看页已开放"
      : "「购票情况」查看页已关闭，查看密码暂时进不去（已经打开的页面下次刷新时也会被挡住）");
  });
  $("ticketShowResetBtn").addEventListener("click", () => {
    const next = ticketAdmin.status?.showReset === false;
    ticketAdminSet({ showReset: next }, next ? "购票页显示每日刷新时间" : "购票页不显示每日刷新时间");
  });

  /* 再次购票间隔（冷却） */
  const saveCooldown = () => {
    const raw = $("ticketCooldownInput").value.trim();
    const n = Number(raw);
    if (raw === "" || !Number.isInteger(n) || n < 0 || n > 1440) {
      setMsg($("ticketAdminMsg"), "购票间隔需为 0–1440 之间的整数（分钟）");
      return;
    }
    $("ticketCooldownInput").blur();
    ticketAdminSet({ cooldownMin: n }, n ? `再次购票间隔已设为 ${n} 分钟` : "已取消再次购票间隔");
  };
  $("ticketCooldownSaveBtn").addEventListener("click", saveCooldown);
  $("ticketCooldownInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveCooldown();
  });

  /* 每日票额刷新时间 */
  const saveReset = () => {
    const m = hhmmToMinutes($("ticketResetInput").value);
    if (m === null) { setMsg($("ticketAdminMsg"), "请填写刷新时间（时:分）"); return; }
    if (m !== (ticketAdmin.status?.resetMin || 0) && !confirm(
      `确定把每日票额刷新时间改为 ${minutesToHHMM(m)}（国服时间）吗？\n\n`
      + "改完后「今日余票」立刻按新的时间段重新计算；已有订单的日期不会变。")) return;
    $("ticketResetInput").blur();
    ticketAdminSet({ resetMin: m }, `每日票额将在 ${minutesToHHMM(m)} 刷新（国服时间）`);
  };
  $("ticketResetSaveBtn").addEventListener("click", saveReset);
  $("ticketResetInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveReset();
  });

  /* 定时开关：两个框都可以只填一个；留空表示不安排这个方向 */
  $("ticketSchedSaveBtn").addEventListener("click", () => {
    const openAt = cnLocalToEpoch($("ticketOpenAtInput").value);
    const closeAt = cnLocalToEpoch($("ticketCloseAtInput").value);
    if ($("ticketOpenAtInput").value && !openAt) { setMsg($("ticketAdminMsg"), "开启时间格式不对"); return; }
    if ($("ticketCloseAtInput").value && !closeAt) { setMsg($("ticketAdminMsg"), "关闭时间格式不对"); return; }
    if (!openAt && !closeAt) { setMsg($("ticketAdminMsg"), "至少填一个时间，或点「清除」取消定时"); return; }

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

  /* 作废 / 恢复：按钮是渲染出来的，用事件委托绑在表格上 */
  $("ticketAdminTbody").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-void-id]");
    if (!btn) return;
    const id = Number(btn.dataset.voidId);
    const toVoid = btn.dataset.void === "1";
    const order = ticketAdmin.orders.find((o) => o.id === id);
    if (toVoid && !confirm(`确定作废${order ? `第 ${order.seq} 号（${order.qty} 张）` : "这一单"}吗？\n\n作废后该单不会导出，票额会放回当日余票。之后可以再恢复。`)) return;
    btn.disabled = true;
    try { await ticketAdminVoid(id, toVoid); } finally { btn.disabled = false; }
  });
  $("ticketDaySelect").addEventListener("change", (e) => {
    ticketAdmin.day = e.target.value;
    renderTicketAdmin();
  });

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
      + `清空前会先自动下载一份 Excel 备份（作废记录会单独放在「已作废」页里），清空后无法恢复。`)) return;
    if (n) {
      try {
        await exportTicketExcel(true);   // 备份要完整，作废的也留一份
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

/* ---- 初始化（本文件加载完立即执行） ---- */
initInternal();
initAdminPanels();
initLockdownToggle();
initCaptchaSwitch();
initStarlightPanel();
initTicketAdmin();
initFeedbackAdmin();
if (typeof buildVenueForm === "function") initVenueAdmin();
else console.error("[场地预约] venue.js 没有加载成功，管理页的「场地预约」不可用");
initPostAnnouncement();
initAnnouncementImageUpload();
window.HJ_ADMIN_READY = true;
