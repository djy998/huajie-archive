/* =============================================================================
   花语 · 一代（V1）：「听花语：」+ 一串草木字
   -----------------------------------------------------------------------------
   明文 ──字模型压缩──▶ 比特 ──Worker 加密──▶ 比特 ──换字──▶「听花语：」+ 花字
   · 比特串 = 头部 2 位（版本 0 + 密钥类型：0 站点密钥 / 1 自定义密钥）+ 校验 16 位 + 密文；
   · 换字：比特串前面加一个 1，当成一个大数写成 N 进制，每一位对应一个花字（N = 花字表的字数）；
   · 花字只用简繁写法相同的草木字，经过繁简转换、夹进空格换行标点也能解开。
   一代最短（中文大约一字换一字多一点），购票截图等需要短密文的地方用它；以后也一直保留。
   !!! 花字表和算法决定了一代花语的写法，发布以后不能改。
   ============================================================================= */
const HJHuayuV1 = (() => {
  const U = HJHuayuUtil;
  const ALGO = 1;
  const MARK = "听花语";          // 一代花语开头的标记（后面跟一个全角冒号）
  const PREFIX = MARK + "：";
  const HEAD_BITS = 2, TAG_BITS = 16;

  /* 花字表：539 个简繁同形的草木、天象、珠玉字（顺序即编号） */
  const ALPHA = Array.from([
    "艽艾艿芄芊芋芍芎芏芑芒芘芙芝芟芡芤芥芨芩芪芫芬芭芮芯芰芳芴芷芸芹芽芾苑苒苓苔苕苗苘苜苞苠苡苣苤若",
    "苫英苴苷苻茁茂茄茅茆茇茈茉茌茗茛茜茨茫茬茭茯茱茳茴茵茶茸茹茺茼荀荃荇草荏荑荔荷荸荻荼荽莆莉莎莒莓",
    "莘莛莜莞莠莨莩莪莫莰莽菀菁菅菇菊菌菏菔菖菘菜菝菟菠菡菥菩菪菰菱菲菹菽萁萃萄萆萋萌萍萏萑萱萸萼落葆",
    "葑葙葚葛葜葡董葩葫葭葳葵葶葸葺蒂蒗蒙蒜蒡蒯蒲蒴蒸蒹蒺蒿蓁蓄蓉蓊蓍蓐蓑蓓蓖蓬蓰蓼蓿蔌蔓蔗蔚蔟蔡蔬蔸",
    "蔻蔽蕃蕈蕉蕊蕖蕙蕞蕤蕨蕹蕺蕻蕾薄薅薇薏薛薜薤薪薯薰薷藁藉藏藕藜藤藩藻藿蘅蘑蘧蘩蘸蘼木朱朵杉杌李杏",
    "村杓杜杞束杪杭杲杳杷杼松枇枋枕林枚果枝枰枳枵枸柁柃柏柑柒染柔柘柙柚柝柞柬柯柰柳柴柿栝栩株栲栳根栽",
    "桂桃桄桅桉桊桐桑桓桔桕桫桴梃梅梆梓梗梢梧梨梭梳梵棉棋棕棘棚棠棣森棵棹棼椋植椐椒椰椴椹椽椿楂楗楚楝",
    "楞楠楣楦楫楮楱楷楸楹榆榍榔榕榛榧榭榴榷榻槁槊槌槎槐槔槭槲槽槿樊樗樘樟樨樵樽樾橄橐橘橙橛橡檀檎檑檗",
    "檠檫檬禾秀秉秋秣秦秧秫秭秸稀稂稃稔稗稚稞稠稷稹稻稼稽穆穗穰竹竺竽竿笄笆笈笊笏笑笙笛笠笤笥笪笫笮笱",
    "笳笸筅筇筌筘筠筢筮筱筲筵筻箅箐箔箕箜箢箬箭箴箸篁篆篌篙篚篝篥篦篪篷篼篾簇簌簏簟簦簧簸籀雨雪雯霄霏",
    "霓霖霜霞露零霰春晴晨暮曦旭昕映星景暖昭晗明昀晏暄曛曜晶旦彩影彤彬香馥馨琳琅琪瑛瑜瑾璀璨璃珊瑚珍珠",
    "琉琥珀玲珂珈珞琴瑟瑰瑞",
  ].join(""));
  const ALPHA_IDX = new Map(ALPHA.map((ch, i) => [ch, i]));
  const N = ALPHA.length, CH = BigInt(N) ** 5n;

  /* 比特 → 花字：大数写成 N 进制，每次除 N^5 */
  function bitsToFlowers(bits) {
    let v = U.bitsToBig(bits);
    const ds = [];
    while (v > 0n) {
      let r = Number(v % CH);
      v /= CH;
      for (let j = 0; j < 5; j++) { ds.push(r % N); r = Math.floor(r / N); }
    }
    while (ds.length && ds[ds.length - 1] === 0) ds.pop();
    let out = "";
    for (let i = ds.length - 1; i >= 0; i--) out += ALPHA[ds[i]];
    return out;
  }

  function flowersToBits(body) {
    const ds = Array.from(body, (ch) => ALPHA_IDX.get(ch));
    let i = 0, r = 0;
    for (; i < ds.length % 5; i++) r = r * N + ds[i];
    let v = BigInt(r);
    for (; i < ds.length; i += 5) {
      r = 0;
      for (let j = 0; j < 5; j++) r = r * N + ds[i + j];
      v = v * CH + BigInt(r);
    }
    return U.bigToBits(v);
  }

  /* 从一段文字里找出花语正文：有「听花语」就从它后面开始；
     花字之间的空白、标点、换行、表情一律跳过，遇到别的文字（字母、数字、非花字的汉字）就停 */
  function extractBody(input) {
    let s = String(input || "");
    const at = s.lastIndexOf(MARK);
    if (at >= 0) s = s.slice(at + MARK.length);
    let body = "";
    for (const ch of s) {
      if (ALPHA_IDX.has(ch)) { body += ch; continue; }
      if (body && /[\p{L}\p{N}]/u.test(ch)) break;
    }
    return body;
  }

  /* 明文 → { data, n }（字模型压缩后的比特，交给 Worker 加密） */
  function pack(text) {
    const bits = HJHuayuZi.compress(text);
    return { data: U.bitsToB64(bits), n: bits.length };
  }

  /* { data, n }（Worker 解密后的比特）→ 明文 */
  function unpack({ data, n }) {
    return HJHuayuZi.decompress(U.b64ToBits(data, n));
  }

  /* Worker 加密的结果 { head, tag, data, n } → 「听花语：」+ 花字 */
  function toText({ head, tag, data, n }) {
    const bits = [];
    U.pushBits(bits, head, HEAD_BITS);
    U.pushBits(bits, tag, TAG_BITS);
    for (const b of U.b64ToBits(data, n)) bits.push(b);
    return PREFIX + bitsToFlowers(bits);
  }

  /* 花语 → { ok, head, tag, data, n, kind }，交给 Worker 解密；
     不是一代花语 / 残缺 / 以后的新版本分别返回 error: not_huayu / broken / version */
  function parse(input) {
    const body = extractBody(input);
    if (!body) return { ok: false, error: "not_huayu" };
    const bits = flowersToBits(body);
    if (!bits || bits.length <= HEAD_BITS + TAG_BITS) return { ok: false, error: "broken" };
    const head = U.readBits(bits, 0, HEAD_BITS);
    if (head >> 1) return { ok: false, error: "version" };
    const from = HEAD_BITS + TAG_BITS;
    return {
      ok: true, algo: ALGO, head, kind: head & 1,
      tag: U.readBits(bits, HEAD_BITS, TAG_BITS),
      data: U.bitsToB64(bits, from), n: bits.length - from,
    };
  }

  /* 看起来像不像一代花语：带「听花语」，或者几乎整段都是花字 */
  function looksLike(input) {
    const s = String(input || "");
    if (s.includes(MARK)) return true;
    const body = extractBody(s);
    const letters = (s.match(/[\p{L}\p{N}]/gu) || []).length;
    return body.length >= 4 && body.length >= letters * 0.9;
  }

  return { ALGO, MARK, PREFIX, pack, unpack, toText, parse, looksLike, extractBody };
})();
