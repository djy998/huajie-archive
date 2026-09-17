# 人机验证扩展：Cloudflare + 狒科生 / 文科生 / 理科生

本次改动把原来「Cloudflare Turnstile + 算术题」两种方式，扩成**四种任选一种即可通过**：

| 按钮 | 玩法 | 说明 |
| --- | --- | --- |
| **Cloudflare** | Turnstile 组件 | 默认方式。国内打不开时（脚本出错 / 6 秒超时）自动切到手动验证 |
| **狒科生** | 看职业图标选职业（三选一） | 图标取自仓库 `jobicon/`，职业名与图标文件名一致（绘灵法师、龙骑士…）|
| **文科生** | 飞花令 | 给一个常用汉字，写一句含该字的诗词；点「提示」会给 20 个字供你拼 |
| **理科生** | 算术题 | 和原来一样，只是换了入口 |

- 三种手动方式**作为按钮并排显示**，用户**完成任意一种即通过**；「狒科生」是手动方式里的默认项。
- Cloudflare 仍是默认；国内打不开时自动用手动验证，手动方式用过一次会**记住 6 小时**（不会每次都先等它转圈）。
- 令字取的都是**中小学必背篇目里最常见**的 20 个字：春 花 月 风 山 水 云 雨 天 人 日 江 夜 秋 白 红 明 雪 千 心；
  诗词库 **184 句全部来自必背篇目**，判卷会去掉标点空格，只写半句也算对。
- 题目由 Worker 出、Worker 判，**答案不下发到前端**；答对发一张一次性通行证（10 分钟、只能用一次）。
- 职业图标走 Worker 代理（`/api?jobicon=<题目 id>`），**地址里不含职业名**，防止「看图片地址就知道答案」。

---

## 一、zip 里的文件与放法

```
huajie-verify-update/
├── README.md                    ← 本文件
├── changes.patch                ← 改动补丁（本地 git 一键应用，见第二节）
├── index.html                   ← 覆盖仓库根目录同名文件
├── style.css                    ← 覆盖仓库根目录同名文件
├── verify.js                    ← 新增，放仓库根目录（和 index.html 同级）
└── verify-ext/
    ├── worker-verify.js         ← 整段粘贴进 Worker
    ├── worker-insert-example.js        ← 「插到哪儿」的示意图（不用上传，看的）
    ├── verify-tables.sql        ← D1 建表语句（控制台执行）
    ├── selftest.js              ← 本地自测：node verify-ext/selftest.js
    └── apply-index-patch.py     ← 我改文件用的补丁脚本（归档用，不必执行）
```

> ⚠️ **部署顺序：先 Worker，后网页。**
> 新前端会调用新接口（`get_verify_task` 等），老 Worker 不认识就会提示「后端还是旧版本」；
> 反过来先更新 Worker 则完全无感（老前端照常跑）。

---

## 二、本地手动改（推荐，不用上 GitHub 网页）

假设你已经 clone 了仓库、在本地目录里：

### 方式 A：一键打补丁（最省事）

```bash
# 在仓库根目录
git checkout main && git pull                # 确保和线上一致
unzip huajie-verify-update.zip               # 解压到任意位置
git apply --stat  huajie-verify-update/changes.patch   # 先看一眼会改哪些文件
git apply        huajie-verify-update/changes.patch    # 应用改动
# 或者不用补丁，直接手动覆盖：
#   cp huajie-verify-update/index.html huajie-verify-update/style.css ./
#   cp huajie-verify-update/verify.js ./
git status                                   # 应看到 index.html / style.css 改动 + verify.js / verify-ext/ 新增
git add -A && git commit -m "人机验证扩展：Cloudflare + 狒科生/文科生/理科生"
git push
```

补丁只动这 4 个位置：`index.html`、`style.css` 两个文件 + 新增 `verify.js`、`verify-ext/`。
如果 `git apply` 报错（线上和本地版本不一致），就用方式 B 直接覆盖文件。

### 方式 B：直接覆盖文件

| 动作 | 文件 |
| --- | --- |
| 新增到仓库根目录 | `verify.js` |
| 覆盖仓库根目录同名文件 | `index.html`、`style.css` |

上传/推送后，浏览器**硬刷新**一次（或确认 `style.css?v=44` 生效）即可。

### 方式 C：不想碰本地 git

到 GitHub 仓库页面手动 **Add file → Upload files**：新增 `verify.js`，再上传替换 `index.html`、`style.css`
（`verify-ext/` 那个目录不用传，它只是给 Worker 用的资料，放本地就行）。

---

## 三、Cloudflare Worker 改动（5 处，全是「只加不删」）

打开 Cloudflare 控制台 → **Workers & Pages → 选中你的 Worker → 编辑代码**。
动手前可以先看 `verify-ext/worker-insert-example.js`，里面把 5 处插入点画在了常见的 worker.js 结构里。

**怎么找位置：** 在你的 worker.js 里搜 `OPTIONS`（插入点 1）、搜 `action`（插入点 2）、
搜 `siteverify` / `submit_ticket` / `verify_turnstile`（插入点 3、4），插入点 5 就是文件末尾。

### 插入点 1：`fetch` 最开头，加 GET 处理（代理职业图标用）

```js
async fetch(request, env, ctx) {
  /* ↓↓↓ 新增 ↓↓↓ */
  if (request.method === "GET") {
    const img = await hjVerifyImage(env, request);
    if (img) return img;          // 只有带 ?jobicon= 的请求会命中，其它 GET 继续走原逻辑
  }
  /* ↑↑↑ 新增 ↑↑↑ */

  if (request.method === "OPTIONS") return new Response(null, { headers: cors });   // 你原有的 CORS 处理
  // ……
```

### 插入点 2：解析出 body、分发 action 之前，加两行

```js
  const body = await request.json();

  /* ↓↓↓ 新增：接管 get_verify_task / get_verify_hint / verify_answer / verify_ping ↓↓↓ */
  const hv = await hjVerifyHandle(env, body, request);
  if (hv) return json(hv);     // json() 换成你原来「返回 JSON」的那个函数
  /* ↑↑↑ 新增 ↑↑↑ */

  switch (body.action) { /* 你原有的分发 */ }
```

### 插入点 3：`verify_turnstile` 里，原有 token / math 校验之前

```js
  /* ↓↓↓ 新增：手动验证的通行证（一次性，用过即废） ↓↓↓ */
  if (body.verifyPass) {
    const vp = await hjVerifyConsume(env, body.verifyPass);
    if (!vp.ok) return json({ ok: false, error: "captcha" });
  }
  /* ↑↑↑ 新增 ↑↑↑ */

  // 下面是你原来的 siteverify / 算术题校验，原样保留
```

### 插入点 4：`submit_ticket` 里，同样的三行

```js
  /* ↓↓↓ 新增 ↓↓↓ */
  if (body.verifyPass) {
    const vp = await hjVerifyConsume(env, body.verifyPass);
    if (!vp.ok) return json({ ok: false, error: "captcha" });
  }
  /* ↑↑↑ 新增 ↑↑↑ */

  // 下面是你原来的校验与写库逻辑，原样保留
```

> 若想让旧版的 `math` 也在这里一次校验完，可把插入点 3、4 换成 `hjVerifyCheckProof(env, body)`：
> 它接受 `verifyPass`，遇到 `token` / `math` 返回「不拦」，交给原逻辑。

### 插入点 5：把 `verify-ext/worker-verify.js` 整份粘贴到 worker.js 的最末尾

里面的函数名都以 `hj` 开头，不会和你原有代码撞名；不依赖任何 npm 包。
（想拆成单独文件 `import` 也行，见该文件末尾的注释说明。）

**需要额外配置吗？** 不需要新环境变量、不用改 Turnstile 的 sitekey/secret、D1 用原来的绑定即可
（绑定名任意，模块会自动找带 `prepare/batch` 的那个）。唯一可能要改的是 `worker-verify.js` 顶部的
`HJV_SITE_ORIGIN`（默认 `https://swayingsussurrusstreet.dpdns.org`），换域名时改它，
或加一个环境变量 `HJ_SITE_ORIGIN`。改完记得 **Deploy**。

---

## 四、D1 建表（可跳过，但建议执行一次）

控制台：**Workers & Pages → D1 → 选中你的库 → Console**，把 `verify-ext/verify-tables.sql` 整段粘进去执行；
或命令行：

```bash
npx wrangler d1 execute <你的数据库名> --remote --file=./verify-ext/verify-tables.sql
```

建的就是这三张表（外加三个索引）：

```sql
CREATE TABLE IF NOT EXISTS hj_verify_tasks (   -- 题目：正确答案只存在这里
  id TEXT PRIMARY KEY, mode TEXT NOT NULL, answer TEXT NOT NULL, meta TEXT,
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
  tries INTEGER NOT NULL DEFAULT 0, solved_at INTEGER);
CREATE TABLE IF NOT EXISTS hj_verify_passes (  -- 一次性通行证
  id TEXT PRIMARY KEY, mode TEXT, created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL, used_at INTEGER, ip TEXT);
CREATE TABLE IF NOT EXISTS hj_verify_rate (    -- 限流
  key TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_hj_verify_tasks_expires  ON hj_verify_tasks (expires_at);
CREATE INDEX IF NOT EXISTS idx_hj_verify_passes_expires ON hj_verify_passes (expires_at);
CREATE INDEX IF NOT EXISTS idx_hj_verify_rate_expires   ON hj_verify_rate (expires_at);
```

确认建好了：`SELECT name FROM sqlite_master WHERE name LIKE 'hj_verify%';`

> 不执行也能用：Worker 第一次收到验证请求时会自动建这三张表，SQL 与上面一模一样。

---

## 五、验收清单

1. **Worker 通了没**（把域名换成你的）：
   ```bash
   curl -s -X POST https://swayingsussurrusstreet.dpdns.org/api/ \
        -H 'Content-Type: application/json' -d '{"action":"verify_ping"}'
   ```
   期望：`{"ok":true,"version":"huajie-verify-1","modes":["ff14","poem","math"],"poems":184,...}`
2. **国内场景**：点「花街介绍」→ 先试 Cloudflare，6 秒内没出来自动切「狒科生」并提示原因 →
   选对职业 → 弹窗打开。（想手动模拟：DevTools → Network → Offline）
3. **三种方式各试一遍**：按钮并排；点「文科生」看令字和提示、点「理科生」做算术题，任一通过即可。
4. **购票**：填表 → 完成任意一种验证 → 提交 → 出现「登记成功」；同一张凭证重复提交应被拒绝。
5. **回归**：公告板、点赞、天气、日历等不受影响（本次只动验证相关代码）。

## 六、回滚

- 网页：`git revert` 或用备份换回旧的 `index.html` / `style.css`，删掉 `verify.js`；
- Worker：删掉那 5 处插入的代码（插入点 5 那段留着也不影响其它功能）；
- D1：三张表可留可删（`DROP TABLE hj_verify_tasks; …`）。

## 七、想改内容？

- **加/换职业**：图标放进 `jobicon/`（文件名用中文职业名），再到 `worker-verify.js` 的 `HJV_JOBS` 里加上同名职业。
- **换令字**：改 `HJV_KEYWORDS`；**加诗句**：往 `HJV_POEM_LINES` 里加（带标点就行），判卷与提示会自动用上
  —— 提示保证能拼出其中一句。
- **改有效期 / 限流**：`HJV_TASK_TTL_MS`、`HJV_PASS_TTL_MS`、`HJV_RATE_MAX_TASK`、`HJV_RATE_MAX_ANSWER`。
- **改免验证窗口 / 等 Cloudflare 的时间**：`index.html` 的 `CAPTCHA_GRACE_MS`、`verify.js` 的 `turnstileWaitMs`（默认 6000）。

## 八、这次 index.html / style.css 具体改了什么

`index.html`

| 位置 | 改动 |
| --- | --- |
| CSS 版本号 | `var CSS_VERSION = 43;` → `44`（让老访客拿到新样式）|
| 页面脚本之前 | 新增 `<script src="verify.js?v=1"></script>` |
| 验证弹窗 `#captchaOverlay` | `#turnstileWidget` / `#captchaMath` / 两个切换链接 → 一个挂载点 `<div class="verify-host" id="captchaVerify"></div>` |
| 购票表单 | 同上，换成 `<div class="verify-host ticket-verify" id="ticketVerify"></div>` |
| 脚本第 9 节 | 整节重写：删掉 `MathCaptcha` 类、`renderTurnstile`、`useMathInOverlay` 等，
改成 `HJVerify.createGate(...)` 两处（弹窗 + 购票表单）+ `finishCaptcha` 收凭证 |
| 购票提交 | `ticketState.proof` 取代 `ticketState.token` / `ticketMath`，凭证随 `submit_ticket` 一起发走 |
| 兜底 | `verify.js` 万一没加载成功，只在控制台报错并提示「刷新页面」，不影响其它功能 |

`style.css`：删除 `#turnstileWidget`、`.math-*`、`.captcha-switch*`、`.ticket-captcha`；
新增 `.verify-*` 一套（四种方式的胶囊按钮、职业图标框、20 个提示字、状态提示行、白天模式与窄屏适配）。
