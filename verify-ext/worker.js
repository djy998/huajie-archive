/* =============================================================================
   花街档案 · Cloudflare Worker
   -----------------------------------------------------------------------------
   职责：内部入口密码校验、公告板（D1 + R2 配图）、站点开关、星芒节时间覆盖、
         人机验证（Turnstile；国内加载不了时可在「狒科生 / 文科生 / 理科生」里任选一种，
         见文件后半段的「手动人机验证」一节）、点赞、通用限流、活动购票。
   请求约定：除 GET /image/<key> 外，其余接口一律 POST JSON：{ action, ...参数 }。

   需要的绑定（Worker → 设置 → 绑定）：
     DB                   D1 数据库（表结构见 schema.sql）
     ANNOUNCEMENT_IMAGES  R2 存储桶（公告配图）
   需要的机密（Worker → 设置 → 变量和机密，类型选「密钥 / Secret」）：
     PASSWORD_A / PASSWORD_B / PASSWORD_C   三种身份的密码，C 为管理员
     TURNSTILE_SECRET_KEY                   Turnstile 后端密钥
     LOGIN_GUARD_SECRET（可选）              IP 哈希用的 pepper，未设置时退回 PASSWORD_C
                                            （手动验证的题目 / 通行证也复用它加密）
   可选变量（普通文本，不是机密）：
     HJ_SITE_ORIGIN                         狒科生的职业图标从哪个站点取，默认本站域名
   ============================================================================= */

/* -----------------------------------------------------------------------------
   基础配置
   ----------------------------------------------------------------------------- */
const ROLES = ["a", "b", "c"];
const ADMIN_ROLE = "c";

/* 部署自检：浏览器直接打开 <Worker 地址>/ping 就能看到这段。
   - 打不开（超时 / 连接失败）→ 这个域名访问不到（workers.dev 在国内被墙）
   - 打开了但 version 不是下面这个 → 新代码没部署成功
   改动代码时顺手更新一下日期即可。 */
const WORKER_VERSION = "2026-09-18d";
const WORKER_FEATURES = ["announcements", "lockdown", "starlight", "likes", "turnstile", "math-captcha", "tickets", "manual-verify"];

/* 管理员防爆破：同一来源在 15 分钟窗口内累计输错 3 次，隐藏封锁管理员 C 15 分钟。
   A、B 不受影响；封锁期间输入正确的 C 也按"密码错误"处理，对外不可区分。 */
const MAX_INVALID_ATTEMPTS = 3;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const ADMIN_BLOCK_MS = 15 * 60 * 1000;

/* 通用限流：action → 窗口内最多请求次数。未列出的 action 不限流。 */
const RATE_LIMITS = {
  verify_turnstile:          { limit: 12, windowSec: 60 },
  get_math_challenge:        { limit: 30, windowSec: 60 },
  get_verify_task:           { limit: 60, windowSec: 60 },   // 手动验证出题（狒科生 / 文科生 / 理科生）
  get_verify_hint:           { limit: 40, windowSec: 60 },   // 飞花令提示
  verify_answer:             { limit: 40, windowSec: 60 },   // 手动验证交卷
  get_announcements:         { limit: 20, windowSec: 60 },
  upload_announcement_image: { limit: 10, windowSec: 3600 },
  post_announcement:         { limit: 30, windowSec: 3600 },
  edit_announcement:         { limit: 30, windowSec: 3600 },
  delete_announcement:       { limit: 30, windowSec: 3600 },
  set_lockdown:              { limit: 20, windowSec: 3600 },
  set_starlight:             { limit: 20, windowSec: 3600 },
  get_likes:                 { limit: 60, windowSec: 60 },   // 批量读取，页面渲染时调用
  add_like:                  { limit: 25, windowSec: 60 },   // 另有每人每日上限，这里只防脚本连点
  submit_ticket:             { limit: 6,  windowSec: 600 },  // 另有人机验证
  lookup_ticket:             { limit: 10, windowSec: 600 },  // 防止批量试探联系方式
  get_ticket_status:         { limit: 60, windowSec: 60 },
  ticket_admin_set:          { limit: 60, windowSec: 3600 },
  ticket_admin_clear:        { limit: 5,  windowSec: 3600 },
};

/* 活动购票
   - 「日」按国服时间（UTC+8）0 点切换，与 likeDayStr 相同
   - 设置存在 site_flags：ticket_open / ticket_daily_limit / ticket_allow_pending
   - 第一位持票人（id + 区服）始终必填，ticket_allow_pending 只影响第二位起
   - 提交时若当日已售 + 本单数量 > 限额，仍然接受，但整单标记 over_limit = 1；
     超额订单同样计入已售数量 */
const TICKET_MAX_QTY = 5;
const TICKET_DEFAULT_LIMIT = 100;
const TICKET_MAX_LIMIT = 100000;
const TICKET_CONTACT_MAX = 40;
const TICKET_NAME_MAX = 30;
const TICKET_MESSAGE_MAX = 200;
const TICKET_SERVERS = [
  "拉诺西亚", "幻影群岛", "神意之地", "萌芽池", "红玉海", "宇宙和音", "沃仙曦染",
  "晨曦王座", "潮风亭", "神拳痕", "白银乡", "白金幻象", "旅人栈桥", "拂晓之间",
  "龙巢神殿", "梦羽宝境", "紫水栈桥", "延夏", "静语庄园", "摩杜纳", "海猫茶屋",
  "柔风海湾", "琥珀原", "水晶塔", "银泪湖", "太阳海岸", "伊修加德", "红茶川",
];
const TICKET_FLAG_KEYS = { open: "ticket_open", limit: "ticket_daily_limit", allowPending: "ticket_allow_pending" };

/* 点赞：target_key 前缀区分目标类型
     act:<活动 id>（最新活动为 act:latest） / mini:<图片文件名> / info:<图片文件名>
   同一访客可对同一目标重复点赞，每人每日（UTC+8）最多 LIKE_DAILY_LIMIT 次。 */
const LIKE_DAILY_LIMIT = 10;
const LIKE_KEY_PATTERN = /^(act|mini|info):[\w.\-]{1,120}$/;
const LIKE_BATCH_MAX = 200;

/* 公告配图 */
const MAX_IMAGE_BASE64_LENGTH = 8 * 1024 * 1024;   // 前端已压缩，这里只做兜底
const IMAGE_TYPES = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };
const IMAGE_KEY_PREFIX = "announcements/";
const IMAGE_URL_PATTERN = /^https:\/\/[^\s"'<>()]+\/image\/announcements\/[\w-]+\.(?:webp|jpg|png)$/;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/* -----------------------------------------------------------------------------
   通用工具
   ----------------------------------------------------------------------------- */
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function notFound() {
  return new Response("not found", { status: 404, headers: CORS_HEADERS });
}

function bytesToHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/* 等长比较，避免按字符提前返回带来的耗时差 */
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function toPositiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/* UTC+8 的 YYYY-MM-DD，点赞"每日"以此切换 */
function likeDayStr(now = Date.now()) {
  return new Date(now + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function placeholders(list) {
  return list.map(() => "?").join(", ");
}

/* -----------------------------------------------------------------------------
   身份与访客标识
   ----------------------------------------------------------------------------- */
function getPasswords(env) {
  return { a: env.PASSWORD_A, b: env.PASSWORD_B, c: env.PASSWORD_C };
}

function matchPassword(password, env) {
  if (typeof password !== "string" || !password) return null;
  const passwords = getPasswords(env);
  for (const role of ROLES) {
    if (!passwords[role]) continue;   // 未配置的身份一律视为不可登录
    if (safeEqual(passwords[role], password)) return role;
  }
  return null;
}

/* 访客标识 = SHA-256(pepper + IP)。数据库里不保存原始 IP。
   注意：更换 pepper 会让所有访客标识变化（已赞记录、限流计数随之重置）。 */
async function getClientKey(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const pepper = env.LOGIN_GUARD_SECRET || env.PASSWORD_C || "";
  const input = new TextEncoder().encode(`${pepper}\n${ip}`);
  return bytesToHex(await crypto.subtle.digest("SHA-256", input));
}

/* 失败响应加随机延迟，让"普通输错"与"封锁期间输对 C"在耗时上难以区分 */
function concealFailureDelay() {
  const delay = 180 + Math.floor(Math.random() * 141);
  return new Promise((resolve) => setTimeout(resolve, delay));
}

async function readLoginGuard(env, clientKey) {
  return env.DB.prepare(
    "SELECT failed_count, first_failed_at, blocked_until FROM admin_login_guard WHERE client_key = ?"
  ).bind(clientKey).first();
}

async function recordInvalidAttempt(env, clientKey, row, now) {
  let failedCount = 1;
  let firstFailedAt = now;

  // 仍在统计窗口内且未处于封锁状态时累加；否则从 1 重新计数
  const oldBlockedUntil = Number(row?.blocked_until || 0);
  const oldFirstFailedAt = Number(row?.first_failed_at || 0);
  if (row && oldBlockedUntil === 0 && oldFirstFailedAt > now - ATTEMPT_WINDOW_MS) {
    failedCount = Number(row.failed_count || 0) + 1;
    firstFailedAt = oldFirstFailedAt;
  }

  const blockedUntil = failedCount >= MAX_INVALID_ATTEMPTS ? now + ADMIN_BLOCK_MS : 0;

  await env.DB.prepare(
    `INSERT INTO admin_login_guard (client_key, failed_count, first_failed_at, blocked_until, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(client_key) DO UPDATE SET
       failed_count    = excluded.failed_count,
       first_failed_at = excluded.first_failed_at,
       blocked_until   = excluded.blocked_until,
       updated_at      = excluded.updated_at`
  ).bind(clientKey, failedCount, firstFailedAt, blockedUntil, now).run();
}

/* 返回 "a" / "b" / "c" / null。
   A、B 在检查封锁之前就放行，因此不受管理员封锁影响。 */
async function authenticate(ctx, password) {
  const { request, env } = ctx;
  const role = matchPassword(password, env);
  if (role === "a" || role === "b") return role;

  const now = Date.now();
  const clientKey = await ctx.clientKey();
  const row = await readLoginGuard(env, clientKey);

  // 封锁期间：正确的 C 与错误密码走同一分支
  if (Number(row?.blocked_until || 0) > now) {
    await concealFailureDelay();
    return null;
  }

  if (role === ADMIN_ROLE) {
    // 登录成功，清掉该来源之前的错误记录
    if (row) {
      await env.DB.prepare("DELETE FROM admin_login_guard WHERE client_key = ?").bind(clientKey).run();
    }
    return role;
  }

  await recordInvalidAttempt(env, clientKey, row, now);
  await concealFailureDelay();
  return null;
}

async function isAdmin(ctx) {
  return (await authenticate(ctx, ctx.body.password)) === ADMIN_ROLE;
}

/* -----------------------------------------------------------------------------
   限流（滑动窗口，逐条记录请求时间戳）
   ----------------------------------------------------------------------------- */
async function checkRateLimit(env, clientKey, action) {
  const rule = RATE_LIMITS[action];
  if (!rule) return true;

  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - rule.windowSec;

  try {
    // 顺带清理本 key 的过期记录，防止表无限增长
    await env.DB
      .prepare("DELETE FROM rate_limits WHERE client_key = ? AND action = ? AND ts < ?")
      .bind(clientKey, action, windowStart)
      .run();

    const row = await env.DB
      .prepare("SELECT COUNT(*) AS n FROM rate_limits WHERE client_key = ? AND action = ? AND ts >= ?")
      .bind(clientKey, action, windowStart)
      .first();
    if (Number(row?.n || 0) >= rule.limit) return false;

    await env.DB
      .prepare("INSERT INTO rate_limits (client_key, action, ts) VALUES (?, ?, ?)")
      .bind(clientKey, action, now)
      .run();
    return true;
  } catch (e) {
    // 限流自身出错（如表未建）时放行，只记日志，不影响正常请求
    console.error("rate limit check failed", e);
    return true;
  }
}

/* -----------------------------------------------------------------------------
   Turnstile 后端校验
   前端组件回调只代表浏览器走完了挑战，是否可信必须由 siteverify 确认。
   ----------------------------------------------------------------------------- */
async function verifyTurnstileToken(env, token, request) {
  if (!token) return false;
  if (!env.TURNSTILE_SECRET_KEY) {
    console.error("TURNSTILE_SECRET_KEY 未配置，校验一律失败");
    return false;
  }
  const form = new URLSearchParams();
  form.append("secret", env.TURNSTILE_SECRET_KEY);
  form.append("response", token);
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) form.append("remoteip", ip);

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
    });
    const outcome = await res.json();
    return !!outcome.success;
  } catch (e) {
    console.error("siteverify 请求失败", e);
    return false;
  }
}

/* -----------------------------------------------------------------------------
   算术题验证（Turnstile 在国内常被拦截时的备用方案）
   - 题目无状态：challenge = "<过期时间>.<随机串>.<签名>"，签名 = HMAC(过期时间.随机串.答案)
     前端拿不到答案，只能把用户算出的数交回来，由 Worker 重算签名比对
   - 每道题只能用一次（无论答对答错），用过的随机串记在 rate_limits 表（action = 'math_used'）
   - 密钥复用 LOGIN_GUARD_SECRET（未设置时退回 PASSWORD_C），不需要新增机密
   ----------------------------------------------------------------------------- */
const MATH_TTL_MS = 10 * 60 * 1000;
const MATH_USED_ACTION = "math_used";

async function mathSign(env, text) {
  const secret = env.LOGIN_GUARD_SECRET || env.PASSWORD_C;
  if (!secret) throw new Error("math captcha secret missing");
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode("math:" + secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  return bytesToHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text)));
}

const randInt = (min, max) => min + Math.floor((crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32) * (max - min + 1));

async function createMathChallenge(env) {
  // 只出 20 以内加减法和九九乘法表，尽量不给访客添麻烦
  let question;
  let answer;
  switch (randInt(0, 2)) {
    case 0: {
      const a = randInt(2, 17), b = randInt(2, 20 - a);
      question = `${a} + ${b}`; answer = a + b;
      break;
    }
    case 1: {
      const a = randInt(5, 20), b = randInt(2, a - 2);
      question = `${a} − ${b}`; answer = a - b;
      break;
    }
    default: {
      const a = randInt(2, 9), b = randInt(2, 9);
      question = `${a} × ${b}`; answer = a * b;
    }
  }
  const exp = Date.now() + MATH_TTL_MS;
  const nonce = bytesToHex(crypto.getRandomValues(new Uint8Array(9)));
  const sig = await mathSign(env, `${exp}.${nonce}.${answer}`);
  return { challenge: `${exp}.${nonce}.${sig}`, question };
}

async function verifyMathChallenge(env, math) {
  const challenge = typeof math?.challenge === "string" ? math.challenge : "";
  const answer = Number(math?.answer);
  const m = /^(\d{13})\.([0-9a-f]{18})\.([0-9a-f]{64})$/.exec(challenge);
  if (!m || !Number.isInteger(answer) || Math.abs(answer) > 100000) return false;
  const [, expStr, nonce, sig] = m;
  const now = Date.now();
  if (Number(expStr) < now) return false;

  // 先作废这道题（答错也作废），防止同一题反复猜
  await env.DB.prepare("DELETE FROM rate_limits WHERE action = ? AND ts < ?")
    .bind(MATH_USED_ACTION, now - MATH_TTL_MS).run();
  const used = await env.DB.prepare(
    `INSERT INTO rate_limits (client_key, action, ts)
     SELECT ?, ?, ? WHERE NOT EXISTS
       (SELECT 1 FROM rate_limits WHERE client_key = ? AND action = ?)`
  ).bind(nonce, MATH_USED_ACTION, now, nonce, MATH_USED_ACTION).run();
  if (!used.meta?.changes) return false;

  return safeEqual(await mathSign(env, `${expStr}.${nonce}.${answer}`), sig);
}

/* 统一的人机校验，三种凭证任一种通过即可：
     1) body.verifyPass —— 手动验证（狒科生 / 文科生 / 理科生）答对后拿到的一次性通行证
     2) body.math       —— 旧版算术题（保留兼容，老页面缓存里还会用到）
     3) body.token      —— Cloudflare Turnstile
   通行证是一次性的：消费过 / 过期都会返回 false，前端会提示重新验证。 */
async function verifyHuman(ctx) {
  const { env, body, request } = ctx;
  if (body.verifyPass) return hjConsumePass(env, body.verifyPass);
  if (body.math) return verifyMathChallenge(env, body.math);
  return verifyTurnstileToken(env, body.token, request);
}

/* -----------------------------------------------------------------------------
   手动人机验证：狒科生（看图标选职业）/ 文科生（飞花令）/ 理科生（算术题）
   -----------------------------------------------------------------------------
   配合前端 verify.js（window.HJVerify）的四个 action：
     get_verify_task   要一道题（mode = ff14 / poem / math）
     get_verify_hint   文科生的提示（20 个字，能拼出题库里的一句）
     verify_answer     交卷（前端只交 id + 答案，判卷在服务端）
     verify_ping       自检（版本、题库规模、图标来源）
   设计要点：
   - 题目和通行证都是「无状态暗号」：AES-GCM 加密 + 认证，密钥由 LOGIN_GUARD_SECRET
     （未设置时用 PASSWORD_C）派生。答案只存在暗号里，前端既看不到也伪造不了；
     不需要新建任何数据表——「一道题只发一张通行证」「通行证只能用一次」借
     rate_limits 表记一笔帐（数据库不可用时自动放行，不影响正常访客）。
   - 飞花令：令字只用最常用最简单的 20 个字（HJV_KEYWORDS）；提示只从「中小学必背」
     题库（HJV_POEM_COMMON）里挑；判定则把常用 + 扩展（高中 / 大学 / 偏门诗词，
     HJV_POEM_EXTRA）一起比对，题库里再没有就走宽松判定（HJV_POEM_STRICT = true 可关掉），
     尽量不让会背诗的访客吃闭门羹。
   - 狒科生的职业图标由 Worker 从站点目录 jobicon/ 取回、以 data URL 内联进题目，
     地址里不含职业名，看源码也抄不到答案。
   可选环境变量：HJ_SITE_ORIGIN —— jobicon/ 所在站点（默认下面 HJV_DEFAULT_ORIGIN）。
   ----------------------------------------------------------------------------- */
const HJV_TASK_TTL_MS = 10 * 60 * 1000;     // 一道题的有效期
const HJV_PASS_TTL_MS = 10 * 60 * 1000;     // 通行证有效期（一次性）
const HJV_HINT_CHARS = 20;                  // 提示给多少个字
const HJV_POEM_MIN = 5;                     // 判定：至少几个汉字（标点不算）
const HJV_POEM_MAX = 40;                    // 判定：最多几个汉字
const HJV_POEM_STRICT = false;              // true = 只认题库里的句子（默认宽松判定）
const HJV_ICON_CACHE_MAX = 48;
const HJV_DEFAULT_ORIGIN = "https://swayingsussurrusstreet.dpdns.org";
const HJV_USED_TASK = "verify_task_used";   // 「一道题只发一张通行证」
const HJV_USED_PASS = "verify_pass_used";   // 「通行证只能用一次」
const HJV_MODES = ["ff14", "poem", "math"];

/* 仓库 jobicon/ 里的职业图标（文件名就是职业名，两边要一致） */
const HJV_JOBS = [
  "骑士", "战士", "暗黑骑士", "绝枪战士", "武僧", "龙骑士", "忍者", "武士", "钐镰客", "蝰蛇剑士",
  "吟游诗人", "机工士", "舞者", "黑魔法师", "召唤师", "赤魔法师", "绘灵法师", "青魔法师",
  "白魔法师", "学者", "占星术士", "贤者", "驯兽师",
];

/* 令字：只用课本里最常见、最简单的 20 个字 */
const HJV_KEYWORDS = ["春", "花", "月", "风", "山", "水", "云", "雨", "天", "人", "日", "江", "夜", "秋", "白", "红", "明", "雪", "千", "心"];

/* 提示里用来凑满 20 个字的补充字（也都是诗词里的常客） */
const HJV_HINT_FILLER = "春风花月山水云天江夜秋白红明雪千人心日星辰光影香色声情露霜舟楼台烟波草木林泉石径归去来客愁乡梦醉酒杯歌长短高远清寒暖新旧时年人家国城池门关塞孤野晚晓晨昏朝暮恨思忆泪笑欢";

/* 繁体 / 异体 → 简体：会背诗的人可能直接打繁体，先转一道再判定 */
const HJV_TRAD = {
  "風": "风", "雲": "云", "紅": "红", "綠": "绿", "藍": "蓝", "黃": "黄", "聲": "声", "來": "来",
  "時": "时", "見": "见", "開": "开", "歸": "归", "與": "与", "無": "无", "萬": "万", "裏": "里",
  "裡": "里", "為": "为", "東": "东", "陽": "阳", "陰": "阴", "誰": "谁", "盡": "尽", "邊": "边",
  "處": "处", "過": "过", "還": "还", "這": "这", "個": "个", "們": "们", "什": "什", "麼": "么",
  "於": "于", "後": "后", "從": "从", "對": "对", "頭": "头", "樓": "楼", "葉": "叶", "樹": "树",
  "語": "语", "詩": "诗", "詞": "词", "書": "书", "畫": "画", "夢": "梦", "覺": "觉", "獨": "独",
  "燈": "灯", "飛": "飞", "鳥": "鸟", "馬": "马", "魚": "鱼", "龍": "龙", "鳳": "凤", "鶴": "鹤",
  "鴻": "鸿", "蟬": "蝉", "鶯": "莺", "鵲": "鹊", "鴉": "鸦", "雞": "鸡", "鴨": "鸭", "國": "国",
  "門": "门", "關": "关", "牆": "墙", "閣": "阁", "臺": "台", "園": "园", "簾": "帘", "帳": "帐",
  "愛": "爱", "戀": "恋", "憶": "忆", "記": "记", "識": "识", "視": "视", "聞": "闻", "聽": "听",
  "說": "说", "問": "问", "淚": "泪", "歡": "欢", "樂": "乐", "熱": "热", "涼": "凉", "溫": "温",
  "節": "节", "歲": "岁", "霧": "雾", "煙": "烟", "電": "电", "蒼": "苍", "賦": "赋", "經": "经",
  "傳": "传", "劍": "剑", "賞": "赏", "賢": "贤", "聖": "圣", "舊": "旧", "點": "点", "蕭": "萧",
  "痕": "痕", "畫": "画", "醉": "醉", "閣": "阁", "簫": "箫", "劍": "剑", "鏡": "镜", "鑑": "鉴",
  "隨": "随", "雖": "虽", "隻": "只", "雙": "双", "幾": "几", "幹": "干", "纖": "纤", "盈": "盈",
  "豔": "艳", "艷": "艳", "豔": "艳", "麗": "丽", "羅": "罗", "織": "织", "線": "线", "約": "约",
  "結": "结", "絕": "绝", "鄉": "乡", "鄰": "邻", "醉": "醉", "酬": "酬", "賦": "赋", "詠": "咏",
  "吟": "吟", "誦": "诵", "讀": "读", "誰": "谁", "問": "问", "答": "答", "慶": "庆", "獻": "献",
  "禮": "礼", "禪": "禅", "緣": "缘", "塵": "尘", "築": "筑", "蓋": "盖", "滿": "满", "灑": "洒",
  "濕": "湿", "斷": "断", "續": "续", "殘": "残", "壓": "压", "歷": "历", "陰": "阴", "陽": "阳",
  "飲": "饮", "飽": "饱", "餓": "饿", "軍": "军", "戰": "战", "敵": "敌", "將": "将", "師": "师",
  "義": "义", "讓": "让", "認": "认", "論": "论", "該": "该", "誰": "谁", "語": "语", "謝": "谢",
  "訪": "访", "許": "许", "認": "认", "誤": "误", "調": "调", "課": "课", "誰": "谁", "談": "谈",
  "貴": "贵", "賤": "贱", "質": "质", "貨": "货", "財": "财", "貧": "贫", "賽": "赛", "車": "车",
  "輪": "轮", "輕": "轻", "載": "载", "島": "岛", "嶼": "屿", "巖": "岩", "嶺": "岭", "峯": "峰",
  "峽": "峡", "灘": "滩", "灣": "湾", "濤": "涛", "浪": "浪", "湧": "涌", "沒": "没", "瀉": "泻",
  "澗": "涧", "溪": "溪", "淵": "渊", "濱": "滨", "濕": "湿", "燈": "灯", "爐": "炉", "煙": "烟",
  "燒": "烧", "燭": "烛", "爛": "烂", "爭": "争", "擊": "击", "掃": "扫", "飄": "飘", "驅": "驱",
  "驚": "惊", "驟": "骤", "馳": "驰", "騎": "骑", "驛": "驿", "鳥": "鸟", "鳴": "鸣", "啼": "啼",
  "葉": "叶", "叢": "丛", "絲": "丝", "線": "线", "綠": "绿", "鮮": "鲜", "豔": "艳", "豐": "丰",
  "曉": "晓", "晝": "昼", "暉": "晖", "曖": "暧", "園": "园", "圍": "围", "圖": "图", "壁": "壁",
  "墻": "墙", "徑": "径", "觀": "观", "規": "规", "視": "视", "覽": "览", "覺": "觉", "觸": "触",
  "論": "论", "詳": "详", "語": "语", "誰": "谁", "謹": "谨", "豐": "丰", "贊": "赞", "賢": "贤",
};

/* 太像现代口语的字（诗词里几乎不出现）：宽松判定时用来挡「随便打一句」 */
const HJV_JUNK_RE = /[的吗呢吧呀呗啥咱俺哦嘛哟咯嗯呃哎]/;

/* ---- 题库：由 verify-ext/poem-bank.json 生成，改完题库重跑 verify-ext/inline-poem-bank.py ---- */
/* HJV_BANK_START */

/* 提示 / 令字题库：中小学必背篇目（每句都含对应令字，提示就从这个库里挑） */
const HJV_POEM_COMMON = {
  "春": [
    "春眠不觉晓", "春风不度玉门关", "春风十里扬州路", "春风又绿江南岸", "春江水暖鸭先知", "春色满园关不住",
    "春潮带雨晚来急", "春来江水绿如蓝", "春种一粒粟", "二月春风似剪刀", "春风花草香", "春蚕到死丝方尽",
    "报得三春晖", "春宵一刻值千金", "春去花还在", "当春乃发生", "春风吹又生", "春江潮水连海平",
  ],
  "花": [
    "花落知多少", "霜叶红于二月花", "千树万树梨花开", "竹外桃花三两枝", "感时花溅泪", "落花时节又逢君",
    "花重锦官城", "花开堪折直须折", "牧童遥指杏花村", "沾衣欲湿杏花雨", "还来就菊花", "映日荷花别样红",
    "花间一壶酒", "人面桃花相映红", "桃花潭水深千尺", "山寺桃花始盛开", "采得百花成蜜后", "乱花渐欲迷人眼",
  ],
  "月": [
    "举头望明月", "明月何时照我还", "月落乌啼霜满天", "明月松间照", "月是故乡明", "小时不识月",
    "举杯邀明月", "月照花林皆似霰", "海上生明月", "月出惊山鸟", "秦时明月汉时关", "月黑雁飞高",
    "可怜九月初三夜", "峨眉山月半轮秋", "二十四桥明月夜", "海上明月共潮生", "明月几时有", "月上柳梢头",
    "八月湖水平", "我寄愁心与明月",
  ],
  "风": [
    "夜来风雨声", "春风又绿江南岸", "二月春风似剪刀", "春风不度玉门关", "风急天高猿啸哀", "风吹草低见牛羊",
    "大风起兮云飞扬", "风萧萧兮易水寒", "忽如一夜春风来", "任尔东西南北风", "随风潜入夜", "东风夜放花千树",
    "春风十里扬州路", "风住尘香花已尽", "好风凭借力", "秋风萧瑟", "洛阳城里见秋风", "长风破浪会有时",
  ],
  "山": [
    "白日依山尽", "山重水复疑无路", "一览众山小", "山外青山楼外楼", "空山不见人", "远上寒山石径斜",
    "青山遮不住", "山不在高", "千山鸟飞绝", "只在此山中", "山光悦鸟性", "江山如画",
    "山随平野尽", "两岸青山相对出", "山寺桃花始盛开", "山映斜阳天接水", "只有敬亭山", "西塞山前白鹭飞",
    "山高月小",
  ],
  "水": [
    "桃花潭水深千尺", "春江水暖鸭先知", "春来江水绿如蓝", "山重水复疑无路", "水光潋滟晴方好", "一水护田将绿绕",
    "绿水人家绕", "水村山郭酒旗风", "白毛浮绿水", "树阴照水爱晴柔", "抽刀断水水更流", "为有源头活水来",
    "水面初平云脚低", "秋水共长天一色", "水调数声持酒听",
  ],
  "云": [
    "云深不知处", "白云千载空悠悠", "千里黄云白日曛", "黄河远上白云间", "云横秦岭家何在", "不畏浮云遮望眼",
    "坐看云起时", "云想衣裳花想容", "大风起兮云飞扬", "白云生处有人家", "云青青兮欲雨", "白云回望合",
    "天接云涛连晓雾", "碧云天黄叶地", "孤云独去闲", "云破月来花弄影", "山抹微云",
  ],
  "雨": [
    "夜来风雨声", "清明时节雨纷纷", "好雨知时节", "渭城朝雨浥轻尘", "春潮带雨晚来急", "天街小雨润如酥",
    "沾衣欲湿杏花雨", "山色空蒙雨亦奇", "巴山夜雨涨秋池", "夜阑卧听风吹雨", "空山新雨后", "却话巴山夜雨时",
    "一蓑烟雨任平生", "白雨跳珠乱入船", "昨夜雨疏风骤", "雨里鸡鸣一两家",
  ],
  "天": [
    "天街小雨润如酥", "秋水共长天一色", "天苍苍野茫茫", "一行白鹭上青天", "月落乌啼霜满天", "风急天高猿啸哀",
    "天似穹庐", "天下谁人不识君", "天长地久有时尽", "天涯若比邻", "天生我材必有用", "天门中断楚江开",
    "天涯何处无芳草", "天意怜幽草", "天阶夜色凉如水", "江天一色无纤尘", "天光云影共徘徊", "念天地之悠悠",
  ],
  "人": [
    "空山不见人", "白云生处有人家", "遍插茱萸少一人", "西出阳关无故人", "人闲桂花落", "人生自古谁无死",
    "但愿人长久", "人有悲欢离合", "野渡无人舟自横", "人面桃花相映红", "人生得意须尽欢", "人间四月芳菲尽",
    "人比黄花瘦", "深林人不知", "人间能得几回闻", "天下谁人不识君", "人生若只如初见", "人迹板桥霜",
  ],
  "日": [
    "白日依山尽", "日照香炉生紫烟", "日出江花红胜火", "迟日江山丽", "映日荷花别样红", "千门万户曈曈日",
    "日暮乡关何处是", "长河落日圆", "日暮苍山远", "日日思君不见君", "日暮汉宫传蜡烛", "今日听君歌一曲",
    "白日放歌须纵酒", "落日故人情", "落日熔金",
  ],
  "江": [
    "春来江水绿如蓝", "春江水暖鸭先知", "日出江花红胜火", "独钓寒江雪", "千里江陵一日还", "江枫渔火对愁眠",
    "迟日江山丽", "大江东去", "江山如画", "春江潮水连海平", "不尽长江滚滚来", "天门中断楚江开",
    "唯见长江天际流", "江碧鸟逾白", "江南可采莲", "春风又绿江南岸", "江上往来人", "江山代有才人出",
    "江畔何人初见月", "江湖夜雨十年灯",
  ],
  "夜": [
    "夜来风雨声", "露从今夜白", "夜阑卧听风吹雨", "巴山夜雨涨秋池", "夜半钟声到客船", "忽如一夜春风来",
    "东风夜放花千树", "二十四桥明月夜", "却话巴山夜雨时", "今夜月明人尽望", "夜发清溪向三峡", "夜泊秦淮近酒家",
    "可怜九月初三夜", "夜深知雪重", "夜静春山空",
  ],
  "秋": [
    "秋风萧瑟", "秋水共长天一色", "巴山夜雨涨秋池", "峨眉山月半轮秋", "自古逢秋悲寂寥", "我言秋日胜春朝",
    "洛阳城里见秋风", "秋色连波", "秋风起兮白云飞", "万里悲秋常作客", "秋阴不散霜飞晚", "银烛秋光冷画屏",
    "湖光秋月两相和", "却道天凉好个秋", "秋风吹不尽",
  ],
  "白": [
    "白日依山尽", "白云生处有人家", "白毛浮绿水", "白发三千丈", "白云千载空悠悠", "黄河远上白云间",
    "白日放歌须纵酒", "白雨跳珠乱入船", "一行白鹭上青天", "白银盘里一青螺", "露从今夜白", "江碧鸟逾白",
    "白头搔更短", "白云回望合", "白露为霜",
  ],
  "红": [
    "日出江花红胜火", "映日荷花别样红", "霜叶红于二月花", "一枝红杏出墙来", "人面桃花相映红", "红豆生南国",
    "万紫千红总是春", "红藕香残玉簟秋", "落红不是无情物", "红杏枝头春意闹", "花褪残红青杏小", "绿肥红瘦",
    "红掌拨清波", "半江瑟瑟半江红", "桃红复含宿雨",
  ],
  "明": [
    "明月松间照", "举头望明月", "月是故乡明", "明月何时照我还", "海上明月共潮生", "明月几时有",
    "秦时明月汉时关", "清明时节雨纷纷", "明月别枝惊鹊", "明月夜短松冈", "沧海月明珠有泪", "明月出天山",
    "明月来相照", "明日隔山岳", "明月楼高休独倚",
  ],
  "雪": [
    "独钓寒江雪", "胡天八月即飞雪", "窗含西岭千秋雪", "梅须逊雪三分白", "雪却输梅一段香", "燕山雪花大如席",
    "夜深知雪重", "晚来天欲雪", "遥知不是雪", "北风吹雁雪纷纷", "白雪却嫌春色晚", "雪上空留马行处",
    "雪尽马蹄轻", "纷纷暮雪下辕门", "将登太行雪满山",
  ],
  "千": [
    "桃花潭水深千尺", "千里江陵一日还", "千山鸟飞绝", "千门万户曈曈日", "千树万树梨花开", "千里黄云白日曛",
    "千里莺啼绿映红", "千里共婵娟", "窗含西岭千秋雪", "白发三千丈", "万紫千红总是春", "千磨万击还坚劲",
    "千锤万凿出深山", "千呼万唤始出来", "千金散尽还复来",
  ],
  "心": [
    "一片冰心在玉壶", "谁言寸草心", "心远地自偏", "春心莫共花争发", "心有灵犀一点通", "心有千千结",
    "心似双丝网", "此心安处是吾乡", "心非木石岂无感", "心忧炭贱愿天寒", "悠悠我心", "我心匪石",
    "心随雁飞灭", "留取丹心照汗青", "心在天山",
  ],
};

/* 判定扩展库：高中 / 大学 / 偏门诗词（不参与提示，只让判定更宽容） */
const HJV_POEM_EXTRA = [
  "春江潮水连海平", "江水流春去欲尽", "春草年年绿", "春来遍是桃花水", "春风得意马蹄疾", "春风拂槛露华浓",
  "春风举国裁宫锦", "春风疑不到天涯", "春风桃李花开日", "春风十里柔情", "春花秋月何时了", "春如旧人空瘦",
  "春色三分二分尘土", "春水碧于天", "春水船如天上坐", "春城无处不飞花", "春水满四泽", "春林花多媚",
  "洛阳城里春光好", "春日游杏花吹满头", "春心莫共花争发", "恰似一江春水向东流", "春归何处", "若到江南赶上春",
  "春在溪头荠菜花", "惜春长怕花开早", "春无踪迹谁知", "春去也多谢洛城人", "春草生兮萋萋", "春江花朝秋月夜",
  "春宵苦短日高起", "随意春芳歇", "春色恼人眠不得", "春阴垂野草青青", "春雨断桥人不度", "花径不曾缘客扫",
  "花非花雾非雾", "花自飘零水自流", "花谢花飞花满天", "花落家童未扫", "花近高楼伤客心", "花月正春风",
  "花明月暗笼轻雾", "花市灯如昼", "花开时节动京城", "花迎剑佩星初落", "花暖青牛卧", "花枝草蔓眼中开",
  "落花人独立", "落花风雨更伤春", "我花开后百花杀", "花不看开人易老", "花有清香月有阴", "桃花一簇开无主",
  "桃花流水鳜鱼肥", "桃花依旧笑春风", "杏花春雨江南", "不是花中偏爱菊", "满园花菊郁金黄", "花落花开自有时",
  "名花倾国两相欢", "花钿委地无人收", "黄四娘家花满蹊", "花底忽闻敲两桨", "人闲桂花落", "月涌大江流",
  "月光如水水如天", "月华如练", "月桥花院", "月明星稀", "月落乌啼霜满天", "月出惊山鸟",
  "明月松间照", "明月几时有", "明月别枝惊鹊", "明月楼高休独倚", "明月出天山", "明月来相照",
  "明月夜短松冈", "海上生明月", "江月何年初照人", "江畔何人初见月", "江月年年望相似", "不知江月待何人",
  "淮水东边旧时月", "二十四桥明月夜", "秦时明月汉时关", "我寄愁心与明月", "峨眉山月半轮秋", "湖光秋月两相和",
  "露从今夜白月是故乡明", "星垂平野阔月涌大江流", "缺月挂疏桐", "无言独上西楼月如钩", "故国不堪回首月明中", "深林人不知明月来相照",
  "中天月色好谁看", "今夜鄜州月", "月黑雁飞高", "月上柳梢头", "风萧萧兮易水寒", "大风起兮云飞扬",
  "秋风萧瑟洪波涌起", "风急天高猿啸哀", "风住尘香花已尽", "风休住蓬舟吹取三山去", "风乍起吹皱一池春水", "风一更雪一更",
  "风雨送春归", "风卷江湖雨暗村", "风吹仙袂飘飘举", "风吹草低见牛羊", "东风夜放花千树", "东风无力百花残",
  "东风不与周郎便", "小楼昨夜又东风", "等闲识得东风面", "东风恶欢情薄", "东风袅袅泛崇光", "西风紧北雁南飞",
  "帘卷西风", "昨夜西风凋碧树", "古道西风瘦马", "北风卷地白草折", "北风吹雁雪纷纷", "春风又绿江南岸",
  "春风十里扬州路", "春风不度玉门关", "春风得意马蹄疾", "春风拂槛露华浓", "春风桃李花开日", "夜来风雨声",
  "随风潜入夜", "秋风起兮白云飞", "洛阳城里见秋风", "任尔东西南北风", "好风凭借力", "长风破浪会有时",
  "长风几万里", "风雨如晦鸡鸣不已", "风飒飒兮木萧萧", "忽如一夜春风来", "山雨欲来风满楼", "山随平野尽",
  "山光悦鸟性", "山抹微云", "山映斜阳天接水", "山寺桃花始盛开", "山不在高有仙则名", "山下兰芽短浸溪",
  "山重水复疑无路", "山回路转不见君", "山高月小水落石出", "山气日夕佳", "山色空蒙雨亦奇", "山外青山楼外楼",
  "山围故国周遭在", "山城过雨百花尽", "山桃红花满上头", "山红涧碧纷烂漫", "山石荦确行径微", "山远天高烟水寒",
  "山寺钟鸣昼已昏", "青山横北郭", "青山遮不住", "青山依旧在", "两岸青山相对出", "遥望洞庭山水翠",
  "一片孤城万仞山", "千山鸟飞绝", "白日依山尽", "会当凌绝顶一览众山小", "相看两不厌只有敬亭山", "空山不见人",
  "空山新雨后", "远上寒山石径斜", "只在此山中", "山中相送罢", "山中一夜雨", "山路元无雨",
  "江山如画", "江山代有才人出", "山雨欲来风满楼", "巫山巫峡气萧森", "三山半落青天外", "吴山点点愁",
  "青山处处埋忠骨", "水光潋滟晴方好", "水村山郭酒旗风", "水调数声持酒听", "水面初平云脚低", "水落石出",
  "水随天去秋无际", "水是眼波横", "水光山色与人亲", "水满有时观下鹭", "水殿风来暗香满", "水边沙外",
  "春水碧于天", "春水船如天上坐", "秋水共长天一色", "恰似一江春水向东流", "白毛浮绿水", "绿水人家绕",
  "山重水复疑无路", "桃花潭水深千尺", "为有源头活水来", "抽刀断水水更流", "一水护田将绿绕", "流水落花春去也",
  "流水无情草自春", "桃花流水鳜鱼肥", "小桥流水人家", "绿水逶迤", "白水绕东城", "沧浪之水清兮",
  "湘水无情吊岂知", "烟水茫茫", "山穷水尽疑无路", "云想衣裳花想容", "云横秦岭家何在", "云青青兮欲雨",
  "云破月来花弄影", "云生结海楼", "云无心以出岫", "云深不知处", "白云千载空悠悠", "白云回望合",
  "白云生处有人家", "白云一片去悠悠", "黄云万里动风色", "千里黄云白日曛", "黄河远上白云间", "黑云压城城欲摧",
  "黑云翻墨未遮山", "不畏浮云遮望眼", "直挂云帆济沧海", "荡胸生曾云", "野径云俱黑", "行到水穷处坐看云起时",
  "碧云天黄叶地", "天接云涛连晓雾", "孤云独去闲", "山抹微云", "云鬓花颜金步摇", "云中谁寄锦书来",
  "云树绕堤沙", "愁云惨淡万里凝", "云散月明谁点缀", "天高云淡", "乱云飞渡仍从容", "云卷云舒",
  "云霞出海曙", "只在此山中云深不知处", "清明时节雨纷纷", "好雨知时节", "天街小雨润如酥", "渭城朝雨浥轻尘",
  "春潮带雨晚来急", "山色空蒙雨亦奇", "巴山夜雨涨秋池", "却话巴山夜雨时", "夜阑卧听风吹雨", "空山新雨后",
  "一蓑烟雨任平生", "白雨跳珠乱入船", "昨夜雨疏风骤", "雨里鸡鸣一两家", "沾衣欲湿杏花雨", "杏花春雨江南",
  "少年听雨歌楼上", "梅子黄时雨", "山雨欲来风满楼", "风雨如晦", "秋雨梧桐叶落时", "雨打梨花深闭门",
  "斜风细雨不须归", "微雨燕双飞", "雨横风狂三月暮", "梧桐更兼细雨", "细雨鱼儿出", "好雨知时节当春乃发生",
  "夜雨剪春韭", "寒雨连江夜入吴", "秋风秋雨愁煞人", "雨雪霏霏", "今我来思雨雪霏霏", "夜来风雨声",
  "春潮带雨", "一行白鹭上青天", "天苍苍野茫茫", "天涯若比邻", "天涯何处无芳草", "天涯地角有穷时",
  "天生我材必有用", "天长地久有时尽", "天时人事日相催", "天意怜幽草", "天阶夜色凉如水", "天门中断楚江开",
  "天街小雨润如酥", "天接云涛连晓雾", "天下谁人不识君", "秋水共长天一色", "月落乌啼霜满天", "风急天高猿啸哀",
  "江天一色无纤尘", "天似穹庐", "天姥连天向天横", "天台四万八千丈", "难于上青天", "天光云影共徘徊",
  "天容水色西湖好", "天上白玉京", "念天地之悠悠", "天气晚来秋", "天寒翠袖薄", "天寒白屋贫",
  "天下三分明月夜", "天下英雄谁敌手", "晚来天欲雪", "天生丽质难自弃", "天长水阔知何处", "人闲桂花落",
  "人迹板桥霜", "人比黄花瘦", "人生若只如初见", "人生自古谁无死", "人生得意须尽欢", "人生七十古来稀",
  "人有悲欢离合", "人间四月芳菲尽", "人间能得几回闻", "人面桃花相映红", "人谁不顾老", "人归落雁后",
  "人人尽说江南好", "人间有味是清欢", "人似秋鸿来有信", "人事有代谢", "人事音书漫寂寥", "人烟寒橘柚",
  "人行明镜中", "人来鸟不惊", "人语驿边桥", "人间别久不成悲", "人生长恨水长东", "人生何处不相逢",
  "人生如梦", "人间万姓仰头看", "遍插茱萸少一人", "西出阳关无故人", "遥知兄弟登高处遍插茱萸少一人", "故人西辞黄鹤楼",
  "故人具鸡黍", "故人入我梦", "深林人不知", "无人知是荔枝来", "昔人已乘黄鹤去", "空山不见人",
  "野渡无人舟自横", "路上行人欲断魂", "断肠人在天涯", "一夜征人尽望乡", "古来征战几人回", "白云生处有人家",
  "白日依山尽", "白日放歌须纵酒", "日照香炉生紫烟", "日出江花红胜火", "日暮乡关何处是", "日暮苍山远",
  "日暮汉宫传蜡烛", "日高人渴漫思茶", "日日思君不见君", "今日听君歌一曲", "落日熔金", "落日故人情",
  "落日楼头", "千门万户曈曈日", "迟日江山丽", "映日荷花别样红", "长河落日圆", "日长飞絮轻",
  "日长睡起无情思", "日暖桑麻光似泼", "日暮酒醒人已远", "日暮东风怨啼鸟", "日暮倚修竹", "白日何短短",
  "一日看尽长安花", "春日游杏花吹满头", "日暮天无云", "日月之行若出其中", "春宵苦短日高起", "今日把示君",
  "大江东去", "江山如画", "江山代有才人出", "江枫渔火对愁眠", "江碧鸟逾白", "江南可采莲",
  "江上往来人", "江畔何人初见月", "江月年年望相似", "江水流春去欲尽", "江天一色无纤尘", "江山如此多娇",
  "江流天地外", "江流宛转绕芳甸", "江作青罗带", "江水三千里", "不废江河万古流", "江间波浪兼天涌",
  "江头宫殿锁千门", "江草江花岂终极", "江城五月落梅花", "江城如画里", "江湖多风波", "江湖夜雨十年灯",
  "江晚正愁余", "江海寄余生", "江上柳如烟", "江南无所有聊赠一枝春", "江南好风景旧曾谙", "江南忆最忆是杭州",
  "千里江陵一日还", "独钓寒江雪", "春来江水绿如蓝", "春江水暖鸭先知", "不尽长江滚滚来", "唯见长江天际流",
  "天门中断楚江开", "恰似一江春水向东流", "寒雨连江夜入吴", "半江瑟瑟半江红", "夜来风雨声", "夜半钟声到客船",
  "夜深知雪重时闻折竹声", "夜阑卧听风吹雨", "夜发清溪向三峡", "夜泊秦淮近酒家", "今夜月明人尽望", "忽如一夜春风来",
  "东风夜放花千树", "二十四桥明月夜", "却话巴山夜雨时", "可怜九月初三夜", "长夜沾湿何由彻", "夜雨剪春韭",
  "夜来幽梦忽还乡", "夜饮东坡醒复醉", "夜阑风静縠纹平", "夜久语声绝", "夜深千帐灯", "夜静春山空",
  "夜来南风起", "夜阑更秉烛", "夜雨闻铃断肠声", "夜半无人私语时", "一夜征人尽望乡", "夜深知雪重",
  "夜深忽梦少年事", "夜久雨休风又定", "夜榜响溪石", "今夜偏知春气暖", "秋风萧瑟", "秋风起兮白云飞",
  "秋风秋雨愁煞人", "洛阳城里见秋风", "万里悲秋常作客", "自古逢秋悲寂寥", "我言秋日胜春朝", "秋色连波",
  "秋水共长天一色", "秋阴不散霜飞晚", "秋草独寻人去后", "秋丛绕舍似陶家", "巴山夜雨涨秋池", "湖光秋月两相和",
  "银烛秋光冷画屏", "峨眉山月半轮秋", "却道天凉好个秋", "秋雨梧桐叶落时", "秋心如海复如潮", "秋风吹不尽",
  "秋风吹渭水", "春花秋月何时了", "春江花朝秋月夜", "秋月春风等闲度", "塞下秋来风景异", "秋来相顾尚飘蓬",
  "秋色从西来", "秋空明月悬", "独立寒秋", "千秋万岁名", "窗含西岭千秋雪", "一叶落知天下秋",
  "秋风萧瑟天气凉", "白发三千丈", "白发谁家翁媪", "白头搔更短", "白首相知犹按剑", "白日依山尽",
  "白日放歌须纵酒", "白日何短短", "白云千载空悠悠", "白云回望合", "白云生处有人家", "白云一片去悠悠",
  "白毛浮绿水", "白水绕东城", "白雨跳珠乱入船", "白露横江水光接天", "白露为霜", "白露未晞",
  "白马饰金羁", "白雪却嫌春色晚", "白银盘里一青螺", "一行白鹭上青天", "江碧鸟逾白", "露从今夜白",
  "白日登山望烽火", "白发悲花落", "白骨露于野", "白首太玄经", "北风卷地白草折", "朝辞白帝彩云间",
  "黄河远上白云间", "红豆生南国", "红杏枝头春意闹", "红藕香残玉簟秋", "红掌拨清波", "红颜弃轩冕",
  "映日荷花别样红", "日出江花红胜火", "霜叶红于二月花", "一枝红杏出墙来", "人面桃花相映红", "万紫千红总是春",
  "落红不是无情物", "花褪残红青杏小", "绿肥红瘦", "桃红复含宿雨", "半江瑟瑟半江红", "万山红遍",
  "红雨随心翻作浪", "红装素裹", "山桃红花满上头", "山红涧碧纷烂漫", "红烛昏罗帐", "红楼隔雨相望冷",
  "红颜未老恩先断", "红消香断有谁怜", "红笺小字", "千里莺啼绿映红", "花红易衰似郎意", "一树红桃亚拂池",
  "晓看红湿处", "明月松间照", "明月几时有", "明月别枝惊鹊", "明月楼高休独倚", "明月出天山",
  "明月来相照", "明月夜短松冈", "明月照积雪", "明眸皓齿今何在", "明朝有意抱琴来", "明日隔山岳",
  "明明如月何时可掇", "清明时节雨纷纷", "沧海月明珠有泪", "海上明月共潮生", "秦时明月汉时关", "月是故乡明",
  "明月何时照我还", "明月何曾是两乡", "山明水净夜来霜", "明日黄花蝶也愁", "明日愁来明日愁", "月明星稀",
  "明月照高楼", "清风明月无人管", "明月松间照清泉石上流", "明月隐高树", "明镜亦非台", "明年此日青云去",
  "明月清风我", "独钓寒江雪", "胡天八月即飞雪", "燕山雪花大如席", "夜深知雪重", "晚来天欲雪",
  "遥知不是雪", "梅须逊雪三分白", "雪却输梅一段香", "北风吹雁雪纷纷", "白雪却嫌春色晚", "雪上空留马行处",
  "雪尽马蹄轻", "纷纷暮雪下辕门", "北风卷地白草折胡天八月即飞雪", "窗含西岭千秋雪", "风雨送春归飞雪迎春到", "千里冰封万里雪飘",
  "五月天山雪", "将登太行雪满山", "剑河风急雪片阔", "天山雪后海风寒", "雪净胡天牧马还", "白雪纷纷何所似",
  "雪暗凋旗画", "雪拥蓝关马不前", "雪里已知春信至", "雪消门外千山绿", "积雪浮云端", "雪晴云淡日光寒",
  "北国风光千里冰封万里雪飘", "千里江陵一日还", "千里莺啼绿映红", "千里黄云白日曛", "千里共婵娟", "千里冰封万里雪飘",
  "千山鸟飞绝", "千树万树梨花开", "千门万户曈曈日", "千载琵琶作胡语", "千骑卷平冈", "千古江山",
  "千金散尽还复来", "千磨万击还坚劲", "千锤万凿出深山", "千秋万岁名", "千朵万朵压枝低", "千寻铁锁沉江底",
  "千载谁堪伯仲间", "千岩万转路不定", "千里烟波", "千里孤坟", "便纵有千种风情", "沉舟侧畔千帆过",
  "千古兴亡多少事", "千古风流人物", "千淘万漉虽辛苦", "白发三千丈", "桃花潭水深千尺", "窗含西岭千秋雪",
  "万紫千红总是春", "千秋二壮士", "千乘万骑西南行", "千呼万唤始出来", "一片冰心在玉壶", "谁言寸草心",
  "心远地自偏", "春心莫共花争发", "心有灵犀一点通", "心有千千结", "心似双丝网", "此心安处是吾乡",
  "心非木石岂无感", "心忧炭贱愿天寒", "悠悠我心", "我心匪石不可转也", "我心伤悲", "心随雁飞灭",
  "留取丹心照汗青", "心在天山身老沧洲", "心似已灰之木", "心折此时无一寸", "心事浩茫连广宇", "问君何能尔心远地自偏",
  "此心吾与白鸥盟", "心画心声总失真", "人心之动物使之然", "同心而离居", "两心之外无人知", "心曲千万端",
  "我心素已闲", "心绪逢摇落", "心随朗月高", "心赏犹难恃",
];

/* HJV_BANK_END */

/* 判定题库：常用 + 扩展合并去重（保留 4 字以上的整句） */
const HJV_POEM_JUDGE = (() => {
  const set = new Set();
  for (const lines of Object.values(HJV_POEM_COMMON)) for (const line of lines) set.add(hjPoemNorm(line));
  for (const line of HJV_POEM_EXTRA) set.add(hjPoemNorm(line));
  return [...set].filter((line) => line.length >= 4);
})();

/* 归一化：去标点与空白、繁体转简体、只留汉字 */
function hjPoemNorm(text) {
  const out = [];
  for (const ch of String(text == null ? "" : text)) {
    if (HJV_TRAD[ch]) { out.push(HJV_TRAD[ch]); continue; }
    const code = ch.codePointAt(0);
    if (code >= 0x3400 && code <= 0x9fff) out.push(ch);   // 汉字（含扩展 A）
  }
  return out.join("");
}

/* 判卷失败时给一句人话，前端直接显示 */
function hjPoemWhy(reason, keyword) {
  switch (reason) {
    case "no_keyword": return "这句里没有「" + keyword + "」字，换一句试试";
    case "too_short": return "太短了，写一句完整的诗词（至少 " + HJV_POEM_MIN + " 个字）";
    case "too_long": return "太长了，写一句就行";
    case "non_chinese": return "只写汉字和标点就好";
    case "not_in_bank": return "题库里暂时没有这句，换一句更常见的试试";
    default: return "这句不太像诗词，再想想？";
  }
}

/* 飞花令判卷：
   1) 必须含令字，长度在 HJV_POEM_MIN ~ HJV_POEM_MAX 之间，不能夹字母数字；
   2) 命中题库（任何一句被完整包含，写上下两句也算）→ 直接通过；
   3) 题库没有 → 宽松判定：像一句诗词就放行（默认；HJV_POEM_STRICT = true 可关掉）。 */
function hjPoemVerdict(raw, keyword) {
  const text = String(raw == null ? "" : raw);
  if (/[A-Za-z0-9]/.test(text)) return { ok: false, reason: "non_chinese" };
  const norm = hjPoemNorm(text);
  if (!norm) return { ok: false, reason: "empty" };
  if (norm.indexOf(keyword) < 0) return { ok: false, reason: "no_keyword" };
  if (norm.length < HJV_POEM_MIN) return { ok: false, reason: "too_short" };
  if (norm.length > HJV_POEM_MAX) return { ok: false, reason: "too_long" };
  for (const line of HJV_POEM_JUDGE) if (norm.indexOf(line) >= 0) return { ok: true, bank: true };
  if (HJV_POEM_STRICT) return { ok: false, reason: "not_in_bank" };
  if (new Set(norm).size < 4) return { ok: false, reason: "junk" };
  if (HJV_JUNK_RE.test(norm)) return { ok: false, reason: "junk" };
  return { ok: true, bank: false };
}

/* ---- 暗号：AES-GCM（题目 / 通行证）。密钥由 LOGIN_GUARD_SECRET 派生 ---- */
let hjKeyCache = { secret: null, key: null };

async function hjSecretKey(env) {
  const secret = env.LOGIN_GUARD_SECRET || env.PASSWORD_C || "";
  if (!secret) throw new Error("hjverify secret missing");
  if (hjKeyCache.secret !== secret || !hjKeyCache.key) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("hjverify:" + secret));
    hjKeyCache = { secret, key: crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]) };
  }
  return hjKeyCache.key;
}

function hjBase64(bytes) {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

const hjToB64Url = (bytes) => hjBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function hjFromB64Url(text) {
  const b64 = String(text).replace(/-/g, "+").replace(/_/g, "/");
  return base64ToBytes(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
}

/* 把 { … } 封成一段密文；密钥不对 / 被改过 → 解不开 */
async function hjSeal(env, payload) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(payload));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await hjSecretKey(env), data));
  const out = new Uint8Array(iv.length + cipher.length);
  out.set(iv, 0);
  out.set(cipher, iv.length);
  return hjToB64Url(out);
}

async function hjOpen(env, token) {
  try {
    const raw = hjFromB64Url(token);
    if (raw.length < 13) return null;
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: raw.subarray(0, 12) }, await hjSecretKey(env), raw.subarray(12)
    );
    const obj = JSON.parse(new TextDecoder().decode(plain));
    return obj && typeof obj === "object" ? obj : null;
  } catch (e) {
    return null;   // 伪造 / 过期密钥 / 不是暗号，一律当无效
  }
}

const hjNonce = () => bytesToHex(crypto.getRandomValues(new Uint8Array(8)));

function hjShuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* 「只放行一次」：借 rate_limits 记一笔；数据库不可用时放行（别把正版访客拦死） */
async function hjUseOnce(env, action, key, ttlMs) {
  if (!key || !env.DB) return true;
  try {
    const now = Date.now();
    await env.DB.prepare("DELETE FROM rate_limits WHERE action = ? AND ts < ?").bind(action, now - ttlMs).run();
    const res = await env.DB.prepare(
      `INSERT INTO rate_limits (client_key, action, ts)
       SELECT ?, ?, ? WHERE NOT EXISTS
         (SELECT 1 FROM rate_limits WHERE client_key = ? AND action = ?)`
    ).bind(key, action, now, key, action).run();
    return !!(res && res.meta && res.meta.changes);
  } catch (e) {
    console.error("hjUseOnce failed", action, e);
    return true;
  }
}

/* 消费一次性通行证（verify_turnstile / submit_ticket 都走这里） */
async function hjConsumePass(env, token) {
  const pass = await hjOpen(env, token);
  if (!pass || pass.t !== "pass") return false;
  if (!(Number(pass.exp) > Date.now())) return false;
  if (!pass.n) return false;
  return hjUseOnce(env, HJV_USED_PASS, "hjpass:" + pass.n, HJV_PASS_TTL_MS * 2);
}

/* ---- 狒科生：职业图标（从站点 jobicon/ 取回后内联成 data URL） ---- */
const hjIconCache = new Map();

async function hjJobIcon(env, job) {
  const cached = hjIconCache.get(job);
  if (cached !== undefined) return cached;
  const origin = String(env.HJ_SITE_ORIGIN || HJV_DEFAULT_ORIGIN).replace(/\/+$/, "");
  let dataUrl = null;
  try {
    const res = await fetch(origin + "/jobicon/" + encodeURIComponent(job) + ".png", { cf: { cacheTtl: 86400 } });
    if (res.ok) {
      const buf = await res.arrayBuffer();
      if (buf.byteLength > 0 && buf.byteLength <= 256 * 1024) {
        dataUrl = "data:image/png;base64," + hjBase64(new Uint8Array(buf));
      }
    }
  } catch (e) {
    console.error("jobicon 取图失败", job, e);
  }
  if (hjIconCache.size >= HJV_ICON_CACHE_MAX) hjIconCache.clear();
  hjIconCache.set(job, dataUrl);
  return dataUrl;
}

/* ---- 出题 ---- */
function hjMathTask() {
  // 只出 20 以内加减法和九九乘法表，尽量不给访客添麻烦
  switch (randInt(0, 2)) {
    case 0: {
      const a = randInt(2, 17), b = randInt(2, 20 - a);
      return { question: a + " + " + b, answer: a + b };
    }
    case 1: {
      const a = randInt(5, 20), b = randInt(2, a - 2);
      return { question: a + " − " + b, answer: a - b };
    }
    default: {
      const a = randInt(2, 9), b = randInt(2, 9);
      return { question: a + " × " + b, answer: a * b };
    }
  }
}

async function hjCreateTask(env, mode) {
  const exp = Date.now() + HJV_TASK_TTL_MS;

  if (mode === "ff14") {
    // 图标取不到就换一个职业再试；连着取不到才认输（前端会切到理科生）
    for (let attempt = 0; attempt < 4; attempt++) {
      const options = hjShuffle(HJV_JOBS).slice(0, 3);
      const answer = options[0];
      const iconData = await hjJobIcon(env, answer);
      if (!iconData) continue;
      const shown = hjShuffle(options);
      const id = await hjSeal(env, { t: "task", m: "ff14", a: answer, n: hjNonce(), exp });
      return { ok: true, mode, id, options: shown, iconData };
    }
    return { ok: false, error: "no_icon" };
  }

  if (mode === "poem") {
    const keyword = HJV_KEYWORDS[randInt(0, HJV_KEYWORDS.length - 1)];
    const lines = HJV_POEM_COMMON[keyword] || [];
    const line = lines[randInt(0, Math.max(0, lines.length - 1))] || "";
    const id = await hjSeal(env, { t: "task", m: "poem", a: keyword, l: line, n: hjNonce(), exp });
    return { ok: true, mode, id, keyword };
  }

  if (mode === "math") {
    const task = hjMathTask();
    const id = await hjSeal(env, { t: "task", m: "math", a: String(task.answer), n: hjNonce(), exp });
    return { ok: true, mode, id, question: task.question };
  }

  return { ok: false, error: "bad_mode" };
}

/* ---- 提示：20 个字，一定包含能拼出提示句的全部字 ---- */
function hjBuildHint(line, keyword) {
  const out = [...line].slice(0, HJV_HINT_CHARS);
  const pool = [...new Set([...HJV_HINT_FILLER, keyword])].filter((ch) => !out.includes(ch));
  while (out.length < HJV_HINT_CHARS && pool.length) {
    out.push(pool.splice(randInt(0, pool.length - 1), 1)[0]);
  }
  return hjShuffle(out);
}

async function hjTaskHint(env, id) {
  const task = await hjOpen(env, id);
  if (!task || task.t !== "task") return { ok: false, error: "not_found" };
  if (!(Number(task.exp) > Date.now())) return { ok: false, error: "expired" };
  const line = hjPoemNorm(task.l || "");
  if (!line) return { ok: false, error: "bad_mode" };
  return { ok: true, chars: hjBuildHint(line, task.a), len: line.length };
}

/* ---- 判卷：答对发一张一次性通行证 ---- */
async function hjCheckAnswer(env, id, answer) {
  const task = await hjOpen(env, id);
  if (!task || task.t !== "task") return { ok: false, error: "not_found" };
  if (!(Number(task.exp) > Date.now())) return { ok: false, error: "expired" };

  const mode = task.m;
  const text = String(answer == null ? "" : answer).trim();

  if (mode === "ff14") {
    if (text !== task.a) return { ok: false, error: "wrong", why: "再看一眼图标，换一个试试" };
  } else if (mode === "math") {
    const value = Number(text.replace(/[\s，。]/g, ""));
    if (!Number.isFinite(value) || value !== Number(task.a)) {
      return { ok: false, error: "wrong", why: "再算一遍？" };
    }
  } else if (mode === "poem") {
    const verdict = hjPoemVerdict(text, task.a);
    if (!verdict.ok) return { ok: false, error: "wrong", why: hjPoemWhy(verdict.reason, task.a) };
    if (!verdict.bank) console.log("飞花令宽松放行（题库里没有，但看着像诗词）", text, "令字", task.a);
  } else {
    return { ok: false, error: "bad_mode" };
  }

  // 一道题只发一张通行证（同一道题重复交卷、或被别人捡去用，都拿不到第二张）
  if (!(await hjUseOnce(env, HJV_USED_TASK, "hjtask:" + (task.n || ""), HJV_TASK_TTL_MS * 2))) {
    return { ok: false, error: "expired" };
  }
  const pass = await hjSeal(env, { t: "pass", m: mode, n: hjNonce(), exp: Date.now() + HJV_PASS_TTL_MS });
  return { ok: true, pass, mode };
}

/* -----------------------------------------------------------------------------
   点赞数据访问
   ----------------------------------------------------------------------------- */
async function countLikesForKeys(env, keys) {
  const counts = {};
  if (!keys.length) return counts;
  const { results } = await env.DB.prepare(
    `SELECT target_key, COUNT(*) AS n FROM likes WHERE target_key IN (${placeholders(keys)}) GROUP BY target_key`
  ).bind(...keys).all();
  for (const row of results || []) counts[row.target_key] = Number(row.n);
  return counts;
}

async function countLikesToday(env, clientKey, day) {
  const row = await env.DB
    .prepare("SELECT COUNT(*) AS n FROM likes WHERE client_key = ? AND day = ?")
    .bind(clientKey, day)
    .first();
  return Number(row?.n || 0);
}

/* -----------------------------------------------------------------------------
   活动购票数据访问
   ----------------------------------------------------------------------------- */
async function readTicketSettings(env) {
  const keys = Object.values(TICKET_FLAG_KEYS);
  const { results } = await env.DB.prepare(
    `SELECT key, value FROM site_flags WHERE key IN (${placeholders(keys)})`
  ).bind(...keys).all();
  const map = Object.fromEntries((results || []).map((r) => [r.key, Number(r.value)]));
  const limitRaw = map[TICKET_FLAG_KEYS.limit];
  return {
    open: map[TICKET_FLAG_KEYS.open] === 1,
    limit: Number.isFinite(limitRaw) ? limitRaw : TICKET_DEFAULT_LIMIT,
    allowPending: map[TICKET_FLAG_KEYS.allowPending] === 1,
  };
}

async function writeFlag(env, key, value) {
  await env.DB.prepare(
    `INSERT INTO site_flags (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).bind(key, value).run();
}

async function ticketSoldOn(env, day) {
  const row = await env.DB
    .prepare("SELECT COALESCE(SUM(qty), 0) AS n FROM ticket_orders WHERE day = ?")
    .bind(day)
    .first();
  return Number(row?.n || 0);
}

async function ticketStatus(env) {
  const day = likeDayStr();
  const [settings, sold] = await Promise.all([readTicketSettings(env), ticketSoldOn(env, day)]);
  return { ...settings, day, sold, remaining: Math.max(0, settings.limit - sold) };
}

const cleanText = (v, max) =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "";

/* 校验购票表单；成功返回 { order }，失败返回 { error } */
function readTicketInput(body, allowPending) {
  const contact = cleanText(body.contact, TICKET_CONTACT_MAX);
  if (!contact) return { error: "bad_contact" };

  const qty = Number(body.qty);
  if (!Number.isInteger(qty) || qty < 1 || qty > TICKET_MAX_QTY) return { error: "bad_qty" };

  if (!Array.isArray(body.holders) || body.holders.length !== qty) return { error: "bad_holders" };
  const holders = [];
  for (const [i, h] of body.holders.entries()) {
    if (h && h.pending === true) {
      // 第一位持票人必须填写完整，待定只对第二位起生效
      if (i === 0) return { error: "first_holder_required" };
      if (!allowPending) return { error: "pending_not_allowed" };
      holders.push({ pending: true });
      continue;
    }
    const name = cleanText(h?.name, TICKET_NAME_MAX);
    const server = typeof h?.server === "string" ? h.server : "";
    if (!name) return { error: "bad_holder_name" };
    if (!TICKET_SERVERS.includes(server)) return { error: "bad_holder_server" };
    holders.push({ name, server });
  }

  const message = typeof body.message === "string"
    ? body.message.replace(/\r\n?/g, "\n").trim().slice(0, TICKET_MESSAGE_MAX)
    : "";
  return {
    order: { contact, qty, holders, message: message || null, anonymous: body.anonymous === false ? 0 : 1 },
  };
}

function ticketRowOut(r) {
  let holders = [];
  try { holders = JSON.parse(r.holders); } catch (e) { /* 保底为空 */ }
  return {
    id: Number(r.id),
    day: r.day,
    seq: Number(r.seq),
    contact: r.contact,
    qty: Number(r.qty),
    holders,
    message: r.message || "",
    anonymous: Number(r.anonymous) === 1,
    overLimit: Number(r.over_limit) === 1,
    createdAt: Number(r.created_at),
  };
}

/* -----------------------------------------------------------------------------
   接口实现：每个 handler 接收 ctx = { request, env, body, clientKey() }
   ----------------------------------------------------------------------------- */
const handlers = {
  /* ---------- 站点开关（公开读 / 管理员写） ---------- */
  async get_lockdown({ env }) {
    const row = await env.DB.prepare("SELECT value FROM site_flags WHERE key = 'lockdown'").first();
    return json({ value: Number(row?.value || 0) === 1 });
  },

  async set_lockdown(ctx) {
    if (!(await isAdmin(ctx))) return json({ ok: false });
    const value = !!ctx.body.value;
    await ctx.env.DB
      .prepare(
        `INSERT INTO site_flags (key, value) VALUES ('lockdown', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .bind(value ? 1 : 0)
      .run();
    return json({ ok: true, value });
  },

  /* ---------- 星芒节时间覆盖 ----------
     时段内前端天气条一律显示「小雪」。start/end 为 epoch 毫秒（前端已按 UTC+8 换算）。
     读取：{ ok:true, value:{start,end} | null }
     写入：value = {start,end} 保存；value = null 清除 */
  async get_starlight({ env }) {
    try {
      const row = await env.DB.prepare("SELECT start_ms, end_ms FROM starlight WHERE id = 1").first();
      return json({
        ok: true,
        value: row ? { start: Number(row.start_ms), end: Number(row.end_ms) } : null,
      });
    } catch (e) {
      // 表不存在等情况按"未设置"返回，避免影响访客页面
      console.error("get_starlight failed", e);
      return json({ ok: true, value: null });
    }
  },

  async set_starlight(ctx) {
    if (!(await isAdmin(ctx))) return json({ ok: false });

    const { value } = ctx.body;
    const clearing = value === null || value === undefined;
    const start = Number(value?.start);
    const end = Number(value?.end);
    if (!clearing && (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)) {
      return json({ ok: false, error: "bad_range" });
    }

    try {
      if (clearing) {
        await ctx.env.DB.prepare("DELETE FROM starlight WHERE id = 1").run();
        return json({ ok: true, value: null });
      }
      await ctx.env.DB
        .prepare(
          `INSERT INTO starlight (id, start_ms, end_ms) VALUES (1, ?, ?)
           ON CONFLICT(id) DO UPDATE SET start_ms = excluded.start_ms, end_ms = excluded.end_ms`
        )
        .bind(start, end)
        .run();
      return json({ ok: true, value: { start, end } });
    } catch (e) {
      console.error("set_starlight failed（检查 starlight 表是否已建）", e);
      return json({ ok: false, error: "db_error" });
    }
  },

  /* ---------- 人机验证 ---------- */
  async verify_turnstile(ctx) {
    return json({ ok: await verifyHuman(ctx) });
  },

  async get_math_challenge({ env }) {
    return json({ ok: true, ...(await createMathChallenge(env)) });
  },

  /* ---------- 手动人机验证（狒科生 / 文科生 / 理科生） ---------- */
  // 出一道题：ff14 = 看图标选职业；poem = 飞花令；math = 算术题
  async get_verify_task(ctx) {
    const mode = typeof ctx.body.mode === "string" ? ctx.body.mode : "ff14";
    if (!HJV_MODES.includes(mode)) return json({ ok: false, error: "bad_mode" }, 400);
    return json(await hjCreateTask(ctx.env, mode));
  },

  // 文科生的提示：20 个字，其中包含能拼出某句含令字诗词的全部字
  async get_verify_hint(ctx) {
    return json(await hjTaskHint(ctx.env, ctx.body.id));
  },

  // 交卷：前端只交 id + 答案，判卷在服务端；答对发一次性通行证
  async verify_answer(ctx) {
    const answer = typeof ctx.body.answer === "string" ? ctx.body.answer : "";
    return json(await hjCheckAnswer(ctx.env, ctx.body.id, answer));
  },

  // 自检：确认新后端是否部署成功、题库有多大
  async verify_ping({ env }) {
    return json({
      ok: true,
      version: WORKER_VERSION,
      modes: HJV_MODES,
      jobs: HJV_JOBS.length,
      poems: HJV_POEM_JUDGE.length,
      hint_chars: HJV_HINT_CHARS,
      strict: HJV_POEM_STRICT,
      site_origin: String(env.HJ_SITE_ORIGIN || HJV_DEFAULT_ORIGIN),
      db: !!env.DB,
    });
  },

  /* ---------- 点赞 ---------- */
  // 批量返回：各目标总数、本访客赞过的目标、今日剩余次数
  async get_likes(ctx) {
    const { env, body } = ctx;
    const clientKey = await ctx.clientKey();
    const wanted = Array.isArray(body.keys)
      ? [...new Set(body.keys.filter((k) => typeof k === "string" && LIKE_KEY_PATTERN.test(k)))].slice(0, LIKE_BATCH_MAX)
      : [];

    const counts = await countLikesForKeys(env, wanted);
    let liked = [];
    if (wanted.length) {
      const { results } = await env.DB.prepare(
        `SELECT DISTINCT target_key FROM likes WHERE client_key = ? AND target_key IN (${placeholders(wanted)})`
      ).bind(clientKey, ...wanted).all();
      liked = (results || []).map((r) => r.target_key);
    }
    const used = await countLikesToday(env, clientKey, likeDayStr());

    return json({ ok: true, counts, liked, remaining: Math.max(0, LIKE_DAILY_LIMIT - used) });
  },

  // 新增一次点赞；额度检查与写入在同一条 SQL 中完成，避免并发请求超额
  async add_like(ctx) {
    const { env, body } = ctx;
    const key = body.key;
    if (typeof key !== "string" || !LIKE_KEY_PATTERN.test(key)) {
      return json({ ok: false, error: "bad_key" }, 400);
    }
    const clientKey = await ctx.clientKey();
    const day = likeDayStr();

    const result = await env.DB.prepare(
      `INSERT INTO likes (target_key, client_key, day, created_at)
       SELECT ?, ?, ?, ?
        WHERE (SELECT COUNT(*) FROM likes WHERE client_key = ? AND day = ?) < ?`
    ).bind(key, clientKey, day, Date.now(), clientKey, day, LIKE_DAILY_LIMIT).run();

    if (!result.meta?.changes) {
      return json({ ok: false, error: "daily_limit", remaining: 0 });
    }

    const [counts, used] = await Promise.all([
      countLikesForKeys(env, [key]),
      countLikesToday(env, clientKey, day),
    ]);
    return json({ ok: true, count: counts[key] || 0, remaining: Math.max(0, LIKE_DAILY_LIMIT - used) });
  },

  /* ---------- 活动购票（访客） ---------- */
  async get_ticket_status({ env }) {
    const st = await ticketStatus(env);
    return json({ ok: true, open: st.open, allowPending: st.allowPending, limit: st.limit, sold: st.sold, remaining: st.remaining, day: st.day });
  },

  async submit_ticket(ctx) {
    const { env, body } = ctx;
    const settings = await readTicketSettings(env);
    if (!settings.open) return json({ ok: false, error: "closed" });

    const input = readTicketInput(body, settings.allowPending);
    if (input.error) return json({ ok: false, error: input.error });
    if (!(await verifyHuman(ctx))) {
      return json({ ok: false, error: "captcha" });
    }

    const o = input.order;
    const day = likeDayStr();
    // 序号与是否超额在同一条语句中计算，D1 串行执行写入，并发提交也不会重号
    const row = await env.DB.prepare(
      `INSERT INTO ticket_orders
         (day, seq, contact, qty, holders, message, anonymous, over_limit, created_at, client_key)
       SELECT ?, COALESCE(MAX(seq), 0) + 1, ?, ?, ?, ?, ?,
              CASE WHEN COALESCE(SUM(qty), 0) + ? > ? THEN 1 ELSE 0 END, ?, ?
         FROM ticket_orders WHERE day = ?
       RETURNING id, seq, over_limit`
    ).bind(
      day, o.contact, o.qty, JSON.stringify(o.holders), o.message, o.anonymous,
      o.qty, settings.limit, Date.now(), await ctx.clientKey(), day
    ).first();

    const sold = await ticketSoldOn(env, day);
    return json({
      ok: true,
      day,
      seq: Number(row.seq),
      overLimit: Number(row.over_limit) === 1,
      remaining: Math.max(0, settings.limit - sold),
    });
  },

  // 凭「联系方式 + 第一位持票人 id」查询自己的登记（第一位为待定时 id 填「待定」）
  async lookup_ticket({ env, body }) {
    const contact = cleanText(body.contact, TICKET_CONTACT_MAX);
    const firstName = cleanText(body.firstName, TICKET_NAME_MAX);
    if (!contact || !firstName) return json({ ok: false, error: "bad_input" });

    const { results } = await env.DB.prepare(
      "SELECT * FROM ticket_orders WHERE contact = ? ORDER BY created_at ASC LIMIT 50"
    ).bind(contact).all();
    const items = (results || []).map(ticketRowOut).filter((r) => {
      const first = r.holders[0];
      if (!first) return false;
      return first.pending ? firstName === "待定" : first.name === firstName;
    }).map(({ id, contact: _c, ...rest }) => rest);
    return json({ ok: true, items });
  },

  /* ---------- 活动购票（管理员） ---------- */
  async ticket_admin_get(ctx) {
    if (!(await isAdmin(ctx))) return json({ ok: false });
    const st = await ticketStatus(ctx.env);
    const { results } = await ctx.env.DB.prepare(
      "SELECT * FROM ticket_orders ORDER BY day ASC, seq ASC"
    ).all();
    return json({ ok: true, status: st, orders: (results || []).map(ticketRowOut) });
  },

  async ticket_admin_set(ctx) {
    if (!(await isAdmin(ctx))) return json({ ok: false });
    const { env, body } = ctx;
    if (typeof body.open === "boolean") await writeFlag(env, TICKET_FLAG_KEYS.open, body.open ? 1 : 0);
    if (typeof body.allowPending === "boolean") {
      await writeFlag(env, TICKET_FLAG_KEYS.allowPending, body.allowPending ? 1 : 0);
    }
    if (body.limit !== undefined) {
      const limit = Number(body.limit);
      if (!Number.isInteger(limit) || limit < 0 || limit > TICKET_MAX_LIMIT) {
        return json({ ok: false, error: "bad_limit" });
      }
      await writeFlag(env, TICKET_FLAG_KEYS.limit, limit);
    }
    return json({ ok: true, status: await ticketStatus(env) });
  },

  async ticket_admin_clear(ctx) {
    if (!(await isAdmin(ctx))) return json({ ok: false });
    if (ctx.body.confirm !== "CLEAR") return json({ ok: false, error: "not_confirmed" });
    await ctx.env.DB.prepare("DELETE FROM ticket_orders").run();
    return json({ ok: true });
  },

  /* ---------- 公告板 ---------- */
  // 兼作内部入口的密码校验：成功时按身份返回可见公告
  async get_announcements(ctx) {
    const role = await authenticate(ctx, ctx.body.password);
    if (!role) return json({ ok: false });   // 输错与 C 被封锁时响应完全相同

    const sql = {
      c: "SELECT id, created_at, body, show_a, show_b, image_url FROM announcements ORDER BY created_at DESC",
      a: "SELECT id, created_at, body, image_url FROM announcements WHERE show_a = 1 ORDER BY created_at DESC",
      b: "SELECT id, created_at, body, image_url FROM announcements WHERE show_b = 1 ORDER BY created_at DESC",
    }[role];
    const { results } = await ctx.env.DB.prepare(sql).all();
    return json({ ok: true, items: results, isAdmin: role === ADMIN_ROLE });
  },

  async upload_announcement_image(ctx) {
    if (!(await isAdmin(ctx))) return json({ ok: false });
    const { env, body } = ctx;
    if (!env.ANNOUNCEMENT_IMAGES) return json({ ok: false, error: "R2 bucket 未绑定" });

    const { image, content_type } = body;
    if (!image || typeof image !== "string") return json({ ok: false, error: "empty" });
    if (image.length > MAX_IMAGE_BASE64_LENGTH) return json({ ok: false, error: "too large" });

    const contentType = content_type in IMAGE_TYPES ? content_type : "image/webp";
    let bytes;
    try {
      bytes = base64ToBytes(image);
    } catch (e) {
      return json({ ok: false, error: "invalid image data" });
    }

    const objectKey = `${IMAGE_KEY_PREFIX}${crypto.randomUUID()}.${IMAGE_TYPES[contentType]}`;
    await env.ANNOUNCEMENT_IMAGES.put(objectKey, bytes, { httpMetadata: { contentType } });
    return json({ ok: true, key: objectKey });
  },

  async post_announcement(ctx) {
    if (!(await isAdmin(ctx))) return json({ ok: false });
    const input = readAnnouncementInput(ctx.body);
    if (input.error) return json({ ok: false, error: input.error });

    await ctx.env.DB
      .prepare("INSERT INTO announcements (body, show_a, show_b, image_url) VALUES (?, ?, ?, ?)")
      .bind(input.text, input.showA, input.showB, input.imageUrl)
      .run();
    return json({ ok: true });
  },

  async edit_announcement(ctx) {
    if (!(await isAdmin(ctx))) return json({ ok: false });
    const id = toPositiveInt(ctx.body.id);
    if (!id) return json({ ok: false, error: "missing id" });
    const input = readAnnouncementInput(ctx.body);
    if (input.error) return json({ ok: false, error: input.error });

    await ctx.env.DB
      .prepare("UPDATE announcements SET body = ?, show_a = ?, show_b = ?, image_url = ? WHERE id = ?")
      .bind(input.text, input.showA, input.showB, input.imageUrl, id)
      .run();
    return json({ ok: true });
  },

  async delete_announcement(ctx) {
    if (!(await isAdmin(ctx))) return json({ ok: false });
    const id = toPositiveInt(ctx.body.id);
    if (!id) return json({ ok: false, error: "missing id" });

    await ctx.env.DB.prepare("DELETE FROM announcements WHERE id = ?").bind(id).run();
    return json({ ok: true });
  },
};

/* 发布 / 编辑公告的公共入参校验 */
function readAnnouncementInput(body) {
  const text = typeof body.content === "string" ? body.content.trim() : "";
  if (!text) return { error: "empty" };

  const imageUrl = body.image_url || null;
  // 只接受本 Worker 转发的配图地址，防止写入任意外链或脚本片段
  if (imageUrl !== null && (typeof imageUrl !== "string" || !IMAGE_URL_PATTERN.test(imageUrl))) {
    return { error: "bad_image_url" };
  }
  return { text, imageUrl, showA: body.show_a ? 1 : 0, showB: body.show_b ? 1 : 0 };
}

/* -----------------------------------------------------------------------------
   GET /image/<key>：由 Worker 转发 R2 中的公告配图（R2 无需开放公共访问）
   ----------------------------------------------------------------------------- */
async function serveImage(env, pathname) {
  const key = decodeURIComponent(pathname.slice("/image/".length));
  if (!key.startsWith(IMAGE_KEY_PREFIX) || !env.ANNOUNCEMENT_IMAGES) return notFound();

  const obj = await env.ANNOUNCEMENT_IMAGES.get(key);
  if (!obj) return notFound();

  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType || "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
      ...CORS_HEADERS,
    },
  });
}

/* -----------------------------------------------------------------------------
   入口
   ----------------------------------------------------------------------------- */
export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    /* 挂在自己域名的子路径上时（例如路由 example.com/api/*），配图地址会变成
       /api/image/<key>，所以这里只按 "/image/" 出现的位置截取，前缀写什么都能认。 */
    const imageAt = url.pathname.indexOf("/image/");
    if (request.method === "GET" && imageAt >= 0) {
      return serveImage(env, url.pathname.slice(imageAt));
    }
    /* 自检：GET /ping —— 能否访问到这个域名、跑的是哪个版本、各绑定是否配好 */
    if (request.method === "GET" && url.pathname.endsWith("/ping")) {
      return json({
        ok: true,
        version: WORKER_VERSION,
        features: WORKER_FEATURES,
        manual_verify: {
          modes: HJV_MODES,
          jobs: HJV_JOBS.length,
          poems: HJV_POEM_JUDGE.length,
          hint_chars: HJV_HINT_CHARS,
          strict: HJV_POEM_STRICT,
        },
        bindings: {
          db: !!env.DB,
          r2: !!env.ANNOUNCEMENT_IMAGES,
          turnstile_secret: !!env.TURNSTILE_SECRET_KEY,
          math_secret: !!(env.LOGIN_GUARD_SECRET || env.PASSWORD_C),
        },
      });
    }
    if (request.method !== "POST") {
      return json({ error: "method not allowed" }, 405);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: "invalid json" }, 400);
    }
    if (!body || typeof body !== "object") {
      return json({ error: "invalid json" }, 400);
    }

    const { action } = body;
    const handler = Object.hasOwn(handlers, action) ? handlers[action] : null;
    if (!handler) {
      return json({ error: "unknown action" }, 400);
    }

    // 访客标识按需计算，同一请求内只算一次
    let clientKeyPromise = null;
    const ctx = {
      request,
      env,
      body,
      clientKey: () => (clientKeyPromise ??= getClientKey(request, env)),
    };

    try {
      if (action in RATE_LIMITS && !(await checkRateLimit(env, await ctx.clientKey(), action))) {
        return json({ ok: false, error: "rate_limited" }, 429);
      }
      return await handler(ctx);
    } catch (e) {
      console.error(`action ${action} failed`, e);
      return json({ ok: false, error: "server_error" }, 500);
    }
  },
};
