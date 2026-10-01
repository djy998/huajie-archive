/* 花语入口：版本识别与 Worker 加解密。发布时由 build.mjs 与 huayu/ 下各模块合并
   加密：明文 → pack → huayu_seal → toText；解密：识别版本 → huayu_open → unpack */
(() => {
  const U = HJHuayuUtil;
  const ALGOS = { 1: HJHuayuV1, 2: HJHuayuV2 };
  const ALGO_NAMES = { 1: "一代", 2: "二代" };

  /* → { ok, algo, head, kind, tag, data, n, method? } */
  function detect(input) {
    const v2 = HJHuayuV2.parse(input);
    if (v2.ok) return v2;
    const v1 = HJHuayuV1.parse(input);
    if (v1.ok || HJHuayuV1.looksLike(input)) return v1;
    return v2.error === "not_huayu" ? v1 : v2;
  }

  /* → { ok, algo, text, method, plainChars, cipherChars } */
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

  /* → { ok, algo, kind, old, text }；kind 1 为自定义密钥 */
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
    ALGO_NAMES, MARK: HJHuayuV1.MARK, countChars: U.countChars, detect, encrypt, decrypt,
  };
})();
