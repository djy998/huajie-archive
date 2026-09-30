/* =============================================================================
   花语 · 二代（V2）压缩：几种方式各试一遍，挑最短的
   -----------------------------------------------------------------------------
   方式（编号写进二代花语的头部，解密时据此还原）：
     0 不压缩   UTF-8 原样（压缩反而变长时用它兜底）
     1 字模型   和一代同一个压缩器（zi.js），专门对付短句和中文，大多数时候最短
     2 DEFLATE  浏览器自带的 deflate-raw（gzip 同一种算法），长文本、大段重复时可能更短
   按「不压缩 → DEFLATE → 字模型」的顺序试（快的在前），比已有的更短才解回来核对一遍，
   对不上的一律不用，保证可逆；一样长时用先试的那种。
   含有落单代理项（不成对的 UTF-16）的文字只能用字模型（UTF-8 表示不了它们）。
   ============================================================================= */
const HJHuayuV2Compress = (() => {
  const U = HJHuayuUtil;
  const RAW = 0, ZI = 1, DEFLATE = 2;
  const NAMES = ["不压缩", "字模型", "DEFLATE"];
  const MAX_CHARS = 20000;
  const DEFLATE_MIN_BYTES = 64;   // 太短的文字 DEFLATE 不可能更短，不用试

  const te = new TextEncoder();
  const hasDeflate = () => typeof CompressionStream === "function" && typeof DecompressionStream === "function";
  const wellFormed = (s) => (typeof s.isWellFormed === "function"
    ? s.isWellFormed()
    : !/[\ud800-\udbff](?![\udc00-\udfff])|(?:^|[^\ud800-\udbff])[\udc00-\udfff]/.test(s));

  async function pipe(stream, bytes) {
    const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
    return new Uint8Array(await res.arrayBuffer());
  }

  const utf8Decode = (bytes) => new TextDecoder("utf-8", { fatal: true }).decode(bytes);

  async function encodeWith(method, text) {
    if (method === ZI) return HJHuayuZi.compress(text);
    const bytes = te.encode(text);
    if (method === RAW) return U.bytesToBits(bytes);
    return U.bytesToBits(await pipe(new CompressionStream("deflate-raw"), bytes));
  }

  async function decodeWith(method, bits) {
    if (method === ZI) return HJHuayuZi.decompress(bits);
    if (bits.length % 8) throw new Error("broken");
    const bytes = U.bitsToBytes(bits);
    if (method === RAW) return utf8Decode(bytes);
    if (method === DEFLATE) {
      if (!hasDeflate()) throw new Error("unsupported");
      return utf8Decode(await pipe(new DecompressionStream("deflate-raw"), bytes));
    }
    throw new Error("version");
  }

  /* 明文 → { method, bits }：候选方式各压一遍，解回来核对无误的里面挑最短的 */
  async function pack(text) {
    text = String(text || "");
    const n = U.countChars(text);
    if (!n) throw new Error("empty");
    if (n > MAX_CHARS) throw new Error("too_long");
    const tries = [];
    if (wellFormed(text)) {
      tries.push(RAW);
      if (hasDeflate() && te.encode(text).length >= DEFLATE_MIN_BYTES) tries.push(DEFLATE);
    }
    tries.push(ZI);
    let best = null;
    for (const method of tries) {
      let bits;
      try { bits = await encodeWith(method, text); } catch (e) { continue; }
      if (best && bits.length >= best.bits.length) continue;
      let back;
      try { back = await decodeWith(method, bits); } catch (e) { continue; }
      if (back === text) best = { method, bits };
    }
    if (!best) throw new Error("broken");
    return best;
  }

  /* (method, bits) → 明文；比特不对时抛 broken，浏览器不支持 DEFLATE 时抛 unsupported */
  async function unpack(method, bits) {
    try {
      return await decodeWith(method, bits);
    } catch (e) {
      throw new Error(["unsupported", "version"].includes(e.message) ? e.message : "broken");
    }
  }

  return { RAW, ZI, DEFLATE, NAMES, MAX_CHARS, pack, unpack };
})();
