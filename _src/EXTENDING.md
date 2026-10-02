# 修改与扩展指南

这里列出常见改动的做法。按这些步骤改，可以保持现有结构不被打乱。整体设计见 `ARCHITECTURE.md`。

## 通用规则

1. 只改 `_src/` 里的源码，改完用 `build.mjs` 生成根目录的发布版。不要手改根目录下压缩过的文件。
2. 改了 `_src/` 里任何会发布的文件，都要把 `index.html` 里所有的 `?v=` 统一换成新版本号（例如 `20261015a`）。否则浏览器和离线缓存会继续用旧文件。
3. 页面上的文字用 `textContent` 写入。必须拼 HTML 时，每个变量都要套上 `escapeHtml(…)`。
4. 不写内联脚本，也不写 `onclick="…"` 这类内联事件。CSP 会拦掉它们，事件一律用 `addEventListener` 绑定。
5. 调用其他文件里的函数，写成 `window.函数名?.()`。
6. 先部署 Worker，再上传前端。新 Worker 要能兼容旧页面：只新增字段和接口，不删除、不改名。

## 改活动内容（最常见）

只改 `config.js`，不需要动其他文件：

| 想改的 | 位置 |
| --- | --- |
| 最新活动（标题、时间、海报、店铺、页签） | `LATEST_EVENT`，首页视频在 `LATEST_VIDEO` |
| 往期活动 | `ARCHIVE_EVENTS`，新的放最前 |
| 小型回顾 | `MINI_REVIEWS` |
| 日历标注 | `HJ_CAL_ITEMS` |
| 建成记录视频 | `INFO_RECORD_VIDEOS`：`aid`、`cid` 在 B 站视频页的分享嵌入代码里；`cover` 可以不填 |
| 首页卡片底图、天空 | `TILE_BG`、`SKY_IMAGES`，替换同名图片时把 `?v=` 加一 |

加了新图片，在 `_src` 目录运行 `python tools/make-thumbs.py` 生成缩略图。标题字体已经带了约 2900 个常用字（按需下载），只有标题用到生僻字时才需要运行 `python tools/make-brush-font.py` 重新生成。所需依赖写在两个脚本的开头。

## 加一个页面（视图）

1. 在 `index.html` 里加 `<section id="view-xxx" class="view" hidden>…</section>`。
   - 需要返回按钮的话，照抄其他视图里的「← 返回」按钮。
2. 在 `main.js` 写 `openXxx()`，里面调用 `showView("view-xxx")`。
3. 在 `main.js` 的 `ROUTES` 加一行 `"#xxx": () => openXxx()`，直达链接就能用了。
4. 如果它也要像 `/activity/` 一样做成独立入口：在 `build.mjs` 的 `STANDALONE_PAGES` 加一项，并在 `main.js` 的 `STANDALONE_PAGES` 照现有两项补上。

## 加一个弹窗

1. 在 `index.html` 里照抄一个现有的 overlay，例如 `groupOverlay`：遮罩、卡片、关闭按钮 `xxxClose`。
2. 在 `main.js` 写 `openXxx` / `closeXxx`。打开时调用 `playEnterAnim(卡片)`，关闭时把遮罩设回 `hidden`。
3. 把它登记进 `MODALS`：`{ overlay: "xxxOverlay", closeBtn: "xxxClose", close: closeXxx }`。Esc 关闭、切换页面时自动关闭都靠这张表；点遮罩关闭用 `closeOnBackdrop(遮罩, closeXxx)`。

## 在「更多」里加入口

在 `main.js` 的 `MORE_ITEMS` 加一项：`{ id, label, open, icon }`。`icon` 写 24×24 的 SVG 路径。只在某些条件下显示的，再加 `shown: () => 条件`。

## 加一个需要人机验证的表单

**前端**

```js
const gate = createFormGate($("xxxCaptcha"));        // 放验证组件的容器
// 提交时：
const tip = gate.missing();                          // 还没验证就返回提示语，并打开验证
if (tip) return setMsg(msg, tip);
const data = await callWorker({ action: "submit_xxx", ...fields, ...gate.proof() });
gate.afterSubmit(data);                              // 成功后收起验证，失败时自动刷新
```

**Worker**

1. 在 `RATE_LIMITS` 加 `submit_xxx: { limit: 10, windowSec: 3600 }`。凡是新加的接口都要加限流。
2. 在 `handlers` 里写处理函数。可以照抄 `submit_feedback`：
   - 先校验和清洗输入（`cleanText`、`cleanLine`）；
   - 再调用 `const verifyMode = await verifyHumanMode(ctx); if (!verifyMode) return fail("captcha");`；
   - 写库时一并存入 `verify_mode` 和 `requestGeo(ctx.request)`。
3. 新表：在 `SCHEMA_SQL` 加 `CREATE TABLE IF NOT EXISTS …`。给旧表加列：写进 `ADDED_COLUMNS`。两种情况都要把 `SCHEMA_VERSION` 加 1。
4. 把 `WORKER_VERSION` 改成当天日期，部署后用 `/api/ping` 确认。

**管理页**：列表里每一行附上 `submitMetaHtml(item)`，就会显示属地和验证方式。

## 管理页加一个面板

1. 在 `index.html` 的 `adminPills` 里加按钮：`<button type="button" class="tab-btn" data-admin-panel="xxxPanel">名称</button>`。
2. 在 `admin.js` 的 `ADMIN_PANELS_HTML` 里加 `<div class="gate-card admin-card" id="xxxPanel" hidden>…</div>`。
3. 写 `initXxxAdmin()` 并加进文件末尾的初始化列表。面板每次打开都要刷新的话，在 `ADMIN_PANEL_REFRESH` 登记。
4. Worker 里对应的处理函数第一行写 `if (!(await isAdmin(ctx))) return denied();`，同时加进 `RATE_LIMITS`。

## 引用外部资源

CSP 默认只允许本站。要嵌入新的外部来源（视频、图片、脚本），先在 `index.html` 的 CSP `<meta>` 对应的指令里加上那个域名，例如 `frame-src`、`img-src`、`script-src`。尽量把文件放进本站，不引用外部地址。

## 字体

- 正文和毛笔字的切片字体在 `assets/fonts/`，一般不用动。
- 艾欧泽亚文字给元素加 class 就能用：`eorzean`、`eorzean-classic`、`hingashi`。
- 商业字体（Jupiter Pro、AXIS、Eurostar）不要放进网站。

## 不要做的事

- 不要改 `huayu/` 下的算法文件（`zi.js`、`zi-data.json`、`v1.js`、`v2-*.js`），改了旧花语就解不开。需要新格式时，新加一代，并在 `huayu.js` 的 `ALGOS` 登记。
- 不要把 Worker 代码、密码和密钥放进仓库。
- 不要删 Worker 里已有的 action 或返回字段，线上旧页面还在用。
- 不要在数据库里存原始 IP。

## 改完自查

- 打开 `F12 → Console`，没有红色报错，也没有 `Content-Security-Policy` 报错。
- 手机宽度（390px）下页面不横向滚动。
- 改过 Worker 的，访问 `/api/ping` 看版本号，再实际提交一次表单。
