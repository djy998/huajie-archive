/* 将 _src 压缩输出到站点根目录，并生成 /activity/、/previous/。
   三个页面的 <head> 里按 config.js 写入各自的分享卡片文字（og:title / og:description）和 JSON-LD 结构化数据
   （首页 WebSite；/activity/ 最新活动的 Event；/previous/ 往期活动的 Event 列表），活动日期取自 dateLabel。
   用法：cd _src && npm ci && node build.mjs [源码目录] [输出目录]（esbuild 版本锁定在 package.json / package-lock.json） */
import { transform } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(process.argv[2] || here);
const OUT = resolve(process.argv[3] || join(here, ".."));

const SCRIPTS = ["boot.js", "verify.js", "config.js", "main.js", "ticket.js", "venue.js", "survey.js", "admin.js", "huayu.js", "puzzle.js", "bard.js", "bard-stage.js", "games.js", "games-poems.js", "sw.js"];
const LEGACY_TARGET = { "boot.js": "es2015" };
const HUAYU_PARTS = ["util.js", "zi.js", "v1.js", "v2-lexicon.js", "v2-compress.js", "v2-sentence.js", "v2.js"];
const SITE_TITLE = "花舞之街 · 薰风花语町";
const SITE_URL = "https://swayingsussurrusstreet.dpdns.org/";
const STANDALONE_PAGES = [
  { dir: "activity", title: "最新活动" },
  { dir: "previous", title: "往期的活动" },
];

/* ==== 结构化数据与分享卡片 ==== */
/* config.js 是浏览器脚本（只有常量），放进空白环境里跑一遍取出活动数据 */
function readConfig(code) {
  return vm.runInNewContext(`${code}\n;({ LATEST_EVENT, ARCHIVE_EVENTS })`, {}, { timeout: 2000 });
}
const absUrl = (path) => new URL(String(path).replace(/^\//, ""), SITE_URL).href;
const shareImage = (src) => (/\.(?:jpe?g|png)(?:\?.*)?$/i.test(src || "") ? absUrl(src) : absUrl("og-image.jpg"));   // QQ、微信不一定认 webp
const pad = (n) => String(n).padStart(2, "0");
/* 「2026年1月1日–1月2日」「2025年9月21日 20:30–0:00」「2024年12月31日–2025年1月1日」「2021年12月24日–26日 每晚20:00–23:00」
   → { start, end }（北京时间，ISO 8601）；只写了年份、季节的认不出，返回 null */
function eventDates(label) {
  const m = /^(\d{4})年(\d{1,2})月(\d{1,2})日/.exec(String(label || "").trim());
  if (!m) return null;
  let [y, mo, d] = [+m[1], +m[2], +m[3]];
  const rest = label.slice(m[0].length);
  const day = (yy, mm, dd) => `${yy}-${pad(mm)}-${pad(dd)}`;
  let endDay = day(y, mo, d);
  const e = /^\s*[–—~-]\s*(?:(\d{4})年)?(?:(\d{1,2})月)?(\d{1,2})日/.exec(rest);
  if (e) endDay = day(+(e[1] || y), +(e[2] || mo), +e[3]);
  const t = /(\d{1,2}):(\d{2})\s*[–—~-]\s*(\d{1,2}):(\d{2})/.exec(rest);
  if (!t) return { start: day(y, mo, d), end: endDay };
  const start = `${day(y, mo, d)}T${pad(+t[1])}:${t[2]}:00+08:00`;
  let endAt = new Date(`${endDay}T${pad(+t[3])}:${t[4]}:00+08:00`);
  if (+t[3] * 60 + +t[4] <= +t[1] * 60 + +t[2]) endAt = new Date(endAt.getTime() + 86400000);   // 0:00 收场 = 第二天
  const local = new Date(endAt.getTime() + 8 * 3600000).toISOString().slice(0, 16);
  return { start, end: `${local}:00+08:00` };
}
function eventLd(ev, url) {
  const when = eventDates(ev.dateLabel);
  if (!when || !ev.title) return null;
  const shops = (ev.areas || []).flatMap((a) => a.shops || []).map((x) => x.name).filter(Boolean);
  return {
    "@type": "Event",
    name: ev.title,
    startDate: when.start,
    endDate: when.end,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
    location: { "@type": "VirtualLocation", name: `最终幻想14 ${ev.location || "莫古力区 · 梦羽宝境"}`, url: SITE_URL },
    image: [absUrl(ev.cover || "og-image.jpg")],
    description: `${ev.title}${ev.location ? `，${ev.location}` : ""}${shops.length ? `。参与店家：${[...new Set(shops)].slice(0, 12).join("、")}` : ""}`,
    organizer: { "@type": "Organization", name: SITE_TITLE, url: SITE_URL },
    isAccessibleForFree: true,
    url,
  };
}
const ldTag = (data) => `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", ...data }).replace(/</g, "\\u003c")}</script>`;
function pageMeta(page, cfg) {
  const latest = cfg.LATEST_EVENT || {};
  const archive = cfg.ARCHIVE_EVENTS || [];
  if (page === "activity") {
    const ld = eventLd(latest, absUrl("activity/"));
    return {
      title: latest.title || "最新活动",
      desc: [latest.title, latest.dateLabel, "活动介绍、店家一览、活动回顾与反馈"].filter(Boolean).join("｜"),
      image: shareImage(latest.cover),
      ld: ld ? ldTag(ld) : "",
    };
  }
  if (page === "previous") {
    const items = archive.map((ev, i) => ({ ev, ld: eventLd(ev, `${SITE_URL}#event-${ev.id}`), i })).filter((x) => x.ld);
    return {
      title: "往期的活动",
      desc: `花舞之街历届活动回顾：${archive.slice(0, 6).map((ev) => `${ev.year || ""}${ev.title}`).join("、")}`,
      ld: items.length ? ldTag({ "@type": "ItemList", name: "花舞之街 · 往期的活动",
        itemListElement: items.map(({ ld }, k) => ({ "@type": "ListItem", position: k + 1, item: ld })) }) : "",
    };
  }
  return {
    ld: ldTag({ "@type": "WebSite", name: SITE_TITLE, url: SITE_URL, inLanguage: "zh-CN",
      description: "最终幻想14莫古力区梦羽宝境花街的活动档案：最新活动、往期回顾、店家与场地" }),
  };
}
/* 换掉一个 <meta property|name="key" content="…"> 的内容 */
function setMeta(html, attr, key, value) {
  const re = new RegExp(`(<meta ${attr}="${key}" content=")[^"]*(")`);
  if (!re.test(html)) throw new Error(`index.html 里没有 <meta ${attr}="${key}">`);
  return html.replace(re, (_, a, b) => a + value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;") + b);
}
function withMeta(html, meta) {
  let out = html;
  if (meta.title) {
    const full = `${meta.title} · ${SITE_TITLE}`;
    out = setMeta(setMeta(out, "property", "og:title", full), "name", "twitter:title", full);
  }
  if (meta.desc) out = setMeta(setMeta(out, "property", "og:description", meta.desc), "name", "twitter:description", meta.desc);
  if (meta.image) out = setMeta(setMeta(out, "property", "og:image", meta.image), "name", "twitter:image", meta.image);
  return meta.ld ? out.replace("</head>", `${meta.ld}\n</head>`) : out;
}

const minifyJs = async (code, target = "esnext") =>
  (await transform(code, { loader: "js", minify: true, charset: "utf8", legalComments: "none", target })).code.trim();
const minifyCss = async (code) =>
  (await transform(code, { loader: "css", minify: true, charset: "utf8", legalComments: "none" })).code.trim();

async function buildScript(name) {
  let code = await readFile(join(SRC, name), "utf8");
  if (name === "admin.js") {
    code = code.replace(/(const ADMIN_PANELS_HTML = `)([\s\S]*?)(`;)/, (_, a, html, b) => a + html.replace(/\n[ \t]+/g, "\n").replace(/\n{2,}/g, "\n") + b);
  }
  if (name === "huayu.js") code = await bundleHuayu(code);
  return minifyJs(code, LEGACY_TARGET[name]);
}

/* 花语模块按依赖顺序拼接并包进闭包，字模型数据填入 zi.js 占位 */
async function bundleHuayu(entry) {
  const parts = await Promise.all(HUAYU_PARTS.map((f) => readFile(join(SRC, "huayu", f), "utf8")));
  const data = JSON.stringify(JSON.parse(await readFile(join(SRC, "huayu", "zi-data.json"), "utf8")));
  const zi = HUAYU_PARTS.indexOf("zi.js");
  parts[zi] = parts[zi].replace("/*@@ZI_DATA@@*/ null", () => data);
  return `(() => {\n${parts.join("\n")}\n${entry}\n})();`;
}

async function buildHtml(html) {
  const styles = [];
  let rest = html.replace(/<!--[\s\S]*?-->/g, "");
  for (const m of rest.matchAll(/<style>([\s\S]*?)<\/style>/g)) styles.push(`<style>${await minifyCss(m[1])}</style>`);
  let i = 0;
  rest = rest.replace(/<style>[\s\S]*?<\/style>/g, () => `\u0000${i++}\u0000`);
  rest = rest.replace(/\n[ \t]+/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{2,}/g, "\n").trim() + "\n";
  return rest.replace(/\u0000(\d+)\u0000/g, (_, k) => styles[Number(k)]);
}

/* 独立入口：data-page 让 main.js 直接显示对应视图，<base> 让相对地址指向站点根目录 */
function standalonePage(html, { dir, title }) {
  const out = html
    .replace(/<html([^>]*)>/, `<html$1 data-page="${dir}" data-site-title="${SITE_TITLE}">`)
    .replace(/(<meta charset="UTF-8">)/, `$1\n<base href="../">`)
    .replace(`<title>${SITE_TITLE}</title>`, `<title>${title} · ${SITE_TITLE}</title>`)
    .replace(/(<meta property="og:url" content="[^"]*?)\/?"/, `$1/${dir}/"`);
  if (!out.includes(`data-page="${dir}"`) || !out.includes('<base href="../">')) throw new Error(`${dir}/index.html 生成失败`);
  return out;
}

const report = [];
async function emit(name, content) {
  const before = (await readFile(join(SRC, name), "utf8")).length;
  await writeFile(join(OUT, name), content);
  report.push(`${name.padEnd(12)} ${String(before).padStart(8)} → ${String(content.length).padStart(8)}`);
}

for (const name of SCRIPTS) await emit(name, (await buildScript(name)) + "\n");
await emit("style.css", (await minifyCss(await readFile(join(SRC, "style.css"), "utf8"))) + "\n");
const cfg = readConfig(await readFile(join(SRC, "config.js"), "utf8"));
const html = await buildHtml(await readFile(join(SRC, "index.html"), "utf8"));
await emit("index.html", withMeta(html, pageMeta("", cfg)));
for (const page of STANDALONE_PAGES) {
  await mkdir(join(OUT, page.dir), { recursive: true });
  await writeFile(join(OUT, page.dir, "index.html"), withMeta(standalonePage(html, page), pageMeta(page.dir, cfg)));
  report.push(`${page.dir}/index.html`);
}
console.log(`${SRC} → ${OUT}\n` + report.join("\n"));
