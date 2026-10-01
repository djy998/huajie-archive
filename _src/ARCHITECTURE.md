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
| 1 | `boot.js` | 最先执行，兼容旧浏览器（es2015）。插入样式表、决定动画档位、开屏，建立 `window.HJ` |
| 2 | `verify.js` | 人机验证组件，提供 `window.HJVerify` |
| 3 | `config.js` | 只放内容和常量，不写逻辑 |
| 4 | `main.js` | 路由、视图、弹窗、时间条、特效、通用工具（`$`、`callWorker`、`escapeHtml`、`createFormGate`…） |
| 5 | `ticket.js` / `venue.js` / `survey.js` | 各自一个功能，依赖 `main.js` 的工具 |

按需加载的有：`admin.js`（进入 `#internal`）、`huayu.js`（打开花语）、`puzzle.js`（打开花街拼图）、`assets/lib/exceljs.min.js`（导出 Excel）、`fonts.css`（正文字体，开屏后）。

### 约定

- 所有脚本都是普通 `<script>`，顶层的 `function` 声明就是全局函数。跨文件调用写成 `window.xxx?.()`，被调用的文件加载失败时也不会连带报错。
- `main.js` 的 `initApp` 与 `admin.js` 末尾的初始化各自包在 `try/catch` 里，一个模块出错不会拖垮整页。
- 页面上的文字统一用 `textContent` 写入。必须拼 HTML 时，所有变量都要经过 `escapeHtml`。
- 路由用 hash（`#latest`、`#previous`、`#ti` …），对照表是 `main.js` 的 `ROUTES`。`/activity/`、`/previous/` 是 `build.mjs` 生成的独立入口：`<html data-page>` 决定显示哪个视图，`<base href="../">` 让相对路径仍然指向站点根目录。
- 弹窗统一登记在 `main.js` 的 `MODALS`，Esc、返回键和 `closeAllModals` 都靠这张表。

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
  - 密码 A、B、C 和查看密码分别对应 `a`、`b`、`c`（管理员）、`v`（只读）。
  - 管理员密码 15 分钟内输错 3 次，封锁 15 分钟。
- **人机验证**：`verifyHumanMode` 返回验证方式并写进记录：`cf`（自动验证，Turnstile）、`ff14`（狒科生）、`poem`（文科生）、`math`（理科生）、`off`（站点关闭了验证）。管理页显示的中文名在 `admin.js` 的 `VERIFY_MODE_NAMES`。
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
| 标题字体单独做子集（`brush.woff2`） | 开屏时就要用，必须很小 | 标题出现新字时要重新生成 |
| 表结构自动迁移 | 只需在控制台粘贴代码，不需要 wrangler 或 SQL | 只能加表、加列。改列或删列要另写迁移 |
| 只存属地，不存 IP | 管理端够用，也少保管一份个人信息 | 无法按 IP 追查，只能用访客标识的前 6 位对照 |
| 花语算法文件不改 | 改了旧花语就解不开 | 新格式只能另加一代 |
