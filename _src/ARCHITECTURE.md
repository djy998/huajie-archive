# 结构与设计取舍

改动前先读一遍，知道每块东西为什么是现在这个样子。具体怎么加功能见 `EXTENDING.md`。

## 总览

```
浏览器 ──GET──▶ GitHub Pages（仓库根目录：index.html、*.js、style.css、assets/…）
   │
   └──POST /api/──▶ Cloudflare Worker（同一域名）──▶ D1（数据）
                                                  └─▶ R2（公告配图，GET /api/image/<key>）
```

- 前端是纯静态页面，没有框架，也没有打包器，只有 `build.mjs` 做压缩。
- 后端只有一个 Worker 文件，在 Cloudflare 控制台里直接粘贴部署，不放进本仓库。

## 前端

### 文件与加载顺序

`index.html` 依次加载：

| 顺序 | 文件 | 职责 |
| --- | --- | --- |
| 1 | `boot.js` | 最先执行，兼容旧浏览器（es2015）。插入样式表、决定动画档位、开屏与回访遮罩，建立 `window.HJ` |
| 2 | `verify.js` | 人机验证组件，提供 `window.HJVerify` |
| 3 | `config.js` | 只放内容和常量，不写逻辑 |
| 4 | `main.js` | 路由、视图、弹窗、时间条、特效、通用工具（`$`、`callWorker`、`escapeHtml`、`createFormGate`…） |
| 5 | `ticket.js` / `venue.js` / `survey.js` | 各自一个功能，依赖 `main.js` 的工具 |

按需加载的有：`admin.js`（进入 `#internal`）、`huayu.js`（打开花语）、`puzzle.js`（打开花街拼图）、`bard.js`（打开吟游诗人模拟器）、`bard-stage.js`（模拟器里点「来舞台演奏」）、`games.js`（打开小游戏助手）、`assets/lib/exceljs.min.js`（导出 Excel）、`fonts.css`（正文字体，开屏后）。

加载提示（`main.js` 的 `trackLoad(promise, how)`）全站通用，都用开屏的莫古力，按「会不会挡住访客」分两种，网快时什么都看不到：

| 方式 | 样子 | 用在 | 出现 / 最短显示 |
| --- | --- | --- | --- |
| `"block"` | 全屏遮罩 +「正在加载库啵……」，盖住页面防止重复点击；超过 12 秒先收起并提示「网络有点慢」 | 访客点了要等它好才能往下做：提交、打开要读数据的页面、按需脚本、没有缩略图的大图 | 0.35 秒 / 0.7 秒 |
| `"corner"` | 右下角小号转圈，不挡点击 | 在加载但不耽误做别的：进站读站点设置、点赞与点赞数、扩充题库、钢琴采样、拼图 / 问卷状态 | 0.6 秒 / 0.9 秒 |
| `"none"` | 不提示 | 定时刷新、后台再确认开关、预取 | — |

- `callWorker(payload, { load })` 默认 `auto`：访客刚点过 / 按过回车（1.5 秒内）发出的请求，或已有全屏提示在等时接着发出的请求，算 `block`，其余算 `none`。定时器里的刷新包在 `runQuietly(fn)` 里。
- `loadLateScript(file, ready, { load })` 默认 `block`，后台预取传 `corner` 或 `none`。
- 小号转圈的事访客后来真要用到时，对同一个 promise 再 `trackLoad(p, "block")` 升级成全屏。例如站点设置：首次进站时开屏会等它（最多到开屏的等待上限），之后右下角转圈；还没读完就点了要人机验证或花语的功能，`siteStateReady()` 让这次操作全屏等它读完，免得按默认设置走错。
- 全屏出现时右下角的小号转圈先藏起来；开屏或回访遮罩还在时两种都不出现，由它们的莫古力代劳。
- 回访遮罩（不放开屏的进站，含每次更新后第一次打开）：`boot.js` 给 `<html>` 加 `boot-veil`（白天再加 `boot-veil-day`），`index.html` 里的 `#bootVeil`（样式内联，样式表没到也能显示）盖住页面；等样式表、`main.js` 的 `initApp`（白天 / 夜晚、首页卡片）、天空与首页卡片底图、标题字都好了再淡出（主程序就绪后图片与字体最多再等 2.5 秒，整体最长 12 秒；`main.js` 没加载成功时 DOMContentLoaded 后照常撤掉）。莫古力 0.3 秒后才出现，网快时只闪一下底色。入场动画、弹窗公告用 `HJ.boot.afterVeil(fn)` 留到撤掉时；`HJ.boot.veiled()` 查是否还盖着。

### 约定

- 所有脚本都是普通 `<script>`，顶层的 `function` 声明就是全局函数。跨文件调用写成 `window.xxx?.()`，被调用的文件加载失败时也不会连带报错。
- `main.js` 的 `initApp` 与 `admin.js` 末尾的初始化各自包在 `try/catch` 里，一个模块出错不会拖垮整页。
- 页面上的文字统一用 `textContent` 写入。必须拼 HTML 时，所有变量都要经过 `escapeHtml`。
- 路由用 hash（`#latest`、`#previous`、`#ti` …），对照表是 `main.js` 的 `ROUTES`。`/activity/`、`/previous/` 是 `build.mjs` 生成的独立入口：`<html data-page>` 决定显示哪个视图，`<base href="../">` 让相对路径仍然指向站点根目录。
- 弹窗统一登记在 `main.js` 的 `MODALS`，Esc、返回键和 `closeAllModals` 都靠这张表。
- 动画档位挂在 `body` 上：`fx-hover-enabled`（完整）、`fx-lite`（轻量）、`fx-off`（关闭）。纯 CSS 的弹出、晃动动画要在 `body.fx-off` 下关掉。
- 配色：毛笔标题字夜间用 `--lantern-soft`；白天卡片 / 弹窗里的用 `--day-cream`（深绿近黑 #1e2810，也是白天卡片里的深色正文字），直接写在页面背景上的（`.section-title`、卡片外的 `.tab-sec-title`）用 `--day-title`。`--day-gold` 为白天卡片里的加粗小标题与强调字（深暖紫 #4b2341，如网站说明里「点赞」「图片」这一列）。
- 手机（`pointer: coarse` 或宽度 ≤ 760）首页减负：花叶 8 片（电脑 17 片），明暗用透明度起伏而不是 filter 动画；页头毛玻璃模糊 8px（电脑 17px）。花叶、星光在毛玻璃后面动，模糊半径越大、filter 动画越多，手机上越卡；新增首页毛玻璃或背景动画时留意。
- 小按钮、选项一律用「凸起玻璃」：`style.css` 设计变量里的 `--glass-up`（平常）、`--glass-on`（选中 / 主按钮）、`--glass-sheen`（叠在任意底色上的高光），配 `--glass-up-edge`、`--glass-up-shadow` 等，白天整套自动换。悬停浮起、按下压进去写在「18. 按下反馈」里，新按钮把类名加进那组选择器即可。不要再做没有阴影的扁平按钮。

### 安全

- CSP 写在 `index.html` 的 `<meta>` 里。脚本只允许本站，以及 Turnstile 和 Cloudflare 统计；不允许内联脚本。图片只允许本站、`data:` 和 `blob:`。
- `frame-ancestors` 不能写在 `<meta>` 里，要靠 Cloudflare Transform Rule 加响应头，见更新说明。
- 外部来源只有 Turnstile（`challenges.cloudflare.com`）、Cloudflare 统计和 B 站播放器，都在 CSP 里逐个放行。新增外部来源要同时改 CSP。

### 离线缓存（`sw.js`）

- 页面：网络优先，3.5 秒超时后用缓存。
- 带 `?v=` 的脚本和样式：缓存优先。版本号一变就会重新下载。
- 图片和字体：缓存优先，每 6 小时在后台更新一次。

## 后端（Worker）

- **入口**：`GET /ping` 用于自检，`GET /image/<key>` 返回 R2 里的配图，其余请求都是 `POST` JSON `{ action, … }`。
  - 请求必须是 `application/json`。浏览器标为跨站（`Sec-Fetch-Site`）的请求直接拒绝。
- **处理流程**：`handlers[action]` 分发 → `ensureSchema` → `RATE_LIMITS` 限流 → 执行处理函数。异常统一返回 `server_error`。
- **身份**：
  - 密码 A、B、C 和查看密码分别对应 `a`、`b`、`c`（管理员）、`v`（只读）。查看密码在管理页改过后存在 D1（加盐哈希），以它为准。
  - 管理员密码 15 分钟内输错 3 次，封锁 15 分钟。
- **人机验证**：手动验证的题面都不以文字下发：狒科生的职业图标、理科生的算式都是图片（data URL；算式由 Worker 的 `mathImage` 用笔画字形画成带扭曲和干扰线的 PNG，前端 `verify.js` 的 `paintImage` 按主题染色），文科生的令字在前端画到 canvas 上；答案只在加密的题目 id 里（AES-GCM），判卷在服务端。`verifyHumanMode` 返回验证方式并写进记录：`cf`（自动验证，Turnstile）、`ff14`（狒科生）、`poem`（文科生）、`math`（理科生）、`off`（站点关闭了验证）。管理页显示的中文名在 `admin.js` 的 `VERIFY_MODE_NAMES`。
- **IP 属地**：`requestGeo` 从 Cloudflare 的 `request.cf` 取出「国家|地区|城市」。数据库不保存 IP 本身。访客标识（`client_key`）是带密钥的 IP 哈希，只用于限流和防重复。
- **表结构**：
  - `SCHEMA_SQL` 只用 `CREATE … IF NOT EXISTS`。给已有表加列写在 `ADDED_COLUMNS`。
  - 改动后把 `SCHEMA_VERSION` 加 1，新版本收到第一个请求时会自动迁移，不需要手动执行 SQL。

## 设计取舍

| 决定 | 原因 | 代价 |
| --- | --- | --- |
| Worker 挂在同一域名的 `/api/` | 不需要跨域（CORS），CSP 可以只写 `connect-src 'self'` | Worker 的路由必须绑定在本站域名上 |
| 不用内联脚本，启动逻辑放进 `boot.js` | CSP 可以禁掉内联脚本，注入的脚本无法执行 | 多一次请求，由 `<link rel=preload>` 抵消 |
| 字体自托管并按字切片 | 国内访问不依赖 Google；浏览器只下载用到的字 | 仓库多出约 190 个字体文件 |
| 标题字体分两层：`brush.woff2` 只含现有标题用字（开屏预加载），`brush-ext-*.woff2` 按字频切片放约 2700 个常用字（unicode-range 按需下载） | 开屏时就要用，必须很小；新标题多数字不用重新生成 | 标题用到两层都没有的字时才要重新生成 |
| 表结构自动迁移 | 只需在控制台粘贴代码，不需要 wrangler 或 SQL | 只能加表、加列。改列或删列要另写迁移 |
| 只存属地，不存 IP | 管理端够用，也少保管一份个人信息 | 无法按 IP 追查，只能用访客标识的前 6 位对照 |
| 花语算法文件不改 | 改了旧花语就解不开 | 新格式只能另加一代 |
