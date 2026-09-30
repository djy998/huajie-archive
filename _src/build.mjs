/* 发布版生成：把 _src 里的源码压缩成网站实际使用的文件（去掉注释和多余空白），写到网站根目录。
   用法（需要 Node.js 18+）：
     cd _src
     npm install esbuild        （只需第一次）
     node build.mjs
   也可以指定目录：node build.mjs <源码目录> <输出目录> */
import { transform } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(process.argv[2] || here);
const OUT = resolve(process.argv[3] || join(here, ".."));

const SCRIPTS = ["verify.js", "config.js", "main.js", "ticket.js", "venue.js", "survey.js", "admin.js", "huayu.js", "sw.js"];

const minifyJs = async (code, target = "esnext") =>
  (await transform(code, { loader: "js", minify: true, charset: "utf8", legalComments: "none", target })).code.trim();
const minifyCss = async (code) =>
  (await transform(code, { loader: "css", minify: true, charset: "utf8", legalComments: "none" })).code.trim();

/* 模板字符串里的 HTML：只去掉每行的缩进（换行本身等于一个空格，显示效果不变） */
const dedentHtml = (html) => html.replace(/\n[ \t]+/g, "\n").replace(/\n{2,}/g, "\n");

async function buildScript(name) {
  let code = await readFile(join(SRC, name), "utf8");
  if (name === "admin.js") {
    code = code.replace(/(const ADMIN_PANELS_HTML = `)([\s\S]*?)(`;)/, (_, a, html, b) => a + dedentHtml(html) + b);
  }
  /* 花语：huayu/ 下的各个模块按顺序拼在入口 huayu.js 前面，字模型的数据填进 zi.js 的占位处 */
  if (name === "huayu.js") code = await bundleHuayu(code);
  return minifyJs(code);
}

/* 花语的各个模块（顺序不能乱：后面的用到前面的） */
const HUAYU_PARTS = ["util.js", "zi.js", "v1.js", "v2-lexicon.js", "v2-compress.js", "v2-sentence.js", "v2.js"];

async function bundleHuayu(entry) {
  const parts = [];
  for (const f of HUAYU_PARTS) parts.push(await readFile(join(SRC, "huayu", f), "utf8"));
  const data = JSON.stringify(JSON.parse(await readFile(join(SRC, "huayu", "zi-data.json"), "utf8")));
  parts[HUAYU_PARTS.indexOf("zi.js")] = parts[HUAYU_PARTS.indexOf("zi.js")].replace("/*@@ZI_DATA@@*/ null", () => data);
  /* 整个包进一个函数里：模块之间照常互相引用，又不会在访客页面上多出一堆全局变量 */
  return `(() => {\n${parts.join("\n")}\n${entry}\n})();`;
}

async function buildHtml(html) {
  const pieces = [];
  let rest = html.replace(/<!--[\s\S]*?-->/g, "");
  /* 内联的 <script> / <style> 单独压缩，先换成占位符，免得下面的缩进处理碰到它们 */
  rest = await replaceAsync(rest, /<script>([\s\S]*?)<\/script>/g, async (_, js) => {
    pieces.push(`<script>${await minifyJs(js, "es2015")}</script>`);   // 开屏脚本要在老浏览器上也能跑
    return `\u0000${pieces.length - 1}\u0000`;
  });
  rest = await replaceAsync(rest, /<style>([\s\S]*?)<\/style>/g, async (_, css) => {
    pieces.push(`<style>${await minifyCss(css)}</style>`);
    return `\u0000${pieces.length - 1}\u0000`;
  });
  rest = rest.replace(/\n[ \t]+/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{2,}/g, "\n").trim() + "\n";
  return rest.replace(/\u0000(\d+)\u0000/g, (_, i) => pieces[Number(i)]);
}

async function replaceAsync(text, re, fn) {
  const jobs = [];
  text.replace(re, (...args) => { jobs.push(fn(...args)); return ""; });
  const results = await Promise.all(jobs);
  let i = 0;
  return text.replace(re, () => results[i++]);
}

const report = [];
async function emit(name, content) {
  const before = (await readFile(join(SRC, name), "utf8")).length;
  await writeFile(join(OUT, name), content);
  report.push(`${name.padEnd(12)} ${String(before).padStart(8)} → ${String(content.length).padStart(8)} 字符`);
}

for (const name of SCRIPTS) await emit(name, (await buildScript(name)) + "\n");
await emit("style.css", (await minifyCss(await readFile(join(SRC, "style.css"), "utf8"))) + "\n");
const html = await buildHtml(await readFile(join(SRC, "index.html"), "utf8"));
await emit("index.html", html);
await emitActivityPage(html);
/* /activity/：最新活动的独立入口（没有「← 返回」，地址栏保持 /activity/）。
   就是同一个首页，只是 <html data-page="activity"> 让 main.js 直接显示最新活动，
   <base href="../"> 让页面里的相对地址（脚本、样式、图片）照旧指向站点根目录 */
async function emitActivityPage(html) {
  const SITE_TITLE = "花舞之街 · 薰风花语町";
  const out = html
    .replace(/<html([^>]*)>/, `<html$1 data-page="activity" data-site-title="${SITE_TITLE}">`)
    .replace(/(<meta charset="UTF-8">)/, `$1\n<base href="../">`)
    .replace(`<title>${SITE_TITLE}</title>`, `<title>最新活动 · ${SITE_TITLE}</title>`)
    .replace(/(<meta property="og:url" content="[^"]*?)\/?"/, `$1/activity/"`);
  if (!out.includes('data-page="activity"') || !out.includes('<base href="../">')) throw new Error("activity/index.html 生成失败");
  await mkdir(join(OUT, "activity"), { recursive: true });
  await writeFile(join(OUT, "activity", "index.html"), out);
  report.push(`${"activity/index.html"}（由 index.html 生成）`);
}

console.log(`源码：${SRC}\n输出：${OUT}\n` + report.join("\n"));
