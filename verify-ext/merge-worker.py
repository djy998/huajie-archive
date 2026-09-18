#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""一次性脚本：把「手动人机验证」模块并进原 worker.js，生成完整的 verify-ext/worker.js。

原文件放在 /tmp/worker-original.js（用户提供的版本），所有改动都是「只加不删」，
原代码除下列 7 处外逐字节保留：
  1. 头部注释（职责 + 可选变量说明）
  2. WORKER_VERSION / WORKER_FEATURES
  3. RATE_LIMITS 增加三个手动验证 action
  4. verifyHuman 增加 verifyPass 分支
  5. GET /ping 增加 manual_verify 信息
  6. 新增「手动人机验证」整节（题库 + 暗号 + 出题/判卷/提示/通行证）
  7. handlers 增加 get_verify_task / get_verify_hint / verify_answer / verify_ping
"""
import io
import sys
from pathlib import Path

SRC = sys.argv[1] if len(sys.argv) > 1 else "/tmp/worker-original.js"
DST = sys.argv[2] if len(sys.argv) > 2 else str(Path(__file__).resolve().parent / "worker.js")

src = io.open(SRC, encoding="utf-8").read()
edits = []


def replace(old, new, label):
    global src
    if src.count(old) != 1:
        print(f"✗ 锚点不唯一（{src.count(old)} 次）：{label}", file=sys.stderr)
        sys.exit(1)
    src = src.replace(old, new, 1)
    edits.append(label)


# ---------------------------------------------------------------- 1. 头部注释
replace(
    """   职责：内部入口密码校验、公告板（D1 + R2 配图）、站点开关、星芒节时间覆盖、
         人机验证（Turnstile，国内加载不了时改用算术题）、点赞、通用限流、活动购票。""",
    """   职责：内部入口密码校验、公告板（D1 + R2 配图）、站点开关、星芒节时间覆盖、
         人机验证（Turnstile；国内加载不了时可在「狒科生 / 文科生 / 理科生」里任选一种，
         见文件后半段的「手动人机验证」一节）、点赞、通用限流、活动购票。""",
    "头部职责说明",
)

replace(
    """     LOGIN_GUARD_SECRET（可选）              IP 哈希用的 pepper，未设置时退回 PASSWORD_C
   ============================================================================= */""",
    """     LOGIN_GUARD_SECRET（可选）              IP 哈希用的 pepper，未设置时退回 PASSWORD_C
                                            （手动验证的题目 / 通行证也复用它加密）
   可选变量（普通文本，不是机密）：
     HJ_SITE_ORIGIN                         狒科生的职业图标从哪个站点取，默认本站域名
   ============================================================================= */""",
    "头部环境变量说明",
)

# ---------------------------------------------------------------- 2. 版本号
replace(
    'const WORKER_VERSION = "2026-09-18c";',
    'const WORKER_VERSION = "2026-09-18d";',
    "WORKER_VERSION",
)
replace(
    'const WORKER_FEATURES = ["announcements", "lockdown", "starlight", "likes", "turnstile", "math-captcha", "tickets"];',
    'const WORKER_FEATURES = ["announcements", "lockdown", "starlight", "likes", "turnstile", "math-captcha", "tickets", "manual-verify"];',
    "WORKER_FEATURES",
)

# ---------------------------------------------------------------- 3. 限流
replace(
    """  get_math_challenge:        { limit: 30, windowSec: 60 },""",
    """  get_math_challenge:        { limit: 30, windowSec: 60 },
  get_verify_task:           { limit: 60, windowSec: 60 },   // 手动验证出题（狒科生 / 文科生 / 理科生）
  get_verify_hint:           { limit: 40, windowSec: 60 },   // 飞花令提示
  verify_answer:             { limit: 40, windowSec: 60 },   // 手动验证交卷""",
    "RATE_LIMITS",
)

# ---------------------------------------------------------------- 4. verifyHuman
replace(
    """/* 统一的人机校验：body.math（算术题）优先，否则按 Turnstile token 校验 */
async function verifyHuman(ctx) {
  const { env, body, request } = ctx;
  if (body.math) return verifyMathChallenge(env, body.math);
  return verifyTurnstileToken(env, body.token, request);
}""",
    """/* 统一的人机校验，三种凭证任一种通过即可：
     1) body.verifyPass —— 手动验证（狒科生 / 文科生 / 理科生）答对后拿到的一次性通行证
     2) body.math       —— 旧版算术题（保留兼容，老页面缓存里还会用到）
     3) body.token      —— Cloudflare Turnstile
   通行证是一次性的：消费过 / 过期都会返回 false，前端会提示重新验证。 */
async function verifyHuman(ctx) {
  const { env, body, request } = ctx;
  if (body.verifyPass) return hjConsumePass(env, body.verifyPass);
  if (body.math) return verifyMathChallenge(env, body.math);
  return verifyTurnstileToken(env, body.token, request);
}""",
    "verifyHuman（verifyPass 分支）",
)


# ---------------------------------------------------------------- 5. 新增整节
SECTION = r"""
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
const HJV_POEM_MIN = 5;                     // 宽松判定：库外的句子至少几个汉字（标点不算）
const HJV_POEM_MAX = 40;                    // 判定：最多几个汉字
const HJV_POEM_STRICT = false;              // true = 只认题库里的句子（默认宽松判定）
const HJV_ICON_CACHE_MAX = 48;
const HJV_ICON_FAIL_TTL_MS = 60 * 1000;     // 取图失败只记 60 秒，站点恢复了就自动能取到
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
const HJV_POEM_COMMON = {
  "春": ["春眠不觉晓"],
};
const HJV_POEM_EXTRA = ["春眠不觉晓"];
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
   1) 必须含令字、不能夹字母数字、长度不超过 HJV_POEM_MAX；
   2) 命中题库（任何一句被完整包含，写上下两句也算）→ 直接通过（四字名句也算）；
   3) 题库没有 → 宽松判定：像一句诗词（≥ HJV_POEM_MIN 个字）就放行
      （默认；HJV_POEM_STRICT = true 可关掉）。 */
function hjPoemVerdict(raw, keyword) {
  const text = String(raw == null ? "" : raw);
  if (/[A-Za-z0-9]/.test(text)) return { ok: false, reason: "non_chinese" };
  const norm = hjPoemNorm(text);
  if (!norm) return { ok: false, reason: "empty" };
  if (norm.indexOf(keyword) < 0) return { ok: false, reason: "no_keyword" };
  if (norm.length < 4) return { ok: false, reason: "too_short" };
  if (norm.length > HJV_POEM_MAX) return { ok: false, reason: "too_long" };
  // 命中题库就算数（「秋风萧瑟」这类四字名句也在库里）
  for (const line of HJV_POEM_JUDGE) if (norm.indexOf(line) >= 0) return { ok: true, bank: true };
  if (HJV_POEM_STRICT) return { ok: false, reason: "not_in_bank" };
  // 题库外的句子走宽松判定，但要求至少 HJV_POEM_MIN 个字，免得「春天真美」也放行
  if (norm.length < HJV_POEM_MIN) return { ok: false, reason: "too_short" };
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
  if (cached && cached.until > Date.now()) return cached.data;   // 成功一直用；失败只记一分钟
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
  hjIconCache.set(job, { data: dataUrl, until: Date.now() + (dataUrl ? 24 * 3600 * 1000 : HJV_ICON_FAIL_TTL_MS) });
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
"""

replace(
    """/* -----------------------------------------------------------------------------
   点赞数据访问""",
    SECTION.strip() + """

/* -----------------------------------------------------------------------------
   点赞数据访问""",
    "新增「手动人机验证」整节",
)

# ---------------------------------------------------------------- 6. handlers
HANDLERS = """  /* ---------- 手动人机验证（狒科生 / 文科生 / 理科生） ---------- */
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

  /* ---------- 点赞 ---------- */"""

replace(
    """  /* ---------- 点赞 ---------- */""",
    HANDLERS,
    "handlers 四个新 action",
)

# ---------------------------------------------------------------- 7. /ping
replace(
    """        version: WORKER_VERSION,
        features: WORKER_FEATURES,""",
    """        version: WORKER_VERSION,
        features: WORKER_FEATURES,
        manual_verify: {
          modes: HJV_MODES,
          jobs: HJV_JOBS.length,
          poems: HJV_POEM_JUDGE.length,
          hint_chars: HJV_HINT_CHARS,
          strict: HJV_POEM_STRICT,
        },""",
    "GET /ping 自检信息",
)

io.open(DST, "w", encoding="utf-8").write(src)
print("已生成 " + DST)
for label in edits:
    print("  · " + label)
