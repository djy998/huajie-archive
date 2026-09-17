# 人机验证扩展：Cloudflare + 狒科生 / 文科生 / 理科生

本次改动的目标：把原来「Cloudflare Turnstile + 算术题」的两种方式，扩成**四种任选一种即可通过**的验证：

| 按钮 | 玩法 | 说明 |
| --- | --- | --- |
| **Cloudflare** | Turnstile 组件 | 默认方式。国内打不开时（脚本出错 / 6 秒超时）自动切到手动验证 |
| **狒科生** | 看职业图标选职业（三选一） | 图标取自仓库 `jobicon/`，职业名与图标文件名一致（绘灵法师、龙骑士…）|
| **文科生** | 飞花令 | 给一个常用汉字，写一句含该字的诗词；点「提示」会给 20 个字供你拼 |
| **理科生** | 算术题 | 和原来一样，只是换了入口 |

设计要求都满足：

- 三种手动方式**作为按钮并排显示**，用户**完成任意一种即通过**；「狒科生」是手动方式里的默认项。
- Cloudflare 是默认方式，国内打不开时自动启用手动验证；手动方式用过一次后会记住 6 小时（下次不用再等 Cloudflare 转圈）。
- 令字取的都是**中小学必背篇目里最常见**的 20 个字（春 花 月 风 山 水 云 雨 天 人 日 江 夜 秋 白 红 明 雪 千 心），
  诗词库 184 句也全部来自必背篇目，随便接一句都能对上；判卷会去掉标点空格，只写半句也算对。
- 题目由 Worker 出、Worker 判，**答案不会下发到前端**；答对发一张一次性通行证（10 分钟、只能用一次）。
- 职业图标走 Worker 代理（`/api?jobicon=<题目 id>`），**地址里不含职业名**，防止「看图片地址就知道答案」。

---

## 一、文件清单（zip 里都在）

| 文件 | 放哪儿 | 说明 |
| --- | --- | --- |
| `index.html` | 仓库根目录（**替换**） | 验证弹窗与购票表单改成组件挂载点；引入 `verify.js`；CSS 版本号 +1 |
| `style.css` | 仓库根目录（**替换**） | 删掉旧的算术题 / 切换链接样式，加入四种方式的按钮、图标、提示字样式 |
| `verify.js` | 仓库根目录（**新增**） | 验证界面组件（`window.HJVerify`），弹窗和购票表单共用 |
| `verify-ext/worker-verify.js` | **粘贴进 Worker** | 出题、判卷、通行证、图标代理，自成一体，不依赖 Worker 原有代码 |
| `verify-ext/verify-tables.sql` | D1 控制台执行 | 三张表；不执行也行，Worker 第一次用到会自动建 |
| `verify-ext/selftest.js` | 可留仓库 | 本地自测：`node verify-ext/selftest.js`（题库、判卷、算术、三选一） |
| `verify-ext/apply-index-patch.py`、`apply-css-patch.py` | 归档用 | 我改 `index.html` / `style.css` 用的补丁脚本，留着方便对照改动，不必执行 |

> ⚠️ **部署顺序：先 Worker，后网页。** 新前端会调用新的接口（`get_verify_task` 等），
> 老 Worker 不认识就会提示「后端还是旧版本」；反过来先更新 Worker 则完全无感（老前端照常跑）。

---

## 二、Cloudflare Worker 改动（4 处，都是「插入」，不动原有逻辑）

打开 Cloudflare 控制台 → Workers & Pages → 选中你的 Worker → 编辑代码：

### 1. 把 `verify-ext/worker-verify.js` 的内容整段粘贴到 worker.js 的最末尾

粘贴后可以直接用，里面的函数名都以 `hj` 开头，不会和你原有的函数撞名。
（若你想把它单独放一个文件 `import`，把文件末尾那行 `export { … }` 的注释去掉即可。）

### 2. `fetch` 处理函数的开头，加一段 GET 处理（职业图标代理要用）

```js
async fetch(request, env, ctx) {
  /* ↓↓↓ 新增 ↓↓↓ */
  if (request.method === "GET") {
    const img = await hjVerifyImage(env, request);
    if (img) return img;            // 只有带 ?jobicon= 的请求会命中，其它 GET 继续走原逻辑
  }
  /* ↑↑↑ 新增 ↑↑↑ */

  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });   // 你原有的 CORS 处理
  …
```

### 3. 解析出 body、分发 action 的地方，加两行

```js
  const body = await request.json();

  /* ↓↓↓ 新增：验证扩展模块接管的 action（get_verify_task / verify_answer / get_verify_hint / verify_ping） ↓↓↓ */
  const hv = await hjVerifyHandle(env, body, request);
  if (hv) return json(hv);          // json() 换成你原来的返回函数（返回 JSON 的那个）
  /* ↑↑↑ 新增 ↑↑↑ */

  switch (body.action) { … }        // 你原有的分发逻辑
```

### 4. 原来校验 token / 算术题的地方（`submit_ticket`、`verify_turnstile` 各一处），加三行

```js
  /* ↓↓↓ 新增：手动验证（狒科生 / 文科生 / 理科生）的通行证 ↓↓↓ */
  if (body.verifyPass) {
    const vp = await hjVerifyConsume(env, body.verifyPass);
    if (!vp.ok) return json({ ok: false, error: "captcha" });
  }
  /* ↑↑↑ 新增 ↑↑↑ */

  … // 下面是你原来的 turnstile token / math 校验，原样保留
```

> 如果想让旧版的 `math` 也能一次校验完，可以把第 4 处换成调用 `hjVerifyCheckProof(env, body)`
> （它接受 `verifyPass`，遇到 `token` / `math` 会返回「不拦」，交给原逻辑）。

**需要额外配置吗？** 不需要新的环境变量、不需要改 Turnstile 的 sitekey/secret、D1 用原来的绑定即可（绑定名任意，模块会自动找带 `prepare/batch` 的那个）。
唯一可能要改的是 `worker-verify.js` 顶部的 `HJV_SITE_ORIGIN`：它决定 Worker 去哪儿取职业图标，默认就是
`https://swayingsussurrusstreet.dpdns.org`；换域名时改这里，或加一个环境变量 `HJ_SITE_ORIGIN`。

---

## 三、D1 建表（可跳过，但建议执行一次）

控制台：**Workers & Pages → D1 → 选中你的库 → Console**，把 `verify-ext/verify-tables.sql` 整段粘进去执行；
或用命令行：

```bash
npx wrangler d1 execute <你的数据库名> --remote --file=./verify-ext/verify-tables.sql
```

建的是什么：

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

确认建好了：

```sql
SELECT name FROM sqlite_master WHERE name LIKE 'hj_verify%';
```

---

## 四、GitHub 仓库改动

在仓库里：

1. **新增** `verify.js`（整份上传到根目录，和 `index.html` 同级）；
2. **替换** `index.html`、`style.css` 两份文件。

`index.html` 这次改了什么（想手工改也可以）：

| 位置 | 改动 |
| --- | --- |
| `<head>` 之后的 CSS 版本号 | `var CSS_VERSION = 43;` → `44`（让老访客拿到新样式）|
| 页面脚本前 | 新增一行 `<script src="verify.js?v=1"></script>` |
| 验证弹窗 `#captchaOverlay` | `#turnstileWidget` / `#captchaMath` / 两个切换链接 → 一个挂载点 `<div class="verify-host" id="captchaVerify"></div>` |
| 购票表单 | 同上，换成 `<div class="verify-host ticket-verify" id="ticketVerify"></div>` |
| 脚本第 9 节 | 整节重写：`MathCaptcha` 类、`renderTurnstile`、`useMathInOverlay` 等删掉，改成 `HJVerify.createGate(...)` 两处 + `finishCaptcha` 收凭证 |
| 购票提交 | `ticketState.proof` 取代 `ticketState.token` / `ticketMath`；提交时把凭证一起发给 Worker |

`style.css`：删掉 `#turnstileWidget`、`.math-*`、`.captcha-switch*`、`.ticket-captcha`，新增 `.verify-*` 一套
（四种方式的胶囊按钮、职业图标框、20 个提示字、白天模式与窄屏适配）。

上传后记得**硬刷新**一次（或看到 `style.css?v=44` 生效）即可。

---

## 五、验收清单

1. **Worker 通了没**：向 Worker POST 一下
   ```bash
   curl -s -X POST https://<你的域名>/api/ -H 'Content-Type: application/json' \
        -d '{"action":"verify_ping"}'
   ```
   期望：`{"ok":true,"version":"huajie-verify-1","modes":["ff14","poem","math"],"poems":184,...}`
2. **国内场景**：把浏览器 DevTools 的 Network 设为 Offline（或真的在国内网络下），点「花街介绍」→
   会先试 Cloudflare，6 秒内没出来就自动切到「狒科生」，并提示原因；选中正确职业 → 弹窗打开。
3. **三种方式各试一遍**：按钮并排，点「文科生」看令字与提示、点「理科生」做算术题，任一通过即可。
4. **购票**：填好表单 → 完成任意一种验证 → 提交 → 出现「登记成功」；重复用同一张凭证提交应被拒绝。
5. **回归**：公告板、点赞、天气、日历等原有功能不受影响（本次只动了验证相关代码）。

## 六、回滚

- 网页：把 `index.html`、`style.css` 换回上一版（`git revert` 或本地备份），删掉 `verify.js` 即可；
- Worker：删掉那 4 处调用（第 1 处粘贴的模块留着不影响任何功能）；
- D1 里的三张表可以留着，也可以 `DROP TABLE hj_verify_tasks; DROP TABLE hj_verify_passes; DROP TABLE hj_verify_rate;`。

## 七、想改内容？

- **加/换职业**：把图标放进 `jobicon/`，文件名用中文职业名，然后在 `worker-verify.js` 的 `HJV_JOBS` 里加上同一个名字。
- **换飞花令令字**：改 `HJV_KEYWORDS`；**加诗句**：往 `HJV_POEM_LINES` 里加一句（带标点就行），
  判卷与提示都会自动用上——提示保证能拼出其中一句。
- **改有效期 / 限流**：`HJV_TASK_TTL_MS`、`HJV_PASS_TTL_MS`、`HJV_RATE_MAX_TASK`、`HJV_RATE_MAX_ANSWER`。
- **改免验证窗口 / 等 Cloudflare 的时间**：`index.html` 里的 `CAPTCHA_GRACE_MS`、`verify.js` 里的 `turnstileWaitMs`（默认 6000）。
