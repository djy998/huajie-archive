/* 花舞之街 · 莫古邮件（私信）：登录账户之间按用户名发信。页头信封按钮第一次点开时由 account.js 加载，对外是 window.HJMail。
   布局参照游戏里的莫古邮件：左边是「未读 / 收件箱 / 已发送」列表和「写新邮件」，右边看信或写信；手机上一次只显示一栏。
   开关在管理页「用户管理 → 设置」：开放私信 / 仅开放与管理员私信 / 关闭私信（Worker 的 mail_mode）。管理员发的信标「管理员」 */
(() => {
  const TITLE_MAX = 30;
  const BODY_MAX = 500;
  const ERRORS = {
    mail_off: "私信功能已关闭",
    admin_only: "目前只能给管理员写信",
    no_user: "没有这个用户，请检查用户名",
    self: "不能给自己写信",
    no_to: "请填写收信人",
    no_body: "请填写正文",
    title_long: `标题最多 ${TITLE_MAX} 字`,
    body_long: `正文最多 ${BODY_MAX} 字`,
    daily_limit: "今天发送的私信已达上限，请明天再试",
    auth: "登录已过期，请重新登录",
    rate_limited: "操作过于频繁，请稍后再试",
    server_error: "服务器出错，请稍后再试",
  };
  const errorText = (d, fallback = "操作失败，请稍后再试") => (!d ? "连接失败，请检查网络后再试" : ERRORS[d.error] || fallback);
  const SEND_HINT = { any: "", admin: "目前只能给管理员写信。", none: "私信功能已关闭，暂时不能写信。" };

  const st = {
    box: "unread",                 // 列表页签：unread / in / sent
    lists: { in: null, sent: null },
    sel: null,                     // 正在看的信 { box, id }
    view: "list",                  // 手机上：list / main
    mode: "off", canSend: "none", unread: 0, total: 0, max: 200,
    bound: false,
  };
  const A = () => window.HJAccount;
  const auth = () => A()?.auth?.() || {};

  /* ---- 显示 ---- */
  /* 署名同「我的账户」的欢迎语：角色名@服务器（用户名），@ 显示成小花；没填角色名就只有用户名。窄屏换行时两段各自整段换 */
  function peerHtml(p) {
    if (p.gone) return "已注销的用户";
    const name = escapeHtml(p.username);
    const char = p.charName ? idHtml(p.charServer ? `${p.charName}@${p.charServer}` : p.charName) : "";
    return char ? `<span class="hj-id">${char}</span><span class="mail-uname">（${name}）</span>` : `<span class="hj-id">${name}</span>`;
  }
  /* 今天的显示时刻，今年的显示月日，更早的显示年月日 */
  function shortTime(ms) {
    const full = formatCnTime(ms);   // YYYY-MM-DD HH:MM
    const today = formatCnTime(Date.now()).slice(0, 10);
    if (full.slice(0, 10) === today) return full.slice(11, 16);
    if (full.slice(0, 4) === today.slice(0, 4)) return `${+full.slice(5, 7)}月${+full.slice(8, 10)}日`;
    return full.slice(0, 10);
  }
  const preview = (m) => (m.title || m.body.split("\n")[0]).slice(0, 40);
  const adminTag = '<span class="mail-tag-admin">管理员</span>';

  function boxItems() {
    if (st.box === "sent") return st.lists.sent || [];
    const list = st.lists.in || [];
    return st.box === "unread" ? list.filter((m) => !m.read) : list;
  }
  const dataBox = () => (st.box === "sent" ? "sent" : "in");

  function paintList() {
    const list = boxItems();
    const loading = !st.lists[dataBox()];
    $("mailList").innerHTML = loading ? '<p class="fb-empty">加载中…</p>'
      : list.length ? list.map((m) => {
        const box = dataBox();
        const peer = box === "sent" ? m.to : m.from;
        const cur = st.sel && st.sel.box === box && st.sel.id === m.id;
        return `<button type="button" class="mail-item${m.read ? "" : " is-unread"}${cur ? " is-cur" : ""}" data-mail="${m.id}">
          <span class="mail-item-top"><span class="mail-item-who">${box === "sent" ? "发给 " : ""}${peerHtml(peer)}${box === "in" && m.admin ? adminTag : ""}</span>
            <span class="mail-item-time">${escapeHtml(shortTime(m.at))}</span></span>
          <span class="mail-item-text">${escapeHtml(preview(m))}</span>
        </button>`;
      }).join("")
      : `<p class="fb-empty">${st.box === "unread" ? "没有未读邮件" : st.box === "sent" ? "还没有发出的邮件" : "收件箱是空的"}</p>`;
    $("mailFoot").textContent = `未读 ${st.unread} · 收件箱 ${st.total} / ${st.max}`;
  }

  function paintMain(which) {
    $("mailRead").hidden = which !== "read";
    $("mailCompose").hidden = which !== "compose";
    $("mailEmpty").hidden = which !== "empty";
    $("mailCard").classList.toggle("is-main", st.view === "main");
  }

  function findMail(box, id) {
    return (st.lists[box] || []).find((m) => m.id === id) || null;
  }

  function paintRead() {
    const m = st.sel && findMail(st.sel.box, st.sel.id);
    if (!m) { st.sel = null; st.view = "list"; paintMain("empty"); return; }
    const sent = st.sel.box === "sent";
    $("mailReadHead").innerHTML = sent
      ? `<span class="mail-read-label">发给</span><span class="mail-read-who">${peerHtml(m.to)}</span>`
      : `<span class="mail-read-label">来自</span><span class="mail-read-who">${peerHtml(m.from)}${m.admin ? adminTag : ""}</span>`;
    $("mailReadMeta").textContent = formatCnTime(m.at) + (sent ? (m.readAt ? ` · 对方已读` : " · 对方未读") : "");
    $("mailReadTitle").textContent = m.title;
    $("mailReadTitle").hidden = !m.title;
    $("mailReadBody").textContent = m.body;
    $("mailReplyBtn").hidden = sent || m.from.gone || st.canSend === "none" || (st.canSend === "admin" && !m.admin);
    paintMain("read");
  }

  /* ---- 数据 ---- */
  function applyMeta(d) {
    st.mode = d.mode || st.mode;
    st.canSend = d.canSend || st.canSend;
    if (Number.isFinite(d.unread)) st.unread = d.unread;
    if (Number.isFinite(d.inboxTotal)) st.total = d.inboxTotal;
    if (Number.isFinite(d.inboxMax)) st.max = d.inboxMax;
    A()?.setMailUnread?.(st.unread, st.mode);
    $("mailSendHint").textContent = SEND_HINT[st.canSend] || "";
    $("mailSendHint").hidden = !SEND_HINT[st.canSend];
    $("mailNewBtn").disabled = st.canSend === "none";
    $("mailSendBtn").disabled = st.canSend === "none";
  }

  async function load(box, { quiet = false } = {}) {
    const data = await callWorker({ action: "mail_list", box, ...auth() }, { load: quiet ? "none" : "corner" });
    if (!data || !data.ok) {
      if (data && data.error === "auth") { close(); A()?.logout?.(); return; }
      if (!quiet) showToast(errorText(data, "读取失败，请稍后再试"));
      return;
    }
    st.lists[box] = data.items;
    applyMeta(data);
    if ($("mailOverlay").hidden) return;
    paintList();
    if (st.sel && st.sel.box === box) paintRead();
  }

  async function openMail(id) {
    const box = dataBox();
    const m = findMail(box, id);
    if (!m) return;
    st.sel = { box, id };
    st.view = "main";
    paintRead();
    paintList();
    if (box === "in" && !m.read) {
      m.read = true;
      st.unread = Math.max(0, st.unread - 1);
      paintList();
      const data = await callWorker({ action: "mail_read", id, ...auth() }, { load: "none" });
      if (data && data.ok) applyMeta({ unread: data.unread });
      else A()?.setMailUnread?.(st.unread, st.mode);
    }
  }

  /* ---- 写信 ---- */
  function compose({ to = "", title = "" } = {}) {
    $("mailTo").value = to;
    $("mailSubject").value = title;
    $("mailBody").value = "";
    countBody();
    setMsg($("mailSendMsg"), "");
    st.sel = null;
    st.view = "main";
    paintList();
    paintMain("compose");
    ($("mailTo").value ? $("mailBody") : $("mailTo")).focus({ preventScroll: true });
  }
  function countBody() {
    const n = $("mailBody").value.length;
    $("mailCount").textContent = `${n} / ${BODY_MAX}`;
    $("mailCount").classList.toggle("is-over", n > BODY_MAX);
  }

  async function send(e) {
    e.preventDefault();
    const msg = $("mailSendMsg");
    const to = $("mailTo").value.trim();
    const title = $("mailSubject").value.trim();
    const body = $("mailBody").value.trim();
    const bad = !to ? ERRORS.no_to : !body ? ERRORS.no_body : title.length > TITLE_MAX ? ERRORS.title_long : body.length > BODY_MAX ? ERRORS.body_long : "";
    if (bad) { setMsg(msg, bad); return; }
    const btn = $("mailSendBtn");
    btn.disabled = true;
    setMsg(msg, "发送中…");
    const data = await callWorker({ action: "mail_send", to, title, body, ...auth() }, { load: "block" });
    btn.disabled = st.canSend === "none";
    if (!data || !data.ok) { setMsg(msg, errorText(data, "发送失败，请稍后再试")); return; }
    setMsg(msg, "");
    showToast(`已发送给 ${data.to}`);
    st.lists.sent = null;
    st.box = "sent";
    syncTabs();
    st.view = "list";
    paintMain("empty");
    load("sent");
  }

  async function remove() {
    if (!st.sel) return;
    const { box, id } = st.sel;
    if (!confirm("删除这封邮件？删除后无法恢复。")) return;
    const data = await callWorker({ action: "mail_delete", id, box, ...auth() }, { load: "block" });
    if (!data || !data.ok) { showToast(errorText(data, "删除失败，请稍后再试")); return; }
    st.lists[box] = (st.lists[box] || []).filter((m) => m.id !== id);
    if (box === "in") st.total = Math.max(0, st.total - 1);
    applyMeta({ unread: data.unread });
    st.sel = null;
    st.view = "list";
    paintMain("empty");
    paintList();
    showToast("邮件已删除");
  }

  /* ---- 开合与绑定 ---- */
  function syncTabs() {
    document.querySelectorAll('#mailTabs input[name="mailBox"]').forEach((r) => { r.checked = r.value === st.box; });
    syncSegments($("mailTabs"));
  }

  function bind() {
    if (st.bound) return;
    st.bound = true;
    $("mailClose").addEventListener("click", close);
    $("mailTabs").addEventListener("change", (e) => {
      st.box = e.target.value;
      syncSegments($("mailTabs"));
      st.view = "list";
      paintMain(st.sel ? "read" : "empty");
      $("mailCard").classList.remove("is-main");
      paintList();
      if (!st.lists[dataBox()]) load(dataBox());
    });
    $("mailList").addEventListener("click", (e) => {
      const item = e.target.closest("[data-mail]");
      if (item) openMail(Number(item.dataset.mail));
    });
    $("mailNewBtn").addEventListener("click", () => compose());
    $("mailRefreshBtn").addEventListener("click", () => { load("in"); if (st.lists.sent) load("sent"); });
    $("mailBack").addEventListener("click", () => {
      st.view = "list";
      $("mailCard").classList.remove("is-main");
    });
    $("mailReplyBtn").addEventListener("click", () => {
      const m = st.sel && findMail(st.sel.box, st.sel.id);
      if (!m) return;
      const t = m.title ? (m.title.startsWith("回复：") ? m.title : `回复：${m.title}`) : "";
      compose({ to: m.from.username, title: t.slice(0, TITLE_MAX) });
    });
    $("mailDeleteBtn").addEventListener("click", remove);
    $("mailCompose").addEventListener("submit", send);
    $("mailBody").addEventListener("input", countBody);
    $("mailCancelBtn").addEventListener("click", () => {
      st.view = "list";
      $("mailCard").classList.remove("is-main");
      paintMain("empty");
    });
  }

  function open() {
    if (!A()?.token?.()) { showToast("登录账户后才能使用私信"); return; }
    bind();
    $("mailOverlay").hidden = false;
    playFadeOnly($("mailCard"));
    st.box = st.unread > 0 || !st.lists.in ? "unread" : st.box;
    syncTabs();
    st.view = "list";
    paintMain(st.sel ? "read" : "empty");
    $("mailCard").classList.remove("is-main");
    paintList();
    load("in");
    if (st.lists.sent) load("sent", { quiet: true });
  }

  function close() {
    $("mailOverlay").hidden = true;
  }

  /* 换了账户、退出登录：清掉上一个账户的信 */
  function reset() {
    st.lists = { in: null, sent: null };
    st.sel = null;
    st.unread = st.total = 0;
    if (!$("mailOverlay").hidden) close();
  }

  window.HJMail = { open, close, reset, setUnread: (n) => { st.unread = n; } };
})();
