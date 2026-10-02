/* 将 _src 压缩输出到站点根目录，并生成 /activity/、/previous/。
   用法：cd _src && npm install esbuild && node build.mjs [源码目录] [输出目录] */
import { transform } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(process.argv[2] || here);
const OUT = resolve(process.argv[3] || join(here, ".."));

const SCRIPTS = ["boot.js", "verify.js", "config.js", "main.js", "ticket.js", "venue.js", "survey.js", "admin.js", "huayu.js", "puzzle.js", "bard.js", "games.js", "sw.js"];
const LEGACY_TARGET = { "boot.js": "es2015" };
const HUAYU_PARTS = ["util.js", "zi.js", "v1.js", "v2-lexicon.js", "v2-compress.js", "v2-sentence.js", "v2.js"];
const SITE_TITLE = "花舞之街 · 薰风花语町";
const STANDALONE_PAGES = [
  { dir: "activity", title: "最新活动" },
  { dir: "previous", title: "往期的活动" },
];

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
const html = await buildHtml(await readFile(join(SRC, "index.html"), "utf8"));
await emit("index.html", html);
for (const page of STANDALONE_PAGES) {
  await mkdir(join(OUT, page.dir), { recursive: true });
  await writeFile(join(OUT, page.dir, "index.html"), standalonePage(html, page));
  report.push(`${page.dir}/index.html`);
}
console.log(`${SRC} → ${OUT}\n` + report.join("\n"));
