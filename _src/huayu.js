/* =============================================================================
   花舞之街 · 薰风花语町 —— 花语入口 huayu.js
   -----------------------------------------------------------------------------
   首页「听得花间语」和管理页「花语加密」共用，打开它们时才由 main.js 的 loadHuayuJs() 加载，
   加载完设置 window.HJHuayu。发布版是 build.mjs 把下面这些源码按顺序拼成的一个文件：
     huayu/util.js          公用小工具（比特、base64、大数）
     huayu/zi.js            字模型压缩（一代的压缩；二代的压缩方式之一），数据在 huayu/zi-data.json
     huayu/v1.js            一代：「听花语：」+ 一串草木字
     huayu/v2-lexicon.js    二代：词库与句式（二代的「密码本」）
     huayu/v2-compress.js   二代：压缩方式挑选（不压缩 / 字模型 / DEFLATE）
     huayu/v2-sentence.js   二代：比特串 ⇄ 散文
     huayu/v2.js            二代：打包、头部
     huayu.js               本文件：版本登记、自动识别、和 Worker 之间的来回
   加密、解密都在 Worker（密钥只在后端）：
     加密：明文 → 该版本 pack → huayu_seal { v, ... } → 该版本 toText → 花语
     解密：花语 → 自动识别版本（先试二代句式，再试一代花字）→ huayu_open { v, ... } → 该版本 unpack → 明文
   各版本互不依赖（二代只借用字模型压缩器），新增版本只要写好模块、在 ALGOS 里登记。
   ============================================================================= */
(() => {
  const U = HJHuayuUtil;
  const ALGOS = { 1: HJHuayuV1, 2: HJHuayuV2 };
  const ALGO_NAMES = { 1: "一代", 2: "二代" };

  /* 认出是哪一代：{ ok, algo, head, kind, tag, data, n, method? } 或 { ok:false, error } */
  function detect(input) {
    const v2 = HJHuayuV2.parse(input);
    if (v2.ok) return v2;
    const v1 = HJHuayuV1.parse(input);
    if (v1.ok || HJHuayuV1.looksLike(input)) return v1;
    return v2.error === "not_huayu" ? v1 : v2;
  }

  const looksLike = (input) => detect(input).ok;

  /* 加密。post = 调 Worker 的函数；auth = 管理员的 { password }；key = 管理员用的自定义密钥
     成功：{ ok, algo, text, method, plainChars, cipherChars }；失败：{ ok:false, error, algo? } */
  async function encrypt(plain, { algo, post, auth = {}, key = "" }) {
    const A = ALGOS[algo];
    if (!A) return { ok: false, error: "bad_algo" };
    let packed;
    try { packed = await A.pack(plain); } catch (e) { return { ok: false, error: e.message }; }
    const data = await post({ action: "huayu_seal", v: algo, ...packed, ...auth, ...(key ? { key } : {}) });
    if (!data) return { ok: false, error: "net" };
    if (!data.ok) return { ...data, ok: false };
    const text = A.toText(data);
    return { ok: true, algo, text, method: packed.method, plainChars: U.countChars(plain), cipherChars: U.countChars(text) };
  }

  /* 解密（自动识别一代 / 二代）。自定义密钥写的花语要传 key
     成功：{ ok, algo, kind, old, text }；失败：{ ok:false, error, algo?, kind? } */
  async function decrypt(input, { post, auth = {}, key = "" }) {
    const info = detect(input);
    if (!info.ok) return info;
    const { algo, kind } = info;
    if (kind === 1 && !key) return { ok: false, error: "need_key", algo, kind };
    const data = await post({
      action: "huayu_open", v: algo, head: info.head, tag: info.tag, data: info.data, n: info.n,
      ...auth, ...(kind === 1 ? { key } : {}),
    });
    if (!data) return { ok: false, error: "net", algo, kind };
    if (!data.ok) return { ...data, ok: false, algo, kind };
    let text;
    try {
      text = await ALGOS[algo].unpack({ method: info.method, data: data.data, n: data.n });
    } catch (e) {
      return { ok: false, error: e.message, algo, kind };
    }
    return { ok: true, algo, kind, old: !!data.old, text };
  }

  window.HJHuayu = {
    ALGO_NAMES, MARK: HJHuayuV1.MARK, V1: HJHuayuV1, V2: HJHuayuV2,
    countChars: U.countChars, detect, looksLike, encrypt, decrypt,
  };
})();
