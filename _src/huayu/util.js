/* =============================================================================
   花语 · 公用小工具（一代、二代都用）
   比特串统一用 0/1 数组表示；和 Worker 之间传 base64 字节 + 比特数 n（最后一个字节不足 8 位时低位补 0）
   ============================================================================= */
const HJHuayuUtil = (() => {
  const cpsOf = (s) => Array.from(String(s || ""), (ch) => ch.codePointAt(0));
  const countChars = (s) => cpsOf(s).length;

  function bytesToB64(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(s);
  }
  function b64ToBytes(b64) {
    const s = atob(b64);
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    return bytes;
  }

  function bitsToBytes(bits, from = 0) {
    const n = bits.length - from;
    const bytes = new Uint8Array(Math.ceil(n / 8));
    for (let i = 0; i < n; i++) if (bits[from + i]) bytes[i >> 3] |= 128 >> (i & 7);
    return bytes;
  }
  function bytesToBits(bytes, n = bytes.length * 8) {
    if (bytes.length !== Math.ceil(n / 8)) throw new Error("broken");
    const bits = new Array(n);
    for (let i = 0; i < n; i++) bits[i] = (bytes[i >> 3] >> (7 - (i & 7))) & 1;
    return bits;
  }

  const bitsToB64 = (bits, from = 0) => bytesToB64(bitsToBytes(bits, from));
  const b64ToBits = (b64, n) => bytesToBits(b64ToBytes(b64), n);

  const pushBits = (bits, v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >> i) & 1); };
  const readBits = (bits, from, n) => { let v = 0; for (let i = 0; i < n; i++) v = v * 2 + bits[from + i]; return v; };

  /* 比特串 ⇄ 大数：前面加一个 1 当哨兵，保住开头的 0 */
  function bitsToBig(bits) {
    let s = "1" + bits.join("");
    s = "0".repeat((4 - (s.length % 4)) % 4) + s;
    let hex = "";
    for (let i = 0; i < s.length; i += 4) hex += parseInt(s.substr(i, 4), 2).toString(16);
    return BigInt("0x" + hex);
  }
  function bigToBits(v) {
    const b = v.toString(2);
    if (b[0] !== "1") return null;
    const bits = new Array(b.length - 1);
    for (let k = 1; k < b.length; k++) bits[k - 1] = b.charCodeAt(k) - 48;
    return bits;
  }

  return {
    cpsOf, countChars, bytesToB64, b64ToBytes, bitsToBytes, bytesToBits, bitsToB64, b64ToBits,
    pushBits, readBits, bitsToBig, bigToBits,
  };
})();
