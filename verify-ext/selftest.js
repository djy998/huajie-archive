/* 本地自测：把 worker-verify.js 里的纯函数拉出来跑一遍（不连云、不连 D1）
   用法：node verify-ext/selftest.js */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const src = fs.readFileSync(path.join(__dirname, "worker-verify.js"), "utf8");

const sandbox = {
  crypto,
  btoa: (s) => Buffer.from(s, "binary").toString("base64"),
  fetch: async () => ({ ok: false, status: 404, body: null }),
  Response: class Response { constructor(body, init) { this.body = body; Object.assign(this, init || {}); } },
  URL,
  Math,
  Date,
  JSON,
  Uint8Array,
  console,
};
sandbox.globalThis = sandbox;

const exported = vm.runInNewContext(
  src + "\n;({hjvCheckPoem, hjvPoemHint, hjvMakeMath, hjvMakeFf14, hjvMakePoem, hjvNormalizePoem, HJV_POEM_LINES, HJV_KEYWORDS, HJV_JOBS});",
  sandbox,
  { filename: "worker-verify.js" }
);

const { hjvCheckPoem, hjvPoemHint, hjvMakeMath, hjvMakeFf14, hjvNormalizePoem, HJV_POEM_LINES, HJV_KEYWORDS } = exported;

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; }
  else { fail++; console.log("  ✗ " + label); }
}

/* ---------- 1. 题库的基本健康度 ---------- */
console.log("诗词库：", HJV_POEM_LINES.length, "句 /", HJV_KEYWORDS.length, "个令字");
HJV_POEM_LINES.forEach((line) => {
  ok(/[\u3400-\u9fff]/.test(line), "诗句里有汉字：" + line);
  ok(/[，。？；：]/.test(line), "诗句带标点：" + line);
});

/* ---------- 2. 每个令字：库里至少 3 句、提示能拼出至少一句 ---------- */
HJV_KEYWORDS.forEach((kw) => {
  const lines = HJV_POEM_LINES.filter((l) => l.indexOf(kw) >= 0);
  ok(lines.length >= 3, `「${kw}」库里至少 3 句（实际 ${lines.length}）`);

  const hint = hjvPoemHint(kw);
  ok(hint.chars.length === 20, `「${kw}」提示给 20 个字（实际 ${hint.chars.length}）`);
  const canBuild = lines.some((l) => [...hjvNormalizePoem(l)].every((ch) => hint.chars.includes(ch)));
  ok(canBuild, `「${kw}」提示里的字能拼出至少一句`);
});

/* ---------- 3. 判卷：常见答案要通过，乱答要拦住 ---------- */
const cases = [
  ["花", "夜来风雨声，花落知多少。", true],
  ["花", "花落知多少", true],
  ["花", "忽如一夜春风来，千树万树梨花开", true],
  ["花", "接天莲叶无穷碧，映日荷花别样红。", true],
  ["花", "借问酒家何处有，牧童遥指杏花村。", true],
  ["花", "采得百花成蜜后，为谁辛苦为谁甜", true],
  ["月", "举头望明月", true],
  ["月", "举头望明月，低头思故乡。", true],
  ["月", "月落乌啼霜满天，江枫渔火对愁眠", true],
  ["月", "但愿人长久千里共婵娟", false],      // 不含令字
  ["月", "床前明月光，疑是地上霜。", true],
  ["春", "春眠不觉晓，处处闻啼鸟。", true],
  ["春", "野火烧不尽，春风吹又生", true],
  ["春", "春风又绿江南岸", true],
  ["雪", "孤舟蓑笠翁，独钓寒江雪。", true],
  ["雪", "晚来天欲雪，能饮一杯无", true],
  ["雨", "清明时节雨纷纷，路上行人欲断魂。", true],
  ["风", "千磨万击还坚劲，任尔东西南北风", true],
  ["山", "会当凌绝顶，一览众山小", true],
  ["水", "白毛浮绿水，红掌拨清波", true],
  ["云", "只在此山中，云深不知处", true],
  ["天", "天苍苍，野茫茫，风吹草低见牛羊", true],
  ["人", "人闲桂花落，夜静春山空", true],
  ["日", "白日依山尽，黄河入海流", true],
  ["江", "孤舟蓑笠翁，独钓寒江雪", true],
  ["夜", "姑苏城外寒山寺，夜半钟声到客船", true],
  ["秋", "空山新雨后，天气晚来秋", true],
  ["白", "白日依山尽", true],
  ["红", "红豆生南国，春来发几枝", true],
  ["明", "明月松间照，清泉石上流", true],
  ["千", "飞流直下三千尺，疑是银河落九天", true],
  ["心", "谁言寸草心，报得三春晖", true],
  ["心", "山光悦鸟性，潭影空人心", true],
  ["花", "哈哈哈哈哈哈哈", false],           // 含令字但是乱按
  ["花", "土豆", false],                     // 太短
  ["花", "今天天气真好我要吃饭", false],     // 不含令字
  ["月", "床前明月光,疑是地上霜", true],       // 半角逗号 / 空格也能通过
  ["月", "  举头望明月  ", true],               // 前后空格无所谓
];
cases.forEach(([kw, ans, want]) => {
  const got = hjvCheckPoem(kw, ans).ok;
  ok(got === want, `判卷「${kw}」${ans} → 期望 ${want}，实际 ${got}`);
});

/* ---------- 4. 理科生：算术题答案自洽 ---------- */
for (let i = 0; i < 300; i++) {
  const q = hjvMakeMath();
  ok(typeof q.question === "string" && q.question.length > 0, "题目不为空");
  const [a, op, b] = q.question.split(" ");
  const expect = op === "+" ? Number(a) + Number(b) : op === "-" ? Number(a) - Number(b) : Number(a) * Number(b);
  if (String(expect) !== q.answer) { fail++; console.log("  ✗ 算术题不自治：" + q.question + " = " + q.answer); }
  else pass++;
  if (op === "-") ok(Number(expect) > 0, "减法不出负数：" + q.question);
}

/* ---------- 5. 狒科生：三个选项里有且只有一个是图标对应的职业 ---------- */
for (let i = 0; i < 200; i++) {
  const q = hjvMakeFf14();
  ok(q.options.length === 3, "三选一");
  ok(q.options.filter((o) => o === q.answer).length === 1, "正确答案只出现一次");
  ok(new Set(q.options).size === 3, "三个选项不重复");
}

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail ? 1 : 0);
