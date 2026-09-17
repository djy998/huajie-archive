/* =============================================================================
   worker-插入示例.js —— 「往 worker.js 里插哪儿」的示意图
   -----------------------------------------------------------------------------
   ⚠️ 这不是一个能直接跑的完整 Worker，只是拿常见的 worker.js 结构做示范，
      标出 ★ 五处要动的地方。你的真实文件长得不一样没关系：
      插入点 1、2 在 fetch 的入口，插入点 3、4 在「校验人机验证」的地方，
      插入点 5 是把 worker-verify.js 整份贴到文件末尾 —— 都是「只加不删」。

   怎么快速找到插入点？在你的 worker.js 里搜这几个词：
     · 搜 "OPTIONS"      → 插入点 1 就在它后面
     · 搜 "action"       → 插入点 2 在你分发 action 的 switch/if 之前
     · 搜 "siteverify"   → 插入点 3、4 就在 siteverify 之前（那是原来的校验）
     · 搜 "submit_ticket" / "verify_turnstile" → 这两个 action 里各要一处插入点 4
   ============================================================================= */

export default {
  async fetch(request, env, ctx) {
    /* 你原有的 CORS 头 */
    const cors = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "POST, GET, OPTIONS",
    };

    /* 你原有的 OPTIONS 预检 */
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    /* ★★★ 插入点 1 ★★★  GET 请求先过一下验证模块：
        命中 ?jobicon=<题目 id> 就由它返回职业图标（狒科生的图标走这里代理，
        地址里只有题目 id、没有职业名，所以看图片地址猜不出答案）；
        其它 GET 一律返回 null，继续走你原来的逻辑，互不影响。 */
    if (request.method === "GET") {
      const img = await hjVerifyImage(env, request);
      if (img) return img;
    }

    /* 你原有的取 body */
    let body = {};
    try { body = await request.json(); } catch (e) { body = {}; }
    const action = body.action;

    /* ★★★ 插入点 2 ★★★  验证模块接管的 4 个 action：
        get_verify_task（出题）、get_verify_hint（文科生的提示）、
        verify_answer（判卷+发通行证）、verify_ping（健康检查）。
        返回 null 表示「不是我的活」，交回你原来的分发逻辑。
        注意 json() 要换成你原来那个「返回 JSON」的函数名。 */
    const hv = await hjVerifyHandle(env, body, request);
    if (hv) return json(hv, cors);

    /* ---------------- 你原来的 action 分发 ---------------- */
    try {
      switch (action) {

        /* …… 公告、点赞、星芒节、lockdown 等等，全都原样别动 …… */

        case "verify_turnstile": {
          /* ★★★ 插入点 3 ★★★  手动验证（狒科生 / 文科生 / 理科生）的通行证。
             放在原来校验 token / math 的最前面：带 verifyPass 就走这条，
              不带就继续往下走你原来的 siteverify / 算术题校验。 */
          if (body.verifyPass) {
            const vp = await hjVerifyConsume(env, body.verifyPass);   // 一次性，用过即废
            if (!vp.ok) return json({ ok: false, error: "captcha" }, cors);
          }

          /* ← 下面这些是你原来的校验，一个字都不用改 */
          if (body.math) {
            // …… 原有算术题校验 ……
          }
          // …… 原有 Turnstile siteverify ……
          return json({ ok: true }, cors);
        }

        case "submit_ticket": {
          /* ★★★ 插入点 4 ★★★  和插入点 3 一样，提交购票前先把通行证消费掉。
             通行证是「答对题目」才发的，前端拿不到正确答案，所以这里能挡住脚本刷票。 */
          if (body.verifyPass) {
            const vp = await hjVerifyConsume(env, body.verifyPass);
            if (!vp.ok) return json({ ok: false, error: "captcha" }, cors);
          }

          /* ← 下面的库位判断、写库、返回余票等逻辑，原样保留 */
          // ……
          return json({ ok: true, remaining: 41, day: "2026-09-26" }, cors);
        }

        default:
          return json({ ok: false, error: "unknown action" }, cors);
      }
    } catch (err) {
      return json({ ok: false, error: String(err) }, cors);
    }
  },
};

/* ★★★ 插入点 5 ★★★
   把 verify-ext/worker-verify.js 的全部内容（从它的文件头注释开始、到最后一行）整段
   粘贴到这里，也就是 worker.js 的末尾。它不依赖你上面任何函数、任何变量，粘完即可用。
   如果你想把它单独放一个文件再 import，把 worker-verify.js 末尾那行
   「export { hjVerifyHandle, hjVerifyImage, hjVerifyConsume, hjVerifyCheckProof };」
   的注释去掉，然后在 worker.js 顶部写：
     import { hjVerifyHandle, hjVerifyImage, hjVerifyConsume } from "./worker-verify.js";
   —— 二选一即可，其余写法完全一样。 */
