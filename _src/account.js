/* 花舞之街 · 账户与个人数据：网站说明里的「致谢」「个人数据」「登录与注册」，登录状态、表单自动填写、本机提交记录、跨设备同步。
   依赖 main.js 的工具（$、callWorker、storage、escapeHtml、setMsg、showToast、createFormGate…），对外是 window.HJAccount。
   - 账户只有用户名、密码、注册码（决定权限），游戏 id 和联系方式选填。不收邮箱手机号。
   - 密码在这里先做 PBKDF2（ACCOUNT_KDF：12 万次，盐 = "hj-account:v1:" + 归一化用户名）再发给 Worker，Worker 只见得到派生值。
     管理员改过用户名、本人还没换密码时，盐里仍是旧名字：Worker 登录时回 kdf { name }，登录后账户信息里的 kdfName 也是它。
     改 ACCOUNT_KDF 会让所有人的旧密码对不上，不要动；站长账户（密码在 Cloudflare 的 ADMIN_PASSWORD）次数不同，由 Worker 回 kdf 告诉这里。
   - 登录、注册都要过人机验证；账户没有任何特权（购票、问卷、反馈和没登录时完全一样）。
   - 登录令牌存在本机 hj_account，带在请求的 session 字段里：勾了「自动登录」存 localStorage（以后打开网站自动登录，直到退出或清除数据），
     没勾存 sessionStorage（关掉浏览器就退出，Worker 那边一天没用也失效）。
   - 本机提交记录 hj_my_records：购票、问卷、场地登记、反馈提交成功时记一条，「个人数据」里列出来；登录时再合并账户里其他设备的记录。
   - 同步（SYNC）：纪录类按「取最好的」合并，设置类按改动时间新的为准；跟设备有关的（动画档位、音量、判定延迟、性能选项）不同步 */
(() => {
  const STORE_ACCT = "hj_account";
  const STORE_RECORDS = "hj_my_records";
  const STORE_SYNC = "hj_sync_meta";          // 同步元数据 { 键: { h: 上次同步后本机值的指纹, s: 账户里这个键的改动时刻 } }
  const STORE_REPLY_CHECK = "hj_reply_check"; // 上次凭本机回执查回复的时刻
  const RECORDS_KEEP = 200;
  const ACCOUNT_KDF = { iter: 120000, salt: "hj-account:v1:" };
  const ROLE_NAMES = { u: "普通用户", a: "内部 · 公告 A", b: "内部 · 公告 B", v: "内部 · 查看", c: "管理员" };
  const INTERNAL_ROLES = ["a", "b", "v", "c"];
  const USERNAME_RE = /^[\p{Script=Han}A-Za-z0-9_\-·]{2,16}$/u;
  const PW_MIN = 6;
  const PW_MAX = 64;
  const SYNC_EVERY_MS = 5 * 60 * 1000;
  const REPLY_CHECK_MS = 10 * 60 * 1000;
  const SYNC = {
    keys: [
      "hj_player_name", "hj_puzzle_records", "hj_puzzle_pref",
      "hj_stage_best3", "hj_stage_best2", "hj_stage_unlock", "hj_stage_song", "hj_stage_diff", "hj_stage_learn", "hj_stage_demo",
      "hj_stage_inst", "hj_stage_judge", "hj_stage_range", "hj_stage_fly", "hj_stage_stars", "hj_stage_cat", "hj_stage_guide",
      "hj_bard_opts", "hj_bard_inst",
      "hj_games_tab", "hj_games_poem_mode", "hj_games_spy_kind", "hj_games_spy_players", "hj_games_bomb_players",
    ],
    prefixes: ["hj_games_macro_", "hj_survey_done_"],
  };
  const TIPS = {
    nocode: "如果您认识网站作者，可以联系其为您提供帮助。",
    forgot: "请联系网站作者帮你重置密码：作者会发给你一个重置链接，打开后设置新密码即可。网站不收集邮箱和手机号，所以没法自助找回。",
  };
  const TYPES = { ticket: "购票", survey: "问卷", venue: "场地登记", feedback: "反馈" };
  const ERRORS = {
    net: "连接失败，检查一下网络后再试",
    no_crypto: "这个浏览器太旧，不支持网页加密，没法登录，换个浏览器试试",
    auth: "用户名或密码不正确",
    locked: "输错次数过多，请 15 分钟后再试",
    disabled: "这个账户已停用，有疑问请联系网站作者",
    bad_username: "用户名为 2~16 位汉字、字母、数字或 _ - ·",
    name_taken: "这个用户名已经有人用了，换一个吧",
    need_code: "请填写注册码",
    bad_code: "注册码不正确或已失效",
    code_locked: "内部码输错次数过多，请 15 分钟后再试",
    code_role: "管理员账户要填管理员的内部码",
    code_required: "这个账户进入内部入口要填写内部码",
    bad_password: "密码格式不对",
    wrong_password: "当前密码不正确",
    same_password: "新密码不能和当前密码一样",
    bad_char_name: "角色名只能用汉字、英文字母和「·」，最多 6 个字",
    bad_char_server: "请从列表里选择服务器",
    bad_contact: "联系方式最多 60 个字",
    rate_limited: "操作过于频繁，请稍后再试",
    server_error: "服务器出错，请稍后再试",
    bad_token: "重置链接无效、已经用过或已过期，请联系网站作者重新生成",
    env_admin: "站长账户的密码在 Cloudflare 的 ADMIN_PASSWORD 里修改",
    last_admin: "这是最后一个管理员账户，不能注销",
    too_large: "要同步的数据太多了",
    kdf: "登录失败，请刷新页面后再试",
  };
  const REG_BEFORE_CAPTCHA = ["bad_username", "name_taken", "bad_password", "bad_char_name", "bad_char_server", "bad_contact", "need_code", "rate_limited"];
  const errorText = (d, fallback = "操作失败，请稍后再试") =>
    (!d ? ERRORS.net : d.error === "captcha" ? CAPTCHA_FAILED_MSG : ERRORS[d.error] || fallback);

  const st = {
    token: null, user: null, remember: false, listeners: new Set(),
    mode: "login", reset: null,          // 登录与注册：login / register；重置密码 { token, username, checking }
    cloud: null, cloudAt: 0,             // 账户里的记录（account_records）
    replies: new Map(),                  // 本机回执查到的回复：反馈编号 → { reply, replyAt, replyRead }
    gates: {}, filter: "all",
    syncing: null, syncTimer: 0, syncSoonTimer: 0, syncedAt: 0, syncErr: "",
    rendered: { account: "", data: false },
  };

  /* ==== 登录状态 ==== */
  function loadState() {
    for (const [area, remember] of [[storage, true], [session, false]]) {
      const s = area.json(STORE_ACCT);
      if (!s || typeof s.token !== "string" || !s.token) continue;
      st.token = s.token;
      st.user = s.user && typeof s.user === "object" ? s.user : null;
      st.remember = remember;
      return;
    }
  }
  function saveState() {
    const keep = st.remember ? storage : session;
    (st.remember ? session : storage).remove(STORE_ACCT);
    if (st.token) keep.set(STORE_ACCT, JSON.stringify({ token: st.token, user: st.user }));
    else keep.remove(STORE_ACCT);
  }
  const auth = () => (st.token ? { session: st.token } : {});
  const isInternal = (u = st.user) => !!u && INTERNAL_ROLES.includes(u.role);
  const charIdOf = (u = st.user) => (u && u.charName ? `${u.charName}${u.charServer ? `@${u.charServer}` : ""}` : "");

  function changed() {
    saveState();
    renderAccountPanel();
    paintDots();
    $("aboutAccountTab").textContent = st.token ? "我的账户" : "登录与注册";
    if (!$("aboutPanelThanks").hidden) renderThanksPanel();
    st.listeners.forEach((fn) => { try { fn(st.user); } catch (e) { console.error(e); } });
  }

  function signIn(data, remember = false) {
    st.token = data.session;
    st.user = data.user;
    st.remember = !!remember;
    st.cloud = null;
    st.reset = null;
    storage.remove(STORE_SYNC);   // 换了账户：同步从头比
    if (!playerName() && st.user) setPlayerName(charIdOf() || st.user.username);
    changed();
    startSyncTimer();
    syncNow();
  }

  function signOutLocal(msg) {
    st.token = null;
    st.user = null;
    st.cloud = null;
    storage.remove(STORE_SYNC);
    clearInterval(st.syncTimer);
    changed();
    renderDataPanel();
    if (msg) showToast(msg);
  }

  /* 改了资料、权限后 Worker 回来的新账户信息 */
  function applyUser(user) {
    if (!user || !st.token) return;
    st.user = { ...st.user, ...user };
    const hello = document.querySelector(".acct-hello .acct-name");   // 改了游戏 id，欢迎语跟着变
    if (hello) hello.innerHTML = welcomeHtml(st.user);
    changed();
  }

  /* get_site_state 的 account：对象 = 还在登录；false = 令牌失效；没有 = 没带令牌或 Worker 读不到，维持原样 */
  function applySite(data) {
    if (!st.token || !data || !("account" in data)) return;
    if (data.account === false) { signOutLocal("登录已过期，请重新登录"); return; }
    st.user = data.account;
    changed();
    startSyncTimer();
    HJ.late(() => syncNow());
  }

  /* ==== 密码预处理 ==== */
  const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  async function derivePw(username, password, iter = ACCOUNT_KDF.iter) {
    if (!window.crypto || !crypto.subtle) throw new Error("no_crypto");
    const uname = String(username).normalize("NFKC").trim().toLowerCase();
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(String(password).normalize("NFC")), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(ACCOUNT_KDF.salt + uname), iterations: iter }, key, 256);
    return b64url(new Uint8Array(bits));
  }

  /* 登录 → Worker 的回应；成功时已经记下登录状态。proof 为人机验证凭证，remember = 勾了「自动登录」 */
  async function login(username, password, { internalCode = "", proof = null, remember = false } = {}) {
    let iter = ACCOUNT_KDF.iter, kdfName = "";
    for (let round = 0; round < 2; round++) {
      let pw;
      try { pw = await derivePw(kdfName || username, password, iter); } catch (e) { return { ok: false, error: "no_crypto" }; }
      const data = await callWorker({
        action: "account_login", username, pw, ...(iter !== ACCOUNT_KDF.iter ? { kdf: iter } : {}), ...(kdfName ? { kdfName } : {}),
        ...(internalCode ? { internalCode } : {}), ...(remember ? { remember: true } : {}), ...(proof || {}),
      }, { load: "block" });
      if (data && data.error === "kdf" && Number(data.iter) > 0 && round === 0) {
        iter = Number(data.iter);
        kdfName = typeof data.name === "string" ? data.name : "";
        continue;
      }
      if (data && data.ok) signIn(data, remember);
      return data || { ok: false, error: "net" };
    }
    return { ok: false, error: "kdf" };
  }

  async function logout(all = false) {
    if (st.token) {
      await syncNow().catch(() => {});
      await callWorker({ action: "account_logout", ...auth(), ...(all ? { all: true } : {}) }, { load: "block" });
    }
    signOutLocal(all ? "已在所有设备上退出登录" : "已退出登录");
  }

  /* 网站说明 · 账户分页的表单检查 */
  function checkUsername(v) {
    const name = String(v || "").normalize("NFKC").trim();
    return USERNAME_RE.test(name) ? "" : ERRORS.bad_username;
  }
  function checkPw(pw, pw2, { min = PW_MIN } = {}) {
    if (pw.length < min) return `密码至少 ${min} 位`;
    if (pw.length > PW_MAX) return `密码最多 ${PW_MAX} 位`;
    if (pw2 !== undefined && pw !== pw2) return "两次输入的密码不一样";
    return "";
  }

  /* ==== 本机提交记录 ==== */
  function readRecords() {
    const list = storage.json(STORE_RECORDS);
    return Array.isArray(list) ? list.filter((r) => r && TYPES[r.t] && Number.isFinite(r.at)) : [];
  }
  /* type：ticket / survey / venue / feedback；data 为要记下的内容 */
  function record(type, data) {
    if (!TYPES[type]) return;
    const list = readRecords();
    list.unshift({ t: type, at: Date.now(), ...(st.user ? { by: st.user.username } : {}), ...data });
    storage.set(STORE_RECORDS, JSON.stringify(list.slice(0, RECORDS_KEEP)));
    st.cloudAt = 0;   // 账户里的记录下次打开时重读
    if (!$("aboutPanelData").hidden) renderDataPanel();
  }

  /* ==== 自动填写：只填空着的栏，填了照样可以改 ==== */
  function fillIfEmpty(el, value, { silent = false } = {}) {
    if (!el || !value || String(el.value || "").trim()) return;
    el.value = value;
    if (!silent) el.dispatchEvent(new Event("input", { bubbles: true }));
  }
  function fillTicket() {
    const u = st.user;
    if (!u) return;
    fillIfEmpty($("ticketContact"), u.contact);
    const row = document.querySelector('#ticketHolders .ticket-holder[data-index="0"]');
    if (!row || !u.charName) return;
    const name = row.querySelector(".th-name");
    const server = row.querySelector(".th-server");
    if (name && !name.value.trim() && typeof ticketNameError === "function" && !ticketNameError(u.charName)) fillIfEmpty(name, u.charName);
    if (server && !server.value && u.charServer) server.value = u.charServer;
  }
  function fillVenue() {
    const u = st.user;
    const root = $("venueFields");
    if (!u || !root || typeof venueInput !== "function") return;
    fillIfEmpty(venueInput(root, "charId"), charIdOf(u));
    fillIfEmpty(venueInput(root, "contact"), u.contact);
  }
  /* 反馈的联系方式栏平常藏着，勾了「留下联系方式」才发出去，所以先填上不会多交出什么 */
  function fillFeedback() {
    if (st.user) fillIfEmpty($("feedbackContact"), st.user.contact, { silent: true });
  }

  /* ==== 跨设备同步 ==== */
  const isSyncKey = (k) => SYNC.keys.includes(k) || SYNC.prefixes.some((p) => k.startsWith(p));
  function localSyncKeys() {
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && isSyncKey(k)) out.push(k);
      }
    } catch (e) { /* 隐私模式 */ }
    return out;
  }
  /* 值的指纹（FNV-1a + 长度），只用来判断本机改没改过 */
  function fingerprint(v) {
    if (v === null || v === undefined) return "-";
    let h = 2166136261;
    for (let i = 0; i < v.length; i++) h = Math.imul(h ^ v.charCodeAt(i), 16777619);
    return `${(h >>> 0).toString(36)}:${v.length}`;
  }
  const parseObj = (v) => {
    try { const o = JSON.parse(v); return o && typeof o === "object" && !Array.isArray(o) ? o : null; } catch (e) { return null; }
  };
  /* 纪录类的合并：每一项取更好的那个 */
  const mergeBestBy = (field) => (a, b) => {
    const A = parseObj(a), B = parseObj(b);
    if (!A) return b;
    if (!B) return a;
    const out = { ...A };
    for (const [k, v] of Object.entries(B)) if (!out[k] || Number(v && v[field]) > Number(out[k][field])) out[k] = v;
    return JSON.stringify(out);
  };
  function mergePuzzle(a, b) {
    const A = parseObj(a), B = parseObj(b);
    if (!A) return b;
    if (!B) return a;
    const adj = (r) => (Number.isFinite(r && r.adj) ? r.adj : Number(r && r.ms) || Infinity);
    const best = { ...(A.best || {}) };
    for (const [k, v] of Object.entries(B.best || {})) if (!best[k] || adj(v) < adj(best[k])) best[k] = v;
    const seen = new Set();
    const list = [];
    for (const r of [...(A.list || []), ...(B.list || [])]) {
      const id = r && `${r.at}|${r.diff}|${r.ms}`;
      if (!r || seen.has(id)) continue;
      seen.add(id);
      list.push(r);
    }
    list.sort((x, y) => (Number(y.at) || 0) - (Number(x.at) || 0));
    return JSON.stringify({ ...A, best, list: list.slice(0, 30) });
  }
  const MERGE = {
    hj_puzzle_records: mergePuzzle,
    hj_stage_best3: mergeBestBy("score"),
    hj_stage_best2: mergeBestBy("acc"),
  };

  /* 本机有没有还没同步上去的改动 */
  function localDirty() {
    const meta = storage.json(STORE_SYNC) || {};
    return localSyncKeys().some((k) => !meta[k] || meta[k].h !== fingerprint(storage.get(k)))
      || Object.keys(meta).some((k) => meta[k].h !== "-" && storage.get(k) === null);
  }

  /* 同步一次：先取账户里的，逐个键决定谁盖谁（纪录类合并），本机改过的再推上去 */
  function syncNow() {
    if (!st.token) return Promise.resolve(false);
    st.syncing ??= doSync().finally(() => { st.syncing = null; paintSyncState(); });
    return st.syncing;
  }
  async function doSync() {
    const got = await callWorker({ action: "account_sync", ...auth() }, { load: "none" });
    if (!got || !got.ok) {
      if (got && got.error === "auth") signOutLocal("登录已过期，请重新登录");
      st.syncErr = errorText(got, "同步失败");
      return false;
    }
    const server = got.items || {};
    const meta = storage.json(STORE_SYNC) || {};
    const keys = new Set([...localSyncKeys(), ...Object.keys(server).filter(isSyncKey), ...Object.keys(meta).filter(isSyncKey)]);
    const put = {};
    const now = typeof hjNow === "function" ? hjNow() : Date.now();
    for (const k of keys) {
      const L = storage.get(k);
      const S = server[k];
      const m = meta[k];
      const localChanged = !m || m.h !== fingerprint(L);
      const serverChanged = !!S && (!m || S.at > (m.s || 0));
      let result = L;
      let push = false;
      if (!S) push = L !== null;
      else if (!localChanged) { if (serverChanged) result = S.v; }
      else if (!serverChanged) {
        /* 只有这台改过：纪录类照样和账户里的合并（不会拿差的盖掉好的），清空了（null）就照清空的推 */
        result = MERGE[k] && L !== null && S.v ? MERGE[k](L, S.v) : L;
        push = result !== S.v;
      } else {
        /* 两边都改过：纪录合并；设置这台改过就以这台为准，这台第一次同步时以账户里的为准 */
        result = MERGE[k] ? MERGE[k](L, S.v) : (m ? L : S.v);
        push = result !== S.v;
      }
      if (result !== L) {
        if (result === null || result === undefined) storage.remove(k);
        else storage.set(k, result);
      }
      if (push) put[k] = { v: result ?? null, at: now };
      if (result === null && !S && !push) delete meta[k];
      else meta[k] = { h: fingerprint(result ?? null), s: push ? now : S ? S.at : 0 };
    }
    let ok = true;
    if (Object.keys(put).length) {
      const res = await callWorker({ action: "account_sync", ...auth(), put }, { load: "none" });
      if (res && res.ok) {
        for (const k of Object.keys(put)) if (res.items[k]) meta[k].s = res.items[k].at;
      } else {
        for (const k of Object.keys(put)) meta[k].h = "dirty";   // 下次还当本机改过，再推
        st.syncErr = errorText(res, "同步失败");
        ok = false;
      }
    }
    storage.set(STORE_SYNC, JSON.stringify(meta));
    if (ok) { st.syncedAt = Date.now(); st.syncErr = ""; }
    return ok;
  }
  /* 拼图通关、演奏完一首之后：过一会儿同步（连着几次只同步一回） */
  function syncSoon() {
    if (!st.token) return;
    clearTimeout(st.syncSoonTimer);
    st.syncSoonTimer = setTimeout(() => runQuietly(syncNow), 4000);
  }
  function startSyncTimer() {
    clearInterval(st.syncTimer);
    if (!st.token) return;
    st.syncTimer = setInterval(() => { if (!document.hidden && localDirty()) runQuietly(syncNow); }, SYNC_EVERY_MS);
  }

  /* ==== 反馈回复：未读红点 ==== */
  const localFeedback = () => readRecords().filter((r) => r.t === "feedback" && r.receipt && Number(r.id) > 0);
  /* 登录着的账户自己提交的反馈由账户那边算未读，这里只算其余的（没登录时交的、别的账户交的） */
  const receiptOnly = () => localFeedback().filter((r) => !st.user || r.by !== st.user.username);
  function localUnread() {
    return receiptOnly().filter((r) => { const x = st.replies.get(Number(r.id)); return x && x.reply && !x.replyRead; }).length;
  }
  function paintDots() {
    const n = (st.user ? Number(st.user.unread) || 0 : 0) + localUnread();
    $("footerReplyDot").hidden = !n;
    $("aboutDataDot").hidden = !n;
  }
  async function checkReplies(force = false) {
    const mine = localFeedback();
    if (!mine.length) return;
    const last = Number(storage.get(STORE_REPLY_CHECK)) || 0;
    if (!force && Date.now() - last < REPLY_CHECK_MS && st.replies.size) return;
    const data = await callWorker({ action: "feedback_replies", receipts: mine.map((r) => r.receipt).slice(0, 50) }, { load: "none" });
    if (!data || !data.ok) return;
    storage.set(STORE_REPLY_CHECK, Date.now());
    data.items.forEach((x) => st.replies.set(x.id, x));
    paintDots();
  }
  /* 打开「个人数据」看到了回复：标记已读 */
  async function markRepliesRead(items) {
    const unread = items.filter((x) => x.type === "feedback" && x.reply && !x.replyRead);
    if (!unread.length) return;
    const ids = unread.map((x) => x.id);
    const receipts = unread.map((x) => x.receipt).filter(Boolean);
    const data = await callWorker({ action: "feedback_mark_read", ids, receipts, ...auth() }, { load: "none" });
    if (!data || !data.ok) return;
    ids.forEach((id) => { const x = st.replies.get(id); if (x) x.replyRead = true; });
    if (st.cloud) st.cloud.feedback.forEach((f) => { if (ids.includes(f.id)) f.replyRead = true; });
    if (st.user) st.user.unread = Math.max(0, (Number(st.user.unread) || 0) - unread.filter((x) => x.src.has("cloud")).length);
    saveState();
    paintDots();
  }

  /* ==== 网站说明 · 致谢 ====
     名单在 config.js 的 SITE_THANKS；最后一行「多场活动长期合作的店家和老师们」下面一行 and、再一行接登录着的人自己的 id（游戏 id，没填用用户名）：
     每个人只看得到自己，算个小彩蛋。没登录就只有这一句。登录状态变了就重画 */
  function renderThanksPanel() {
    const me = st.user ? charIdOf() || st.user.username : "";
    /* 自己就在名单里（角色名相同；填了服务器时服务器也要相同）：那一行变紫，下面不再单独列 */
    const cn = st.user && st.user.charName, cs = st.user && st.user.charServer;
    const mine = (t) => !!cn && (([n, sv]) => n === cn && (!cs || !sv || sv === cs))(t.name.split("@"));
    const listed = SITE_THANKS.some(mine);
    $("aboutPanelThanks").innerHTML = `<div class="about-text">
      <dl class="about-list thanks-list">
        ${SITE_THANKS.map((t) => `<dt${mine(t) ? ' class="thanks-mine"' : ""}>${idHtml(t.name)}</dt><dd${mine(t) ? ' class="thanks-mine"' : ""}>${escapeHtml(t.what)}</dd>`).join("")}
        <dt class="thanks-wide">${escapeHtml(SITE_THANKS_PARTNERS)}${me && !listed ? `<span class="thanks-and">and</span><span class="thanks-me">${idHtml(me)}</span>` : ""}</dt>
      </dl>
      <p class="about-thanks">花舞之街·薰风花语町感谢大家的支持！</p>
    </div>`;
  }

  /* ==== 网站说明 · 个人数据 ==== */
  async function loadCloudRecords() {
    if (!st.token || (st.cloud && Date.now() - st.cloudAt < 60000)) return;
    const data = await callWorker({ action: "account_records", ...auth() }, { load: "corner" });
    if (!data) return;
    if (!data.ok) { if (data.error === "auth") signOutLocal("登录已过期，请重新登录"); return; }
    st.cloud = data;
    st.cloudAt = Date.now();
  }

  const surveyTitle = (id) => (typeof SURVEY !== "undefined" && SURVEY.id === id ? SURVEY.title : `问卷（${id}）`);
  const roundLabel = (day) => (typeof ticketRoundLabel === "function" ? ticketRoundLabel(day) : day);
  const holderText = (h) => (typeof formatHolder === "function" ? formatHolder(h) : h && h.name ? `${h.name}@${h.server}` : "待定");

  /* 本机记录与账户记录合到一起：同一条（同一张单、同一份问卷……）只列一次，标出来自哪里 */
  function mergedItems() {
    const map = new Map();
    const put = (key, item, src) => {
      const old = map.get(key);
      if (old) { old.src.add(src); Object.assign(old, src === "cloud" ? item : {}, { src: old.src }); return; }
      map.set(key, { ...item, src: new Set([src]) });
    };
    for (const r of readRecords()) {
      if (r.t === "ticket") put(`t:${r.day}#${r.seq}`, { type: "ticket", at: r.at, day: r.day, seq: r.seq, qty: r.qty, contact: r.contact, holders: r.holders || [], message: r.message || "", anonymous: r.anonymous !== false }, "local");
      else if (r.t === "survey") put(`s:${r.id}`, { type: "survey", at: r.at, id: r.id, survey: r.survey }, "local");
      else if (r.t === "venue") put(`v:${r.id}`, { type: "venue", at: r.at, id: r.id, rows: r.rows || [] }, "local");
      else if (r.t === "feedback") {
        const x = st.replies.get(Number(r.id)) || {};
        put(`f:${r.id}`, { type: "feedback", at: r.at, id: Number(r.id), category: r.category, content: r.content, contact: r.contact || "", receipt: r.receipt,
          reply: x.reply || "", replyAt: x.replyAt || 0, replyRead: !!x.replyRead }, "local");
      }
    }
    const c = st.token && st.cloud;
    if (c) {
      c.tickets.forEach((r) => put(`t:${r.day}#${r.seq}`, { type: "ticket", at: r.createdAt, day: r.day, seq: r.seq, qty: r.qty, contact: r.contact, holders: r.holders, message: r.message, anonymous: r.anonymous, voided: r.voided }, "cloud"));
      c.surveys.forEach((r) => put(`s:${r.id}`, { type: "survey", at: r.createdAt, id: r.id, survey: r.survey, voided: r.voided }, "cloud"));
      c.venues.forEach((r) => put(`v:${r.id}`, { type: "venue", at: r.createdAt, id: r.id, rows: typeof venueSummaryRows === "function" ? venueSummaryRows(r) : [], voided: r.voided }, "cloud"));
      c.feedback.forEach((r) => put(`f:${r.id}`, { type: "feedback", at: r.createdAt, id: r.id, category: r.category, content: r.content, contact: r.contact, reply: r.reply, replyAt: r.replyAt, replyRead: r.replyRead }, "cloud"));
    }
    return [...map.values()].sort((a, b) => b.at - a.at);
  }

  function itemRows(x) {
    if (x.type === "ticket") {
      return [
        ["场次", `${roundLabel(x.day)} · 第 ${x.seq} 号`],
        ["联系方式", x.contact || "—"],
        ["购票数量", `${x.qty} 张`],
        ...(x.holders || []).map((h, i) => [`持票人 ${i + 1}`, `${holderText(h)}${h && h.voided ? "（已作废）" : ""}`]),
        ...(x.message ? [["留言", `${x.message}（${x.anonymous ? "匿名" : "实名"}）`]] : []),
      ];
    }
    if (x.type === "survey") return [["问卷", surveyTitle(x.survey)], ["编号", `#${x.id}`]];
    if (x.type === "venue") return [["编号", `#${x.id}`], ...x.rows];
    const cats = typeof FEEDBACK_CATEGORIES !== "undefined" ? FEEDBACK_CATEGORIES : {};
    return [["类别", cats[x.category] || x.category || ""], ...(x.contact ? [["联系方式", x.contact]] : [])];
  }

  function itemHtml(x) {
    const src = x.src.has("local") && x.src.has("cloud") ? "本机 · 账户" : x.src.has("cloud") ? "账户" : "本机";
    const reply = x.type === "feedback" && x.reply
      ? `<div class="mydata-reply${x.replyRead ? "" : " is-new"}"><b>站长回复</b><span>${escapeHtml(formatCnTime(x.replyAt))}</span>${x.replyRead ? "" : "<i>新</i>"}<p>${escapeHtml(x.reply)}</p></div>`
      : x.type === "feedback" ? `<p class="mydata-noreply">还没有回复</p>` : "";
    return `<div class="fb-item mydata-item${x.voided ? " is-void" : ""}">
      <div class="fb-head">
        <span class="fb-cat mydata-type is-${x.type}">${TYPES[x.type]}</span>
        <span class="fb-time">${escapeHtml(formatCnTime(x.at))}</span>
        ${x.voided ? `<span class="mydata-void">已作废</span>` : ""}
        <span class="mydata-src">${src}</span>
      </div>
      ${x.type === "feedback" ? `<div class="fb-body">${escapeHtml(x.content || "")}</div>` : ""}
      <dl class="mydata-kv">${itemRows(x).map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${idHtml(v)}</dd>`).join("")}</dl>
      ${reply}
    </div>`;
  }

  function buildDataPanel() {
    const panel = $("aboutPanelData");
    panel.innerHTML = `
      <p class="about-hint mydata-intro" id="myDataIntro"></p>
      <div class="alarm-seg mydata-filter" id="myDataFilter" role="radiogroup" aria-label="记录类型">
        ${[["all", "全部"], ...Object.entries(TYPES)].map(([k, v], i) =>
          `<label${i ? "" : ' class="is-active"'}><input type="radio" name="myDataFilter" value="${k}"${i ? "" : " checked"}><span>${v}</span></label>`).join("")}
      </div>
      <div class="mydata-list" id="myDataList"></div>
      <div class="about-text mydata-tools">
        <p class="about-sub">本机数据</p>
        <dl class="about-list">
          <dt>清除缓存</dt><dd>只删图片、字体等离线缓存，下次用到时重新下载；记录、设置和登录状态都保留。</dd>
          <dt>清除数据</dt><dd>删除这台设备上本网站的全部数据：上面的本机记录、各种设置、拼图与舞台演奏纪录、登录状态和缓存，然后刷新网站。已同步到账户里的不受影响。</dd>
        </dl>
        <div class="group-btn-row">
          <button type="button" class="share-site-btn" id="myCacheBtn">清除缓存</button>
          <button type="button" class="share-site-btn is-danger" id="myWipeBtn">清除数据</button>
        </div>
      </div>`;
    $("myDataFilter").addEventListener("change", (e) => {
      syncSegments(e.currentTarget);
      st.filter = e.target.value;
      paintDataList();
    });
    $("myCacheBtn").addEventListener("click", clearMediaCache);
    $("myWipeBtn").addEventListener("click", wipeAllData);
  }

  function paintDataList() {
    const items = mergedItems();
    const list = st.filter === "all" ? items : items.filter((x) => x.type === st.filter);
    $("myDataIntro").textContent = "你在这台设备上提交过的购票、问卷、场地登记和反馈都记在这里。";   // 登录着时下面也会列出账户在其他设备上提交的
    $("myDataList").innerHTML = list.length ? list.map(itemHtml).join("")
      : `<p class="fb-empty">${items.length ? "这一类还没有记录" : "还没有记录"}</p>`;
    return items;
  }

  async function renderDataPanel() {
    if (!st.rendered.data) { st.rendered.data = true; buildDataPanel(); }
    paintDataList();
    if ($("aboutPanelData").hidden) return;
    await Promise.all([loadCloudRecords(), checkReplies(true)]);
    if ($("aboutPanelData").hidden) return;
    const items = paintDataList();
    markRepliesRead(items);
  }

  /* 清除缓存：只删离线缓存里的图片与字体（sw.js 的 hj-media） */
  async function clearMediaCache() {
    try {
      if (!window.caches) { showToast("这个浏览器没有离线缓存"); return; }
      const names = (await caches.keys()).filter((n) => n === "hj-media");
      let n = 0;
      for (const name of names) {
        n += (await (await caches.open(name)).keys()).length;
        await caches.delete(name);
      }
      showToast(n ? `已清除 ${n} 个图片、字体缓存` : "没有需要清除的图片缓存");
    } catch (e) {
      showToast("清除失败，请稍后再试");
    }
  }

  /* 清除数据：先把还没同步的推上去，再退出登录、清空本机的一切，刷新 */
  async function wipeAllData() {
    const msg = "清除这台设备上本网站的全部数据？\n\n本机的提交记录、各种设置、拼图与舞台演奏纪录、登录状态都会删除，网站会刷新。"
      + (st.token ? "\n已同步到账户里的不受影响，之后重新登录就能找回。" : "\n没有登录账户，删掉的找不回来。");
    if (!confirm(msg)) return;
    if (st.token) {
      await syncNow().catch(() => {});
      await callWorker({ action: "account_logout", ...auth() }, { load: "block" });
    }
    try { localStorage.clear(); } catch (e) {}
    try { sessionStorage.clear(); } catch (e) {}
    try { if (window.caches) await Promise.all((await caches.keys()).map((k) => caches.delete(k))); } catch (e) {}
    try {
      const regs = navigator.serviceWorker && navigator.serviceWorker.getRegistrations ? await navigator.serviceWorker.getRegistrations() : [];
      await Promise.all(regs.map((r) => r.unregister()));
    } catch (e) {}
    location.reload();
  }

  /* ==== 网站说明 · 登录与注册 / 我的账户 ==== */
  function serverOptions(selected = "") {
    const groups = typeof TICKET_SERVER_GROUPS !== "undefined" ? TICKET_SERVER_GROUPS : [];
    return `<option value="">服务器</option>` + groups.map((g) =>
      `<optgroup label="【${escapeHtml(g.dc)}】">${g.servers.map((s) => `<option value="${escapeHtml(s)}"${s === selected ? " selected" : ""}>${escapeHtml(s)}</option>`).join("")}</optgroup>`).join("");
  }
  const pwToggle = `<label class="password-show-label acct-show"><input type="checkbox" data-pw-toggle> 显示密码</label>`;
  /* 显示密码 + 自动登录 排一行 */
  const pwOpts = (id) => `<div class="acct-opts">
    <label class="password-show-label"><input type="checkbox" data-pw-toggle> 显示密码</label>
    <label class="password-show-label"><input type="checkbox" id="${id}"> 自动登录</label>
  </div>
  <p class="acct-remember-hint">请不要在网吧或者公用设备上勾选“自动登录”</p>`;

  function guestHtml() {
    return `<div class="acct-wrap">
      <div class="alarm-seg acct-seg" id="acctSeg" role="radiogroup" aria-label="登录或注册"${st.reset ? " hidden" : ""}>
        <label${st.mode === "login" ? ' class="is-active"' : ""}><input type="radio" name="acctMode" value="login"${st.mode === "login" ? " checked" : ""}><span>登录</span></label>
        <label${st.mode === "register" ? ' class="is-active"' : ""}><input type="radio" name="acctMode" value="register"${st.mode === "register" ? " checked" : ""}><span>注册</span></label>
      </div>
      <form class="about-form acct-form" id="acctLoginForm" novalidate${st.mode === "login" && !st.reset ? "" : " hidden"}>
        <div class="about-field"><label class="about-label" for="acctLoginName">用户名</label>
          <input type="text" id="acctLoginName" maxlength="16" autocomplete="username" spellcheck="false" autocapitalize="off"></div>
        <div class="about-field"><label class="about-label" for="acctLoginPw">密码</label>
          <input type="password" id="acctLoginPw" maxlength="64" autocomplete="current-password" data-pw></div>
        ${pwOpts("acctLoginRemember")}
        <div class="verify-host about-verify" id="acctLoginVerify"></div>
        <div class="about-submit-row"><button type="submit" class="share-site-btn" id="acctLoginBtn">登录</button></div>
        <p class="form-msg" id="acctLoginMsg" hidden></p>
        <p class="acct-links"><button type="button" class="about-inline-link" data-acct-tip="forgot">忘记密码？</button></p>
      </form>
      <form class="about-form acct-form" id="acctRegForm" novalidate${st.mode === "register" && !st.reset ? "" : " hidden"}>
        <div class="about-field"><label class="about-label is-required" for="acctRegCode">注册码</label>
          <div class="acct-code-row">
            <input type="text" id="acctRegCode" maxlength="64" autocomplete="off" spellcheck="false" autocapitalize="off">
            <button type="button" class="acct-nocode" data-acct-tip="nocode">没有注册码？</button>
          </div></div>
        <div class="about-field"><label class="about-label is-required" for="acctRegName">用户名</label>
          <p class="about-hint">2~16 位，汉字、字母、数字或 _ - ·，注册后修改需联系管理员；登录时区分大小写</p>
          <input type="text" id="acctRegName" maxlength="16" autocomplete="username" spellcheck="false" autocapitalize="off"></div>
        <div class="about-field"><label class="about-label is-required" for="acctRegPw">密码</label>
          <p class="about-hint">至少 ${PW_MIN} 位</p>
          <input type="password" id="acctRegPw" maxlength="64" autocomplete="new-password" data-pw>
          <p class="acct-pw-note">密码经过多重加密存储在后端，网站和管理员不知道您的密码。<br>但出于安全起见，依然建议您使用与其他网站不同的密码。</p></div>
        <div class="about-field"><label class="about-label is-required" for="acctRegPw2">确认密码</label>
          <input type="password" id="acctRegPw2" maxlength="64" autocomplete="new-password" data-pw></div>
        ${pwOpts("acctRegRemember")}
        <div class="about-field"><label class="about-label" for="acctRegChar">游戏 id（选填）</label>
          <div class="acct-char-row">
            <input type="text" id="acctRegChar" maxlength="12" placeholder="角色名" autocomplete="off" spellcheck="false" autocapitalize="off" aria-label="角色名">
            <select id="acctRegServer" aria-label="服务器">${serverOptions()}</select>
          </div></div>
        <div class="about-field"><label class="about-label" for="acctRegContact">联系方式（选填）</label>
          <input type="text" id="acctRegContact" maxlength="60" autocomplete="off"></div>
        <div class="verify-host about-verify" id="acctRegVerify"></div>
        <div class="about-submit-row"><button type="submit" class="share-site-btn" id="acctRegBtn">注册</button></div>
        <p class="form-msg" id="acctRegMsg" hidden></p>
      </form>
      <form class="about-form acct-form" id="acctResetForm" novalidate${st.reset ? "" : " hidden"}>
        <p class="about-hint acct-reset-who" id="acctResetWho"></p>
        <div class="about-field"><label class="about-label is-required" for="acctResetPw">新密码</label>
          <p class="about-hint">至少 ${PW_MIN} 位</p>
          <input type="password" id="acctResetPw" maxlength="64" autocomplete="new-password" data-pw></div>
        <div class="about-field"><label class="about-label is-required" for="acctResetPw2">确认新密码</label>
          <input type="password" id="acctResetPw2" maxlength="64" autocomplete="new-password" data-pw></div>
        ${pwToggle}
        <div class="about-submit-row"><button type="submit" class="share-site-btn" id="acctResetBtn">设置新密码</button></div>
        <p class="form-msg" id="acctResetMsg" hidden></p>
      </form>
      <div class="about-text acct-promise" id="acctPromise"${st.mode === "register" && !st.reset ? "" : " hidden"}>
        <dl class="about-list">
          <dt>不注册</dt><dd>原则上无需注册即可使用网站全部功能并参与活动。</dd>
          <dt>注册后</dt><dd>在不同设备间同步花街拼图、舞台演奏的纪录和偏好设置；自动填写游戏 id 和联系方式；在任何设备上查看自己提交过的购票、问卷、场地登记和反馈，并收到站长的回复。</dd>
          <dt>隐私</dt><dd>不收集邮箱和手机号。密码在你的浏览器里加密后才发出，网站和站长都看不到你的密码。</dd>
        </dl>
      </div>
    </div>`;
  }

  /* 我的账户顶上的欢迎语：「欢迎 角色名@服务器（用户名），花街一直在这里等你。」@ 显示成小花；没填角色名就只有用户名（不加括号） */
  function welcomeHtml(u) {
    const name = escapeHtml(u.username || "");
    const char = u.charName ? idHtml(u.charServer ? `${u.charName}@${u.charServer}` : u.charName) : "";
    return `欢迎 ${char ? `<b>${char}</b><span class="acct-uname">（${name}）</span>` : `<b>${name}</b>`}，花街一直在这里等你。`;
  }

  function homeHtml() {
    const u = st.user || {};
    const env = !!u.envAdmin;
    return `<div class="acct-wrap about-form acct-home">
      <div class="acct-hello">
        <span class="acct-name">${welcomeHtml(u)}</span>
        <span class="acct-role${isInternal(u) ? " is-internal" : ""}">${escapeHtml(ROLE_NAMES[u.role] || ROLE_NAMES.u)}</span>
      </div>
      ${u.mustChange ? `<p class="acct-must">这个账户还在用初始密码，请先在下面「修改密码」里改掉。</p>` : ""}
      <form id="acctProfileForm" novalidate>
        <p class="about-label">我的资料</p>
        <div class="acct-char-row">
          <input type="text" id="acctChar" maxlength="12" placeholder="角色名" value="${escapeHtml(u.charName || "")}" autocomplete="off" spellcheck="false" aria-label="角色名">
          <select id="acctServer" aria-label="服务器">${serverOptions(u.charServer || "")}</select>
        </div>
        <input type="text" id="acctContact" class="acct-contact" maxlength="60" placeholder="联系方式" value="${escapeHtml(u.contact || "")}" autocomplete="off" aria-label="联系方式">
        <div class="about-submit-row"><button type="submit" class="share-site-btn">保存资料</button></div>
        <p class="form-msg" id="acctProfileMsg" hidden></p>
      </form>
      <div class="acct-sec">
        <p class="about-label">同步</p>
        <p class="about-hint">花街拼图与舞台演奏的纪录、玩家名称、吟游诗人与舞台演奏的常用设置、小游戏助手的设置，会在登录了这个账户的设备之间自动同步。动画档位、音量、判定延迟这些跟设备有关的不同步。</p>
        <p class="acct-sync-state" id="acctSyncState"></p>
        <div class="group-btn-row"><button type="button" class="share-site-btn" id="acctSyncBtn">立即同步</button></div>
      </div>
      <details class="acct-more" id="acctPwBox"${u.mustChange ? " open" : ""}>
        <summary>修改密码</summary>
        ${env ? `<p class="about-hint">站长账户的密码放在 Cloudflare 的 Worker 设置里（ADMIN_PASSWORD），在那里修改；改完之后所有设备都要重新登录。</p>` : `
        <form id="acctPwForm" novalidate>
          <input type="password" id="acctPwOld" maxlength="64" placeholder="当前密码" autocomplete="current-password" data-pw aria-label="当前密码">
          <input type="password" id="acctPwNew" maxlength="64" placeholder="新密码（至少 ${PW_MIN} 位）" autocomplete="new-password" data-pw aria-label="新密码">
          <input type="password" id="acctPwNew2" maxlength="64" placeholder="再输一次新密码" autocomplete="new-password" data-pw aria-label="确认新密码">
          ${pwToggle}
          <p class="about-hint">修改后，其他设备上的登录会全部退出。</p>
          <div class="about-submit-row"><button type="submit" class="share-site-btn">修改密码</button></div>
          <p class="form-msg" id="acctPwMsg" hidden></p>
        </form>`}
      </details>
      <details class="acct-more" id="acctDevBox">
        <summary>登录设备</summary>
        <div class="acct-devices" id="acctDevList"><p class="fb-empty">加载中…</p></div>
        <div class="group-btn-row"><button type="button" class="share-site-btn" id="acctDevOthersBtn">让其他设备都退出</button></div>
      </details>
      <details class="acct-more" id="acctDangerBox">
        <summary>导出与注销</summary>
        <p class="about-hint">导出：把账户资料、在各设备上提交过的记录和同步的数据下载成一个 JSON 文件。</p>
        <div class="group-btn-row"><button type="button" class="share-site-btn" id="acctExportBtn">导出我的数据</button></div>
        ${env ? `<p class="about-hint">站长账户不能注销。</p>` : `
        <p class="about-hint">注销：删除账户、同步的数据和所有登录。已经提交的购票、问卷、场地登记和反馈照常有效，只是不再和账户关联。注销后不能恢复。</p>
        <form id="acctDelForm" novalidate>
          <input type="password" id="acctDelPw" maxlength="64" placeholder="输入密码确认" autocomplete="current-password" aria-label="输入密码确认注销">
          <div class="about-submit-row"><button type="submit" class="share-site-btn is-danger">注销账户</button></div>
          <p class="form-msg" id="acctDelMsg" hidden></p>
        </form>`}
      </details>
      <div class="group-btn-row acct-logout-row">
        <button type="button" class="share-site-btn" id="acctLogoutBtn">退出登录</button>
      </div>
    </div>`;
  }

  /* 登录状态变了才整块重画；同一状态下只更新里面的字 */
  function renderAccountPanel() {
    const panel = $("aboutPanelAccount");
    const home = st.token && !st.reset;
    const key = home ? `home:${st.user ? [st.user.username, st.user.role, st.user.mustChange, st.user.envAdmin].join("|") : ""}` : `guest:${st.reset ? "reset" : st.mode}`;
    if (st.rendered.account === key) { paintSyncState(); return; }
    st.rendered.account = key;
    Object.values(st.gates).forEach((g) => g.close());
    st.gates = {};
    panel.innerHTML = home ? homeHtml() : guestHtml();
    if (home) bindHome();
    else bindGuest();
    paintSyncState();
  }

  const panelShowing = () => !$("siteAboutOverlay").hidden && !$("aboutPanelAccount").hidden;

  function bindGuest() {
    const panel = $("aboutPanelAccount");
    const gateFor = (host, mode) => {
      const el = $(host);
      return createFormGate(el, {
        shouldOpen: () => el.isConnected && panelShowing() && !st.token && !st.reset && st.mode === mode,
        onPass: () => setMsg($(mode === "login" ? "acctLoginMsg" : "acctRegMsg"), ""),
      });
    };
    st.gates = { login: gateFor("acctLoginVerify", "login"), register: gateFor("acctRegVerify", "register") };
    $("acctSeg").addEventListener("change", (e) => {
      syncSegments(e.currentTarget);
      st.mode = e.target.value;
      st.rendered.account = `guest:${st.mode}`;
      $("acctLoginForm").hidden = st.mode !== "login";
      $("acctRegForm").hidden = st.mode !== "register";
      $("acctPromise").hidden = st.mode !== "register";
      openGates();
      $(st.mode === "login" ? "acctLoginName" : "acctRegName").focus({ preventScroll: true });
    });
    $("acctLoginForm").addEventListener("submit", submitLogin);
    $("acctRegForm").addEventListener("submit", submitRegister);
    $("acctResetForm").addEventListener("submit", submitReset);
    bindCommon(panel);
    if (st.reset) paintReset();
    openGates();
  }

  function bindCommon(panel) {
    panel.querySelectorAll("[data-pw-toggle]").forEach((box) => box.addEventListener("change", () => {
      box.closest("form, .acct-more, .acct-wrap").querySelectorAll("input[data-pw]").forEach((el) => { el.type = box.checked ? "text" : "password"; });
    }));
    panel.addEventListener("click", (e) => {
      const tip = e.target.closest("[data-acct-tip]");
      if (tip) openTip(TIPS[tip.dataset.acctTip]);
    });
  }

  function openGates() {
    Object.entries(st.gates).forEach(([mode, g]) => { if (mode !== st.mode) g.close(); });
    if (st.gates[st.mode]) st.gates[st.mode].open();
  }

  async function submitLogin(e) {
    e.preventDefault();
    const msg = $("acctLoginMsg");
    const name = $("acctLoginName").value.trim();
    const pw = $("acctLoginPw").value;
    if (!name || !pw) { setMsg(msg, "请填写用户名和密码"); return; }
    const gate = st.gates.login;
    const need = gate.missing();
    if (need) { setMsg(msg, need); return; }
    const btn = $("acctLoginBtn");
    btn.disabled = true;
    setMsg(msg, "登录中…");
    const data = await login(name, pw, { proof: gate.proof(), remember: $("acctLoginRemember").checked });
    btn.disabled = false;
    if (!data.ok) {
      if (data.error !== "locked" && data.error !== "no_crypto") gate.sync(true);   // 验证凭证已经用掉了，换一题
      setMsg(msg, errorText(data));
      return;
    }
    showToast(`欢迎回来，${data.user.username}`);
  }

  async function submitRegister(e) {
    e.preventDefault();
    const msg = $("acctRegMsg");
    const name = $("acctRegName").value.trim();
    const pw = $("acctRegPw").value;
    const code = $("acctRegCode").value.trim();
    const charName = typeof normalizeTicketName === "function" ? normalizeTicketName($("acctRegChar").value) : $("acctRegChar").value.trim();
    const charServer = $("acctRegServer").value;
    const contact = $("acctRegContact").value.trim();
    const bad = checkUsername(name) || checkPw(pw, $("acctRegPw2").value)
      || (!code ? ERRORS.need_code : "")
      || (charName && typeof ticketNameError === "function" && ticketNameError(charName) ? `游戏 id：${ticketNameError(charName)}` : "");
    if (bad) { setMsg(msg, bad); return; }
    const gate = st.gates.register;
    const need = gate.missing();
    if (need) { setMsg(msg, need); return; }
    const btn = $("acctRegBtn");
    btn.disabled = true;
    setMsg(msg, "注册中…");
    let derived;
    try { derived = await derivePw(name, pw); } catch (err) { btn.disabled = false; setMsg(msg, ERRORS.no_crypto); return; }
    const remember = $("acctRegRemember").checked;
    const data = await callWorker({ action: "account_register", username: name, pw: derived, code, charName, charServer, contact, ...(remember ? { remember } : {}), ...gate.proof() }, { load: "block" });
    btn.disabled = false;
    if (!data || !data.ok) {
      /* 查重名等在人机验证之前，凭证还能用；验证之后的（注册码不对等）凭证已经用掉了，换一题 */
      if (!data || !REG_BEFORE_CAPTCHA.includes(data.error)) gate.sync(true);
      setMsg(msg, errorText(data, "注册失败，请稍后再试"));
      return;
    }
    signIn(data, remember);
    showToast("注册成功，已经登录");
  }

  function paintReset() {
    const r = st.reset;
    $("acctResetWho").innerHTML = r.checking ? "正在检查重置链接…"
      : r.username ? `给账户 <b>${escapeHtml(r.username)}</b> 设置新密码` : escapeHtml(ERRORS.bad_token);
    $("acctResetBtn").disabled = !r.username;
  }

  async function submitReset(e) {
    e.preventDefault();
    const r = st.reset;
    const msg = $("acctResetMsg");
    if (!r || !r.username) return;
    const pw = $("acctResetPw").value;
    const bad = checkPw(pw, $("acctResetPw2").value);
    if (bad) { setMsg(msg, bad); return; }
    $("acctResetBtn").disabled = true;
    setMsg(msg, "设置中…");
    let derived;
    try { derived = await derivePw(r.username, pw); } catch (err) { setMsg(msg, ERRORS.no_crypto); return; }
    const data = await callWorker({ action: "password_reset", token: r.token, pw: derived }, { load: "block" });
    $("acctResetBtn").disabled = false;
    if (!data || !data.ok) { setMsg(msg, errorText(data)); return; }
    signIn(data);
    showToast("新密码已设置好，已经登录");
  }

  /* 打开 网址/#reset=令牌（管理页生成的重置链接） */
  async function openReset(token) {
    st.reset = { token, username: "", checking: true };   // 登录着别的账户也先不退出：设好新密码时才换成这个账户
    if (typeof openSiteAbout === "function") openSiteAbout("account");
    renderAccountPanel();
    paintReset();
    const data = await callWorker({ action: "password_reset_check", token }, { load: "block" });
    if (!st.reset || st.reset.token !== token) return;
    st.reset.checking = false;
    st.reset.username = data && data.ok ? data.username : "";
    paintReset();
    if (!data) setMsg($("acctResetMsg"), ERRORS.net);
  }

  function bindHome() {
    const panel = $("aboutPanelAccount");
    bindCommon(panel);
    $("acctProfileForm").addEventListener("submit", saveProfile);
    $("acctSyncBtn").addEventListener("click", async (e) => {
      e.currentTarget.disabled = true;
      const ok = await trackLoad(syncNow(), "block");
      e.currentTarget.disabled = false;
      showToast(ok ? "同步好了" : st.syncErr || "同步失败");
    });
    $("acctPwForm")?.addEventListener("submit", changePassword);
    $("acctDelForm")?.addEventListener("submit", deleteAccount);
    $("acctDevBox").addEventListener("toggle", (e) => { if (e.currentTarget.open) loadDevices(); });
    $("acctDevOthersBtn").addEventListener("click", async () => {
      if (!confirm("让除了这台以外的设备都退出登录？")) return;
      const data = await callWorker({ action: "account_session_revoke", ...auth(), others: true }, { load: "block" });
      showToast(data && data.ok ? "其他设备都已退出" : errorText(data));
      loadDevices();
    });
    $("acctDevList").addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-dev]");
      if (!btn) return;
      const data = await callWorker({ action: "account_session_revoke", ...auth(), id: btn.dataset.dev }, { load: "block" });
      showToast(data && data.ok ? "这台设备已退出" : errorText(data));
      loadDevices();
    });
    $("acctExportBtn").addEventListener("click", exportData);
    $("acctLogoutBtn").addEventListener("click", () => logout());
  }

  function paintSyncState() {
    const el = $("acctSyncState");
    if (!el) return;
    el.textContent = st.syncing ? "同步中…"
      : st.syncErr ? `上次同步没成功：${st.syncErr}`
      : st.syncedAt ? `上次同步：${formatCnTime(st.syncedAt + (typeof hjClockOffset === "number" ? hjClockOffset : 0))}` : "";
  }

  async function saveProfile(e) {
    e.preventDefault();
    const msg = $("acctProfileMsg");
    const charName = typeof normalizeTicketName === "function" ? normalizeTicketName($("acctChar").value) : $("acctChar").value.trim();
    $("acctChar").value = charName;
    const charServer = $("acctServer").value;
    const contact = $("acctContact").value.trim();
    const bad = charName && typeof ticketNameError === "function" ? ticketNameError(charName) : "";
    if (bad) { setMsg(msg, `游戏 id：${bad}`); return; }
    if (charName && !charServer) { setMsg(msg, "请选择服务器"); return; }
    setMsg(msg, "保存中…");
    const data = await callWorker({ action: "account_profile", ...auth(), charName, charServer, contact }, { load: "block" });
    if (!data || !data.ok) { setMsg(msg, errorText(data, "保存失败，请稍后再试")); return; }
    setMsg(msg, "");
    applyUser(data.user);
    showToast("资料已保存");
  }

  async function changePassword(e) {
    e.preventDefault();
    const msg = $("acctPwMsg");
    const old = $("acctPwOld").value;
    const pw = $("acctPwNew").value;
    const min = st.user && st.user.role === "c" ? 8 : PW_MIN;   // 管理员账户的密码再长一点
    const bad = (!old ? "请填写当前密码" : "") || checkPw(pw, $("acctPwNew2").value, { min });
    if (bad) { setMsg(msg, bad); return; }
    setMsg(msg, "修改中…");
    let oldPw, newPw;
    try {
      [oldPw, newPw] = await Promise.all([derivePw(st.user.kdfName || st.user.username, old), derivePw(st.user.username, pw)]);
    } catch (err) { setMsg(msg, ERRORS.no_crypto); return; }
    const data = await callWorker({ action: "account_password", ...auth(), oldPw, newPw }, { load: "block" });
    if (!data || !data.ok) { setMsg(msg, errorText(data, "修改失败，请稍后再试")); return; }
    setMsg(msg, "");
    applyUser(data.user);
    showToast("密码已修改，其他设备需要重新登录");
  }

  async function deleteAccount(e) {
    e.preventDefault();
    const msg = $("acctDelMsg");
    const pw = $("acctDelPw").value;
    if (!pw) { setMsg(msg, "请输入密码确认"); return; }
    if (!confirm(`确定注销账户「${st.user.username}」吗？注销后不能恢复。`)) return;
    let derived;
    try { derived = await derivePw(st.user.kdfName || st.user.username, pw); } catch (err) { setMsg(msg, ERRORS.no_crypto); return; }
    const data = await callWorker({ action: "account_delete", ...auth(), pw: derived }, { load: "block" });
    if (!data || !data.ok) { setMsg(msg, errorText(data, "注销失败，请稍后再试")); return; }
    signOutLocal("账户已注销");
  }

  async function loadDevices() {
    const box = $("acctDevList");
    const data = await callWorker({ action: "account_sessions", ...auth() }, { load: "corner" });
    if (!box.isConnected) return;
    if (!data || !data.ok) { box.innerHTML = `<p class="fb-empty">${escapeHtml(errorText(data, "读取失败"))}</p>`; return; }
    box.innerHTML = data.items.map((d) => `<div class="acct-device${d.current ? " is-current" : ""}">
      <div><b>${escapeHtml(d.device || "未知设备")}</b>${d.current ? "<em>这台</em>" : ""}
        <small>${escapeHtml([typeof geoText === "function" ? geoText(d.geo) : "", `最近使用 ${formatCnTime(d.seenAt)}`].filter(Boolean).join(" · "))}</small></div>
      ${d.current ? "" : `<button type="button" class="pill-btn-outline" data-dev="${escapeHtml(d.id)}">退出</button>`}
    </div>`).join("") || `<p class="fb-empty">没有登录中的设备</p>`;
  }

  async function exportData() {
    const data = await callWorker({ action: "account_export", ...auth() }, { load: "block" });
    if (!data || !data.ok) { showToast(errorText(data, "导出失败")); return; }
    const { ok: _ok, ...rest } = data;
    rest.localRecords = readRecords().map(({ receipt: _r, ...r }) => r);
    downloadBlob(new Blob([JSON.stringify(rest, null, 2)], { type: "application/json" }), `花街账户-${st.user.username}-${cnDate(0)}.json`);
  }

  /* 小提示卡 */
  function openTip(text) {
    $("acctTipText").textContent = text;
    $("acctTipOverlay").hidden = false;
    playEnterAnim($("acctTipOverlay").firstElementChild);
  }
  const closeTip = () => { $("acctTipOverlay").hidden = true; };

  /* 网站说明切到某个标签时（main.js 的 switchAboutTab 调用） */
  function onAboutTab(tab) {
    if (tab === "thanks") renderThanksPanel();
    else if (tab === "data") renderDataPanel();
    else if (tab === "account") { renderAccountPanel(); openGates(); if (st.token) loadCloudRecords(); }
  }

  function init() {
    renderAccountPanel();
    $("aboutAccountTab").textContent = st.token ? "我的账户" : "登录与注册";
    $("acctTipClose").addEventListener("click", closeTip);
    closeOnBackdrop($("acctTipOverlay"), closeTip);
    paintDots();
    document.addEventListener("visibilitychange", () => { if (document.hidden && st.token && localDirty()) syncNow(); });
    window.addEventListener("pagehide", () => { if (st.token && localDirty()) syncNow(); });
    HJ.late(() => runQuietly(() => checkReplies()));
  }

  loadState();
  window.HJAccount = {
    init, auth, token: () => st.token, user: () => st.user, isInternal, ROLE_NAMES, INTERNAL_ROLES,
    login, logout, applyUser, applySite, errorText, onChange: (fn) => st.listeners.add(fn),
    record, fillTicket, fillVenue, fillFeedback, syncNow, syncSoon, openReset, onAboutTab, closeTip,
    charId: () => charIdOf(),
  };
})();
