/* =============================================================================
   花语 · 二代（V2）：写成一段像散文的花语
   -----------------------------------------------------------------------------
   明文 ──压缩（v2-compress，挑最短）──▶ 比特 ──Worker 加密──▶ 比特 ──组句（v2-sentence）──▶ 散文
   比特串 = 头部 4 位 + 校验 16 位 + 密文
     头部：密钥类型 1 位（0 站点密钥 / 1 自定义密钥）+ 压缩方式 2 位 + 保留位 1 位（二代一律是 0）
   二代花语没有「听花语：」这样的开头，靠能不能整句对上二代的句式来认；
   Worker 那边二代用自己的密钥派生（和一代互不相通），头部、校验都参与校验计算。
   ============================================================================= */
const HJHuayuV2 = (() => {
  const U = HJHuayuUtil;
  const C = HJHuayuV2Compress;
  const S = HJHuayuV2Sentence;
  const ALGO = 2;
  const HEAD_BITS = 4, TAG_BITS = 16;

  /* 明文 → { method, data, n }（压缩后的比特，交给 Worker 加密；Worker 按 method 写头部） */
  async function pack(text) {
    const { method, bits } = await C.pack(text);
    return { method, data: U.bitsToB64(bits), n: bits.length };
  }

  /* { method, data, n }（Worker 解密后的比特）→ 明文 */
  function unpack({ method, data, n }) {
    return C.unpack(method, U.b64ToBits(data, n));
  }

  /* Worker 加密的结果 { head, tag, data, n } → 散文 */
  function toText({ head, tag, data, n }) {
    const bits = [];
    U.pushBits(bits, head, HEAD_BITS);
    U.pushBits(bits, tag, TAG_BITS);
    for (const b of U.b64ToBits(data, n)) bits.push(b);
    return S.encode(bits);
  }

  /* 散文 → { ok, head, kind, method, tag, data, n }，交给 Worker 解密；
     对不上二代句式返回 not_huayu，太短 broken，保留位不是 0 / 不认识的压缩方式 version */
  function parse(input) {
    const bits = S.decode(input);
    if (!bits) return { ok: false, error: "not_huayu" };
    if (bits.length <= HEAD_BITS + TAG_BITS) return { ok: false, error: "broken" };
    const head = U.readBits(bits, 0, HEAD_BITS);
    const method = (head >> 1) & 3;
    if (head & 1 || !C.NAMES[method]) return { ok: false, error: "version" };
    const from = HEAD_BITS + TAG_BITS;
    return {
      ok: true, algo: ALGO, head, kind: head >> 3, method,
      tag: U.readBits(bits, HEAD_BITS, TAG_BITS),
      data: U.bitsToB64(bits, from), n: bits.length - from,
    };
  }

  const looksLike = (input) => !!S.decode(input);

  return { ALGO, pack, unpack, toText, parse, looksLike, METHOD_NAMES: C.NAMES };
})();
